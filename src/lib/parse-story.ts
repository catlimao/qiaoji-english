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

export function sanitizeSegments(segments: StorySegment[]): StorySegment[] {
  return segments.map((seg) => {
    if (seg.type === "word") {
      const pure = (seg.word?.word || seg.content)
        .replace(/（.*?）|\(.*?\)/g, "")
        .replace(/[\u4e00-\u9fff]/g, "")
        .trim();
      return { ...seg, content: pure || seg.content };
    }
    return { ...seg, content: stripInlineGlosses(seg.content) };
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

/** 仍缺失的目标词：文末轻触一句带入，避免打断主线太多 */
export function ensureTargetWordsPresent(
  segments: StorySegment[],
  wordList: WordEntry[]
): StorySegment[] {
  const present = new Set(
    segments
      .filter((s) => s.type === "word" && s.word)
      .map((s) => s.word!.word.toLowerCase())
  );
  const missing = wordList.filter((w) => !present.has(w.word.toLowerCase()));
  if (missing.length === 0) return segments;

  const extra: StorySegment[] = [
    {
      type: "text",
      content: "\n\n事后她回想这场经历，又咀嚼了几个词：",
    },
  ];
  missing.forEach((w, i) => {
    if (i > 0) extra.push({ type: "text", content: "、" });
    extra.push(makeWordSegment(w.word, getPrimaryMeaning(w), w));
  });
  extra.push({ type: "text", content: "。" });
  return mergeAdjacentText([...segments, ...extra]);
}

export function parseStory(
  raw: string,
  wordList: WordEntry[] = []
): StorySegment[] {
  const normalized = normalizeChineseParenEnglish(raw, wordList);
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
  result = ensureTargetWordsPresent(result, wordList);
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
      ? "短篇：正文 160–220 汉字，必须写完结局"
      : params.length === "long"
        ? "长篇：正文 1000–1200 汉字，必须写完完整结局，禁止中途停笔"
        : "中篇：正文 550–800 汉字，必须写完完整结局，禁止中途停笔";

  // 打乱列表顺序展示，避免模型按表序机械堆砌
  const shuffled = [...params.words].sort(() => Math.random() - 0.5);
  const wordLines = shuffled
    .map((w) => `- ${w.word}｜${getPrimaryMeaning(w)}`)
    .join("\n");

  const isSerial = params.mode === "serial";

  const structureRules = isSerial
    ? `10. 这是连载第 ${params.chapter ?? 1} 章。剧情须与前文连贯，承接人物与冲突，可以留下悬念，但本章自身要有完整的小高潮与阶段收束。
11. 不要重复复述上一章全文；自然衔接即可。
12. 不要输出“第X章”标题，只输出本章正文。`
    : `10. 这是独立成篇的完整故事：开端→发展→转折→收束，因果清楚，读完应觉得故事讲完了。
11. 禁止在高潮处突然结束；必须写出明确结局。
12. 不要输出标题，只输出正文。`;

  const system = `你是一位擅长将英语单词自然融入中文网文的职业编剧。故事必须有清晰人物动机与情节逻辑；英语学习词只作为叙事中的自然零件，不是填表。

硬性规则：
1. 全文以中文为主；学习目标词必须保留英文拼写，且正文里只能出现英文本身（不要在英文旁再写中文）。
2. 每个给定单词至少出现一次，按情节需要穿插即可，【不必按词表顺序】，也禁止机械逐词堆砌。
3. 嵌入格式只能用：[[英文单词|中文释义]]
   正确：她看出这是[[advantageous|有利的]]局面
   错误：有利的（advantageous）、advantageous（有利的）、有利的advantageous
4. 绝对禁止「中文释义（英文）」或「英文（中文释义）」写法。
5. 中文释义必须与词表一致；专有名词可用拼音或中文；不要额外编造词表外学习词。
6. 分段清晰，段间空行；不要 Markdown、不要解释、不要前后缀。
7. 情节合理：人物言行符合身份，冲突有因，结果有果，避免无意义口号与空洞抒情。
${structureRules}
13. 写完前自检：每个目标词都已用 [[word|释义]] 出现；句号收束完整；字数达标。`;

  let user = `小说类型/风格：${params.style}
篇幅要求：${lengthHint}
模式：${isSerial ? "连载" : "完整单篇"}
`;

  if (isSerial) {
    user += `连载标题：${params.seriesTitle || params.style}
章节：第 ${params.chapter ?? 1} 章
`;
    if (params.previousRaw?.trim()) {
      user += `
上一章正文（请连贯续写，勿照抄）：
---
${params.previousRaw.trim().slice(-1200)}
---
`;
    } else {
      user += `这是连载的第一章，请开篇立住人物与主线冲突。
`;
    }
  }

  user += `
必须嵌入的单词（顺序随意，服务情节即可）：
${wordLines}

请直接输出完整小说正文。`;

  return { system, user };
}
