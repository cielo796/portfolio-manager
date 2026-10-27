'use client';

import Link from 'next/link';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { TopPick, TopPickInput, TopPickView } from '@/types';
import { LatestMemos } from '@/components/memos/latest-memos';
import { getProfitLossColor } from '@/lib/utils';
import { topPickPerformance } from '@/lib/top-picks-calc';
import { convictionText, horizonText, inputClass, panel, percent, pickRequest } from './shared';
import { PickChart } from './pick-chart';

export type PickDetailHandle = { flush: () => Promise<boolean> };

export const PickDetail = forwardRef<PickDetailHandle, { pick: TopPickView; busy: boolean; onSaved: (pick: TopPick) => void; onRemove: () => Promise<void> }>(function PickDetail({ pick, busy, onSaved, onRemove }, ref) {
  const initial: Partial<TopPickInput> = { theme: pick.theme, conviction: pick.conviction, horizon: pick.horizon,
    targetPrice: pick.target_price, reviewOn: pick.review_on, thesis: pick.thesis, catalysts: pick.catalysts, risks: pick.risks, exitRule: pick.exit_rule };
  const [draft, setDraft] = useState(initial);
  const current = useRef(initial);
  const saved = useRef(JSON.stringify(initial));
  const inFlight = useRef<Promise<boolean> | null>(null);
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'failed'>('saved');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = (patch: Partial<TopPickInput>) => {
    current.current = { ...current.current, ...patch }; setDraft(current.current); setStatus('dirty'); setConfirm(false);
  };
  const save = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return inFlight.current;
    const signature = JSON.stringify(current.current);
    if (signature === saved.current) return true;
    setStatus('saving'); setError('');
    const pending = (async () => {
      try {
        const result = await pickRequest<{ topPick: TopPick }>(`/api/top-picks/${encodeURIComponent(pick.id)}`, 'PATCH', current.current);
        saved.current = signature; onSaved(result.topPick);
        setStatus(signature === JSON.stringify(current.current) ? 'saved' : 'dirty'); return true;
      } catch (reason) { setStatus('failed'); setError(reason instanceof Error ? reason.message : '保存できませんでした。'); return false; }
    })();
    inFlight.current = pending;
    try { return await pending; } finally { inFlight.current = null; }
  }, [pick.id, onSaved]);
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (inFlight.current && !await inFlight.current) return false;
    while (saved.current !== JSON.stringify(current.current)) { if (!await save()) return false; }
    return true;
  }, [save]);
  useImperativeHandle(ref, () => ({ flush }), [flush]);
  useEffect(() => {
    if (status !== 'dirty') return;
    timer.current = setTimeout(() => { void save(); }, 800);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [draft, status, save]);
  useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => { if (inFlight.current || saved.current !== JSON.stringify(current.current)) event.preventDefault(); };
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, []);
  useEffect(() => { if (!confirm) return; const timeout = setTimeout(() => setConfirm(false), 5000); return () => clearTimeout(timeout); }, [confirm]);
  const performance = topPickPerformance(pick);
  return <aside aria-label="選択中のピック" className={panel}>
    <div className="border-b border-[var(--pm-border)] px-3 py-2"><div className="flex flex-wrap items-baseline gap-2"><strong className="text-xl text-[var(--pm-accent)]">{pick.removed_at ? '履歴' : `#${pick.rank}`}</strong><span className="pm-muted">{pick.symbol} · {pick.market}</span><h2 className="text-sm font-semibold">{pick.name}</h2></div><div className="mt-1 flex flex-wrap gap-2 text-[11px]"><span className="rounded border border-[var(--pm-input-border)] px-1">{pick.state}</span><span>{draft.theme}</span><span className="text-[var(--pm-accent)]">確信度 {draft.conviction ? convictionText[draft.conviction] : '—'}</span><span>{draft.horizon ? horizonText[draft.horizon] : '—'}</span><span className={getProfitLossColor(performance.change ?? 0)}>{percent(performance.change)}</span></div></div>
    <PickChart pick={{ ...pick, target_price: draft.targetPrice ?? null }} />
    <div className="border-b border-[var(--pm-border)] p-3"><div className="mb-2 flex justify-between gap-2"><h3 className="text-[11px] pm-muted">ピックの情報</h3><span role="status" className="text-[10px] pm-muted">{status === 'saved' ? '保存済み' : status === 'saving' ? '保存中…' : status === 'failed' ? '保存失敗' : '未保存'}</span></div>
      <div className="grid grid-cols-2 gap-2"><label className="text-[11px] pm-muted">テーマ<input disabled={busy} className={`${inputClass} mt-1 w-full text-[var(--pm-text)]`} value={draft.theme ?? ''} onChange={(event) => update({ theme: event.target.value })} /></label>
        <label className="text-[11px] pm-muted">確信度<select disabled={busy} className={`${inputClass} mt-1 w-full`} value={draft.conviction ?? ''} onChange={(event) => update({ conviction: event.target.value as TopPickInput['conviction'] || null })}><option value="">未設定</option>{Object.entries(convictionText).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="text-[11px] pm-muted">期間<select disabled={busy} className={`${inputClass} mt-1 w-full`} value={draft.horizon ?? ''} onChange={(event) => update({ horizon: event.target.value as TopPickInput['horizon'] || null })}><option value="">未設定</option>{Object.entries(horizonText).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="text-[11px] pm-muted">目標価格<input disabled={busy} type="number" step="any" min="0.00000001" className={`${inputClass} mt-1 w-full`} value={draft.targetPrice ?? ''} onChange={(event) => update({ targetPrice: event.target.value ? Number(event.target.value) : null })} /></label>
        <label className="col-span-2 text-[11px] pm-muted">見直し日<input disabled={busy} type="date" className={`${inputClass} ml-2`} value={draft.reviewOn ?? ''} onChange={(event) => update({ reviewOn: event.target.value || null })} /></label></div>
    </div>
    {([['thesis', '選定理由'], ['catalysts', 'カタリスト'], ['risks', 'リスク'], ['exitRule', '外す条件']] as const).map(([key, label]) => <label key={key} className="block border-b border-[var(--pm-border)] px-3 py-2"><span className="text-[11px] pm-muted">{label}</span><textarea disabled={busy} rows={3} maxLength={20000} className={`${inputClass} mt-1 w-full resize-y leading-relaxed`} value={draft[key] ?? ''} onChange={(event) => update({ [key]: event.target.value })} /></label>)}
    {error && <div role="alert" className="p-3 text-[var(--pm-accent)]">{error}<button type="button" className="pm-button ml-2" onClick={() => void flush()}>再試行</button></div>}
    <LatestMemos symbol={pick.symbol} market={pick.market} />
    <div className="flex flex-wrap gap-2 border-t border-[var(--pm-border)] p-3"><Link className="pm-button inline-flex items-center" href={`/detail?symbol=${encodeURIComponent(pick.symbol)}&market=${pick.market}`}>銘柄詳細</Link>{!pick.removed_at && <button type="button" disabled={busy} className={`pm-button ml-auto ${confirm ? '!border-[var(--pm-accent)] !text-[var(--pm-accent)]' : ''}`} onClick={() => { if (confirm) { setConfirm(false); void onRemove(); } else setConfirm(true); }}>{confirm ? 'もう一度押して外す' : 'ピックから外す'}</button>}</div>
  </aside>;
});
