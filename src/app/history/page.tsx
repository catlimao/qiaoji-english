"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { HistoryGroup } from "@/lib/types";
import {
  clearStoryHistory,
  getHistoryGroups,
  removeSeriesFromHistory,
  removeStoryFromHistory,
  saveLastStory,
} from "@/lib/storage";

function previewFromSegments(
  segments: { content: string }[],
  max = 80
): string {
  const plain = segments
    .map((s) => s.content)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max)}…`;
}

export default function HistoryPage() {
  const [groups, setGroups] = useState<HistoryGroup[]>([]);

  const refresh = () => setGroups(getHistoryGroups());

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink-900">
            生成历史
          </h1>
          <p className="mt-2 font-body text-sm text-ink-600">
            连载会合并为一部；单篇各自独立。共 {groups.length} 条记录。
          </p>
        </div>
        {groups.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (!confirm("确定清空全部历史？")) return;
              clearStoryHistory();
              refresh();
            }}
            className="rounded-lg px-3 py-1.5 font-body text-sm text-red-700 hover:bg-red-50"
          >
            清空历史
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-paper/60 px-6 py-14 text-center">
          <p className="font-body text-sm text-ink-500">
            还没有历史记录。去首页生成第一篇吧。
          </p>
          <Link
            href="/"
            className="mt-3 inline-block font-body text-sm text-accent-deep underline"
          >
            返回生成
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {groups.map((group) => {
            if (group.kind === "series") {
              const last = group.chapters[group.chapters.length - 1];
              return (
                <li
                  key={group.id}
                  className="rounded-2xl border border-ink-200 bg-paper p-4 sm:p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-body text-sm font-medium text-ink-900">
                        <span className="mr-2 rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent-deep">
                          连载
                        </span>
                        {group.title}
                        <span className="ml-2 font-normal text-ink-500">
                          · {group.chapters.length} 章 ·{" "}
                          {new Date(group.updatedAt).toLocaleString()}
                        </span>
                      </p>
                      <p className="mt-1 font-body text-xs text-ink-500">
                        风格：{group.style}
                      </p>
                      {last && (
                        <p className="mt-2 font-body text-sm leading-relaxed text-ink-600 line-clamp-2">
                          {previewFromSegments(last.segments)}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Link
                        href={`/?series=${encodeURIComponent(group.id)}`}
                        onClick={() => last && saveLastStory(last)}
                        className="rounded-lg bg-ink-900 px-3 py-1.5 text-sm text-paper hover:bg-ink-800"
                      >
                        打开
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            !confirm(
                              `删除连载「${group.title}」全部 ${group.chapters.length} 章？`
                            )
                          ) {
                            return;
                          }
                          removeSeriesFromHistory(group.id);
                          refresh();
                        }}
                        className="rounded-lg px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </li>
              );
            }

            const story = group.story;
            return (
              <li
                key={group.id}
                className="rounded-2xl border border-ink-200 bg-paper p-4 sm:p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-sm font-medium text-ink-900">
                      <span className="mr-2 rounded bg-ink-100 px-1.5 py-0.5 text-xs text-ink-600">
                        单篇
                      </span>
                      {story.style}
                      <span className="ml-2 font-normal text-ink-500">
                        · {new Date(story.createdAt).toLocaleString()}
                      </span>
                    </p>
                    <p className="mt-2 font-body text-sm leading-relaxed text-ink-600 line-clamp-2">
                      {previewFromSegments(story.segments)}
                    </p>
                    <p className="mt-1 font-body text-xs text-ink-400">
                      含 {story.words.length} 个目标词
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link
                      href={`/?story=${encodeURIComponent(story.id)}`}
                      onClick={() => saveLastStory(story)}
                      className="rounded-lg bg-ink-900 px-3 py-1.5 text-sm text-paper hover:bg-ink-800"
                    >
                      打开
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        removeStoryFromHistory(story.id);
                        refresh();
                      }}
                      className="rounded-lg px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
