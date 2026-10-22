import type { Metadata } from "next";
import { Header } from "@/components/header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portfolio Manager - 投資ポートフォリオ管理",
  description: "米国株・日本株・FXを一元管理する投資ポートフォリオ管理アプリ",
  icons: {
    icon: [{ url: "/brand-mark.svg", type: "image/svg+xml" }, { url: "/favicon.ico" }],
    apple: "/app-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased bg-slate-900 min-h-screen font-sans">
        <Header />
        <main className="bg-gradient-mesh min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </body>
    </html>
  );
}
