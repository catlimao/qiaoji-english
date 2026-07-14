"use client";

import { useCallback, useMemo, useState } from "react";
import type { GeneratedStory, StorySegment, WordEntry } from "@/lib/types";
import { WordModal } from "./WordModal";
import { addToNotebook, isInNotebook } from "@/lib/storage";
import { sanitizeSegments } from "@/lib/parse-story";

type ActiveWord = {
  word: WordEntry;
  contextMeaning?: string;
};

type Props = {
  segments?: StorySegment[];
  story?: GeneratedStory | null;
  chapters?: GeneratedStory[];
  storyId?: string;
  emptyHint?: string;
};

function splitParagraphs(segments: StorySegment[]): StorySegment[][] {
  const paragraphs: StorySegment[][] = [];
  let current: StorySegment[] = [];

  const pushCurrent = () => {
    if (current.length === 0) return;
    const hasContent = current.some((s) => s.content.trim().length > 0);
    if (hasContent) paragraphs.push(current);
    current = [];
  };

  for (const seg of segments) {
    if (seg.type === "word") {
      current.push(seg);
      continue;
    }
    const parts = seg.content.split(/\n+/);
    parts.forEach((part, idx) => {
      if (part) current.push({ type: "text", content: part });
      if (idx < parts.length - 1) pushCurrent();
    });
  }
  pushCurrent();
  return paragraphs.length > 0 ? paragraphs : [segments];
}

function ChapterBody({
  segments,
  onWordClick,
}: {
  segments: StorySegment[];
  onWordClick: (payload: ActiveWord) => void;
}) {
  const safeSegments = useMemo(() => sanitizeSegments(segments), [segments]);
  const paragraphs = useMemo(
    () => splitParagraphs(safeSegments),
    [safeSegments]
  );

  return (
    <div className="story-body space-y-5">
      {paragraphs.map((para, pi) => (
        <p
          key={pi}
          className="story-paragraph font-display text-[1.08rem] leading-[2.05] text-ink-800"
        >
          {para.map((seg, i) => {
            if (seg.type === "text") {
              return <span key={i}>{seg.content}</span>;
            }
            const label = (seg.word?.word || seg.content).replace(
              /（.*?）|\(.*?\)/g,
              ""
            );
            return (
              <button
                key={i}
                type="button"
                onClick={() =>
                  seg.word &&
                  onWordClick({
                    word: seg.word,
                    contextMeaning: seg.contextMeaning,
                  })
                }
                className="word-highlight mx-0.5 inline align-baseline font-bold text-ink-950 underline decoration-ink-400/50 decoration-2 underline-offset-[5px] transition hover:bg-ink-100 hover:decoration-ink-700"
              >
                {label}
              </button>
            );
          })}
        </p>
      ))}
    </div>
  );
}

export function StoryReader({
  segments,
  story,
  chapters,
  storyId,
  emptyHint = "生成后的小说将显示在这里。点击黑色加粗单词可查看释义与例句。",
}: Props) {
  const [active, setActive] = useState<ActiveWord | null>(null);
  const [notebookTick, setNotebookTick] = useState(0);

  const handleAdd = useCallback(
    (word: WordEntry) => {
      addToNotebook(word, storyId || story?.id);
      setNotebookTick((t) => t + 1);
    },
    [storyId, story?.id]
  );

  const wordInNotebook =
    !!active && notebookTick >= 0 && isInNotebook(active.word.word);

  const list =
    chapters && chapters.length > 0
      ? chapters
      : story
        ? [story]
        : segments && segments.length > 0
          ? [
              {
                id: storyId || "preview",
                createdAt: Date.now(),
                style: "",
                raw: "",
                segments,
                words: [],
              } satisfies GeneratedStory,
            ]
          : [];

  if (list.length === 0 || list.every((c) => c.segments.length === 0)) {
    return (
      <div className="rounded-2xl border border-dashed border-ink-200 bg-paper/60 px-6 py-16 text-center">
        <p className="font-body text-sm leading-relaxed text-ink-500">
          {emptyHint}
        </p>
      </div>
    );
  }

  return (
    <>
      <article className="story-panel overflow-hidden rounded-2xl border border-ink-200/80 shadow-sm">
        <div className="border-b border-ink-200/60 bg-gradient-to-r from-[#f3ebe0] to-paper px-6 py-4 sm:px-10">
          {list[0].mode === "serial" || list.length > 1 ? (
            <div>
              <p className="font-display text-lg font-semibold text-ink-900">
                {list[0].seriesTitle || list[0].style}
              </p>
              <p className="mt-0.5 font-body text-xs text-ink-500">
                连载 · 共 {list.length} 章 · {list[0].style}
              </p>
            </div>
          ) : (
            <div>
              <p className="font-display text-lg font-semibold text-ink-900">
                {list[0].style || "小说正文"}
              </p>
              <p className="mt-0.5 font-body text-xs text-ink-500">完整单篇</p>
            </div>
          )}
        </div>

        <div className="space-y-10 bg-paper px-6 py-8 sm:px-10 sm:py-10">
          {list.map((ch) => (
            <section key={ch.id} className="story-chapter">
              {(ch.mode === "serial" || list.length > 1) && (
                <h3 className="mb-5 font-display text-base font-semibold tracking-wide text-ink-600">
                  第 {ch.chapter ?? 1} 章
                </h3>
              )}
              <ChapterBody segments={ch.segments} onWordClick={setActive} />
            </section>
          ))}
        </div>
      </article>
      <WordModal
        word={active?.word ?? null}
        contextMeaning={active?.contextMeaning}
        inNotebook={wordInNotebook}
        onClose={() => setActive(null)}
        onAdd={handleAdd}
      />
    </>
  );
}
