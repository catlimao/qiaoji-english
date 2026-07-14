import type { WordEntry } from "./types";
import { translateEnToZh } from "./translate";

function normalizeEntry(raw: Record<string, unknown>): WordEntry | null {
  const word = String(raw.word ?? raw.Word ?? raw.english ?? "").trim();
  let meaning = String(
    raw.meaning ?? raw.Meaning ?? raw.chinese ?? raw.translation ?? ""
  ).trim();

  let meanings: string[] | undefined;
  if (Array.isArray(raw.meanings)) {
    meanings = raw.meanings.map((m) => String(m).trim()).filter(Boolean);
  }
  if (!meaning && meanings?.length) meaning = meanings[0];
  if (!word) return null;
  // 允许先无释义，后续异步查中文
  if (!meaning) meaning = "";

  if (!meanings && meaning) {
    meanings = meaning
      .split(/[；;｜|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const entry: WordEntry = {
    word,
    meaning: meanings?.[0] || meaning || word,
    meanings: meanings && meanings.length > 0 ? meanings : undefined,
  };

  const phonetic = String(raw.phonetic ?? raw.Phonetic ?? "").trim();
  const example = String(raw.example ?? raw.Example ?? "").trim();
  const pos = String(raw.pos ?? raw.POS ?? raw.partOfSpeech ?? "").trim();
  if (phonetic) entry.phonetic = phonetic;
  if (pos) entry.pos = pos;

  let examples: string[] | undefined;
  if (Array.isArray(raw.examples)) {
    examples = raw.examples.map((e) => String(e).trim()).filter(Boolean);
  }
  if (example) {
    examples = examples ? [...examples, example] : [example];
  }

  let translations: string[] | undefined;
  if (Array.isArray(raw.exampleTranslations)) {
    translations = raw.exampleTranslations
      .map((t) => String(t).trim())
      .filter(Boolean)
      .filter((t) => !/这句话展示了|表示「.*」的用法/.test(t));
  }

  if (examples?.length) {
    entry.examples = Array.from(new Set(examples));
    entry.example = entry.examples[0];
  }
  if (translations?.length) {
    entry.exampleTranslations = translations;
  }
  return entry;
}

function dedupe(words: WordEntry[]): WordEntry[] {
  const seen = new Set<string>();
  const result: WordEntry[] = [];
  for (const w of words) {
    const key = w.word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(w);
  }
  return result;
}

const WORD_ONLY_RE = /^[A-Za-z][A-Za-z'-]*$/;
const WORD_MEANING_RE =
  /^([A-Za-z][A-Za-z'-]*)\s*[,，|｜\t:：\-–—]\s*(.+)$/;
const WORD_SPACE_ZH_RE =
  /^([A-Za-z][A-Za-z'-]*)\s+([\u4e00-\u9fff].+)$/;

/** 纯英文词表：按空白/标点拆出全部单词 */
export function parseEnglishOnlyList(text: string): WordEntry[] {
  const tokens = text.match(/[A-Za-z][A-Za-z'-]*/g) || [];
  if (tokens.length === 0) return [];
  return dedupe(tokens.map((word) => ({ word, meaning: word })));
}

function textLooksEnglishOnly(text: string): boolean {
  const hasHan = /[\u4e00-\u9fff]/.test(text);
  if (hasHan) return false;
  const tokens = text.match(/[A-Za-z][A-Za-z'-]*/g) || [];
  return tokens.length >= 1;
}

export function parseWordBookJson(text: string): WordEntry[] {
  const data = JSON.parse(text) as unknown;
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as { words?: unknown }).words)
      ? (data as { words: unknown[] }).words
      : null;
  if (!list) throw new Error("JSON 需为单词数组，或含 words 字段的对象");
  const words: WordEntry[] = [];
  for (const item of list) {
    if (typeof item === "string" && WORD_ONLY_RE.test(item.trim())) {
      words.push({ word: item.trim(), meaning: item.trim() });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const entry = normalizeEntry(item as Record<string, unknown>);
    if (entry) words.push(entry);
  }
  if (words.length === 0) throw new Error("未解析到有效单词");
  return dedupe(words);
}

export function parseWordBookCsv(text: string): WordEntry[] {
  if (textLooksEnglishOnly(text)) {
    const only = parseEnglishOnlyList(text);
    if (only.length) return only;
  }

  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) throw new Error("CSV 为空");

  const split = (line: string) => {
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        cells.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };

  const header = split(lines[0]).map((h) => h.toLowerCase());
  const hasHeader =
    header.includes("word") ||
    header.includes("english") ||
    header.includes("单词");

  const words: WordEntry[] = [];
  const start = hasHeader ? 1 : 0;

  const idx = (names: string[]) =>
    names.reduce((found, n) => (found >= 0 ? found : header.indexOf(n)), -1);

  const wordIdx = hasHeader ? Math.max(0, idx(["word", "english", "单词"])) : 0;
  const meaningIdx = hasHeader
    ? Math.max(1, idx(["meaning", "chinese", "translation", "释义", "中文"]))
    : 1;
  const phoneticIdx = hasHeader ? idx(["phonetic", "音标"]) : 2;
  const posIdx = hasHeader ? idx(["pos", "词性"]) : 3;
  const exampleIdx = hasHeader ? idx(["example", "例句"]) : 4;

  for (let i = start; i < lines.length; i++) {
    const cells = split(lines[i]);
    const word = (cells[wordIdx] ?? "").trim();
    const meaning = (cells[meaningIdx] ?? "").trim();
    if (!word) continue;
    if (!meaning && WORD_ONLY_RE.test(word)) {
      words.push({ word, meaning: word });
      continue;
    }
    if (!meaning) continue;
    const entry: WordEntry = { word, meaning };
    if (phoneticIdx >= 0 && cells[phoneticIdx]) {
      entry.phonetic = cells[phoneticIdx];
    }
    if (posIdx >= 0 && cells[posIdx]) entry.pos = cells[posIdx];
    if (exampleIdx >= 0 && cells[exampleIdx]) entry.example = cells[exampleIdx];
    words.push(entry);
  }

  if (words.length === 0) throw new Error("未解析到有效单词");
  return dedupe(words);
}

/**
 * 纯文本词书，兼容：
 * - 每行一个英文单词
 * - abandon 放弃 / abandon|放弃 / abandon: 放弃
 * - Word 导出后可能全部挤在一行用空格分隔
 */
export function parseWordBookTxt(text: string): WordEntry[] {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  if (!cleaned) throw new Error("TXT 为空");

  // 全文无中文 → 整表当作英文单词列表（避免把末字母当成释义）
  if (textLooksEnglishOnly(cleaned)) {
    const only = parseEnglishOnlyList(cleaned);
    if (only.length === 0) throw new Error("未能从文件解析出英文单词");
    return only;
  }

  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  if (lines.length === 0) throw new Error("TXT 为空");

  if (/^(word|english|单词)\b/i.test(lines[0]) && /,/.test(lines[0])) {
    return parseWordBookCsv(text);
  }

  const words: WordEntry[] = [];

  for (const line of lines) {
    if (!/[A-Za-z]/.test(line)) continue;

    if (WORD_ONLY_RE.test(line)) {
      words.push({ word: line, meaning: line });
      continue;
    }

    let m = line.match(WORD_MEANING_RE);
    if (m) {
      words.push({
        word: m[1].trim(),
        meaning: m[2].trim(),
      });
      continue;
    }

    m = line.match(WORD_SPACE_ZH_RE);
    if (m) {
      words.push({
        word: m[1].trim(),
        meaning: m[2].trim(),
      });
      continue;
    }

    // 一行多个纯英文词（如 Word 粘成一行）
    if (!/[\u4e00-\u9fff]/.test(line)) {
      const tokens = line.match(/[A-Za-z][A-Za-z'-]*/g) || [];
      for (const t of tokens) words.push({ word: t, meaning: t });
    }
  }

  if (words.length === 0) {
    throw new Error(
      "未能解析出单词。支持：每行一个英文词，或「english 中文释义」"
    );
  }
  return dedupe(words);
}

/** 给缺失/占位释义的词批量查中文（免费翻译） */
export async function enrichEmptyMeanings(
  words: WordEntry[],
  onProgress?: (done: number, total: number) => void
): Promise<WordEntry[]> {
  const out: WordEntry[] = [];
  const needLookup = words.filter(
    (w) =>
      !w.meaning ||
      w.meaning === w.word ||
      !/[\u4e00-\u9fff]/.test(w.meaning)
  );
  const total = needLookup.length || words.length;
  let done = 0;

  for (const w of words) {
    const needsZh =
      !w.meaning ||
      w.meaning === w.word ||
      !/[\u4e00-\u9fff]/.test(w.meaning);

    if (!needsZh) {
      out.push(w);
      continue;
    }

    let zh = "";
    try {
      zh = await translateEnToZh(w.word);
    } catch {
      zh = "";
    }
    done++;
    onProgress?.(done, total);

    if (zh && /[\u4e00-\u9fff]/.test(zh) && zh.toLowerCase() !== w.word.toLowerCase()) {
      // MyMemory 有时返回「单词：释义」之类，取中文部分
      const cleaned = zh
        .replace(new RegExp(w.word, "ig"), "")
        .replace(/^[\s:：\-–—]+/, "")
        .trim();
      const meaning = cleaned || zh;
      out.push({
        ...w,
        meaning,
        meanings: [meaning],
      });
    } else {
      out.push({ ...w, meaning: w.meaning || w.word });
    }

    // 温和限速，避免免费接口炸掉
    if (needsZh) {
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  return out;
}

export async function parseWordBookDocx(file: File): Promise<WordEntry[]> {
  const mammoth = await import("mammoth");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const text = (result.value || "").trim();
  if (!text) throw new Error("Word 文档没有可提取的文字");
  return parseWordBookTxt(text);
}

export async function parseUploadedWordBook(file: File): Promise<WordEntry[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".docx") || name.endsWith(".doc")) {
    if (name.endsWith(".doc") && !name.endsWith(".docx")) {
      throw new Error(
        "暂不支持旧版 .doc，请另存为 .docx 或导出为 TXT 后再上传"
      );
    }
    return parseWordBookDocx(file);
  }

  const text = await file.text();

  if (name.endsWith(".json")) return parseWordBookJson(text);
  if (name.endsWith(".csv")) return parseWordBookCsv(text);
  if (name.endsWith(".txt")) return parseWordBookTxt(text);

  try {
    return parseWordBookJson(text);
  } catch {
    try {
      return parseWordBookTxt(text);
    } catch {
      return parseWordBookCsv(text);
    }
  }
}
