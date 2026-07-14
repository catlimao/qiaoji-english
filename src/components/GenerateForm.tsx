"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DEFAULT_SETTINGS,
  WORD_COUNT_MAX,
  WORD_COUNT_MIN,
  addStoryToHistory,
  getAllBooks,
  getApiConfig,
  getGenerateSettings,
  getSeriesChapters,
  getSeriesList,
  saveGenerateSettings,
} from "@/lib/storage";
import { DEFAULT_API_CONFIG } from "@/lib/providers";
import { BUILTIN_BOOKS, pickRandomWords } from "@/lib/wordbooks";
import { normalizeWordEntry } from "@/lib/word-utils";
import { generateStoryClient } from "@/lib/client-generate";
import type {
  ApiConfig,
  GenerateSettings,
  GeneratedStory,
  WordBook,
} from "@/lib/types";

const STYLE_PRESETS = [
  "霸总小说",
  "玛丽苏文学",
  "穿越小说",
  "无限流",
  "古风言情",
  "悬疑推理",
  "校园青春",
];

const LENGTH_OPTIONS = [
  { value: "short" as const, label: "短篇", range: "100–200 字" },
  { value: "medium" as const, label: "中篇", range: "500–800 字" },
  { value: "long" as const, label: "长篇", range: "1000–1200 字" },
];

type Props = {
  onGenerated: (story: GeneratedStory, seriesChapters?: GeneratedStory[]) => void;
};

