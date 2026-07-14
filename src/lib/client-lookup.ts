import { isFakeTranslation, translateEnToZh } from "@/lib/translate";
import type { DictPayload, SenseItem, ExampleItem } from "@/lib/lookup-cache";

function splitBookMeanings(book: string): string[] {
  return book
    .split(/[；;、|/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function fetchFreeDict(word: string): Promise<{
  phonetic?: string;
  examples: string[];
  firstPos?: string;
}> {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`
    );
    if (!res.ok) return { examples: [] };
    const data = (await res.json()) as Array<{
      phonetic?: string;
      phonetics?: { text?: string }[];
      meanings?: Array<{
        partOfSpeech?: string;
        definitions?: Array<{ example?: string }>;
      }>;
    }>;
    const entry = data[0];
    if (!entry) return { examples: [] };

    const phonetic =
      entry.phonetic ||
      entry.phonetics?.find((p) => p.text)?.text ||
      undefined;

    const examples: string[] = [];
    let firstPos: string | undefined;
    for (const m of entry.meanings ?? []) {
      if (!firstPos && m.partOfSpeech) firstPos = `${m.partOfSpeech}.`;
      for (const d of m.definitions ?? []) {
        if (d.example && examples.length < 2) examples.push(d.example);
      }
    }
    return { phonetic, examples, firstPos };
  } catch {
    return { examples: [] };
  }
}

async function translateWithTimeout(text: string, ms = 3500): Promise<string> {
  return Promise.race([
    translateEnToZh(text),
    new Promise<string>((resolve) => setTimeout(() => resolve(""), ms)),
  ]);
}

/** 纯前端查词（无需 /api/lookup） */
export async function lookupWordClient(params: {
  word: string;
  context?: string;
  book?: string;
  pos?: string;
  bookExamples?: string[];
}): Promise<DictPayload> {
  const {
    word,
    context = "",
    book = "",
    pos = "—",
    bookExamples = [],
  } = params;

  const senses: SenseItem[] = [];
  const seen = new Set<string>();
  const pushSense = (p: string, meaning: string) => {
    const m = meaning.trim();
    if (!m || seen.has(m)) return;
    seen.add(m);
    senses.push({ pos: p || "—", meaning: m });
  };

  if (context) pushSense(pos, context);
  for (const m of splitBookMeanings(book)) pushSense(pos, m);

  const free = await fetchFreeDict(word);
  if ((!pos || pos === "—") && free.firstPos) {
    for (const s of senses) {
      if (s.pos === "—") s.pos = free.firstPos;
    }
  }

  const enList = Array.from(
    new Set([
      ...bookExamples.map((e) => e.trim()).filter(Boolean),
      ...free.examples,
    ])
  ).slice(0, 3);

  const examples: ExampleItem[] = (
    await Promise.all(
      enList.map(async (en) => {
        const zh = await translateWithTimeout(en, 3500);
        const clean = isFakeTranslation(zh) ? "" : zh;
        return { en, zh: clean };
      })
    )
  ).filter((e) => e.en);

  return {
    phonetic: free.phonetic,
    senses: senses.slice(0, 8),
    examples,
  };
}
