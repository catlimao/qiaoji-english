import type {
  ApiConfig,
  GenerateSettings,
  GeneratedStory,
  HistoryGroup,
  NotebookItem,
  WordBook,
  WordEntry,
} from "./types";
import { BUILTIN_BOOKS } from "./wordbooks";
import { DEFAULT_API_CONFIG } from "./providers";
import { normalizeWordEntry } from "./word-utils";

const KEYS = {
  books: "qj_wordbooks",
  notebook: "qj_notebook",
  api: "qj_api_config",
  settings: "qj_generate_settings",
  story: "qj_last_story",
  history: "qj_story_history",
} as const;

const MAX_HISTORY = 80;
const WORD_COUNT_MIN = 10;
const WORD_COUNT_MAX = 50;

export { WORD_COUNT_MIN, WORD_COUNT_MAX };

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (!canUseStorage()) return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function getUploadedBooks(): WordBook[] {
  return readJson<WordBook[]>(KEYS.books, []);
}

export function getAllBooks(): WordBook[] {
  return [...BUILTIN_BOOKS, ...getUploadedBooks()].map((b) => ({
    ...b,
    words: b.words.map(normalizeWordEntry),
  }));
}

export function saveUploadedBooks(books: WordBook[]): void {
  writeJson(
    KEYS.books,
    books.filter((b) => b.source === "upload")
  );
}

export function addUploadedBook(book: WordBook): void {
  const books = getUploadedBooks();
  books.unshift({
    ...book,
    words: book.words.map(normalizeWordEntry),
  });
  saveUploadedBooks(books);
}

export function removeUploadedBook(id: string): void {
  saveUploadedBooks(getUploadedBooks().filter((b) => b.id !== id));
}

export function getNotebook(): NotebookItem[] {
  return readJson<NotebookItem[]>(KEYS.notebook, []).map((i) => ({
    ...normalizeWordEntry(i),
    addedAt: i.addedAt,
    fromStoryId: i.fromStoryId,
  }));
}

export function saveNotebook(items: NotebookItem[]): void {
  writeJson(KEYS.notebook, items);
}

export function addToNotebook(word: WordEntry, fromStoryId?: string): boolean {
  const items = getNotebook();
  const exists = items.some(
    (i) => i.word.toLowerCase() === word.word.toLowerCase()
  );
  if (exists) return false;
  items.unshift({
    ...normalizeWordEntry(word),
    addedAt: Date.now(),
    fromStoryId,
  });
  saveNotebook(items);
  return true;
}

export function removeFromNotebook(word: string): void {
  saveNotebook(
    getNotebook().filter((i) => i.word.toLowerCase() !== word.toLowerCase())
  );
}

export function isInNotebook(word: string): boolean {
  return getNotebook().some((i) => i.word.toLowerCase() === word.toLowerCase());
}

export function getApiConfig(): ApiConfig {
  if (!canUseStorage()) return { ...DEFAULT_API_CONFIG };
  try {
    const rawText = localStorage.getItem(KEYS.api);
    if (!rawText) return { ...DEFAULT_API_CONFIG };
    const raw = JSON.parse(rawText) as Partial<ApiConfig>;
    const hasKey = !!(raw.apiKey || "").trim();
    // 旧默认「DeepSeek 且无 Key」→ 免费通道
    if (!hasKey && (!raw.provider || raw.provider === "deepseek")) {
      return { ...DEFAULT_API_CONFIG };
    }
    return {
      ...DEFAULT_API_CONFIG,
      ...raw,
      provider: raw.provider || (hasKey ? "deepseek" : "free"),
    };
  } catch {
    return { ...DEFAULT_API_CONFIG };
  }
}

export function saveApiConfig(config: ApiConfig): void {
  writeJson(KEYS.api, config);
}

export const DEFAULT_SETTINGS: GenerateSettings = {
  style: "霸总小说",
  wordCount: 10,
  length: "medium",
  selectedBookId: "builtin-cet4",
  mode: "oneshot",
  activeSeriesId: "",
  seriesTitle: "",
};

function clampWordCount(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.wordCount;
  return Math.max(WORD_COUNT_MIN, Math.min(WORD_COUNT_MAX, Math.round(n)));
}