export function GenerateForm({ onGenerated }: Props) {
  // 立即用默认值渲染，避免「加载设置中…」空等
  const [books, setBooks] = useState<WordBook[]>(BUILTIN_BOOKS);
  const [apiConfig, setApiConfig] = useState<ApiConfig>(DEFAULT_API_CONFIG);
  const [settings, setSettings] = useState<GenerateSettings>(DEFAULT_SETTINGS);
  const [wordCountText, setWordCountText] = useState(
    String(DEFAULT_SETTINGS.wordCount)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seriesOptions, setSeriesOptions] = useState<
    ReturnType<typeof getSeriesList>
  >([]);

  useEffect(() => {
    const refresh = () => {
      setBooks(getAllBooks());
      setApiConfig(getApiConfig());
      const s = getGenerateSettings();
      setSettings(s);
      setWordCountText(String(s.wordCount));
      setSeriesOptions(getSeriesList());
    };
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const selectedBook = useMemo(
    () => books.find((b) => b.id === settings.selectedBookId) ?? books[0],
    [books, settings.selectedBookId]
  );

  const update = (patch: Partial<GenerateSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveGenerateSettings(next);
  };

  const commitWordCount = (raw: string) => {
    const n = Number(raw);
    const clamped = Number.isFinite(n)
      ? Math.max(WORD_COUNT_MIN, Math.min(WORD_COUNT_MAX, Math.round(n)))
      : WORD_COUNT_MIN;
    setWordCountText(String(clamped));
    update({ wordCount: clamped });
    return clamped;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const latestApi = getApiConfig();
    setApiConfig(latestApi);
    const latestBooks = getAllBooks();
    setBooks(latestBooks);
    const book =
      latestBooks.find((b) => b.id === settings.selectedBookId) ?? latestBooks[0];

    const useCustom = latestApi.provider !== "free";
    if (useCustom && !latestApi.apiKey.trim()) {
      setError("自备模型需填写 API Key，或切回「免费模型」");
      return;
    }
    if (!book || book.words.length === 0) {
      setError("请选择一本有效词书");
      return;
    }
    if (!settings.style.trim()) {
      setError("请选择或输入小说类型");
      return;
    }

    const wordCount = commitWordCount(wordCountText);
    const words = pickRandomWords(book.words, wordCount).map(normalizeWordEntry);

    let seriesId = "";
    let seriesTitle = "";
    let chapter = 1;
    let previousRaw = "";

    if (settings.mode === "serial") {
      if (settings.activeSeriesId) {
        const chapters = getSeriesChapters(settings.activeSeriesId);
        if (chapters.length === 0) {
          setError("找不到所选连载，请新建或重新选择");
          return;
        }
        const last = chapters[chapters.length - 1];
        seriesId = settings.activeSeriesId;
        seriesTitle = last.seriesTitle || settings.seriesTitle || settings.style;
        chapter = (last.chapter ?? chapters.length) + 1;
        previousRaw = last.raw;
      } else {
        seriesTitle =
          settings.seriesTitle.trim() || `${settings.style.trim()}·连载`;
        seriesId = `series-${Date.now()}`;
        chapter = 1;
      }
    }

    setLoading(true);
    try {
      const data = await generateStoryClient({
        provider: latestApi.provider || "free",
        baseUrl: latestApi.baseUrl,
        apiKey: latestApi.apiKey,
        model: latestApi.model,
        style: settings.style.trim(),
        words,
        length: settings.length,
        mode: settings.mode,
        seriesTitle: settings.mode === "serial" ? seriesTitle : undefined,
        chapter: settings.mode === "serial" ? chapter : undefined,
        previousRaw:
          settings.mode === "serial" && previousRaw
            ? previousRaw
            : undefined,
      });
      const story: GeneratedStory = {
        id: `story-${Date.now()}`,
        createdAt: Date.now(),
        style: settings.style.trim(),
        raw: data.raw,
        segments: data.segments,
        words,
        mode: settings.mode,
        ...(settings.mode === "serial"
          ? { seriesId, seriesTitle, chapter }
          : {}),
      };
      addStoryToHistory(story);
      if (settings.mode === "serial") {
        update({ activeSeriesId: seriesId, seriesTitle });
        setSeriesOptions(getSeriesList());
        onGenerated(story, getSeriesChapters(seriesId));
      } else {
        onGenerated(story);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-ink-200 bg-paper/90 p-5 shadow-sm sm:p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <span className="mb-1.5 block font-body text-xs font-medium uppercase tracking-wide text-ink-500">
            小说类型 / 风格
          </span>
          <p className="mb-2 font-body text-xs text-ink-500">
            可点选预设，也可自行输入任意类型
          </p>
          <div className="mb-2 flex flex-wrap gap-2">
            {STYLE_PRESETS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => update({ style: s })}
                className={`rounded-lg px-2.5 py-1 font-body text-xs transition ${
                  settings.style === s
                    ? "bg-ink-800 text-paper"
                    : "bg-ink-100 text-ink-600 hover:bg-ink-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={settings.style}
            onChange={(e) => update({ style: e.target.value })}
            placeholder="例如：霸总小说、赛博修仙、末日求生…"
            className="w-full rounded-xl border border-ink-200 bg-white/70 px-3 py-2.5 font-body text-sm text-ink-900 outline-none ring-accent/30 transition focus:ring-2"
            required
          />
        </div>

        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 font-body text-xs font-medium uppercase tracking-wide text-ink-500">
            生成模式
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => update({ mode: "oneshot" })}
              className={`rounded-xl px-4 py-3 text-left transition ${
                settings.mode === "oneshot"
                  ? "bg-accent text-white"
                  : "bg-ink-100 text-ink-700 hover:bg-ink-200"
              }`}
            >
              <span className="block text-sm font-medium">完整单篇</span>
              <span
                className={`mt-0.5 block text-xs ${
                  settings.mode === "oneshot" ? "text-white/80" : "text-ink-500"
                }`}
              >
                每次生成独立完整故事
              </span>
            </button>
            <button
              type="button"
              onClick={() => update({ mode: "serial" })}
              className={`rounded-xl px-4 py-3 text-left transition ${
                settings.mode === "serial"
                  ? "bg-accent text-white"
                  : "bg-ink-100 text-ink-700 hover:bg-ink-200"
              }`}
            >
              <span className="block text-sm font-medium">连载</span>
              <span
                className={`mt-0.5 block text-xs ${
                  settings.mode === "serial" ? "text-white/80" : "text-ink-500"
                }`}
              >
                剧情连贯，历史合并为一部
              </span>
            </button>
          </div>
        </fieldset>

        {settings.mode === "serial" && (
          <div className="space-y-3 rounded-xl border border-dashed border-ink-300 bg-ink-50/50 p-4 sm:col-span-2">
            <label className="block">
              <span className="mb-1.5 block font-body text-xs font-medium text-ink-500">
                续写已有连载
              </span>
              <select
                value={settings.activeSeriesId}
                onChange={(e) => {
                  const id = e.target.value;
                  const found = seriesOptions.find((s) => s.id === id);
                  update({
                    activeSeriesId: id,
                    seriesTitle: found?.title ?? settings.seriesTitle,
                    style: found?.style ?? settings.style,
                  });
                }}
                className="w-full rounded-xl border border-ink-200 bg-white/70 px-3 py-2.5 font-body text-sm outline-none ring-accent/30 focus:ring-2"
              >
                <option value="">新建连载</option>
                {seriesOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}（已 {s.chapters.length} 章）
                  </option>
                ))}
              </select>
            </label>
            {!settings.activeSeriesId && (
              <label className="block">
                <span className="mb-1.5 block font-body text-xs font-medium text-ink-500">
                  新连载标题
                </span>
                <input
                  type="text"
                  value={settings.seriesTitle}
                  onChange={(e) => update({ seriesTitle: e.target.value })}
                  placeholder="例如：陆沉渊的复仇"
                  className="w-full rounded-xl border border-ink-200 bg-white/70 px-3 py-2.5 font-body text-sm outline-none ring-accent/30 focus:ring-2"
                />
              </label>
            )}
          </div>
        )}

        <label className="block">
          <span className="mb-1.5 block font-body text-xs font-medium uppercase tracking-wide text-ink-500">
            词书
          </span>
          <select
            value={selectedBook?.id ?? ""}
            onChange={(e) => update({ selectedBookId: e.target.value })}
            className="w-full rounded-xl border border-ink-200 bg-white/70 px-3 py-2.5 font-body text-sm text-ink-900 outline-none ring-accent/30 focus:ring-2"
          >
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}（{b.words.length} 词）
              </option>
            ))}
          </select>
          <Link
            href="/books"
            className="mt-1.5 inline-block font-body text-xs text-accent-deep hover:underline"
          >
            管理 / 上传词书
          </Link>
        </label>

        <label className="block">
          <span className="mb-1.5 block font-body text-xs font-medium uppercase tracking-wide text-ink-500">
            本次嵌入单词数
          </span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={wordCountText}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d]/g, "");
              setWordCountText(v);
            }}
            onBlur={() => commitWordCount(wordCountText)}
            className="w-full rounded-xl border border-ink-200 bg-white/70 px-3 py-2.5 font-body text-sm text-ink-900 outline-none ring-accent/30 focus:ring-2"
          />
          <span className="mt-1.5 block font-body text-xs text-ink-500">
            手动输入数字，范围 {WORD_COUNT_MIN}–{WORD_COUNT_MAX}
          </span>
        </label>

        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 font-body text-xs font-medium uppercase tracking-wide text-ink-500">
            篇幅
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {LENGTH_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => update({ length: opt.value })}
                className={`rounded-xl px-4 py-3 text-left font-body transition ${
                  settings.length === opt.value
                    ? "bg-accent text-white"
                    : "bg-ink-100 text-ink-700 hover:bg-ink-200"
                }`}
              >
                <span className="block text-sm font-medium">{opt.label}</span>
                <span
                  className={`mt-0.5 block text-xs ${
                    settings.length === opt.value
                      ? "text-white/80"
                      : "text-ink-500"
                  }`}
                >
                  {opt.range}
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 font-body text-sm text-red-800"
        >
          {error}
          {apiConfig.provider !== "free" && !apiConfig.apiKey.trim() && (
            <>
              {" · "}
              <Link href="/settings" className="underline">
                去配置
              </Link>
            </>
          )}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-5 w-full rounded-xl bg-ink-900 px-4 py-3 font-body text-sm font-medium text-paper transition hover:bg-ink-800 disabled:cursor-wait disabled:opacity-70 sm:w-auto sm:min-w-[10rem]"
      >
        {loading
          ? "生成中…"
          : settings.mode === "serial"
            ? settings.activeSeriesId
              ? "续写下一章"
              : "开写第一章"
            : "生成完整故事"}
      </button>
    </form>
  );
}
