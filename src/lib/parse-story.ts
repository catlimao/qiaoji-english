import type { StoryMode, StorySegment, WordEntry } from "./types";
import { getPrimaryMeaning } from "./word-utils";

/** [[word|meaning]] 或 word（释义）/ word(释义) */
const TOKEN_RE =
  /\[\[([^\]|]+)\|([^\]]+)\]\]|([A-Za-z][A-Za-z'-]*)(?:（([^）]+)）|\(([^)]+)\))/g;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeWordSegment(
  word: string,
  contextMeaning: string,
  known?: WordEntry
): StorySegment {
  const entry: WordEntry = known
    ? { ...known, meaning: getPrimaryMeaning(known) || contextMeaning }
    : { word, meaning: contextMeaning };
  return {
    type: "word",
    content: entry.word,
    word: entry,
    contextMeaning: contextMeaning || getPrimaryMeaning(entry),
  };
}

/**
 * 把模型常见错误写法「有利的（advantageous）」转成 [[advantageous|有利的]]
 * 读者端只高亮英文。
 */
export function normalizeChineseParenEnglish(
  raw: string,
  wordList: WordEntry[] = []
): string {
  const known = new Set(wordList.map((w) => w.word.toLowerCase()));
  return raw.replace(
    /([\u4e00-\u9fff]{1,16}?)\s*[（(]\s*([A-Za-z][A-Za-z'-]*)\s*[）)]/g,
    (full, zh: string, en: string) => {
      const lower = en.toLowerCase();
      if (known.has(lower) || /^[a-z][a-z'-]*$/.test(en)) {
        const canon =
          wordList.find((w) => w.word.toLowerCase() === lower)?.word || en;
        return `[[${canon}|${zh}]]`;
      }
      return full;
    }
  );
}

export function stripInlineGlosses(text: string): string {
  return text
    .replace(/([\u4e00-\u9fff]{1,16}?)\s*[（(]\s*[A-Za-z][A-Za-z'-]*\s*[）)]/g, "")
    .replace(/([A-Za-z][A-Za-z'-]*)（[^）]+）/g, "$1")
    .replace(/([A-Za-z][A-Za-z'-]*)\([^)]+\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|[^\]]+\]\]/g, "$1");
}

/** 去掉「事后回想 / 咀嚼了几个词：a、b、c。」这类硬塞词表的劣质收尾 */
export function stripWordDumpEnding(text: string): string {
  return text
    .replace(
      /\n*\s*(?:（?尾声）?)?[^\n]{0,40}(?:回想|回忆|默念|咀嚼)[^\n]{0,40}(?:词|单词)[：:]\s*[A-Za-z][\s\S]*$/,
      ""
    )
    .replace(
      /\n*\s*事后她回想这场经历，又咀嚼了几个词：[\s\S]*$/,
      ""
    )
    .trimEnd();
}

export function sanitizeSegments(segments: StorySegment[]): StorySegment[] {
  return segments.map((seg) => {
    if (seg.type === "word") {
      const pure = (seg.word?.word || seg.content)
        .replace(/（.*?）|\(.*?\)/g, "")
        .replace(/[\u4e00-\u9fff]/g, "")
        .trim();
      return { ...seg, content: pure || seg.content };
    }
    return {
      ...seg,
      content: stripInlineGlosses(stripWordDumpEnding(seg.content)),
    };
  });
}

function mergeAdjacentText(segments: StorySegment[]): StorySegment[] {
  const merged: StorySegment[] = [];
  for (const seg of segments) {
    const prev = merged[merged.length - 1];
    if (seg.type === "text" && prev?.type === "text") {
      prev.content += seg.content;
    } else if (!(seg.type === "text" && !seg.content)) {
      merged.push({ ...seg });
    }
  }
  return merged;
}

/** 把正文里未标记、但属于目标词表的英文词高亮出来 */
export function highlightBareTargetWords(
  segments: StorySegment[],
  wordList: WordEntry[]
): StorySegment[] {
  if (wordList.length === 0) return segments;
  const lookup = new Map(
    wordList.map((w) => [w.word.toLowerCase(), w] as const)
  );
  const keys = Array.from(lookup.keys()).sort((a, b) => b.length - a.length);
  if (keys.length === 0) return segments;
  const re = new RegExp(`\\b(${keys.map(escapeRegExp).join("|")})\\b`, "gi");

  const out: StorySegment[] = [];
  for (const seg of segments) {
    if (seg.type === "word") {
      out.push(seg);
      continue;
    }
    let last = 0;
    let m: RegExpExecArray | null;
    const local = new RegExp(re.source, "gi");
    while ((m = local.exec(seg.content)) !== null) {
      if (m.index > last) {
        out.push({ type: "text", content: seg.content.slice(last, m.index) });
      }
      const rawWord = m[1];
      const known = lookup.get(rawWord.toLowerCase());
      out.push(
        makeWordSegment(
          known?.word || rawWord,
          known ? getPrimaryMeaning(known) : rawWord,
          known
        )
      );
      last = m.index + m[0].length;
    }
    if (last < seg.content.length) {
      out.push({ type: "text", content: seg.content.slice(last) });
    }
  }
  return mergeAdjacentText(out);
}

/** @deprecated 已停用：禁止在文末罗列单词，不再自动补「咀嚼几个词」 */
export function ensureTargetWordsPresent(
  segments: StorySegment[],
  _wordList: WordEntry[]
): StorySegment[] {
  return segments;
}

export function parseStory(
  raw: string,
  wordList: WordEntry[] = []
): StorySegment[] {
  const cleanedRaw = stripWordDumpEnding(raw);
  const normalized = normalizeChineseParenEnglish(cleanedRaw, wordList);
  const lookup = new Map(
    wordList.map((w) => [w.word.toLowerCase(), w] as const)
  );
  const segments: StorySegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(TOKEN_RE.source, "g");

  while ((match = re.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: stripInlineGlosses(
          normalized.slice(lastIndex, match.index)
        ),
      });
    }

    if (match[1] != null) {
      const word = match[1].trim();
      const meaning = match[2].trim();
      segments.push(
        makeWordSegment(word, meaning, lookup.get(word.toLowerCase()))
      );
    } else {
      const word = match[3];
      const meaning = (match[4] || match[5] || "").trim();
      const known = lookup.get(word.toLowerCase());
      segments.push(makeWordSegment(word, meaning, known));
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < normalized.length) {
    segments.push({
      type: "text",
      content: stripInlineGlosses(normalized.slice(lastIndex)),
    });
  }

  let result = sanitizeSegments(
    segments.length > 0
      ? segments
      : [{ type: "text", content: stripInlineGlosses(normalized) }]
  );
  result = mergeAdjacentText(result);
  result = highlightBareTargetWords(result, wordList);
  // 不再文末硬塞缺失词
  return result;
}

export function buildPrompt(params: {
  style: string;
  words: WordEntry[];
  length: "short" | "medium" | "long";
  mode: StoryMode;
  seriesTitle?: string;
  chapter?: number;
  previousRaw?: string;
}): { system: string; user: string } {
  const lengthHint =
    params.length === "short"
      ? "约180字，写完结局"
      : params.length === "long"
        ? "约1000字，写完结局"
        : "约500字，写完结局";

  const shuffled = [...params.words].sort(() => Math.random() - 0.5);
  const wordLines = shuffled
    .map((w) => `${w.word}|${getPrimaryMeaning(w)}`)
    .join("，");

  const isSerial = params.mode === "serial";

  const system = `你是中文网文作者。把学习词自然写进情节句子里，像普通叙事，不是背单词。

硬性要求：
1. 每个词都必须出现在完整句子中，格式只能是 [[英文|中文]]。
2. 禁止在文末罗列单词；禁止「回想/默念/咀嚼了几个词：a、b、c」这类收尾。
3. 禁止英文推理、JSON、Markdown、括号释义。
4. 词序随意，为情节服务。只输出正文。`;

  let user = `风格：${params.style}；篇幅：${lengthHint}；${
    isSerial ? `连载第${params.chapter ?? 1}章` : "完整单篇"
  }
词表（逐个嵌进情节，勿罗列）：${wordLines}
`;

  if (isSerial && params.previousRaw?.trim()) {
    user += `前文摘要：\n${params.previousRaw.trim().slice(-600)}\n`;
  }

  user += `直接输出完整正文。`;

  return { system, user };
}
