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
    icon: [{ url: '/brand-mark.svg', type: 'image/svg+xml' }, { url: '/favicon.ico' }],
    apple: '/app-icon.png',
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
