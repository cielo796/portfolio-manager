'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { MarketSnapshot, ShellSyncLog, ShellSyncPeer, SyncResult } from '@/types';

export function useMarketData() {
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [marketError, setMarketError] = useState(false);
  const refreshMarket = useCallback(async (force = false) => {
    try {
      const response = await fetch(`/api/market${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('market_failed');
      setMarket(await response.json() as MarketSnapshot);
      setMarketError(false);
    } catch {
      setMarketError(true);
    }
  }, []);
  useEffect(() => {
    void refreshMarket();
    const timer = window.setInterval(() => { void refreshMarket(); }, 300000);
    return () => window.clearInterval(timer);
  }, [refreshMarket]);
  return { market, marketError, refreshMarket };
}

export function useShellSync() {
  const [peers, setPeers] = useState<ShellSyncPeer[]>([]);
  const [latest, setLatest] = useState<ShellSyncLog | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  const reload = useCallback(async () => {
    const results = await Promise.allSettled([
      fetch('/api/sync/peers', { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) throw new Error('Link先を取得できませんでした。');
        const data = await response.json() as { peers: ShellSyncPeer[] };
        setPeers(data.peers);
      }),
      fetch('/api/sync/log', { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) throw new Error('同期ログを取得できませんでした。');
        const data = await response.json() as { logs: ShellSyncLog[] };
        setLatest(data.logs.find((entry) => entry.status !== 'running') ?? null);
      }),
    ]);
    const failure = results.find((result) => result.status === 'rejected');
    setError(failure?.status === 'rejected'
      ? failure.reason instanceof Error ? failure.reason.message : '同期状態を取得できませんでした。'
      : '');
    setLoading(false);
  }, []);
  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => { if (!lock.current) void reload(); }, 30000);
    const onFocus = () => { if (!lock.current) void reload(); };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [reload, pathname]);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  const run = async (peer: ShellSyncPeer) => {
    if (lock.current) return;
    lock.current = true;
    setRunning(true);
    setError('');
    setNotice('');
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    try {
      const response = await fetch('/api/sync/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ peerId: peer.id }),
      });
      const result = await response.json() as SyncResult & { error?: string };
      if (!response.ok) throw new Error(result.error || '同期に失敗しました。');
      await reload();
      setNotice(`受信${result.received}・送信${result.sent}`);
      noticeTimer.current = setTimeout(() => setNotice(''), 3000);
    } catch (cause) {
      await reload();
      setError(cause instanceof Error ? cause.message : '同期に失敗しました。');
    } finally {
      lock.current = false;
      setRunning(false);
    }
  };
  return { peers, latest, running, loading, error, notice, run };
}

export type ShellSyncState = ReturnType<typeof useShellSync>;
