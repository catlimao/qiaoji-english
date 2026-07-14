"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "生成" },
  { href: "/history", label: "历史" },
  { href: "/books", label: "词书" },
  { href: "/notebook", label: "生词本" },
  { href: "/settings", label: "API 配置" },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-ink-200/70 bg-paper/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="group shrink-0">
          <span className="font-display text-xl font-semibold tracking-tight text-ink-900 transition group-hover:text-accent-deep sm:text-2xl">
            巧记英语
          </span>
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-1 sm:gap-2">
          {LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-1.5 font-body text-sm transition ${
                  active
                    ? "bg-ink-900 text-paper"
                    : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
