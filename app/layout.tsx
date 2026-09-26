import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "포켓몬 배움 탐험대",
  description: "오늘의 학습 미션을 풀고 포켓몬과 함께 성장해요.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}

