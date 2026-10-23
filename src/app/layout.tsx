import type { Metadata } from 'next';
import { Inter, Noto_Sans_JP } from 'next/font/google';
import { AppShell } from '@/components/shell/app-shell';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const notoSansJp = Noto_Sans_JP({ subsets: ['latin'], variable: '--font-noto-sans-jp', display: 'swap' });

export const metadata: Metadata = {
  title: 'Portfolio Manager - 投資ポートフォリオ管理',
  description: '米国株・日本株・FXを一元管理する投資ポートフォリオ管理アプリ',
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon', sizes: '16x16 32x32 48x48' },
      { url: '/app-icon-small.svg', type: 'image/svg+xml', sizes: 'any' },
    ],
    apple: [{ url: '/app-icon.png', type: 'image/png', sizes: '512x512' }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${inter.variable} ${notoSansJp.variable} antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
