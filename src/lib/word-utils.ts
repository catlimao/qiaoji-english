import type { WordEntry } from "./types";

/** 拆分「账户；叙述」这类词典多义写法 */
export function splitMeanings(meaning: string): string[] {
  return meaning
    .split(/[；;｜|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getMeanings(word: WordEntry): string[] {
  if (word.meanings && word.meanings.length > 0) {
    return word.meanings.map((m) => m.trim()).filter(Boolean);
  }
  return splitMeanings(word.meaning);
}

export function getPrimaryMeaning(word: WordEntry): string {
  return getMeanings(word)[0] || word.meaning;
}

export function getExamples(word: WordEntry): string[] {
  const list: string[] = [];
  if (word.examples?.length) list.push(...word.examples);
  if (word.example) list.push(word.example);
  return Array.from(new Set(list.map((e) => e.trim()).filter(Boolean)));
}

/** 规范化词条：补全 meanings / 主释义 */
export function normalizeWordEntry(word: WordEntry): WordEntry {
  const meanings = getMeanings(word);
  const examples = getExamples(word);
  return {
    ...word,
    meaning: meanings[0] || word.meaning,
    meanings: meanings.length > 0 ? meanings : undefined,
    examples: examples.length > 0 ? examples : undefined,
    example: examples[0] || word.example,
  };
}

export type DictionaryEnrichment = {
  phonetic?: string;
  meanings: string[];
  examples: string[];
  pos?: string;
};

/** 使用免费英英词典补充例句与英文义项说明（中文释义仍以词书为准） */
export async function fetchDictionaryEnrichment(
  word: string
): Promise<DictionaryEnrichment | null> {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      phonetic?: string;
      phonetics?: { text?: string }[];
      meanings?: Array<{
        partOfSpeech?: string;
        definitions?: Array<{ definition?: string; example?: string }>;
      }>;
    }>;
    const entry = data[0];
    if (!entry) return null;

    const phonetic =
      entry.phonetic ||
      entry.phonetics?.find((p) => p.text)?.text ||
      undefined;

    const meanings: string[] = [];
    const examples: string[] = [];
    let pos: string | undefined;

    for (const m of entry.meanings ?? []) {
      if (!pos && m.partOfSpeech) pos = m.partOfSpeech;
      for (const d of m.definitions ?? []) {
        if (d.definition) {
          const label = m.partOfSpeech
            ? `${m.partOfSpeech}. ${d.definition}`
            : d.definition;
          meanings.push(label);
        }
        if (d.example) examples.push(d.example);
      }
    }

    return {
      phonetic,
      pos,
      meanings: meanings.slice(0, 6),
      examples: examples.slice(0, 4),
    };
  } catch {
    return null;
  }
}

export function mergeDictionary(
  word: WordEntry,
  enrich: DictionaryEnrichment | null
): WordEntry {
  const base = normalizeWordEntry(word);
  if (!enrich) return base;

  const examples = [
    ...getExamples(base),
    ...enrich.examples,
  ];
  const uniqueExamples = Array.from(new Set(examples)).slice(0, 6);

  return {
    ...base,
    phonetic: base.phonetic || enrich.phonetic,
    pos: base.pos || (enrich.pos ? `${enrich.pos}.` : undefined),
    examples: uniqueExamples.length ? uniqueExamples : undefined,
    example: uniqueExamples[0],
    // 保留中文多义；英英义项作为补充字段放在 meanings 之后展示时单独处理
    meanings: getMeanings(base),
    // stash english defs on a custom field via examples-only; WordModal will take enrich separately
  };
}
