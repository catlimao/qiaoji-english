import type { StoryMode, StorySegment, WordEntry } from "./types";
import { getPrimaryMeaning } from "./word-utils";

/** [[word|meaning]] 或 word（释义）/ word(释义) */
const TOKEN_RE =
  /\[\[([^\]|]+)\|([^\]]+)\]\]|([A-Za-z][A-Za-z'-]*)(?:（([^）]+)）|\(([^)]+)\))/g;

const DUMP_MARK_RE =
  /咀嚼了几个词|默念这些词|事后她回想这场经历|心里默念这些词/;

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

/** 去掉文末单词清单式劣质收尾（原文级） */
export function stripWordDumpEnding(text: string): string {
  let t = text;
  // 精确命中旧版硬编码句
  t = t.replace(/事后她回想这场经历，又咀嚼了几个词：[\s\S]*$/g, "");
  t = t.replace(/（尾声）她在心里默念这些词：[\s\S]*$/g, "");
  // 更宽：从「咀嚼/默念…词：」起切到文末（保留前面正文）
  t = t.replace(
    /[^\n。！？]*?(?:又)?(?:咀嚼了几个词|默念这些词)[：:][\s\S]*$/g,
    ""
  );
  t = t.replace(/\n*（尾声）[^\n]*$/g, "");
  return t.trimEnd();
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

/**
 * 展示层再砍一遍：旧历史里若已经拆成「…咀嚼了几个词：」+ 单词高亮片段，整段丢掉。
 */
export function removeTrailingWordDumpSegments(
  segments: StorySegment[]
): StorySegment[] {
  let cut = -1;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.type === "text" && DUMP_MARK_RE.test(seg.content)) {
      cut = i;
      break;
    }
  }
  if (cut < 0) return segments;

  const head = segments.slice(0, cut);
  const bad = segments[cut];
  if (bad.type === "text") {
    const trimmed = stripWordDumpEnding(bad.content);
    if (trimmed.trim()) {
      return mergeAdjacentText([
        ...head,
        { type: "text", content: trimmed },
      ]);
    }
  }
  return mergeAdjacentText(head);
}

export function sanitizeSegments(segments: StorySegment[]): StorySegment[] {
  const cleaned = segments.map((seg) => {
    if (seg.type === "word") {
      const pure = (seg.word?.word || seg.content)
        .replace(/（.*?）|\(.*?\)/g, "")
        .replace(/[\u4e00-\u9fff]/g, "")
        .trim();
      return { ...seg, content: pure || seg.content };
    }
    return {
      ...seg,
      content: stripInlineGlosses(seg.content),
    };
  });
  return removeTrailingWordDumpSegments(mergeAdjacentText(cleaned));
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
  result = highlightBareTargetWords(result, wordList);
  result = removeTrailingWordDumpSegments(result);
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

  const system = `你是中文网文作者。学习词必须自然出现在完整情节句子里。

硬性要求：
1. 每个词用 [[英文|中文]] 嵌进句子，例如：她推开[[door|门]]走出去。
2. 严禁把单词写成清单贴在文末；故事必须以情节句号收束。
3. 禁止英文推理、JSON、Markdown、括号释义。
4. 词序随意。只输出正文。`;

  let user = `风格：${params.style}；篇幅：${lengthHint}；${
    isSerial ? `连载第${params.chapter ?? 1}章` : "完整单篇"
  }
词表（嵌进句子，勿清单）：${wordLines}
`;

  if (isSerial && params.previousRaw?.trim()) {
    user += `前文摘要：\n${stripWordDumpEnding(params.previousRaw.trim()).slice(-600)}\n`;
  }

  user += `直接输出完整正文。`;

  return { system, user };
}
