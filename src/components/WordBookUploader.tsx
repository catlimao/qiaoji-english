"use client";

import { useEffect, useRef, useState } from "react";
import type { WordBook } from "@/lib/types";
import {
  enrichEmptyMeanings,
  parseUploadedWordBook,
} from "@/lib/parse-wordbook";
import { addUploadedBook } from "@/lib/storage";

type Props = {
  onUploaded: (book: WordBook) => void;
};

type UploadResult = {
  ok: boolean;
  title: string;
  detail: string;
};

export function WordBookUploader({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);

  useEffect(() => {
    if (!result) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setResult(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result]);

  const handleFile = async (file: File) => {
    setResult(null);
    setBusy(true);
    setPercent(4);
    try {
      let words = await parseUploadedWordBook(file, (_label, done, total) => {
        if (typeof done === "number" && typeof total === "number" && total > 0) {
          // PDF 页进度：占前 55%
          setPercent(Math.min(55, Math.round((done / total) * 55)));
        } else {
          setPercent((p) => Math.min(50, Math.max(p, 12)));
        }
      });

      const needZh = words.some(
        (w) =>
          !w.meaning ||
          w.meaning === w.word ||
          !/[\u4e00-\u9fff]/.test(w.meaning)
      );
      if (needZh) {
        setPercent(58);
        words = await enrichEmptyMeanings(words, (done, total) => {
          const base = 58;
          const span = 38;
          setPercent(
            Math.min(96, base + Math.round((done / Math.max(1, total)) * span))
          );
        });
      } else {
        setPercent(90);
      }

      const bookName =
        name.trim() ||
        file.name.replace(/\.(json|csv|txt|tsv|docx|doc|pdf)$/i, "") ||
        "自定义词书";
      const book: WordBook = {
        id: `upload-${Date.now()}`,
        name: bookName,
        source: "upload",
        words,
      };
      addUploadedBook(book);
      onUploaded(book);
      setName("");
      if (inputRef.current) inputRef.current.value = "";
      setPercent(100);
      setResult({
        ok: true,
        title: "上传成功",
        detail: `「${bookName}」已导入，共 ${words.length} 个单词。`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "上传失败";
      setResult({
        ok: false,
        title: "上传失败",
        detail: msg,
      });
    } finally {
      setBusy(false);
      setPercent(0);
    }
  };

  return (
    <div className="rounded-2xl border border-ink-200 bg-paper p-5">
      <h2 className="font-display text-lg font-semibold text-ink-900">
        上传词书
      </h2>
      <p className="mt-1 font-body text-sm text-ink-500">
        支持 TXT / Word(.docx) / PDF / CSV / TSV / JSON。可每行一个英文词，或
        <code className="mx-1 rounded bg-ink-100 px-1">abandon 放弃</code>
        ；PDF 支持「不背单词」等序号词表（扫描图片件无法识别）。
      </p>
      <label className="mt-4 block">
        <span className="mb-1.5 block font-body text-xs font-medium text-ink-500">
          词书名称（可选）
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：我的考研核心词"
          className="w-full rounded-xl border border-ink-200 bg-white/70 px-3 py-2 font-body text-sm outline-none ring-accent/30 focus:ring-2"
        />
      </label>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.docx,.pdf,.csv,.tsv,.json,text/plain,application/json,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="mt-4 block w-full font-body text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-900 file:px-3 file:py-2 file:text-sm file:text-paper file:hover:bg-ink-800"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      {busy && (
        <div className="mt-4 space-y-2" aria-live="polite" aria-label="上传进度">
          <div className="h-2 overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full rounded-full bg-accent transition-all duration-200 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-right font-body text-xs text-ink-500">
            {Math.round(percent)}%
          </p>
        </div>
      )}

      {result && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4"
          role="presentation"
          onClick={() => setResult(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-result-title"
            className="w-full max-w-sm rounded-2xl border border-ink-200 bg-paper p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${
                  result.ok ? "bg-emerald-600" : "bg-red-600"
                }`}
                aria-hidden
              >
                {result.ok ? "✓" : "!"}
              </span>
              <div className="min-w-0 flex-1">
                <h3
                  id="upload-result-title"
                  className="font-display text-lg font-semibold text-ink-900"
                >
                  {result.title}
                </h3>
                <p className="mt-2 font-body text-sm leading-relaxed text-ink-600">
                  {result.detail}
                </p>
              </div>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setResult(null)}
              className={`mt-5 w-full rounded-xl px-4 py-2.5 font-body text-sm font-medium text-white transition ${
                result.ok
                  ? "bg-ink-900 hover:bg-ink-800"
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
