"use client";

import { useEffect, useMemo, useState } from "react";
import type { NotebookItem, WordEntry } from "@/lib/types";
import {
  getNotebook,
  removeFromNotebook,
  isInNotebook,
  addToNotebook,
} from "@/lib/storage";
import { WordModal } from "@/components/WordModal";

export default function NotebookPage() {
  const [items, setItems] = useState<NotebookItem[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<WordEntry | null>(null);

  const refresh = () => setItems(getNotebook());

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.word.toLowerCase().includes(q) ||
        i.meaning.toLowerCase().includes(q)
    );
  }, [items, query]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink-900">生词本</h1>
        <p className="mt-2 font-body text-sm text-ink-600">
          数据保存在本机浏览器，不会上传到服务器。共 {items.length} 个词。
        </p>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索单词或释义…"
        className="w-full rounded-xl border border-ink-200 bg-paper px-3 py-2.5 font-body text-sm outline-none ring-accent/30 focus:ring-2 sm:max-w-md"
      />

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-paper/60 px-6 py-14 text-center">
          <p className="font-body text-sm text-ink-500">
            {items.length === 0
              ? "生词本还是空的。在小说正文里点击高亮单词即可加入。"
              : "没有匹配的单词。"}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-paper">
          {filtered.map((item) => (
            <li
              key={`${item.word}-${item.addedAt}`}
              className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
            >
              <button
                type="button"
                onClick={() => setActive(item)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="font-body font-semibold text-accent-deep">
                  {item.word}
                </span>
                <span className="ml-2 font-body text-sm text-ink-700">
                  {item.meaning}
                </span>
                {item.pos && (
                  <span className="ml-2 font-body text-xs text-ink-400">
                    {item.pos}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  removeFromNotebook(item.word);
                  refresh();
                  if (active?.word.toLowerCase() === item.word.toLowerCase()) {
                    setActive(null);
                  }
                }}
                className="shrink-0 rounded-lg px-2 py-1 text-xs text-red-700 hover:bg-red-50"
              >
                移除
              </button>
            </li>
          ))}
        </ul>
      )}

      <WordModal
        word={active}
        inNotebook={!!active && isInNotebook(active.word)}
        onClose={() => setActive(null)}
        onAdd={(word) => {
          addToNotebook(word);
          refresh();
        }}
      />
    </div>
  );
}
