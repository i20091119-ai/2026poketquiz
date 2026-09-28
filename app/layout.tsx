import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "@/components/pwa";
import "./globals.css";

export const metadata: Metadata = {
  title: "포켓몬 배움 탐험대",
  description: "문제를 풀고 속성 스탯을 모아 포켓몬을 진화시키는 학습 게임",
  applicationName: "배움탐험대",
  // 휴대폰 홈 화면에 앱으로 설치 (public/manifest.webmanifest, 아이콘은 public/icons/)
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    shortcut: "/favicon.svg",
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "배움탐험대", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#17674e" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
