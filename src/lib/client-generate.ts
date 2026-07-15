import { buildPrompt, parseStory } from "@/lib/parse-story";
import { callChatCompletion } from "@/lib/free-llm";
import { BUILTIN_FALLBACK_API } from "@/lib/builtin-api";
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
  if (countWords(segments) < Math.max(1, Math.ceil(words.length * 0.3))) {
    return true;
  }
  return false;
}

function needsOneContinue(
  raw: string,
  length: GenerateRequest["length"]
): boolean {
  const floor = length === "short" ? 100 : length === "long" ? 500 : 280;
  if (chineseLen(raw) < floor) return true;
  const t = raw.trim();
  if (/[,，、：:]$/.test(t)) return true;
  return false;
}

/** 按真实阶段 + 等待期间平滑爬升，避免进度条卡住像假进度 */
class ProgressDriver {
  private value = 0;
  private label = "";
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private onProgress?: (p: GenerateProgress) => void) {}

  private emit() {
    this.onProgress?.({
      percent: Math.round(Math.min(99, Math.max(0, this.value))),
      label: this.label,
    });
  }

  /** 进入某阶段：立刻跳到 from，并在 durationMs 内向 softCap 缓升（等待网络时） */
  stage(from: number, softCap: number, label: string, durationMs: number) {
    if (this.timer) clearInterval(this.timer);
    this.value = Math.max(this.value, from);
    this.label = label;
    this.emit();

    const start = this.value;
    const target = Math.max(start, Math.min(softCap, 96));
    const startedAt = Date.now();
    this.timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - startedAt) / Math.max(1, durationMs));
      // ease-out
      const eased = 1 - (1 - t) * (1 - t);
      this.value = start + (target - start) * eased;
      this.emit();
      if (t >= 1 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }, 200);
  }

  jump(to: number, label?: string) {
    if (label) this.label = label;
    this.value = Math.max(this.value, to);
    this.emit();
  }

  done() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.value = 100;
    this.label = "完成";
    this.emit();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

type LlmTarget = { base: string; key: string; model: string; label: string };

function resolveConfiguredLlm(req: {
  provider: ProviderId | string;
  baseUrl: string;
  apiKey: string;
  model: string;
}): LlmTarget | null {
  const useFree = req.provider === "free" || !req.apiKey?.trim();
  if (useFree) return null;

  if (!req.model?.trim()) return null;
  const customProvider = (
    ["deepseek", "openai", "qwen", "custom"] as ProviderId[]
  ).includes(req.provider as ProviderId)
    ? (req.provider as Exclude<ProviderId, "free">)
    : "deepseek";
  const resolved = resolveBaseUrl({
    provider: customProvider,
    baseUrl: req.baseUrl,
  });
  if (!resolved) return null;
  return {
    base: resolved,
    key: req.apiKey,
    model: req.model.trim(),
    label: "自备模型",
  };
}

function resolveBuiltinFallback(): LlmTarget {
  const fb = BUILTIN_FALLBACK_API;
  return {
    base: resolveBaseUrl(fb) || fb.baseUrl,
    key: fb.apiKey,
    model: fb.model || "deepseek-chat",
    label: "备用模型",
  };
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

  const driver = new ProgressDriver(onProgress);

  if (!style?.trim()) throw new Error("请填写小说类型/风格");
  if (!words?.length) throw new Error("单词列表无效");

  driver.stage(5, 12, "准备生成…", 800);

  const configured = resolveConfiguredLlm({
    provider,
    baseUrl,
    apiKey,
    model,
  });

  // 默认静默走内置 API；仅当用户在设置里自填了 Key 才用其配置
  const queue: LlmTarget[] = [];
  if (configured) {
    queue.push(configured);
  } else {
    queue.push({
      ...resolveBuiltinFallback(),
      label: "默认模型",
    });
  }

  const expectMs =
    length === "short" ? 12000 : length === "long" ? 45000 : 25000;

  const callOnce = async (target: LlmTarget, sys: string, usr: string) => {
    const result = await callChatCompletion({
      baseUrl: target.base,
      apiKey: target.key,
      model: target.model,
      system: sys,
      user: usr,
    });
    if ("error" in result) {
      throw new Error(sanitizeError(result.error));
    }
    return sanitizeLlmStoryOutput(result.content) || result.content;
  };

  let lastError = "";
  let raw = "";
  let used: LlmTarget | null = null;

  for (let i = 0; i < queue.length; i++) {
    const target = queue[i];
    const genWords = words;

    const { system, user } = buildPrompt({
      style,
      words: genWords,
      length,
      mode,
      seriesTitle,
      chapter,
      previousRaw,
    });

    try {
      driver.stage(
        i === 0 ? 15 : 20,
        70,
        i === 0 ? "正在生成…" : "正在重试…",
        expectMs
      );

      raw = await callOnce(target, system, user);
      let segments = parseStory(raw, words);
      used = target;

      if (needsHardRetry(raw, segments, genWords, length)) {
        driver.stage(72, 85, "正文不完整，正在修正…", Math.floor(expectMs * 0.6));
        try {
          const retryRaw = await callOnce(
            target,
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
          /* keep */
        }
      }

      if (needsOneContinue(raw, length) && !isUnusableStoryOutput(raw)) {
        driver.stage(86, 94, "补全结尾…", Math.floor(expectMs * 0.4));
        const present = new Set(
          segments
            .filter((s) => s.type === "word" && s.word)
            .map((s) => s.word!.word.toLowerCase())
        );
        const missing = genWords.filter(
          (w) => !present.has(w.word.toLowerCase())
        );
        try {
          const extra = await callOnce(
            target,
            "只输出续写正文，不要解释。",
            `续写完下面故事并收束。可用 [[英文|中文]]。\n---\n${raw.slice(-900)}\n---\n未用词：${
              missing
                .map((w) => `${w.word}|${getPrimaryMeaning(w)}`)
                .join("; ") || "无"
            }`
          );
          if (extra.trim() && !isUnusableStoryOutput(extra)) {
            raw = `${raw.trim()}\n\n${extra.trim()}`;
          }
        } catch {
          /* ignore */
        }
      }

      raw = sanitizeLlmStoryOutput(raw) || raw;
      if (!raw.trim() || (isUnusableStoryOutput(raw) && chineseLen(raw) < 40)) {
        throw new Error("模型返回无效正文");
      }

      // success
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "生成失败";
      used = null;
      raw = "";
      // try next candidate
      if (i >= queue.length - 1) {
        driver.stop();
        throw new Error(sanitizeError(lastError));
      }
    }
  }

  driver.jump(96, "整理高亮…");
  if (!raw.trim() || !used) {
    driver.stop();
    throw new Error(
      sanitizeError(lastError || "生成失败，请稍后重试")
    );
  }

  driver.done();
  return { raw, segments: parseStory(raw, words) };
}
