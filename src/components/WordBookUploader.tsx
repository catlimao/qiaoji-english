"use client";

import { useRef, useState } from "react";
import type { WordBook } from "@/lib/types";
import { parseUploadedWordBook } from "@/lib/parse-wordbook";
import { addUploadedBook } from "@/lib/storage";

type Props = {
  onUploaded: (book: WordBook) => void;
};

export function WordBookUploader({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const words = await parseUploadedWordBook(file);
      const bookName =
        name.trim() ||
        file.name.replace(/\.(json|csv|txt|docx|doc)$/i, "") ||
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-ink-200 bg-paper p-5">
      <h2 className="font-display text-lg font-semibold text-ink-900">
        上传词书
      </h2>
      <p className="mt-1 font-body text-sm text-ink-500">
        支持 TXT / Word(.docx) / CSV / JSON。TXT 或 Word 建议每行：
        <code className="mx-1 rounded bg-ink-100 px-1">abandon 放弃</code>
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
        accept=".txt,.docx,.csv,.json,text/plain,application/json,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="mt-4 block w-full font-body text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-900 file:px-3 file:py-2 file:text-sm file:text-paper file:hover:bg-ink-800"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      {error && (
        <p className="mt-3 font-body text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className="mt-3 font-body text-sm text-ink-500">正在解析…</p>
      )}
    </div>
  );
}
