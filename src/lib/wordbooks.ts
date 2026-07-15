import type { WordEntry, WordBook } from "./types";
import cet4 from "@/data/cet4-sample.json";
import cet6 from "@/data/cet6-sample.json";
import kaoyan from "@/data/kaoyan-sample.json";
import kaoyanHongbaoshu from "@/data/kaoyan-hongbaoshu-2026.json";

export const BUILTIN_BOOKS: WordBook[] = [
  {
    id: "builtin-cet4",
    name: "四级词汇",
    source: "builtin",
    words: cet4 as WordEntry[],
  },
  {
    id: "builtin-cet6",
    name: "六级词汇",
    source: "builtin",
    words: cet6 as WordEntry[],
  },
  {
    id: "builtin-kaoyan",
    name: "考研词汇（精简）",
    source: "builtin",
    words: kaoyan as WordEntry[],
  },
  {
    id: "builtin-kaoyan-hongbaoshu-2026",
    name: "考研红宝书2026（乱序）",
    source: "builtin",
    words: kaoyanHongbaoshu as WordEntry[],
  },
];

export function pickRandomWords(words: WordEntry[], count: number): WordEntry[] {
  if (words.length === 0) return [];
  const n = Math.min(count, words.length);
  const copy = [...words];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}
