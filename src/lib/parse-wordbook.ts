import type { WordEntry } from "./types";

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
  if (!word || !meaning) return null;

  if (!meanings) {
    meanings = meaning
      .split(/[；;｜|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const entry: WordEntry = {
    word,
    meaning: meanings[0] || meaning,
    meanings: meanings.length > 0 ? meanings : undefined,
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
    if (!item || typeof item !== "object") continue;
    const entry = normalizeEntry(item as Record<string, unknown>);
    if (entry) words.push(entry);
  }
  if (words.length === 0) throw new Error("未解析到有效单词");
  return dedupe(words);
}

export function parseWordBookCsv(text: string): WordEntry[] {
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
    if (!word || !meaning) continue;
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
 * abandon 放弃 / abandon	放弃 / abandon|放弃 / abandon - 放弃 / abandon：放弃
 */
export function parseWordBookTxt(text: string): WordEntry[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  if (lines.length === 0) throw new Error("TXT 为空");

  if (/^(word|english|单词)\b/i.test(lines[0]) && /,/.test(lines[0])) {
    return parseWordBookCsv(text);
  }

  const words: WordEntry[] = [];
  const lineRe =
    /^([A-Za-z][A-Za-z'-]*)\s*[,，|｜\t:：\-–—]?\s*(.+)$/;

  for (const line of lines) {
    if (!/[A-Za-z]/.test(line)) continue;

    const m = line.match(lineRe);
    if (!m) continue;
    const word = m[1].trim();
    const meaning = m[2].trim().replace(/^[,，|｜\-:：–—]\s*/, "");
    if (word && meaning) words.push({ word, meaning });
  }

  if (words.length === 0) {
    throw new Error(
      "未能从 TXT 解析出单词。每行请写成：english 中文释义（也可用逗号/竖线/冒号分隔）"
    );
  }
  return dedupe(words);
}

export async function parseWordBookDocx(file: File): Promise<WordEntry[]> {
  const mammoth = await import("mammoth");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const text = (result.value || "").trim();
  if (!text) throw new Error("Word 文档没有可提取的文字");
  try {
    return parseWordBookTxt(text);
  } catch {
    try {
      return parseWordBookCsv(text);
    } catch {
      throw new Error(
        "Word 内容格式无法识别。请每行一个词，如：abandon 放弃"
      );
    }
  }
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
  if (name.endsWith(".txt")) {
    try {
      return parseWordBookTxt(text);
    } catch {
      return parseWordBookCsv(text);
    }
  }

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
