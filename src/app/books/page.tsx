"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WordBookUploader } from "@/components/WordBookUploader";
import type { WordBook } from "@/lib/types";
import {
  getAllBooks,
  getGenerateSettings,
  removeUploadedBook,
  saveGenerateSettings,
} from "@/lib/storage";

export default function BooksPage() {
  const [books, setBooks] = useState<WordBook[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");

  const refresh = () => {
    const all = getAllBooks();
    setBooks(all);
    const settings = getGenerateSettings();
    setSelectedId(settings.selectedBookId);
  };

  useEffect(() => {
    refresh();
  }, []);

  const preview = books.find((b) => b.id === previewId);

  const selectBook = (id: string) => {
    const settings = getGenerateSettings();
    saveGenerateSettings({ ...settings, selectedBookId: id });
    setSelectedId(id);
  };

  const removeBook = (id: string) => {
    if (!confirm("确定删除这本上传的词书？")) return;
    removeUploadedBook(id);
    if (selectedId === id) {
      const settings = getGenerateSettings();
      saveGenerateSettings({ ...settings, selectedBookId: "builtin-cet4" });
      setSelectedId("builtin-cet4");
    }
    if (previewId === id) setPreviewId(null);
    refresh();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink-900">词书管理</h1>
        <p className="mt-2 font-body text-sm text-ink-600">
          内置四六级 / 考研样例词书，也可上传 TXT、Word（.docx）、CSV 或 JSON。
        </p>
      </div>

      <WordBookUploader
        onUploaded={(book) => {
          refresh();
          setPreviewId(book.id);
          selectBook(book.id);
        }}
      />

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-ink-900">我的词书</h2>
        <ul className="space-y-3">
          {books.map((book) => (
            <li
              key={book.id}
              className="flex flex-col gap-3 rounded-2xl border border-ink-200 bg-paper p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-body font-medium text-ink-900">
                  {book.name}
                  {selectedId === book.id && (
                    <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent-deep">
                      使用中
                    </span>
                  )}
                </p>
                <p className="mt-0.5 font-body text-xs text-ink-500">
                  {book.source === "builtin" ? "内置样例" : "本地上传"} · {book.words.length} 词
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewId(book.id)}
                  className="rounded-lg bg-ink-100 px-3 py-1.5 text-sm text-ink-700 hover:bg-ink-200"
                >
                  预览
                </button>
                <button
                  type="button"
                  onClick={() => selectBook(book.id)}
                  className="rounded-lg bg-ink-900 px-3 py-1.5 text-sm text-paper hover:bg-ink-800"
                >
                  选用
                </button>
                {book.source === "upload" && (
                  <button
                    type="button"
                    onClick={() => removeBook(book.id)}
                    className="rounded-lg px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                  >
                    删除
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {preview && (
        <section className="rounded-2xl border border-ink-200 bg-paper p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-lg font-semibold text-ink-900">
              预览：{preview.name}
            </h3>
            <button
              type="button"
              onClick={() => setPreviewId(null)}
              className="text-sm text-ink-500 hover:text-ink-800"
            >
              收起
            </button>
          </div>
          <div className="mt-4 max-h-72 overflow-auto">
            <table className="w-full text-left font-body text-sm">
              <thead className="sticky top-0 bg-paper text-ink-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">单词</th>
                  <th className="py-2 pr-3 font-medium">释义</th>
                  <th className="py-2 font-medium">音标</th>
                </tr>
              </thead>
              <tbody>
                {preview.words.slice(0, 80).map((w) => (
                  <tr key={w.word} className="border-t border-ink-100">
                    <td className="py-1.5 pr-3 font-medium text-ink-900">{w.word}</td>
                    <td className="py-1.5 pr-3 text-ink-700">{w.meaning}</td>
                    <td className="py-1.5 text-ink-500">{w.phonetic ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.words.length > 80 && (
              <p className="mt-2 text-xs text-ink-500">
                仅显示前 80 词，共 {preview.words.length} 词
              </p>
            )}
          </div>
        </section>
      )}

      <p className="font-body text-sm text-ink-500">
        选好词书后回{" "}
        <Link href="/" className="text-accent-deep underline">
          首页
        </Link>{" "}
        生成小说。
      </p>
    </div>
  );
}
