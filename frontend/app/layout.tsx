import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";

import { SeasonThemeProvider } from "@/components/atmosphere/season-theme-provider";

import "./globals.css";

const notoSans = Noto_Sans_SC({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const notoSerif = Noto_Serif_SC({
  variable: "--font-quote",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "职小伴 · AI 求职助手",
  description: "职小伴：Multi-Agent + Career Memory + Evaluation 的 AI 求职伙伴（无登录演示）",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      data-season="spring"
      className={`${notoSans.variable} ${notoSerif.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SeasonThemeProvider>{children}</SeasonThemeProvider>
      </body>
    </html>
  );
}
