import { buildPrompt, parseStory } from "@/lib/parse-story";
import { callChatCompletion, resolveClientFreeLlm } from "@/lib/free-llm";
import { resolveBaseUrl } from "@/lib/providers";
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

function targetChars(length: GenerateRequest["length"]): number {
  if (length === "short") return 160;
  if (length === "long") return 1000;
  return 550;
}

function minCharsForLength(length: GenerateRequest["length"]): number {
  return Math.floor(targetChars(length) * 0.55);
}

function looksIncomplete(raw: string): boolean {
  const t = raw.trim();
  if (!t) return true;
  // 没有中文句末标点，或结尾像被截断
  if (!/[。！？…」』]$/.test(t) && !/[.!?]"?$/.test(t)) return true;
  if (/[,，、：:]$/.test(t)) return true;
  if (/(他说|她说|于是|然后|突然|就在这时)\s*$/.test(t)) return true;
  return false;
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

function needsContinue(
  raw: string,
  length: GenerateRequest["length"]
): boolean {
  if (chineseLen(raw) < targetChars(length) * 0.75) return true;
  if (looksIncomplete(raw)) return true;
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

  progress(8, "准备生成…");

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

  progress(25, "正在向模型请求正文…");
  let raw = await callOnce(system, user);
  progress(55, "正在检查篇幅与用词…");
  let segments = parseStory(raw, words);

  if (needsRetry(raw, segments, words, length)) {
    progress(60, "正文不达标，正在重新生成…");
    const retryUser = `${user}

【二次生成要求】上一次输出不合格。请重新完整写作：
1. 只用 [[英文|中文]]，禁止「有利的（advantageous）」这类写法
2. 每个词都要出现，顺序随意
3. 故事情节完整，不要中途停笔
4. 直接输出正文`;
    try {
      const retryRaw = await callOnce(system, retryUser);
      const retrySeg = parseStory(retryRaw, words);
      if (
        !needsRetry(retryRaw, retrySeg, words, length) ||
        countWords(retrySeg) > countWords(segments) ||
        chineseLen(retryRaw) > chineseLen(raw)
      ) {
        raw = retryRaw;
        segments = retrySeg;
      }
    } catch {
      /* keep first */
    }
  }

  // 截断续写（最多两轮）
  for (let i = 0; i < 2 && needsContinue(raw, length); i++) {
    progress(70 + i * 10, i === 0 ? "正文偏短，正在续写…" : "继续补完结局…");
    const present = new Set(
      parseStory(raw, words)
        .filter((s) => s.type === "word" && s.word)
        .map((s) => s.word!.word.toLowerCase())
    );
    const missing = words.filter((w) => !present.has(w.word.toLowerCase()));
    const continueUser = `下面是一篇未完成的中文小说正文。请从断点无缝续写到完整结局，不要重复已有段落，不要另起新故事。
续写时仍可用 [[英文|中文]] 嵌入尚未出现的学习词。
禁止输出「中文（english）」写法。

已写正文：
---
${raw.slice(-1500)}
---

尚未嵌入的单词：
${
  missing.length
    ? missing.map((w) => `- ${w.word}｜${getPrimaryMeaning(w)}`).join("\n")
    : "（已全部出现，请专注把结局写完）"
}

请只输出续写部分。`;
    try {
      const extra = await callOnce(
        "你负责把半截中文小说续写完整。只输出续写正文。",
        continueUser
      );
      if (extra.trim()) {
        raw = `${raw.trim()}\n\n${extra.trim()}`;
        segments = parseStory(raw, words);
      }
    } catch {
      break;
    }
  }

  progress(92, "正在整理高亮…");

  if (!raw.trim()) {
    throw new Error("模型未返回正文");
  }

  progress(100, "完成");
  return { raw, segments: parseStory(raw, words) };
}
