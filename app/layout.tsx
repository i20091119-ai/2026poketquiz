import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "포켓몬 배움 탐험대",
  description: "문제를 풀고 속성 스탯을 모아 포켓몬을 진화시키는 학습 게임",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
