import type { WordEntry } from "./types";
import { isFakeTranslation } from "./translate";
import { getExamples, getMeanings } from "./word-utils";

export type SenseItem = { pos: string; meaning: string };
export type ExampleItem = { en: string; zh: string };
export type DictPayload = {
  phonetic?: string;
  senses: SenseItem[];
  examples: ExampleItem[];
};

const CACHE_KEY = "qj_lookup_cache_v2";
const memoryCache = new Map<string, DictPayload>();

function readDiskCache(): Record<string, DictPayload> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, DictPayload>;
  } catch {
    return {};
  }
}

function writeDiskCache(map: Record<string, DictPayload>) {
  if (typeof window === "undefined") return;
  try {
    const keys = Object.keys(map);
    if (keys.length > 200) {
      for (const k of keys.slice(0, keys.length - 200)) delete map[k];
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

export function getCachedLookup(word: string): DictPayload | null {
  const key = word.toLowerCase();
  if (memoryCache.has(key)) return memoryCache.get(key)!;
  const disk = readDiskCache();
  const hit = disk[key];
  if (hit) {
    memoryCache.set(key, hit);
    return hit;
  }
  return null;
}

export function setCachedLookup(word: string, data: DictPayload) {
  const key = word.toLowerCase();
  memoryCache.set(key, data);
  const disk = readDiskCache();
  disk[key] = data;
  writeDiskCache(disk);
}

/** 打开弹窗立刻可用的本地释义（不等网络） */
export function buildInstantLookup(
  word: WordEntry,
  contextMeaning?: string
): DictPayload {
  const inContext = (contextMeaning || word.meaning || "").trim();
  const meanings = getMeanings(word);
  const senses: SenseItem[] = [];
  const seen = new Set<string>();

  const push = (pos: string, meaning: string) => {
    const m = meaning.trim();
    if (!m || seen.has(m)) return;
    seen.add(m);
    senses.push({ pos: pos || word.pos || "—", meaning: m });
  };

  if (inContext) push(word.pos || "—", inContext);
  for (const m of meanings) push(word.pos || "—", m);

  const examplesEn = getExamples(word);
  const zhList = word.exampleTranslations || [];
  const examples: ExampleItem[] = examplesEn
    .map((en, i) => {
      const raw = zhList[i] || "";
      const zh = isFakeTranslation(raw) ? "" : raw;
      return { en, zh };
    })
    .filter((e) => e.en);

  return {
    phonetic: word.phonetic,
    senses,
    examples,
  };
}
