'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Briefcase,
  Eye,
  LayoutDashboard,
  Newspaper,
  Settings,
  Menu,
  X,
} from 'lucide-react';

const navigation = [
  { name: 'ダッシュボード', href: '/', icon: LayoutDashboard },
  { name: 'ポートフォリオ', href: '/portfolio', icon: Briefcase },
  { name: 'ウォッチリスト', href: '/watchlist', icon: Eye },
  { name: 'ニュース', href: '/news', icon: Newspaper },
  { name: '設定', href: '/settings', icon: Settings },
];

export const Header: React.FC = () => {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/brand-mark.svg" alt="" width={40} height={40} className="shrink-0" />
            <span className="text-lg font-bold text-slate-100 tracking-tight">
              Portfolio<span className="text-blue-400">Manager</span>
            </span>
          </Link>

          <nav className="hidden lg:flex items-center gap-1" aria-label="メインナビゲーション">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                    transition-all duration-200
                    ${
                      isActive
                        ? 'bg-slate-800 text-blue-400'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <button className="lg:hidden p-2 text-slate-400 hover:text-slate-200" type="button" aria-label={menuOpen ? 'メニューを閉じる' : 'メニューを開く'} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
        {menuOpen && <nav id="mobile-navigation" className="grid gap-1 border-t border-slate-800 py-3 lg:hidden" aria-label="モバイルナビゲーション">
          {navigation.map(({ name, href, icon: Icon }) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} aria-current={pathname === href ? 'page' : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${pathname === href ? 'bg-slate-800 text-blue-300' : 'text-slate-300 hover:bg-slate-800/50'}`}><Icon className="h-4 w-4" />{name}</Link>)}
        </nav>}
      </div>
    </header>
  );
};