export function getGenerateSettings(): GenerateSettings {
  const raw = readJson<Partial<GenerateSettings>>(KEYS.settings, {});
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    mode: raw.mode === "serial" ? "serial" : "oneshot",
    activeSeriesId: typeof raw.activeSeriesId === "string" ? raw.activeSeriesId : "",
    seriesTitle: typeof raw.seriesTitle === "string" ? raw.seriesTitle : "",
    wordCount: clampWordCount(
      typeof raw.wordCount === "number" ? raw.wordCount : DEFAULT_SETTINGS.wordCount
    ),
  };
}

export function saveGenerateSettings(settings: GenerateSettings): void {
  writeJson(KEYS.settings, {
    ...settings,
    wordCount: clampWordCount(settings.wordCount),
  });
}

export function getLastStory(): GeneratedStory | null {
  return readJson<GeneratedStory | null>(KEYS.story, null);
}

export function saveLastStory(story: GeneratedStory | null): void {
  if (story === null) {
    if (canUseStorage()) localStorage.removeItem(KEYS.story);
    return;
  }
  writeJson(KEYS.story, story);
}

export function getStoryHistory(): GeneratedStory[] {
  const list = readJson<GeneratedStory[]>(KEYS.history, []);
  if (list.length > 0) return list;
  const last = getLastStory();
  if (last) {
    writeJson(KEYS.history, [last]);
    return [last];
  }
  return [];
}

function writeHistory(list: GeneratedStory[]): void {
  writeJson(KEYS.history, list.slice(0, MAX_HISTORY));
}

export function addStoryToHistory(story: GeneratedStory): void {
  const prev = getStoryHistory().filter((s) => s.id !== story.id);
  const next = [story, ...prev].slice(0, MAX_HISTORY);
  writeHistory(next);
  saveLastStory(story);
}

export function getStoryById(id: string): GeneratedStory | null {
  return getStoryHistory().find((s) => s.id === id) ?? null;
}

export function getSeriesChapters(seriesId: string): GeneratedStory[] {
  return getStoryHistory()
    .filter((s) => s.seriesId === seriesId)
    .sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0));
}

export function getSeriesList(): Array<{
  id: string;
  title: string;
  style: string;
  chapters: GeneratedStory[];
  updatedAt: number;
}> {
  const map = new Map<
    string,
    {
      id: string;
      title: string;
      style: string;
      chapters: GeneratedStory[];
      updatedAt: number;
    }
  >();

  for (const story of getStoryHistory()) {
    if (story.mode !== "serial" || !story.seriesId) continue;
    const existing = map.get(story.seriesId);
    if (!existing) {
      map.set(story.seriesId, {
        id: story.seriesId,
        title: story.seriesTitle || story.style,
        style: story.style,
        chapters: [story],
        updatedAt: story.createdAt,
      });
    } else {
      existing.chapters.push(story);
      existing.updatedAt = Math.max(existing.updatedAt, story.createdAt);
      if (story.seriesTitle) existing.title = story.seriesTitle;
    }
  }

  for (const s of Array.from(map.values())) {
    s.chapters.sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0));
  }

  return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getHistoryGroups(): HistoryGroup[] {
  const stories = getStoryHistory();
  const seriesSeen = new Set<string>();
  const groups: HistoryGroup[] = [];

  // Preserve recency: walk stories newest-first, emit series once
  for (const story of stories) {
    if (story.mode === "serial" && story.seriesId) {
      if (seriesSeen.has(story.seriesId)) continue;
      seriesSeen.add(story.seriesId);
      const chapters = getSeriesChapters(story.seriesId);
      const latest = chapters[chapters.length - 1] ?? story;
      groups.push({
        kind: "series",
        id: story.seriesId,
        title: story.seriesTitle || story.style,
        style: story.style,
        chapters,
        updatedAt: latest.createdAt,
      });
    } else {
      groups.push({
        kind: "oneshot",
        id: story.id,
        story,
        updatedAt: story.createdAt,
      });
    }
  }

  return groups.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function removeStoryFromHistory(id: string): void {
  const next = getStoryHistory().filter((s) => s.id !== id);
  writeHistory(next);
  const last = getLastStory();
  if (last?.id === id) {
    saveLastStory(next[0] ?? null);
  }
}

export function removeSeriesFromHistory(seriesId: string): void {
  const next = getStoryHistory().filter((s) => s.seriesId !== seriesId);
  writeHistory(next);
  const last = getLastStory();
  if (last?.seriesId === seriesId) {
    saveLastStory(next[0] ?? null);
  }
}

export function clearStoryHistory(): void {
  writeHistory([]);
  saveLastStory(null);
}
