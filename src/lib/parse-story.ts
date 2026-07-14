import type { StoryMode, StorySegment, WordEntry } from "./types";
import { getPrimaryMeaning } from "./word-utils";

/** [[word|meaning]] 或 word（释义）/ word(释义) */
const TOKEN_RE =
  /\[\[([^\]|]+)\|([^\]]+)\]\]|([A-Za-z][A-Za-z'-]*)(?:（([^）]+)）|\(([^)]+)\))/g;

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
    // 正文只显示英文单词，绝不附带中文括号
    content: entry.word,
    word: entry,
    contextMeaning: contextMeaning || getPrimaryMeaning(entry),
  };
}

/** 去掉残留的 word（中文）展示，避免正文再出现括号释义 */
export function stripInlineGlosses(text: string): string {
  return text
    .replace(/([A-Za-z][A-Za-z'-]*)（[^）]+）/g, "$1")
    .replace(/([A-Za-z][A-Za-z'-]*)\([^)]+\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|[^\]]+\]\]/g, "$1");
}

export function sanitizeSegments(segments: StorySegment[]): StorySegment[] {
  return segments.map((seg) => {
    if (seg.type === "word") {
      const pure = (seg.word?.word || seg.content).replace(/（.*?）|\(.*?\)/g, "").trim();
      return {
        ...seg,
        content: pure || seg.content,
      };
    }
    return {
      ...seg,
      content: stripInlineGlosses(seg.content),
    };
  });
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
      // [[word|meaning]]
      const word = match[1].trim();
      const meaning = match[2].trim();
      segments.push(makeWordSegment(word, meaning, lookup.get(word.toLowerCase())));
    } else {
      const word = match[3];
      const meaning = (match[4] || match[5] || "").trim();
      const known = lookup.get(word.toLowerCase());
      // 凡是「英文+括号中文」都当作学习标注，高亮英文并去掉括号
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

  const cleaned = sanitizeSegments(
    segments.length > 0 ? segments : [{ type: "text", content: stripInlineGlosses(raw) }]
  );

  // 合并相邻 text
  const merged: StorySegment[] = [];
  for (const seg of cleaned) {
    const prev = merged[merged.length - 1];
    if (seg.type === "text" && prev?.type === "text") {
      prev.content += seg.content;
    } else if (!(seg.type === "text" && !seg.content)) {
      merged.push(seg);
    }
  }

  return merged;
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
      ? "短篇，约 100–200 字"
      : params.length === "long"
        ? "长篇，约 1000–1200 字"
        : "中篇，约 500–800 字";

  const wordLines = params.words
    .map((w) => `- ${w.word}｜${getPrimaryMeaning(w)}`)
    .join("\n");

  const isSerial = params.mode === "serial";

  const structureRules = isSerial
    ? `8. 这是连载第 ${params.chapter ?? 1} 章。剧情须与前文连贯，承接人物与冲突，可以留下悬念，但本章自身要有起承转合。
9. 不要重复复述上一章全文；自然衔接即可。
10. 不要输出“第X章”标题，只输出本章正文。`
    : `8. 这是独立成篇的完整故事：有开端、发展、高潮与收束，读完应感到故事讲完了，不要写成章节片段或开放性续写预告。
9. 不要输出标题，只输出正文。`;

  const system = `你是一位擅长将英语单词自然融入中文网文的职业编剧。请创作情节合理、人物动机清晰、可读性强的小说正文，并把指定英语单词自然嵌进叙事。

硬性规则：
1. 全文以中文为主，只把学习目标单词写成英文。
2. 每个给定单词必须至少出现一次，且尽量自然贴合情节，禁止生硬罗列或为塞词而塞词。
3. 嵌入格式必须严格使用双中括号标记：[[英文单词|中文释义]]
   正确示例：指尖[[slip|滑落]]一份协议
   错误示例：slip（滑落）、slip(滑落) —— 禁止在正文再用括号写中文释义。
4. 中文释义必须与词表给出的释义一致，不要改写；读者端只会高亮显示英文单词本身。
5. 不要编造词表之外的英文学习目标词；专有名词（人名、公司名）可用拼音或中文。
6. 正文分段清晰，每段之间用空行分隔。
7. 不要输出说明、列表或 Markdown（除必须的 [[word|释义]] 标记外）。
8. 情节要合理：人物言行符合身份，因果关系清楚，避免前后矛盾、无意义重复和机械抒情。
9. 优先「一个小冲突 + 推进/解决」的叙事节奏，而不是空泛形容堆砌。
${structureRules}
12. 不要解释规则，不要在正文外加任何前后缀。`;

  let user = `小说类型/风格：${params.style}
篇幅：${lengthHint}
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
必须嵌入的单词列表：
${wordLines}

请直接输出小说正文。记住：只用 [[word|释义]] 标记，正文中不要再写 word（释义）。`;

  return { system, user };
}
