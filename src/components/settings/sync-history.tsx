'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SyncHistoryEntry } from '@/types';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const labels = { success: '成功', failed: '失敗', partial: '一部', running: '実行中' };

export function SyncHistory({ revision }: { revision: number }) {
  const [logs, setLogs] = useState<SyncHistoryEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    try {
      const response = await fetch(`/api/sync/log?limit=200${filter ? `&status=${filter}` : ''}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '同期履歴を取得できませんでした。');
      setLogs(data.logs); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '同期履歴を取得できませんでした。'); }
    finally { setLoading(false); }
  }, [filter]);
  useEffect(() => {
    void reload();
    const timer = setInterval(() => { void reload(); }, 10_000);
    return () => clearInterval(timer);
  }, [reload, revision]);
  return <section className="space-y-3" role="tabpanel" id="sync-history-panel" aria-labelledby="sync-history-tab">
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-sm text-slate-300">結果
        <select className="ml-2 rounded border border-slate-600 bg-slate-900 p-2" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="">すべて</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <Button size="sm" variant="secondary" onClick={() => { void reload(); }}>更新</Button>
      <span className="text-xs text-slate-500">直近200件まで</span>
    </div>
    {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
    {loading && <p className="text-sm text-slate-500">読み込み中…</p>}
    {!loading && !error && logs.length === 0 && <p className="text-sm text-slate-500">同期履歴はありません。</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead><tr className="border-b border-slate-700 text-left text-slate-400">{['日時', '相手', '実行', '結果', '受信 / 送信', '所要時間', '詳細'].map((label) => <th key={label} className="p-2 font-medium">{label}</th>)}</tr></thead>
      <tbody>{logs.map((log) => <tr key={log.id} className="border-b border-slate-700/40 align-top text-slate-300">
        <td className="p-2 whitespace-nowrap">{formatDate(log.started_at, 'full')}</td><td className="p-2">{log.peerName}</td><td className="p-2 whitespace-nowrap">{log.source === 'auto' ? '自動' : '手動'}</td>
        <td className={`p-2 ${log.status === 'failed' ? 'text-red-400' : log.status === 'partial' ? 'text-amber-300' : log.status === 'success' ? 'text-emerald-400' : ''}`}>{labels[log.status]}</td>
        <td className="p-2 tabular-nums">{log.received} / {log.sent}</td><td className="p-2 whitespace-nowrap">{log.durationMs === null ? '—' : `${(log.durationMs / 1000).toFixed(1)}秒`}</td>
        <td className="p-2 min-w-48 max-w-lg">
          {log.error && <p className="text-red-400 whitespace-pre-wrap break-words">{log.error}</p>}
          {log.warnings.map((warning) => <p className="text-amber-300" key={warning}>{warning}</p>)}
          <details><summary className="cursor-pointer">テーブル別件数</summary>
            {Object.keys(log.byTable).length === 0 ? <p className="text-xs text-slate-500">テーブル別の記録はありません。</p> : <ul className="mt-1 space-y-1 text-xs">{Object.entries(log.byTable).map(([table, counts]) => <li key={table}>{table}: 受信 {counts?.received ?? 0} / 送信 {counts?.sent ?? 0}</li>)}</ul>}
          </details>
        </td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}
