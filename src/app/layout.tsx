import type { Metadata } from "next";
import { Literata, Source_Sans_3 } from "next/font/google";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

const display = Literata({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "巧记英语 · 单词小说",
  description: "把四六级、考研单词自然嵌入自定义风格小说，点击高亮词加入生词本。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${display.variable} ${body.variable} min-h-screen bg-paper bg-paper-grain font-body text-ink-900 antialiased`}
      >
        <SiteNav />
        <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
          {children}
        </main>
      </body>
    </html>
  );
}
