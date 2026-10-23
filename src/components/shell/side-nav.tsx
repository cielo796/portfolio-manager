'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, ChartCandlestick, ChartNoAxesCombined, Eye, LayoutDashboard, Network, Newspaper, NotebookPen, Settings, Star } from 'lucide-react';
import { timeText } from './market-clock';
import type { ShellSyncState } from './use-shell-data';

const navigation = [
  { name: 'ホーム', href: '/', icon: LayoutDashboard },
  { name: '保有銘柄', href: '/portfolio', icon: Briefcase },
  { name: '登録銘柄', href: '/watchlist', icon: Eye },
  { name: 'トップピック', href: '/top-picks', icon: Star },
  { name: '銘柄詳細', href: '/detail', icon: ChartCandlestick },
  { name: 'マーケット', href: '/market', icon: ChartNoAxesCombined },
  { name: '資産推移', href: '/history', icon: ChartNoAxesCombined },
  { name: 'ニュース', href: '/news', icon: Newspaper },
  { name: '銘柄メモ', href: '/memos', icon: NotebookPen },
  { name: '記録', href: '/records', icon: NotebookPen },
  { name: '設定', href: '/settings', icon: Settings },
];

export function SideNav({ sync }: { sync: ShellSyncState }) {
  const pathname = usePathname();
  const peer = sync.peers.find((item) => item.device_id === sync.latest?.peer_device_id) ?? sync.peers[0];
  const summary = `LAN同期：${peer?.name ?? '未設定'}・最終 ${timeText(peer?.last_synced_at, true)}`;
  return <nav className="pm-sidenav" aria-label="メインナビゲーション">
    <div className="pm-nav-links">{navigation.map(({ name, href, icon: Icon }) =>
      <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined} aria-label={name} title={name}><Icon size={16} aria-hidden="true" /><span className="pm-nav-label">{name}</span></Link>
    )}</div>
    <Link href="/settings" className="pm-lan" title={summary} aria-label={summary}>
      <span className="pm-lan-title"><Network size={14} aria-hidden="true" /><span className="pm-nav-label">LAN同期</span></span>
      <span className="pm-nav-label">相手：{sync.loading ? '確認中…' : peer?.name ?? '未設定'}</span>
      <span className="pm-nav-label">最終：{timeText(peer?.last_synced_at, true)}</span>
    </Link>
  </nav>;
}
