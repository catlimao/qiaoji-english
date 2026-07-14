/**
 * 浏览器端可直接调用的 LLM（无需本站服务端 API）。
 * 适合 GitHub Pages 等静态托管。
 */

export type LlmEndpoint = {
  baseUrl: string;
  apiKey: string;
  model: string;
  label: string;
};

/** 客户端免费通道（可用 NEXT_PUBLIC_FREE_LLM_* 在构建时覆盖） */
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
    model: envModel || "openai",
    label: "免费模型",
  };
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
  const endpoint =
    base.endsWith("/chat/completions") || base.endsWith("/openai")
      ? base
      : `${base}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (params.apiKey.trim()) {
    headers.Authorization = `Bearer ${params.apiKey.trim()}`;
  }

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: params.model.trim() || "openai",
        temperature: params.temperature ?? 0.85,
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
      }),
    });

    const rawText = await upstream.text();
    let data: {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };

    try {
      data = JSON.parse(rawText) as typeof data;
    } catch {
      if (upstream.ok && rawText.trim()) {
        return { content: rawText.trim() };
      }
      // POST 可能被 CORS 拦住时已进 catch；这里是非 JSON
      return {
        error: `模型返回异常（HTTP ${upstream.status}）`,
        status: 502,
      };
    }

    if (!upstream.ok) {
      return {
        error: data.error?.message || `上游错误 HTTP ${upstream.status}`,
        status: upstream.status >= 400 ? upstream.status : 502,
      };
    }

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return { error: "模型未返回正文", status: 502 };
    return { content };
  } catch {
    // 浏览器 CORS / 网络失败时：尝试 Pollinations GET（免 CORS 更友好）
    try {
      const prompt = `${params.system}\n\n---\n\n${params.user}`;
      const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=${encodeURIComponent(params.model || "openai")}`;
      const res = await fetch(url);
      const text = (await res.text()).trim();
      if (!res.ok || !text) {
        return {
          error:
            "无法连接模型。若使用自备 API，对方可能禁止浏览器直接调用（CORS），请改用免费模型或在 Vercel 部署带代理的版本。",
          status: 502,
        };
      }
      return { content: text };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "网络错误";
      return { error: `调用模型失败：${msg}`, status: 502 };
    }
  }
}
