import type { WordEntry } from "./types";
import { translateEnToZh } from "./translate";

/** 解码 HTML 实体与脏控制符 */
function decodeDirtyText(raw: string): string {
  return raw
    .replace(/&#x0[dD];/gi, "")
    .replace(/&#\d+;/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\r/g, "")
    .trim();
}

/**
 * 清洗释义：去掉拼音、词性前缀、占位符「—」，取干净中文
 * 例：轉變 转变 [zhuan3 bian4] → 转变
 *     v.安排 → 安排
 *     （音乐）大声播放&#x0D; → （音乐）大声播放
 */
export function cleanMeaning(raw: string): {
  meaning: string;
  phonetic?: string;
  pos?: string;
} {
  let s = decodeDirtyText(raw);
  if (!s || /^[—\-–.•·]+$/.test(s)) {
    return { meaning: "" };
  }

  let phonetic: string | undefined;
  let pos: string | undefined;

  const pinyinMatch = s.match(/\[([a-zA-Z0-9\s']+)\]/);
  if (pinyinMatch) {
    phonetic = `/${pinyinMatch[1].trim().replace(/\s+/g, " ")}/`;
    s = s.replace(/\[[a-zA-Z0-9\s']+\]/g, " ");
  }

  const posMatch = s.match(
    /^\s*((?:n|v|adj|adv|prep|conj|pron|num|int|vt|vi|aux)\.?)\s+/i
  );
  if (posMatch) {
    pos = posMatch[1].endsWith(".") ? posMatch[1] : `${posMatch[1]}.`;
    s = s.slice(posMatch[0].length);
  }

  s = s
    .replace(/^[—\-–.•·\s]+/, "")
    .replace(/[—\-–.•·\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  // 「轉變 转变」按空白切开，取最后一块纯中文释义
  const parts = s
    .split(/\s+/)
    .map((p) => p.trim())
    .filter((p) => /[\u4e00-\u9fff]/.test(p));
  if (parts.length >= 1) {
    s = parts[parts.length - 1].replace(/[^\u4e00-\u9fff（）()\-]/g, "");
  } else {
    const hans = s.match(/[\u4e00-\u9fff（）()]+/g);
    if (hans?.length) s = hans[hans.length - 1];
  }

  // 仍无中文则置空，留给 enrich
  if (!/[\u4e00-\u9fff]/.test(s)) {
    return { meaning: "", phonetic, pos };
  }

  return { meaning: s, phonetic, pos };
}

function makeEntry(
  word: string,
  meaningRaw: string,
  extra?: Partial<WordEntry>
): WordEntry | null {
  const w = word.trim();
  if (!w || !/^[A-Za-z]/.test(w)) return null;
  const cleaned = cleanMeaning(meaningRaw || "");
  const meaning = cleaned.meaning || w;
  const entry: WordEntry = {
    word: w,
    meaning,
    meanings: cleaned.meaning ? [cleaned.meaning] : undefined,
    ...extra,
  };
  if (cleaned.phonetic && !entry.phonetic) entry.phonetic = cleaned.phonetic;
  if (cleaned.pos && !entry.pos) entry.pos = cleaned.pos;
  return entry;
}

function normalizeEntry(raw: Record<string, unknown>): WordEntry | null {
  const word = String(raw.word ?? raw.Word ?? raw.english ?? "").trim();
  let meaning = String(
    raw.meaning ?? raw.Meaning ?? raw.chinese ?? raw.translation ?? ""
  ).trim();

  let meanings: string[] | undefined;
  if (Array.isArray(raw.meanings)) {
    meanings = raw.meanings
      .map((m) => cleanMeaning(String(m)).meaning)
      .filter(Boolean);
  }
  if (!meaning && meanings?.length) meaning = meanings[0];
  if (!word) return null;

  const cleaned = cleanMeaning(meaning);
  const entry = makeEntry(word, cleaned.meaning || meaning);
  if (!entry) return null;

  if (meanings && meanings.length > 0) {
    entry.meanings = meanings;
    entry.meaning = meanings[0];
  }

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
  /^([A-Za-z][A-Za-z'-]*)\s*[,，|｜:：\-–—]\s*(.+)$/;
const WORD_SPACE_ZH_RE =
  /^([A-Za-z][A-Za-z'-]*)\s+(.+)$/;

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

/** Tab 分隔：word \\t meaning \\t … */
function parseTabLine(line: string): WordEntry | null {
  if (!line.includes("\t")) return null;
  const cols = line.split("\t").map((c) => c.trim());
  const word = cols[0] || "";
  if (!WORD_ONLY_RE.test(word) && !/^[A-Za-z][A-Za-z'-]*$/.test(word)) {
    return null;
  }
  // 合并后续含中文的列作为释义源
  const meaningSrc = cols
    .slice(1)
    .filter((c) => c && !/^[—\-–.•·]+$/.test(c))
    .join(" ");
  return makeEntry(word, meaningSrc);
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

  // 优先按 Tab 解析（Anki / 词表导出常见）
  if (lines.filter((l) => l.includes("\t")).length >= Math.ceil(lines.length * 0.5)) {
    const words: WordEntry[] = [];
    for (const line of lines) {
      const e = parseTabLine(line);
      if (e) words.push(e);
    }
    if (words.length > 0) return dedupe(words);
  }

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
    const meaningRaw = (cells[meaningIdx] ?? "").trim();
    if (!word) continue;
    const entry = makeEntry(word, meaningRaw);
    if (!entry) continue;
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
 * - alter\\t轉變 转变 [zhuan3 bian4]\\t—
 * - Word 导出后可能全部挤在一行用空格分隔
 */
export function parseWordBookTxt(text: string): WordEntry[] {
  const cleaned = decodeDirtyText(text.replace(/^\uFEFF/, "")).trim();
  if (!cleaned) throw new Error("TXT 为空");

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

  // 多数行含 Tab → 走 Tab 词表
  if (lines.filter((l) => l.includes("\t")).length >= Math.ceil(lines.length * 0.4)) {
    const tabWords: WordEntry[] = [];
    for (const line of lines) {
      const e = parseTabLine(line);
      if (e) tabWords.push(e);
    }
    if (tabWords.length > 0) return dedupe(tabWords);
  }

  const words: WordEntry[] = [];

  for (const line of lines) {
    if (!/[A-Za-z]/.test(line)) continue;

    if (WORD_ONLY_RE.test(line)) {
      words.push({ word: line, meaning: line });
      continue;
    }

    const tabEntry = parseTabLine(line);
    if (tabEntry) {
      words.push(tabEntry);
      continue;
    }

    let m = line.match(WORD_MEANING_RE);
    if (m) {
      const e = makeEntry(m[1], m[2]);
      if (e) words.push(e);
      continue;
    }

    m = line.match(WORD_SPACE_ZH_RE);
    if (m && /[\u4e00-\u9fff]/.test(m[2])) {
      const e = makeEntry(m[1], m[2]);
      if (e) words.push(e);
      continue;
    }

    if (!/[\u4e00-\u9fff]/.test(line)) {
      const tokens = line.match(/[A-Za-z][A-Za-z'-]*/g) || [];
      for (const t of tokens) words.push({ word: t, meaning: t });
    }
  }

  if (words.length === 0) {
    throw new Error(
      "未能解析出单词。支持：每行一个英文词，或「english 中文」，或 Tab 分隔词表"
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
  const total = needLookup.length || 1;
  let done = 0;

  for (const w of words) {
    const needsZh =
      !w.meaning ||
      w.meaning === w.word ||
      !/[\u4e00-\u9fff]/.test(w.meaning);

    if (!needsZh) {
      // 再次清洗已有释义
      const cleaned = cleanMeaning(w.meaning);
      out.push({
        ...w,
        meaning: cleaned.meaning || w.meaning,
        meanings: cleaned.meaning ? [cleaned.meaning] : w.meanings,
        phonetic: w.phonetic || cleaned.phonetic,
        pos: w.pos || cleaned.pos,
      });
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

    if (
      zh &&
      /[\u4e00-\u9fff]/.test(zh) &&
      zh.toLowerCase() !== w.word.toLowerCase()
    ) {
      const cleaned = cleanMeaning(
        zh
          .replace(new RegExp(w.word, "ig"), "")
          .replace(/^[\s:：\-–—]+/, "")
          .trim() || zh
      );
      out.push({
        ...w,
        meaning: cleaned.meaning || zh,
        meanings: [cleaned.meaning || zh],
        phonetic: w.phonetic || cleaned.phonetic,
        pos: w.pos || cleaned.pos,
      });
    } else {
      out.push({ ...w, meaning: w.meaning || w.word });
    }

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

export async function parseWordBookPdf(
  file: File,
  onProgress?: (done: number, total: number) => void
): Promise<WordEntry[]> {
  const { extractTextFromPdf, parseBbdcStylePdfText } = await import(
    "./parse-pdf"
  );
  const text = (await extractTextFromPdf(file, onProgress)).trim();
  if (!text) throw new Error("PDF 没有可提取的文字（可能是扫描件图片）");

  // 优先「不背单词」序号词表结构
  const bbdc = parseBbdcStylePdfText(text);
  if (bbdc.length >= 20) {
    return dedupe(
      bbdc.map((e) => ({
        word: e.word,
        meaning: e.meaning,
        meanings: e.meanings,
      }))
    );
  }

  // 通用文本解析兜底
  try {
    return parseWordBookTxt(text);
  } catch {
    const only = parseEnglishOnlyList(text);
    if (only.length === 0) {
      throw new Error(
        "未能从 PDF 解析出单词。请确认是可选中文字的 PDF，或改用 TXT/Word"
      );
    }
    return only;
  }
}

export async function parseUploadedWordBook(
  file: File,
  onProgress?: (label: string, done?: number, total?: number) => void
): Promise<WordEntry[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf")) {
    onProgress?.("正在读取 PDF…");
    return parseWordBookPdf(file, (done, total) => {
      onProgress?.(`正在解析 PDF ${done}/${total} 页`, done, total);
    });
  }

  if (name.endsWith(".docx") || name.endsWith(".doc")) {
    if (name.endsWith(".doc") && !name.endsWith(".docx")) {
      throw new Error(
        "暂不支持旧版 .doc，请另存为 .docx 或导出为 TXT / PDF 后再上传"
      );
    }
    return parseWordBookDocx(file);
  }

  const text = await file.text();

  if (name.endsWith(".json")) return parseWordBookJson(text);
  if (name.endsWith(".csv") || name.endsWith(".tsv")) return parseWordBookCsv(text);
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
