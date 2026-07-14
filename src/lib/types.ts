export type WordEntry = {
  word: string;
  /** 主释义 / 文中释义 */
  meaning: string;
  /** 词典多义项（中文） */
  meanings?: string[];
  phonetic?: string;
  example?: string;
  examples?: string[];
  /** 例句中文翻译（与 examples 对齐） */
  exampleTranslations?: string[];
  pos?: string;
};

export type WordBook = {
  id: string;
  name: string;
  source: "builtin" | "upload";
  words: WordEntry[];
};

export type NotebookItem = WordEntry & {
  addedAt: number;
  fromStoryId?: string;
};

export type StorySegment = {
  type: "text" | "word";
  /** 正文展示：单词不加中文 */
  content: string;
  word?: WordEntry;
  /** 文中该处采用的释义 */
  contextMeaning?: string;
};

export type ProviderId = "free" | "deepseek" | "openai" | "qwen" | "custom";

export type ApiConfig = {
  /** free = 默认免费通道，无需填写 Key */
  provider: ProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type StoryMode = "oneshot" | "serial";

export type GenerateSettings = {
  style: string;
  wordCount: number;
  length: "short" | "medium" | "long";
  selectedBookId: string;
  mode: StoryMode;
  activeSeriesId: string;
  seriesTitle: string;
};

export type GeneratedStory = {
  id: string;
  createdAt: number;
  style: string;
  raw: string;
  segments: StorySegment[];
  words: WordEntry[];
  mode?: StoryMode;
  seriesId?: string;
  seriesTitle?: string;
  chapter?: number;
};

export type HistoryGroup =
  | {
      kind: "oneshot";
      id: string;
      story: GeneratedStory;
      updatedAt: number;
    }
  | {
      kind: "series";
      id: string;
      title: string;
      style: string;
      chapters: GeneratedStory[];
      updatedAt: number;
    };

export type GenerateRequest = {
  provider: ProviderId;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  style: string;
  words: WordEntry[];
  length: "short" | "medium" | "long";
  mode: StoryMode;
  seriesTitle?: string;
  chapter?: number;
  previousRaw?: string;
};

export type GenerateResponse = {
  raw: string;
  segments: StorySegment[];
};
