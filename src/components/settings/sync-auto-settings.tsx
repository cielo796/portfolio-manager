'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SyncAutoConfig, SyncAutoStatus, SyncDiscoveredPeer } from '@/types';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';

export function SyncAutoSettings({ onAddress, pairedIds }: { onAddress: (address: string) => void; pairedIds: string[] }) {
  const [status, setStatus] = useState<(SyncAutoStatus & { nearby: SyncDiscoveredPeer[] }) | null>(null);
  const [config, setConfig] = useState<SyncAutoConfig | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const reload = useCallback(async () => {
    try {
      const response = await fetch('/api/sync/auto', { cache: 'no-store' });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || '自動同期の設定を取得できませんでした。');
      setStatus(value);
      setConfig((previous) => previous ?? value.config);
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '自動同期の設定を取得できませんでした。'); }
  }, []);
  useEffect(() => {
    void reload();
    const timer = setInterval(() => { void reload(); }, 10_000);
    return () => clearInterval(timer);
  }, [reload]);
  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/sync/auto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || '自動同期の設定を保存できませんでした。');
      setStatus(value); setConfig(value.config); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '自動同期の設定を保存できませんでした。'); }
    finally { setSaving(false); }
  };
  const nearby = status?.nearby.filter((peer) => !pairedIds.includes(peer.deviceId)) ?? [];
  return <section className="space-y-3">
    <h4 className="text-sm font-semibold text-slate-200">自動同期</h4>
    {config && <div className="flex flex-wrap items-center gap-3">
      <label className="text-sm text-slate-300">実行タイミング
        <select className="ml-2 rounded border border-slate-600 bg-slate-900 p-2" value={config.mode} onChange={(event) => setConfig({ ...config, mode: event.target.value as SyncAutoConfig['mode'] })}>
          <option value="off">オフ</option><option value="startup">起動時のみ</option><option value="interval">起動時＋定期</option>
        </select>
      </label>
      {config.mode === 'interval' && <label className="text-sm text-slate-300">間隔
        <select className="ml-2 rounded border border-slate-600 bg-slate-900 p-2" value={config.intervalMinutes} onChange={(event) => setConfig({ ...config, intervalMinutes: Number(event.target.value) as SyncAutoConfig['intervalMinutes'] })}>
          {[15, 30, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes}分</option>)}
        </select>
      </label>}
      <Button size="sm" variant="secondary" onClick={save} disabled={saving}>{saving ? '保存中…' : '設定を保存'}</Button>
    </div>}
    <p className="text-xs text-slate-400">アプリの起動中、Link済みのPCと同期します。失敗時は実行間隔を延ばし、次回まで待ちます。</p>
    {status && <div className="text-sm text-slate-300 space-y-1" aria-live="polite">
      <p>最終同期: {status.lastSyncedAt ? formatDate(status.lastSyncedAt, 'full') : '未同期'}</p>
      <p>次回予定: {status.running ? '同期中…' : status.nextRunAt ? formatDate(status.nextRunAt, 'full') : '予定なし'}</p>
      <p>直近の結果: {status.latest ? `${status.latest.peerName}・${({ success: '成功', failed: '失敗', partial: '一部', running: '実行中' })[status.latest.status]}` : '履歴なし'}</p>
      {status.latest?.error && <p className="text-red-400">{status.latest.error}</p>}
    </div>}
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    <h4 className="pt-2 text-sm font-semibold text-slate-200">近くのPC</h4>
    <p className="text-xs text-slate-400">PCを選ぶと相手のアドレスを入力します。Linkには相手のペアリングコードが必要です。</p>
    {nearby.length === 0 ? <p className="text-sm text-slate-500">検出された未LinkのPCはありません。</p> : <ul className="space-y-2">{nearby.map((peer) => <li key={peer.deviceId} className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
      <span>{peer.deviceName}（{peer.address}:{peer.port} / v{peer.schemaVersion}）</span>
      <Button size="sm" variant="secondary" onClick={() => onAddress(`${peer.address}:${peer.port}`)}>アドレスを入力</Button>
    </li>)}</ul>}
  </section>;
}
