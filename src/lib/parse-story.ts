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

export function stripInlineGlosses(text: string): string {
  return text
    .replace(/([A-Za-z][A-Za-z'-]*)（[^）]+）/g, "$1")
    .replace(/([A-Za-z][A-Za-z'-]*)\([^)]+\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|[^\]]+\]\]/g, "$1");
}

export function sanitizeSegments(segments: StorySegment[]): StorySegment[] {
  return segments.map((seg) => {
    if (seg.type === "word") {
      const pure = (seg.word?.word || seg.content)
        .replace(/（.*?）|\(.*?\)/g, "")
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

/** 仍缺失的目标词：在文末补一段，保证学习词出现 */
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
    { type: "text", content: "\n\n（尾声）她在心里默念这些词：" },
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
  const lookup = new Map(
    wordList.map((w) => [w.word.toLowerCase(), w] as const)
  );
  const segments: StorySegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(TOKEN_RE.source, "g");

  while ((match = re.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: stripInlineGlosses(raw.slice(lastIndex, match.index)),
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

  if (lastIndex < raw.length) {
    segments.push({
      type: "text",
      content: stripInlineGlosses(raw.slice(lastIndex)),
    });
  }

  let result = sanitizeSegments(
    segments.length > 0
      ? segments
      : [{ type: "text", content: stripInlineGlosses(raw) }]
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
      ? "短篇：正文不少于 150 字，不超过 220 字"
      : params.length === "long"
        ? "长篇：正文不少于 1000 字，尽量写到 1100–1200 字，必须写完完整结局，禁止中途停笔"
        : "中篇：正文不少于 500 字，尽量写到 600–800 字，必须写完完整结局，禁止中途停笔";

  const wordLines = params.words
    .map((w) => `- ${w.word}｜${getPrimaryMeaning(w)}`)
    .join("\n");

  const isSerial = params.mode === "serial";

  const structureRules = isSerial
    ? `10. 这是连载第 ${params.chapter ?? 1} 章。剧情须与前文连贯，承接人物与冲突，可以留下悬念，但本章自身要有起承转合。
11. 不要重复复述上一章全文；自然衔接即可。
12. 不要输出“第X章”标题，只输出本章正文。`
    : `10. 这是独立成篇的完整故事：有开端、发展、高潮与收束，读完应感到故事讲完了。
11. 禁止在高潮处突然结束；必须把结局写完。
12. 不要输出标题，只输出正文。`;

  const system = `你是一位擅长将英语单词自然融入中文网文的职业编剧。请创作情节合理、人物动机清晰、可读性强、篇幅达标的小说正文，并把指定英语单词自然嵌进叙事。

硬性规则：
1. 全文以中文为主，学习目标单词必须保留为英文拼写（不可译成中文）。
2. 每个给定单词必须至少出现一次，且尽量自然贴合情节，禁止生硬罗列。
3. 嵌入格式必须严格使用双中括号标记：[[英文单词|中文释义]]
   正确示例：指尖[[slip|滑落]]一份协议
   错误示例：slip（滑落）、把单词译成中文、完全不写英文词。
4. 中文释义必须与词表给出的释义一致；读者端只会高亮显示英文单词本身。
5. 不要编造词表之外的英文学习目标词；专有名词可用拼音或中文。
6. 正文分段清晰，每段之间用空行分隔。
7. 不要输出说明、列表或 Markdown（除必须的 [[word|释义]] 标记外）。
8. 情节要合理：人物言行符合身份，因果关系清楚。
9. 优先「一个小冲突 + 推进/解决」的叙事节奏。
${structureRules}
13. 不要解释规则，不要在正文外加任何前后缀。
14. 输出结束前请自检：每个目标词都已用 [[word|释义]] 出现，且故事已完整收束。`;

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
必须嵌入的单词列表（每个都要用 [[word|释义]] 写出来）：
${wordLines}

请直接输出完整小说正文。`;

  return { system, user };
}
