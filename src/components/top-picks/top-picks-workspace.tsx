'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ChartData, FundamentalMetrics, StockPrice, TopPick, TopPickView } from '@/types';
import { useDetailCatalog, useDetailResource, type SearchTickers } from '@/components/detail/data';
import { usePageRefresh } from '@/components/shell/refresh-context';
import { getProfitLossColor } from '@/lib/utils';
import { priceKey } from '@/lib/price-key';
import { topPickPerformance, topPicksSummary } from '@/lib/top-picks-calc';
import { AddPickDialog } from './add-pick-dialog';
import { PickDetail, type PickDetailHandle } from './pick-detail';
import { convictionText, horizonText, panel, percent, pickRequest, priceText } from './shared';

export function TopPicksWorkspace() {
  const params = useSearchParams();
  const router = useRouter();
  const catalog = useDetailCatalog();
  const tickers = useDetailResource<SearchTickers>('/api/tickers');
  const [data, setData] = useState<{ current: TopPickView[]; removed: TopPickView[] }>({ current: [], removed: [] });
  const [tab, setTab] = useState<'current' | 'removed'>('current');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [drop, setDrop] = useState<string | null>(null);
  const detail = useRef<PickDetailHandle>(null);
  const appliedId = useRef<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [current, removed] = await Promise.all([pickRequest<{ topPicks: TopPickView[] }>('/api/top-picks'), pickRequest<{ topPicks: TopPickView[] }>('/api/top-picks?status=removed')]);
      setData({ current: current.topPicks, removed: removed.topPicks });
    } catch (reason) { setError(reason instanceof Error ? reason.message : '一覧を取得できませんでした。'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const symbols = JSON.stringify({ symbols: [...new Map(data.current.map((pick) => [priceKey(pick.symbol, pick.market), { symbol: pick.symbol, market: pick.market }])).values()] });
  const quotes = useDetailResource<{ prices: Record<string, StockPrice> }>('/api/prices', symbols);
  const fundamentals = useDetailResource<{ fundamentals: Record<string, FundamentalMetrics> }>('/api/fundamentals', symbols);
  const benchmark = useDetailResource<ChartData>('/api/chart?symbol=%5EGSPC&market=INDEX&range=5y&interval=d');
  const enriched = data.current.map((pick) => {
    const key = priceKey(pick.symbol, pick.market);
    return { ...pick, current_price: quotes.data?.prices[key]?.price ?? pick.current_price,
      current_benchmark: benchmark.data?.candles.at(-1)?.close ?? pick.current_benchmark,
      next_earnings_date: fundamentals.data?.fundamentals[key]?.next_earnings_date ?? pick.next_earnings_date };
  });
  const picks = tab === 'current' ? enriched : data.removed;
  const selected = picks.find((pick) => pick.id === selectedId) ?? picks[0];
  const summary = topPicksSummary(enriched, new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }));
  const paramId = params.get('id');
  useEffect(() => {
    if (!paramId) { appliedId.current = null; return; }
    if (loading || appliedId.current === paramId) return;
    const match = data.current.find((pick) => pick.id === paramId) ?? data.removed.find((pick) => pick.id === paramId);
    if (!match) return;
    let cancelled = false;
    void (async () => { if (detail.current && !await detail.current.flush()) return; if (!cancelled) { appliedId.current = paramId; setTab(match.removed_at ? 'removed' : 'current'); setSelectedId(paramId); } })();
    return () => { cancelled = true; };
  }, [paramId, loading, data]);
  useEffect(() => {
    const followLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download') || link.origin !== location.origin || !detail.current) return;
      event.preventDefault();
      const href = `${link.pathname}${link.search}${link.hash}`;
      void detail.current.flush().then((ok) => { if (ok) router.push(href); });
    };
    document.addEventListener('click', followLink, true);
    return () => document.removeEventListener('click', followLink, true);
  }, [router]);
  const changeSelection = async (id: string | null, nextTab = tab) => {
    if (busy) return;
    setBusy(true);
    try { if (detail.current && !await detail.current.flush()) return; setSelectedId(id); setTab(nextTab); }
    finally { setBusy(false); }
  };
  const onSaved = useCallback((pick: TopPick) => setData((previous) => ({
    current: previous.current.map((item) => item.id === pick.id ? { ...item, ...pick } : item),
    removed: previous.removed.map((item) => item.id === pick.id ? { ...item, ...pick } : item),
  })), []);
  const refresh = async () => {
    if (detail.current && !await detail.current.flush()) return;
    await Promise.all([reload(), quotes.reload(), fundamentals.reload(), benchmark.reload()]);
  };
  usePageRefresh(refresh, loading || quotes.loading || benchmark.loading, data.current[0]?.updated_at ?? null);
  const reorder = async (source: string, target: string) => {
    setDragged(null); setDrop(null);
    if (source === target || busy) return;
    setBusy(true); setError('');
    try {
      if (detail.current && !await detail.current.flush()) return;
      const ids = data.current.map((pick) => pick.id);
      const destination = ids.indexOf(target);
      ids.splice(ids.indexOf(source), 1);
      ids.splice(destination, 0, source);
      const result = await pickRequest<{ topPicks: TopPickView[] }>('/api/top-picks/reorder', 'PATCH', { ids });
      setSelectedId(selected?.id ?? null);
      setData((previous) => ({ ...previous, current: result.topPicks }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : '並べ替えに失敗しました。'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!selected || busy) return;
    setBusy(true); setError('');
    try { if (detail.current && !await detail.current.flush()) return; await pickRequest(`/api/top-picks/${encodeURIComponent(selected.id)}/remove`, 'POST'); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '外す処理に失敗しました。'); }
    finally { setBusy(false); }
  };
  return <div className="flex min-h-full min-w-0 flex-col gap-1">
    <section aria-label="トップピックの成績" className={`${panel} flex flex-wrap`}><div className="border-r border-[var(--pm-border)] px-3 py-2"><h1 className="text-[15px] font-semibold">トップピック</h1><p className="text-[11px] pm-muted">確信度の高い銘柄を最大10件に絞って成績を追う</p></div>{[
      ['ピック数', `${summary.count} / 10`, null], ['選定来の平均騰落', percent(summary.averageChange), summary.averageChange],
      ['S&P500比（平均）', percent(summary.averageAlpha), summary.averageAlpha], ['プラスの銘柄', `${summary.winners} / ${summary.count}`, null],
    ].map(([label, value, change]) => <div key={String(label)} className="min-w-28 flex-1 border-r border-[var(--pm-border)] px-3 py-2"><p className="text-[11px] pm-muted">{label}</p><strong className={`text-[17px] tabular-nums ${getProfitLossColor(typeof change === 'number' ? change : 0)}`}>{value}</strong></div>)}<div className="min-w-32 flex-1 px-3 py-2"><p className="text-[11px] pm-muted">次の見直し</p><strong className="text-[17px] text-[var(--pm-active-text)]">{summary.nextReview?.date ?? '—'}</strong><p className="text-[11px] pm-muted">{summary.nextReview ? `${summary.nextReview.symbol} ${summary.nextReview.reason}` : '予定なし'}</p></div></section>
    {error && <p role="alert" className="p-2 text-[var(--pm-accent)]">{error}<button type="button" className="pm-button ml-2" onClick={() => void reload()}>再試行</button></p>}
    {(quotes.error || fundamentals.error || benchmark.error) && <p role="status" className="px-2 text-[11px] pm-muted">価格・決算情報の一部を更新できませんでした。保存済みの値を表示しています。</p>}
    <div className="grid flex-1 grid-cols-1 items-start gap-1 min-[1200px]:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-label="ピック一覧" className={`${panel} overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--pm-border)] px-2"><div role="tablist" aria-label="ピックの表示">{([['current', '現在のピック'], ['removed', '外したピック']] as const).map(([key, label]) => <button type="button" role="tab" aria-selected={tab === key} aria-controls="picks-table" key={key} disabled={busy} onClick={() => void changeSelection(null, key)} className={`h-8 border-b-2 px-2 ${tab === key ? 'border-[var(--pm-accent)] text-[var(--pm-active-text)]' : 'border-transparent pm-muted'}`}>{label} {data[key].length}</button>)}</div><button type="button" disabled={busy || loading || data.current.length >= 10} className="pm-button my-1 ml-auto !h-6 !bg-[var(--pm-accent)] !text-[#1a1205]" onClick={() => setAdding(true)}>＋ ピックを追加</button></div>
        <div id="picks-table" role="tabpanel" className="max-h-[calc(100vh-280px)] min-h-44 overflow-auto"><table aria-label="トップピック" className="w-full min-w-[1250px] border-collapse whitespace-nowrap text-[11px]"><thead className="sticky top-0 z-10 bg-[var(--pm-heading)] text-left pm-muted"><tr>{['並べ替え', tab === 'current' ? '順位' : '外した日', 'コード', '銘柄名', '状態', 'テーマ', '確信度', '期間', '選定日', '選定時', tab === 'current' ? '現在値' : '外した時', '選定来', 'S&P比', '目標', '目標まで', '見直し'].map((label, i) => <th key={label} scope="col" className={`h-[26px] border-b border-[var(--pm-border)] px-2 font-medium ${i >= 8 ? 'text-right' : ''}`}>{i === 0 ? <span className="sr-only">{label}</span> : label}</th>)}</tr></thead><tbody>{picks.map((pick, index) => {
          const performance = topPickPerformance(pick);
          return <tr key={pick.id} aria-selected={pick.id === selected?.id} onDragOver={(event) => { if (dragged && !busy && tab === 'current') { event.preventDefault(); setDrop(pick.id); } }} onDrop={(event) => { event.preventDefault(); if (dragged) void reorder(dragged, pick.id); }} className={`border-b border-[var(--pm-divider)] ${pick.id === selected?.id ? 'bg-[var(--pm-selected-row)]' : 'hover:bg-[var(--pm-heading)]'} ${drop === pick.id ? 'outline outline-1 outline-[var(--pm-accent)]' : ''}`} style={{ height: 'var(--pm-row-h)' }}>
            <td className="px-1">{tab === 'current' && <button type="button" disabled={busy} draggable={!busy} aria-label={`${pick.symbol}の順位を変更。Alt+上下矢印でも変更できます`} title="ドラッグまたはAlt+上下矢印で順位変更" className="cursor-grab px-1 pm-muted" onDragStart={(event) => { setDragged(pick.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', pick.id); }} onDragEnd={() => { setDragged(null); setDrop(null); }} onKeyDown={(event) => { const target = index + (event.key === 'ArrowUp' ? -1 : 1); if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key) && picks[target]) { event.preventDefault(); void reorder(pick.id, picks[target].id); } }}>⋮⋮</button>}</td>
            <td className="px-2 font-semibold text-[var(--pm-accent)]">{tab === 'current' ? `#${pick.rank}` : pick.removed_at?.slice(0, 10)}</td><td className="px-2 pm-muted">{pick.symbol}</td><td className="max-w-48 truncate px-2"><button type="button" disabled={busy} className="font-semibold hover:text-[var(--pm-link)]" title={pick.name} onClick={() => void changeSelection(pick.id)}>{pick.name}</button></td>
            <td className="px-2"><span className={`rounded border px-1 ${pick.state === '保有中' ? 'border-[#365e4d] text-[#7acba5]' : 'border-[var(--pm-input-border)] pm-muted'}`}>{pick.state}</span></td><td className="max-w-40 truncate px-2" title={pick.theme ?? ''}>{pick.theme || '—'}</td><td className="px-2 text-[var(--pm-active-text)]" aria-label={`確信度 ${pick.conviction ? convictionText[pick.conviction] : '未設定'}`}>{pick.conviction ? '●'.repeat({ high: 3, medium: 2, low: 1 }[pick.conviction]) : '—'}</td><td className="px-2 pm-muted">{pick.horizon ? horizonText[pick.horizon] : '—'}</td>
            <td className="px-2 text-right tabular-nums">{pick.picked_at}</td><td className="px-2 text-right tabular-nums">{priceText(pick.picked_price)}</td><td className="px-2 text-right font-semibold tabular-nums">{priceText(pick.removed_at ? pick.removed_price : pick.current_price)}</td>{[performance.change, performance.alpha].map((value, i) => <td key={i} className={`px-2 text-right tabular-nums ${getProfitLossColor(value ?? 0)}`}>{percent(value)}</td>)}<td className="px-2 text-right tabular-nums">{pick.target_price === null ? '未設定' : priceText(pick.target_price)}</td><td className="px-2 text-right tabular-nums">{percent(performance.toTarget)}</td><td className="px-2 text-right tabular-nums">{pick.review_on ?? '—'}</td>
          </tr>;
        })}</tbody></table>{loading && <p role="status" className="p-3 pm-muted">読み込み中…</p>}{!loading && !picks.length && <p className="p-4 pm-muted">{tab === 'current' ? 'ピックがありません。「＋ ピックを追加」から選定してください。' : '外したピックはありません。'}</p>}</div>
        <p className="border-t border-[var(--pm-border)] px-3 py-2 text-[11px] pm-muted">つまみをドラッグして順位を変更。状態は保有・登録銘柄と連動します。外したピックは成績ごと残ります。平均は取得できた価格のみで計算します（{summary.pricedCount}/{summary.count}件）。</p>
      </section>
      {selected ? <PickDetail key={selected.id} ref={detail} pick={selected} busy={busy} onSaved={onSaved} onRemove={remove} /> : <aside className={`${panel} p-3 pm-muted`}>ピックを選ぶと詳細を表示します。</aside>}
    </div>
    {adding && <AddPickDialog candidates={[...catalog.holdings, ...catalog.watchlist, ...(tickers.data?.tickerPresets ?? [])]} onClose={() => setAdding(false)} onAdded={async () => { if (detail.current) await detail.current.flush(); await reload(); }} />}
  </div>;
}
