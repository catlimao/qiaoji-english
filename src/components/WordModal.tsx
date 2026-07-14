"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  buildInstantLookup,
  getCachedLookup,
  setCachedLookup,
  type DictPayload,
} from "@/lib/lookup-cache";
import { lookupWordClient } from "@/lib/client-lookup";
import { isFakeTranslation } from "@/lib/translate";
import { getExamples, getMeanings } from "@/lib/word-utils";
import type { WordEntry } from "@/lib/types";

type Props = {
  word: WordEntry | null;
  contextMeaning?: string;
  inNotebook: boolean;
  onClose: () => void;
  onAdd: (word: WordEntry) => void;
};

export function WordModal({
  word,
  contextMeaning,
  inNotebook,
  onClose,
  onAdd,
}: Props) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [lookup, setLookup] = useState<DictPayload | null>(null);
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    if (!word) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [word, onClose]);

  useEffect(() => {
    if (!word) {
      setLookup(null);
      return;
    }

    // 1) 立刻展示词书内容
    const instant = buildInstantLookup(word, contextMeaning);
    // 2) 命中缓存则直接合并
    const cached = getCachedLookup(word.word);
    const initial: DictPayload = cached
      ? {
          phonetic: cached.phonetic || instant.phonetic,
          senses: mergeSenses(instant.senses, cached.senses),
          examples: mergeExamples(instant.examples, cached.examples),
        }
      : instant;
    setLookup(initial);

    let cancelled = false;
    setEnriching(true);

    const params = {
      word: word.word,
      context: (contextMeaning || word.meaning || "").trim(),
      book: getMeanings(word).join("；"),
      pos: word.pos || "—",
      bookExamples: getExamples(word),
    };

    lookupWordClient(params)
      .then((data) => {
        if (cancelled) return;
        const next: DictPayload = {
          phonetic: data.phonetic || initial.phonetic,
          senses: mergeSenses(initial.senses, data.senses || []),
          examples: mergeExamples(initial.examples, data.examples || []),
        };
        setLookup(next);
        setCachedLookup(word.word, next);
        setEnriching(false);
      })
      .catch(() => {
        if (!cancelled) setEnriching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [word, contextMeaning]);

  if (!word || !lookup) return null;

  const inContext = (contextMeaning || word.meaning || "").trim();
  const phonetic = lookup.phonetic || word.phonetic;

  const contextSense =
    lookup.senses.find(
      (s) => s.meaning === inContext || (inContext && s.meaning.includes(inContext))
    ) || (inContext ? { pos: word.pos || "—", meaning: inContext } : null);

  const otherSenses = lookup.senses.filter(
    (s) => s.meaning && s.meaning !== contextSense?.meaning
  );

  const examples = lookup.examples.filter((e) => e.en);
  const examplesWithZh = examples.filter((e) => e.zh);

  const enrichedForNotebook: WordEntry = {
    ...word,
    phonetic,
    pos: contextSense?.pos || word.pos,
    meaning: inContext || otherSenses[0]?.meaning || word.meaning,
    meanings: lookup.senses.map((s) => s.meaning).filter(Boolean),
    examples: examples.map((e) => e.en),
    exampleTranslations: examples.map((e) => e.zh || ""),
    example: examples[0]?.en,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/40 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto animate-in rounded-2xl border border-ink-200 bg-paper p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id={titleId}
              className="font-display text-3xl font-semibold tracking-tight text-ink-900"
            >
              {word.word}
            </h2>
            {phonetic && (
              <p className="mt-1 font-body text-sm text-ink-500">{phonetic}</p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
            aria-label="关闭"
          >
            关闭
          </button>
        </div>

        <dl className="mt-5 space-y-4 font-body text-sm">
          {contextSense && (
            <div>
              <dt className="text-ink-400">文中释义</dt>
              <dd className="mt-1 text-base text-ink-900">
                {contextSense.pos && contextSense.pos !== "—" && (
                  <span className="mr-2 rounded bg-ink-100 px-1.5 py-0.5 text-xs font-medium text-ink-600">
                    {contextSense.pos}
                  </span>
                )}
                <span className="font-semibold">{contextSense.meaning}</span>
              </dd>
            </div>
          )}

          <div>
            <dt className="text-ink-400">其他释义</dt>
            <dd className="mt-1.5 space-y-2">
              {otherSenses.length > 0 ? (
                otherSenses.map((s, i) => (
                  <p key={i} className="text-base leading-snug text-ink-800">
                    <span className="mr-2 inline-block min-w-[2.5rem] rounded bg-ink-100 px-1.5 py-0.5 text-center text-xs font-medium text-ink-600">
                      {s.pos || "—"}
                    </span>
                    {s.meaning}
                  </p>
                ))
              ) : (
                <p className="text-ink-400">
                  {enriching ? "正在补充义项…" : "暂无更多义项"}
                </p>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-ink-400">例句</dt>
            <dd className="mt-1.5 space-y-2">
              {examples.length > 0 ? (
                examples.map((ex, i) => (
                  <div
                    key={i}
                    className="rounded-lg bg-ink-50/80 px-3 py-2 leading-relaxed"
                  >
                    <p className="text-ink-800">{ex.en}</p>
                    {ex.zh ? (
                      <p className="mt-1 text-sm text-ink-500">{ex.zh}</p>
                    ) : enriching ? (
                      <p className="mt-1 text-sm text-ink-400">翻译加载中…</p>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-ink-400">
                  {enriching ? "正在加载例句…" : "暂无例句"}
                </p>
              )}
              {enriching && examplesWithZh.length === 0 && examples.length > 0 && (
                <p className="text-xs text-ink-400">正在补全中文翻译…</p>
              )}
            </dd>
          </div>
        </dl>

        <div className="mt-6">
          <button
            type="button"
            disabled={inNotebook}
            onClick={() => onAdd(enrichedForNotebook)}
            className="w-full rounded-xl bg-accent px-4 py-2.5 font-body text-sm font-medium text-white transition hover:bg-accent-deep disabled:cursor-default disabled:bg-ink-300"
          >
            {inNotebook ? "已在生词本" : "加入生词本"}
          </button>
        </div>
      </div>
    </div>
  );
}

function mergeSenses(
  a: { pos: string; meaning: string }[],
  b: { pos: string; meaning: string }[]
) {
  const out = [...a];
  const seen = new Set(a.map((s) => s.meaning));
  for (const s of b) {
    if (!s.meaning || seen.has(s.meaning)) continue;
    // 跳过纯英文长释义（API 偶发带回英英）
    if (/^[A-Za-z0-9\s,.'";:—\-()]+$/.test(s.meaning) && s.meaning.length > 24) {
      continue;
    }
    seen.add(s.meaning);
    out.push(s);
  }
  return out;
}

function mergeExamples(
  a: { en: string; zh: string }[],
  b: { en: string; zh: string }[]
) {
  const map = new Map<string, { en: string; zh: string }>();
  const prefer = (prevZh: string, nextZh: string) => {
    const pOk = prevZh && !isFakeTranslation(prevZh);
    const nOk = nextZh && !isFakeTranslation(nextZh);
    if (!pOk && nOk) return nextZh;
    if (pOk) return prevZh;
    return nOk ? nextZh : "";
  };
  for (const e of [...a, ...b]) {
    if (!e.en) continue;
    const zh = e.zh && !isFakeTranslation(e.zh) ? e.zh : "";
    const prev = map.get(e.en);
    if (!prev) map.set(e.en, { en: e.en, zh });
    else map.set(e.en, { en: e.en, zh: prefer(prev.zh, zh) });
  }
  return Array.from(map.values());
}
