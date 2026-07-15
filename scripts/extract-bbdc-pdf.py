# -*- coding: utf-8 -*-
"""Parse 不背单词考研红宝书 PDF extracted text into JSON wordbook."""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "tmp" / "bbdc_ky.txt"
OUT = ROOT / "src" / "data" / "kaoyan-hongbaoshu-2026.json"


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def strip_pos(s: str) -> str:
    return re.sub(
        r"\b(?:vt|vi|n|adj|adv|prep|conj|pron|num|int|aux)\.?\s*",
        "",
        s,
        flags=re.I,
    )


def main() -> None:
    text = SRC.read_text(encoding="utf-8")
    pages = text.split("=====PAGE=====")
    entries: dict[int, dict] = {}

    for page in pages:
        page = page.strip()
        if not page:
            continue
        parts = re.split(r"\bWord Meaning\b", page)
        if len(parts) < 3:
            continue
        word_sec = parts[1]
        mean_sec = parts[2]
        mean_sec = re.split(r"系统词书的词表|扫描二维码|扫描⼆维码", mean_sec)[0]

        words: dict[int, str] = {}
        for m in re.finditer(
            r"(?m)^(\d+)\s+([A-Za-z][A-Za-z'\-]*)\s*$", word_sec
        ):
            words[int(m.group(1))] = m.group(2)

        mean_blocks: dict[int, str] = {}
        cur_n = None
        cur_lines: list[str] = []
        for line in mean_sec.splitlines():
            line = line.strip()
            if not line:
                continue
            m = re.match(r"^(\d+)\s*(.*)$", line)
            if m:
                if cur_n is not None:
                    mean_blocks[cur_n] = " ".join(cur_lines)
                cur_n = int(m.group(1))
                cur_lines = [m.group(2)] if m.group(2) else []
            elif cur_n is not None:
                if re.match(
                    r"^(?:n|v|vt|vi|adj|adv|prep|conj|pron|num|int|aux)\b",
                    line,
                    re.I,
                ) or re.search(r"[\u4e00-\u9fff]", line):
                    cur_lines.append(line)
        if cur_n is not None:
            mean_blocks[cur_n] = " ".join(cur_lines)

        for n, w in words.items():
            raw = norm(mean_blocks.get(n, ""))
            raw = strip_pos(raw).replace("...", "…")
            parts_m = [
                p.strip(" ,;；")
                for p in re.split(r"[；;]", raw)
                if p.strip(" ,;；") and re.search(r"[\u4e00-\u9fff]", p)
            ]
            primary = parts_m[0] if parts_m else (
                raw if re.search(r"[\u4e00-\u9fff]", raw) else w
            )
            entries[n] = {
                "word": w,
                "meaning": primary,
                "meanings": parts_m[:6] if parts_m else ([primary] if primary != w else []),
            }

    seen = set()
    out = []
    for n in sorted(entries.keys()):
        e = entries[n]
        key = e["word"].lower()
        if key in seen:
            continue
        seen.add(key)
        item = {"word": e["word"], "meaning": e["meaning"]}
        if e["meanings"]:
            item["meanings"] = e["meanings"]
            item["meaning"] = e["meanings"][0]
        out.append(item)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    nozh = sum(1 for e in out if not re.search(r"[\u4e00-\u9fff]", e["meaning"]))
    print(f"unique={len(out)} no_chinese={nozh} -> {OUT}")
    print("sample:", json.dumps(out[:3], ensure_ascii=False))


if __name__ == "__main__":
    main()
