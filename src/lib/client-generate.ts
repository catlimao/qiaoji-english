import { buildPrompt, parseStory } from "@/lib/parse-story";
import { callChatCompletion, resolveClientFreeLlm } from "@/lib/free-llm";
import { resolveBaseUrl } from "@/lib/providers";
import type {
  GenerateRequest,
  GenerateResponse,
  ProviderId,
} from "@/lib/types";

function sanitizeError(message: string): string {
  return message.replace(/sk-[a-zA-Z0-9_-]+/g, "sk-***");
}

/**
 * 纯前端生成小说（无需 /api/generate）
 */
export async function generateStoryClient(
  req: GenerateRequest
): Promise<GenerateResponse> {
  const {
    provider = "free",
    baseUrl = "",
    apiKey = "",
    model = "",
    style,
    words,
    length,
    mode = "oneshot",
    seriesTitle,
    chapter,
    previousRaw,
  } = req;

  if (!style?.trim()) throw new Error("请填写小说类型/风格");
  if (!words?.length) throw new Error("单词列表无效");

  const useFree = provider === "free" || !apiKey?.trim();

  let llmBase = "";
  let llmKey = "";
  let llmModel = "";

  if (useFree) {
    const free = resolveClientFreeLlm();
    llmBase = free.baseUrl;
    llmKey = free.apiKey;
    llmModel = free.model;
  } else {
    if (!model?.trim()) throw new Error("请填写模型名称");
    const customProvider = (
      ["deepseek", "openai", "qwen", "custom"] as ProviderId[]
    ).includes(provider)
      ? provider
      : "deepseek";
    const resolved = resolveBaseUrl({
      provider: customProvider as Exclude<ProviderId, "free">,
      baseUrl,
    });
    if (!resolved) throw new Error("请填写有效的 Base URL");
    llmBase = resolved;
    llmKey = apiKey;
    llmModel = model.trim();
  }

  const { system, user } = buildPrompt({
    style,
    words,
    length,
    mode,
    seriesTitle,
    chapter,
    previousRaw,
  });

  const result = await callChatCompletion({
    baseUrl: llmBase,
    apiKey: llmKey,
    model: llmModel,
    system,
    user,
  });

  if ("error" in result) {
    throw new Error(sanitizeError(result.error));
  }

  return {
    raw: result.content,
    segments: parseStory(result.content, words),
  };
}
