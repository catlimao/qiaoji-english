/** 检测「这句话展示了…用法」这类伪翻译 */
export function isFakeTranslation(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return true;
  return /这句话展示了|表示「.*」的用法|展示了\s*[“"'].*[”"']/.test(t);
}

/** 免费英译中（MyMemory），失败时返回空串 */
export async function translateEnToZh(text: string): Promise<string> {
  const q = text.trim();
  if (!q) return "";
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=en|zh-CN`;
    const res = await fetch(url);
    if (!res.ok) return "";
    const data = (await res.json()) as {
      responseData?: { translatedText?: string };
    };
    const t = data.responseData?.translatedText?.trim() || "";
    if (!t) return "";
    if (/MYMEMORY WARNING/i.test(t)) return "";
    if (t.toLowerCase() === q.toLowerCase()) return "";
    if (isFakeTranslation(t)) return "";
    return t;
  } catch {
    return "";
  }
}

export async function translateMany(texts: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const t of texts) {
    // eslint-disable-next-line no-await-in-loop
    out.push(await translateEnToZh(t));
  }
  return out;
}
