import { buildPrompt, parseStory } from "@/lib/parse-story";
import { callChatCompletion, resolveClientFreeLlm } from "@/lib/free-llm";
import { resolveBaseUrl } from "@/lib/providers";
import {
  isUnusableStoryOutput,
  sanitizeLlmStoryOutput,
} from "@/lib/sanitize-llm-output";
import { getPrimaryMeaning } from "@/lib/word-utils";
import type {
  GenerateRequest,
  GenerateResponse,
  ProviderId,
  StorySegment,
  WordEntry,
} from "@/lib/types";

export type GenerateProgress = {
  percent: number;
  label: string;
};

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
  if (length === "short") return 70;
  if (length === "long") return 350;
  return 180;
}

function needsHardRetry(
  raw: string,
  segments: StorySegment[],
  words: WordEntry[],
  length: GenerateRequest["length"]
): boolean {
  if (isUnusableStoryOutput(raw)) return true;
  if (chineseLen(raw) < minCharsForLength(length)) return true;
  // 一篇至少命中约 30% 目标词即可；其余靠本地补词
  if (countWords(segments) < Math.max(1, Math.ceil(words.length * 0.3))) {
    return true;
  }
  return false;
}

function needsOneContinue(raw: string, length: GenerateRequest["length"]): boolean {
  const floor =
    length === "short" ? 100 : length === "long" ? 500 : 280;
  if (chineseLen(raw) < floor) return true;
  const t = raw.trim();
  if (/[,，、：:]$/.test(t)) return true;
  return false;
}

/** 纯前端生成小说（无需 /api/generate） */
export async function generateStoryClient(
  req: GenerateRequest & {
    onProgress?: (p: GenerateProgress) => void;
  }
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
    onProgress,
  } = req;

  const progress = (percent: number, label: string) => {
    onProgress?.({ percent, label });
  };

  if (!style?.trim()) throw new Error("请填写小说类型/风格");
  if (!words?.length) throw new Error("单词列表无效");

  progress(10, "准备生成…");

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

  // 免费通道词太多时大幅拖慢且易乱码：自动截到 12
  const genWords =
    useFree && words.length > 12 ? words.slice(0, 12) : words;

  const { system, user } = buildPrompt({
    style,
    words: genWords,
    length: useFree && length === "long" ? "medium" : length,
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
    return sanitizeLlmStoryOutput(result.content) || result.content;
  };

  progress(30, "正在生成正文…");
  let raw = await callOnce(system, user);
  let segments = parseStory(raw, words);

  // 仅在严重不合格时重试一次（控制总耗时）
  if (needsHardRetry(raw, segments, genWords, length)) {
    progress(55, "正在修正输出…");
    try {
      const retryRaw = await callOnce(
        system,
        `${user}\n\n只输出小说正文，禁止英文说明/JSON/推理。学习词格式：[[word|中文]]。`
      );
      const retrySeg = parseStory(retryRaw, words);
      if (
        !needsHardRetry(retryRaw, retrySeg, genWords, length) ||
        chineseLen(retryRaw) > chineseLen(raw)
      ) {
        raw = retryRaw;
        segments = retrySeg;
      }
    } catch {
      /* keep first */
    }
  }

  // 最多续写一轮
  if (needsOneContinue(raw, length) && !isUnusableStoryOutput(raw)) {
    progress(75, "补全结尾…");
    const present = new Set(
      segments
        .filter((s) => s.type === "word" && s.word)
        .map((s) => s.word!.word.toLowerCase())
    );
    const missing = genWords.filter((w) => !present.has(w.word.toLowerCase()));
    try {
      const extra = await callOnce(
        "只输出续写正文，不要解释。",
        `续写完下面故事并收束。可用 [[英文|中文]]。\n---\n${raw.slice(-900)}\n---\n未用词：${
          missing.map((w) => `${w.word}|${getPrimaryMeaning(w)}`).join("; ") || "无"
        }`
      );
      if (extra.trim() && !isUnusableStoryOutput(extra)) {
        raw = `${raw.trim()}\n\n${extra.trim()}`;
        segments = parseStory(raw, words);
      }
    } catch {
      /* ignore */
    }
  }

  progress(95, "整理高亮…");
  raw = sanitizeLlmStoryOutput(raw) || raw;

  if (!raw.trim() || (isUnusableStoryOutput(raw) && chineseLen(raw) < 40)) {
    throw new Error(
      "模型返回了无效正文（可能被限流或输出了推理草稿）。请稍后再试，或在「API 配置」使用自备 Key。"
    );
  }

  progress(100, "完成");
  return { raw, segments: parseStory(raw, words) };
}
