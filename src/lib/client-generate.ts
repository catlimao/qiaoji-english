import { buildPrompt, parseStory } from "@/lib/parse-story";
import { callChatCompletion, resolveClientFreeLlm } from "@/lib/free-llm";
import { resolveBaseUrl } from "@/lib/providers";
import type {
  GenerateRequest,
  GenerateResponse,
  ProviderId,
  StorySegment,
  WordEntry,
} from "@/lib/types";

function sanitizeError(message: string): string {
  return message.replace(/sk-[a-zA-Z0-9_-]+/g, "sk-***");
}

function countWords(segments: StorySegment[]): number {
  return segments.filter((s) => s.type === "word").length;
}

function chineseLen(raw: string): number {
  return (raw.match(/[\u4e00-\u9fff]/g) || []).length;
}

function minCharsForLength(length: GenerateRequest["length"]): number {
  if (length === "short") return 80;
  if (length === "long") return 400;
  return 200;
}

function needsRetry(
  raw: string,
  segments: StorySegment[],
  words: WordEntry[],
  length: GenerateRequest["length"]
): boolean {
  if (!raw.trim()) return true;
  if (chineseLen(raw) < minCharsForLength(length)) return true;
  if (countWords(segments) < Math.max(1, Math.ceil(words.length * 0.4))) {
    return true;
  }
  return false;
}

/** 纯前端生成小说（无需 /api/generate） */
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

  const callOnce = async (sys: string, usr: string) => {
    const result = await callChatCompletion({
      baseUrl: llmBase,
      apiKey: llmKey,
      model: llmModel,
      system: sys,
      user: usr,
    });
    if ("error" in result) {
      throw new Error(sanitizeError(result.error));
    }
    return result.content;
  };

  let raw = await callOnce(system, user);
  let segments = parseStory(raw, words);

  if (needsRetry(raw, segments, words, length)) {
    const retryUser = `${user}

【二次生成要求】上一次输出不合格。请重新完整写作：
1. 每个单词都必须出现为 [[英文|中文]]，例如 [[agenda|议程]]
2. 禁止只写中文、禁止省略英文拼写
3. 必须写完完整故事，不要中途停笔
4. 直接输出正文`;
    try {
      const retryRaw = await callOnce(system, retryUser);
      const retrySeg = parseStory(retryRaw, words);
      if (
        !needsRetry(retryRaw, retrySeg, words, length) ||
        countWords(retrySeg) > countWords(segments)
      ) {
        raw = retryRaw;
        segments = retrySeg;
      }
    } catch {
      /* 保留第一次结果 */
    }
  }

  if (!raw.trim()) {
    throw new Error("模型未返回正文");
  }

  return { raw, segments: parseStory(raw, words) };
}
