/**
 * 浏览器端可直接调用的 LLM（无需本站服务端 API）。
 */

import { sanitizeLlmStoryOutput } from "./sanitize-llm-output";

export type LlmEndpoint = {
  baseUrl: string;
  apiKey: string;
  model: string;
  label: string;
};

export function resolveClientFreeLlm(): LlmEndpoint {
  const envBase = (
    process.env.NEXT_PUBLIC_FREE_LLM_BASE_URL ||
    ""
  ).replace(/\/$/, "");
  const envKey = process.env.NEXT_PUBLIC_FREE_LLM_API_KEY || "";
  const envModel = process.env.NEXT_PUBLIC_FREE_LLM_MODEL || "";

  if (envBase) {
    return {
      baseUrl: envBase,
      apiKey: envKey,
      model: envModel || "openai",
      label: "免费模型",
    };
  }

  return {
    baseUrl: "https://text.pollinations.ai/openai",
    apiKey: "",
    // 明确用较稳的快捷模型名；避免推理模型把 CoT 当正文
    model: envModel || "openai",
    label: "免费模型",
  };
}

function extractMessageContent(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const obj = data as Record<string, unknown>;

  const choices = obj.choices;
  if (Array.isArray(choices) && choices[0]) {
    const first = choices[0] as Record<string, unknown>;
    const msg = first.message as Record<string, unknown> | undefined;
    // 跳过 reasoning，只要 content
    const content =
      msg?.content ??
      (typeof msg?.text === "string" ? msg.text : undefined) ??
      first.text ??
      first.content;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      return content
        .map((p) => {
          if (typeof p === "string") return p;
          if (p && typeof p === "object") {
            const part = p as Record<string, unknown>;
            if (part.type === "reasoning") return "";
            return String(part.text ?? part.content ?? "");
          }
          return "";
        })
        .join("")
        .trim();
    }
  }

  if (typeof obj.content === "string") return obj.content.trim();
  if (typeof obj.response === "string") return obj.response.trim();
  if (typeof obj.text === "string") return obj.text.trim();
  if (typeof obj.output === "string") return obj.output.trim();
  // 不要把 reasoning 当正文
  return "";
}

function finalizeContent(raw: string): string {
  return sanitizeLlmStoryOutput(raw) || raw.trim();
}

async function postChat(params: {
  endpoint: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  temperature?: number;
}): Promise<{ content: string } | { error: string; status: number }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (params.apiKey.trim()) {
    headers.Authorization = `Bearer ${params.apiKey.trim()}`;
  }

  const upstream = await fetch(params.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: params.model.trim() || "openai",
      temperature: params.temperature ?? 0.75,
      max_tokens: 2200,
      // 部分兼容接口会识别，用于压住长推理
      reasoning: false,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
    }),
  });

  const rawText = await upstream.text();

  if (
    upstream.ok &&
    rawText.trim() &&
    !rawText.trim().startsWith("{") &&
    !rawText.trim().startsWith("[")
  ) {
    return { content: finalizeContent(rawText) };
  }

  let data: unknown;
  try {
    data = JSON.parse(rawText);
  } catch {
    if (upstream.ok && rawText.trim()) {
      return { content: finalizeContent(rawText) };
    }
    return {
      error: `模型返回异常（HTTP ${upstream.status}）`,
      status: 502,
    };
  }

  if (!upstream.ok) {
    const errObj = data as { error?: { message?: string } };
    return {
      error: errObj.error?.message || `上游错误 HTTP ${upstream.status}`,
      status: upstream.status >= 400 ? upstream.status : 502,
    };
  }

  const content = extractMessageContent(data);
  if (!content) return { error: "模型未返回正文", status: 502 };
  return { content: finalizeContent(content) };
}

async function getChatFallback(
  system: string,
  user: string,
  model: string
): Promise<{ content: string } | { error: string; status: number }> {
  const shortSystem =
    "只输出中文小说正文。学习词用[[英文|中文]]。禁止英文推理、JSON、括号释义。";
  const compactUser = user.length > 900 ? `${user.slice(0, 900)}\n…` : user;
  const prompt = `${shortSystem}\n\n${compactUser}`;
  const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model || "openai")}`;

  const res = await fetch(url);
  const text = (await res.text()).trim();
  if (!res.ok || !text) {
    return {
      error:
        "无法连接免费模型。请稍后重试，或在「API 配置」填写可用的自备 Key。",
      status: 502,
    };
  }
  if (/^\s*<!DOCTYPE|^\s*<html/i.test(text)) {
    return { error: "模型未返回正文", status: 502 };
  }
  const cleaned = finalizeContent(text);
  if (!cleaned) return { error: "模型未返回正文", status: 502 };
  return { content: cleaned };
}

export async function callChatCompletion(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  temperature?: number;
}): Promise<{ content: string } | { error: string; status: number }> {
  const base = params.baseUrl.replace(/\/$/, "");
  const endpoints = [
    base.endsWith("/chat/completions") || base.endsWith("/openai")
      ? base
      : `${base}/chat/completions`,
  ];

  if (base.includes("pollinations.ai") && !base.includes("gen.pollinations")) {
    endpoints.push("https://text.pollinations.ai/openai");
  }

  let lastError = "模型未返回正文";

  for (const endpoint of endpoints) {
    try {
      const result = await postChat({
        endpoint,
        apiKey: params.apiKey,
        model: params.model,
        system: params.system,
        user: params.user,
        temperature: params.temperature,
      });
      if (!("error" in result) && result.content.trim()) return result;
      if ("error" in result) lastError = result.error;
    } catch {
      /* try next */
    }
  }

  try {
    return await getChatFallback(params.system, params.user, params.model);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "网络错误";
    return { error: lastError || `调用模型失败：${msg}`, status: 502 };
  }
}
