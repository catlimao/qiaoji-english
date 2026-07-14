"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { GenerateForm } from "@/components/GenerateForm";
import { StoryReader } from "@/components/StoryReader";
import type { GeneratedStory } from "@/lib/types";
import {
  getLastStory,
  getSeriesChapters,
  getStoryById,
  saveLastStory,
} from "@/lib/storage";

function HomeContent() {
  const searchParams = useSearchParams();
  const [story, setStory] = useState<GeneratedStory | null>(null);
  const [chapters, setChapters] = useState<GeneratedStory[] | undefined>();

  useEffect(() => {
    const seriesId = searchParams.get("series");
    const storyId = searchParams.get("story");

    if (seriesId) {
      const list = getSeriesChapters(seriesId);
      if (list.length > 0) {
        setChapters(list);
        setStory(list[list.length - 1]);
        saveLastStory(list[list.length - 1]);
        return;
      }
    }

    if (storyId) {
      const found = getStoryById(storyId);
      if (found) {
        if (found.seriesId) {
          setChapters(getSeriesChapters(found.seriesId));
          setStory(found);
        } else {
          setChapters(undefined);
          setStory(found);
        }
        saveLastStory(found);
        return;
      }
    }

    const last = getLastStory();
    if (last?.seriesId) {
      setChapters(getSeriesChapters(last.seriesId));
      setStory(last);
    } else {
      setChapters(undefined);
      setStory(last);
    }
  }, [searchParams]);

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl border border-ink-200/60 bg-gradient-to-br from-[#f8f1e6] via-paper to-[#e8dcc8] px-6 py-10 sm:px-10 sm:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-accent/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 left-10 h-48 w-48 rounded-full bg-ink-400/10 blur-3xl"
        />
        <p className="font-display text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl md:text-6xl">
          巧记英语
        </p>
        <h1 className="sr-only">巧记英语 · 单词小说生成</h1>
        <p className="mt-4 max-w-xl font-body text-base leading-relaxed text-ink-700 sm:text-lg">
          把四六级、考研单词写进你定义的小说世界——霸总、穿越、无限流，随你定调。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-ink-900">
          生成设置
        </h2>
        <GenerateForm
          onGenerated={(next, seriesChapters) => {
            setStory(next);
            setChapters(seriesChapters);
          }}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-ink-900">
            小说正文
          </h2>
          <div className="flex items-center gap-3">
            {story && (
              <p className="font-body text-xs text-ink-500">
                {story.mode === "serial"
                  ? `${story.seriesTitle || story.style} · 第 ${story.chapter ?? 1} 章`
                  : story.style}{" "}
                · {new Date(story.createdAt).toLocaleString()}
              </p>
            )}
            <Link
              href="/history"
              className="font-body text-xs text-accent-deep hover:underline"
            >
              历史记录
            </Link>
          </div>
        </div>
        <StoryReader story={story} chapters={chapters} storyId={story?.id} />
      </section>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<GenerateFormSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

function GenerateFormSkeleton() {
  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-ink-200/60 bg-paper px-6 py-10">
        <p className="font-display text-4xl font-semibold text-ink-950">
          巧记英语
        </p>
      </section>
      <div className="rounded-2xl border border-ink-200 bg-paper/70 p-6 text-sm text-ink-500">
        准备中…
      </div>
    </div>
  );
}
