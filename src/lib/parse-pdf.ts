/**
 * 浏览器端用 pdf.js 提取 PDF 文本。
 */
export async function extractTextFromPdf(
  file: File,
  onProgress?: (done: number, total: number) => void
): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const total = doc.numPages;
  const parts: string[] = [];

  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // 用换行尽量保留「序号 + 单词」结构
    const strings: string[] = [];
    let lastY: number | null = null;
    for (const it of content.items) {
      if (!("str" in it)) continue;
      const item = it as { str: string; transform?: number[] };
      const y = item.transform?.[5];
      if (lastY != null && y != null && Math.abs(lastY - y) > 2) {
        strings.push("\n");
      } else if (strings.length > 0 && !strings[strings.length - 1].endsWith("\n")) {
        strings.push(" ");
      }
      strings.push(item.str);
      if (y != null) lastY = y;
    }
    parts.push(strings.join(""));
    onProgress?.(i, total);
  }

  return parts.join("\n\n");
}

function stripPos(s: string): string {
  return s
    .replace(/\b(?:vt|vi|n|adj|adv|prep|conj|pron|num|int|aux)\.?\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 解析「不背单词」类 PDF：序号英文词 + 序号中文释义。
 */
export function parseBbdcStylePdfText(text: string): {
  word: string;
  meaning: string;
  meanings?: string[];
}[] {
  const normalized = text.normalize("NFKC");

  const wordMap = new Map<number, string>();
  // 行首或空白后：12 abandon / 12.abandon
  const wordRe =
    /(?:^|[\s\n])(\d{1,5})\s*\.?\s*([A-Za-z][A-Za-z'\-]{1,39})(?=[\s\n]|$)/gm;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(normalized)) !== null) {
    const n = Number(m[1]);
    const w = m[2];
    // 过滤页码类短命中：词必须像英语单词
    if (n < 1 || n > 30000) continue;
    if (!/^[A-Za-z]+(?:'[A-Za-z]+)?(?:-[A-Za-z]+)*$/.test(w)) continue;
    if (!wordMap.has(n)) wordMap.set(n, w);
  }

  const meanMap = new Map<number, string[]>();
  const meanStartRe =
    /(?:^|[\s\n])(\d{1,5})\s*((?:(?:vt|vi|n|adj|adv|prep|conj|pron|num|int|aux)\.?\s*)+)([\u4e00-\u9fff（）()…，、；;：:\-\sA-Za-z0-9]{1,240})/gim;

  while ((m = meanStartRe.exec(normalized)) !== null) {
    const n = Number(m[1]);
    const chunk = stripPos(`${m[2]} ${m[3]}`);
    if (!/[\u4e00-\u9fff]/.test(chunk)) continue;
    const list = meanMap.get(n) || [];
    list.push(chunk);
    meanMap.set(n, list);
  }

  // 若释义正则偏少，宽松兜底：数字 + 中文
  if (meanMap.size < wordMap.size * 0.3) {
    const looseRe =
      /(?:^|[\s\n])(\d{1,5})\s+([^\n\d]{0,20}[\u4e00-\u9fff][^\n\d]{0,160})/gm;
    while ((m = looseRe.exec(normalized)) !== null) {
      const n = Number(m[1]);
      if (meanMap.has(n)) continue;
      const chunk = stripPos(m[2]);
      if (/[\u4e00-\u9fff]/.test(chunk)) meanMap.set(n, [chunk]);
    }
  }

  const out: { word: string; meaning: string; meanings?: string[] }[] = [];
  const seen = new Set<string>();
  const nums = Array.from(wordMap.keys()).sort((a, b) => a - b);

  for (const n of nums) {
    const word = wordMap.get(n)!;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const rawParts = meanMap.get(n) || [];
    const joined = rawParts.join("；");
    const meanings = joined
      .split(/[；;]/)
      .map((s) => s.trim())
      .filter((s) => /[\u4e00-\u9fff]/.test(s))
      .slice(0, 6);
    const meaning = meanings[0] || word;
    out.push(
      meanings.length > 0 ? { word, meaning, meanings } : { word, meaning }
    );
  }

  return out;
}
