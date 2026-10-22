'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, RefreshCw } from 'lucide-react';
import { marketClock, timeText } from './market-clock';
import { useShellRefresh } from './refresh-context';
import type { ShellSyncState } from './use-shell-data';

export function TopBar({ sync, refreshMarket }: { sync: ShellSyncState; refreshMarket: (force: boolean) => Promise<void> }) {
  const current = useShellRefresh();
  const [now, setNow] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const lock = useRef(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) setMenuOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [menuOpen]);
  const refresh = async () => {
    if (!current || current.busy || lock.current) return;
    lock.current = true;
    setRefreshing(true);
    setRefreshError('');
    try {
      await Promise.all([current.refresh(), refreshMarket(true)]);
    } catch {
      setRefreshError('価格更新に失敗しました。');
    } finally {
      lock.current = false;
      setRefreshing(false);
    }
  };
  const syncStatus = sync.error || sync.latest?.status === 'failed' ? 'failed' : sync.latest?.status === 'success' ? 'success' : 'none';
  const syncPeer = sync.peers.find((peer) => peer.device_id === sync.latest?.peer_device_id);
  const syncSummary = sync.latest
    ? `${sync.latest.status === 'failed' ? '失敗 ' : ''}${syncPeer?.name ?? '解除済みPC'} ${timeText(sync.latest.finished_at, true)}`
    : '未同期';
  const busy = refreshing || current?.busy;
  return <header className="pm-topbar">
    <Link href="/" className="pm-brand" aria-label="Portfolio Manager ホーム">
      <Image src="/brand-mark.svg" width={20} height={20} alt="" />
      <span>Portfolio Manager</span>
    </Link>
    <button type="button" className="pm-button" disabled={!current || busy} onClick={() => void refresh()} title={refreshError || '現在の画面と指数の価格を更新'}>
      <RefreshCw size={14} className={busy ? 'animate-spin' : ''} aria-hidden="true" />価格更新
      <span className="pm-update-time">{timeText(current?.updatedAt)}</span>
    </button>
    <div className="pm-sync-control" ref={menu}>
      {!sync.loading && sync.peers.length === 0 ? <Link className="pm-button" href="/settings" title={sync.error || '設定でPCをLink'}><ArrowLeftRight size={14} aria-hidden="true" />同期<span className={`pm-dot ${syncStatus}`} /></Link> :
        <button type="button" className="pm-button" disabled={sync.running || sync.loading} aria-expanded={sync.peers.length > 1 ? menuOpen : undefined} aria-controls={sync.peers.length > 1 ? 'pm-sync-peers' : undefined} onClick={() => {
          if (sync.peers.length === 1) void sync.run(sync.peers[0]);
          else setMenuOpen(!menuOpen);
        }} title={sync.error || 'Link済みPCと同期'}><ArrowLeftRight size={14} className={sync.running ? 'animate-spin' : ''} aria-hidden="true" />同期<span className={`pm-dot ${syncStatus}`} /></button>}
      {menuOpen && sync.peers.length > 1 && <div id="pm-sync-peers" className="pm-sync-menu" aria-label="同期先を選択">
        {sync.peers.map((peer) => <button type="button" key={peer.id} className="pm-button" onClick={() => { setMenuOpen(false); void sync.run(peer); }}>{peer.name}</button>)}
      </div>}
    </div>
    <span className="pm-sync-notice" role="status" title={sync.error || sync.notice || syncSummary}>{sync.running ? '同期中…' : sync.error || sync.notice || syncSummary}</span>
    <div className="pm-clocks">
      {(['tokyo', 'ny'] as const).map((city) => {
        const clock = now ? marketClock(now, city) : null;
        return <span key={city} className="pm-clock"><span>{city === 'tokyo' ? '東京' : 'NY'}</span><time>{clock?.time ?? '--:--:--'}</time><span className={`pm-market-state ${clock?.status === '取引中' ? 'open' : ''}`}>{clock?.status ?? '—'}</span></span>;
      })}
    </div>
    {refreshError && <span className="sr-only" role="alert">{refreshError}</span>}
  </header>;
}
