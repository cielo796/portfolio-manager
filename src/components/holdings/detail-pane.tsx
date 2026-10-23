'use client';

import { LatestMemos } from '@/components/memos/latest-memos';

import { useState } from 'react';
import Link from 'next/link';
import { getProfitLossColor } from '@/lib/utils';
import { formatHoldingCell, type HoldingColumnId, type HoldingRow } from './columns';

const DETAILS: [HoldingColumnId, string][] = [
  ['shares', '保有数量'], ['cost', '取得単価'], ['valueLocal', '評価額（現地）'], ['valueJpy', '評価額（円）'],
  ['profit', '評価損益'], ['profitPercent', '損益率'], ['daily', '当日損益'], ['weight', '構成比'],
  ['sector', 'セクター'], ['account', '口座'],
];

export function HoldingDetailPane({ row, onEdit, onSaveMemo }: {
  row: HoldingRow | undefined;
  onEdit: () => void;
  onClosePosition: () => Promise<void>;
  onSaveMemo: (memo: string) => Promise<void>;
}) {
  const [memo, setMemo] = useState(row?.holding.memo ?? '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!row) return <aside aria-label="選択中の銘柄" className="rounded border border-[var(--pm-border)] bg-[var(--pm-panel)] p-3 pm-muted">表示中の銘柄を選択してください。</aside>;
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await action(); } catch { setError('保存に失敗しました。もう一度お試しください。'); } finally { setBusy(false); }
  };
  return (
    <aside aria-label="選択中の銘柄" className="flex min-w-0 flex-col rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]">
      <div className="border-b border-[var(--pm-border)] px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-2"><span className="pm-muted">{row.values.symbol}</span><strong className="text-sm">{row.values.name}</strong><span className="pm-muted">{row.values.market}</span></div>
        <div className="mt-1 flex flex-wrap items-baseline gap-2 tabular-nums"><strong className={`text-[22px] ${row.holding.price_status === 'missing' ? 'pm-muted' : ''}`}>{formatHoldingCell(row, 'price')}</strong><span className={getProfitLossColor(Number(row.values.change ?? 0))}>{formatHoldingCell(row, 'change')}（{formatHoldingCell(row, 'changePercent')}）</span></div>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-b border-[var(--pm-border)] px-3 py-2">
        {DETAILS.map(([id, label]) => <div key={id}><dt className="pm-muted text-[11px]">{label}</dt><dd className={`break-words tabular-nums ${['profit', 'profitPercent', 'daily'].includes(id) ? getProfitLossColor(Number(row.values[id] ?? 0)) : ''}`}>{formatHoldingCell(row, id)}</dd></div>)}
      </dl>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center justify-between"><h2 className="pm-muted">ひとこと</h2>{!editing && <button type="button" className="text-[var(--pm-link)]" onClick={() => { setMemo(row.holding.memo ?? ''); setEditing(true); }}>ひとことを編集</button>}</div>
        {editing ? <>
          <textarea aria-label="保有メモ" value={memo} onChange={(event) => setMemo(event.target.value)} disabled={busy} rows={5} className="w-full resize-y rounded border border-[var(--pm-input-border)] bg-[var(--pm-bg)] p-2" />
          <div className="flex gap-2"><button type="button" className="pm-button" disabled={busy} onClick={() => void run(async () => { await onSaveMemo(memo); setEditing(false); })}>保存</button><button type="button" className="pm-button" disabled={busy} onClick={() => setEditing(false)}>キャンセル</button></div>
        </> : <p className="min-h-16 whitespace-pre-wrap break-words">{row.holding.memo || <span className="pm-muted">メモはありません。</span>}</p>}
        {error && <p role="alert" className="text-[var(--pm-accent)]">{error}</p>}
        <div className="mt-auto flex gap-2 pt-2"><button type="button" className="pm-button flex-1" disabled={busy} onClick={onEdit}>編集</button>{row.holding.symbol !== 'CASH' && <Link className="pm-button flex-1 text-center" href={`/records?holding=${encodeURIComponent(row.holding.id)}&type=sell`}>売却を記録</Link>}</div>
      </div>
      <LatestMemos symbol={row.holding.symbol} market={row.holding.market} />
    </aside>
  );
}
