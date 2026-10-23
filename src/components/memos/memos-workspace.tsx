'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { MemoSymbol, MemoTag, StockMemo, TickerPreset } from '@/types';
import { priceKey } from '@/lib/price-key';
import { useDetailCatalog, useDetailResource } from '@/components/detail/data';
import { usePageRefresh } from '@/components/shell/refresh-context';
import { MemoEditor, type MemoEditorHandle } from './memo-editor';
import { MemoContext } from './memo-context';
import { TAGS, activeClass, dateText, inputClass, memoRequest, panel } from './shared';

export function MemosWorkspace() {
  const params = useSearchParams();
  const router = useRouter();
  const catalog = useDetailCatalog();
  const tickers = useDetailResource<{ tickerPresets: TickerPreset[] }>('/api/tickers');
  const [memos, setMemos] = useState<StockMemo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<MemoTag | ''>('');
  const [scope, setScope] = useState('all');
  const [symbol, setSymbol] = useState('');
  const [market, setMarket] = useState('US');
  const [selection, setSelection] = useState<{ key: string; memo: StockMemo | null; symbols: MemoSymbol[] } | null>(null);
  const [contextSymbols, setContextSymbols] = useState<MemoSymbol[]>([]);
  const [switching, setSwitching] = useState(false);
  const editor = useRef<MemoEditorHandle>(null);
  const appliedParams = useRef<string | null>(null);
  const paramsKey = params.toString();
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setMemos((await memoRequest<{ memos: StockMemo[] }>('/api/memos', 'GET')).memos); }
    catch { setError('メモを取得できませんでした。'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  usePageRefresh(reload, loading, memos[0]?.updated_at ?? null);
  useEffect(() => {
    const followLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download') || link.origin !== location.origin) return;
      if (!editor.current) return;
      event.preventDefault();
      const href = `${link.pathname}${link.search}${link.hash}`;
      void editor.current.flush().then((ok) => { if (ok) router.push(href); });
    };
    document.addEventListener('click', followLink, true);
    return () => document.removeEventListener('click', followLink, true);
  }, [router]);

  useEffect(() => {
    if (loading || error || appliedParams.current === paramsKey) return;
    const url = new URLSearchParams(paramsKey);
    const code = url.get('symbol')?.trim().toUpperCase();
    const value = url.get('market')?.toUpperCase();
    const symbols: MemoSymbol[] = code && (value === 'US' || value === 'JP' || value === 'FX') ? [{ symbol: code, market: value }] : [];
    let cancelled = false;
    void (async () => {
      if (editor.current && !await editor.current.flush()) return;
      if (cancelled) return;
      appliedParams.current = paramsKey;
      setScope(symbols.length ? 'specified' : 'all');
      setSymbol(code ?? '');
      setMarket(symbols[0]?.market ?? 'US');
      const memo = url.get('new') === '1' ? null : memos.find((item) => item.id === url.get('id'))
        ?? memos.find((item) => !symbols.length || item.symbols.some((s) => priceKey(s.symbol, s.market) === priceKey(symbols[0].symbol, symbols[0].market))) ?? null;
      setSelection({ key: memo?.id ?? crypto.randomUUID(), memo, symbols });
      setContextSymbols(memo?.symbols ?? symbols);
    })();
    return () => { cancelled = true; };
  }, [paramsKey, loading, error, memos]);

  const onSaved = useCallback((memo: StockMemo) => {
    setMemos((previous) => [memo, ...previous.filter((item) => item.id !== memo.id)].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)));
    setSelection((previous) => previous ? { ...previous, memo } : previous);
  }, []);
  const switchTo = async (memo: StockMemo | null) => {
    if (switching || (memo && memo.id === selection?.memo?.id)) return;
    setSwitching(true);
    try {
      if (editor.current && !await editor.current.flush()) return;
      const symbols: MemoSymbol[] = scope === 'specified' && symbol.trim() && ['US', 'JP', 'FX'].includes(market) ? [{ symbol: symbol.trim().toUpperCase(), market: market as MemoSymbol['market'] }] : [];
      setSelection({ key: memo?.id ?? crypto.randomUUID(), memo, symbols });
      setContextSymbols(memo?.symbols ?? symbols);
    } finally { setSwitching(false); }
  };
  const held = new Set(catalog.holdings.filter((item) => item.symbol !== 'CASH').map((item) => priceKey(item.symbol, item.market)));
  const term = query.trim().toLocaleLowerCase();
  const visible = memos.filter((memo) => (!tag || memo.tag === tag)
    && (!term || `${memo.title}\n${memo.body}`.toLocaleLowerCase().includes(term))
    && (scope === 'all' || memo.symbols.some((item) => scope === 'held' ? held.has(priceKey(item.symbol, item.market)) : item.symbol === symbol.trim().toUpperCase() && item.market === market)));
  const candidates = useMemo(() => [...catalog.holdings, ...catalog.watchlist, ...(tickers.data?.tickerPresets ?? [])], [catalog.holdings, catalog.watchlist, tickers.data]);
  return <div className="grid min-h-full min-w-0 grid-cols-1 items-start gap-1 min-[900px]:grid-cols-[minmax(200px,1fr)_minmax(300px,2fr)_minmax(200px,1fr)]">
    <section aria-label="メモ一覧" className={`${panel} min-[900px]:sticky min-[900px]:top-0`}>
      <div className="flex items-center gap-2 border-b border-[var(--pm-border)] px-3 py-2"><h1 className="font-semibold">銘柄メモ</h1><span className="pm-muted">{visible.length}件</span><button type="button" disabled={switching || loading} className="pm-button ml-auto !h-6 !bg-[var(--pm-accent)] !text-[#1a1205]" onClick={() => void switchTo(null)}>＋ 新規</button></div>
      <div className="flex flex-col gap-2 border-b border-[var(--pm-border)] p-2"><input aria-label="メモを検索" type="search" placeholder="タイトル・本文を検索" className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} /><div role="group" aria-label="タグで絞り込み" className="flex flex-wrap gap-1">{[{ key: '', label: 'すべて' }, ...TAGS].map((item) => <button type="button" key={item.key} aria-pressed={tag === item.key} onClick={() => setTag(item.key as MemoTag | '')} className={`pm-button !h-[22px] !rounded-full !px-2 !text-[11px] ${tag === item.key ? activeClass : ''}`}>{item.label}</button>)}</div><label className="flex items-center gap-2"><span className="shrink-0 pm-muted">銘柄</span><select aria-label="銘柄の絞り込み" value={scope} onChange={(event) => setScope(event.target.value)} className={`${inputClass} flex-1`}><option value="all">すべての銘柄</option><option value="held">保有銘柄のみ</option><option value="specified">指定銘柄</option></select></label>{scope === 'specified' && <div className="flex gap-1"><input aria-label="絞り込み銘柄コード" placeholder="銘柄コード" value={symbol} onChange={(event) => setSymbol(event.target.value)} className={`${inputClass} w-full`} /><select aria-label="絞り込み市場" value={market} onChange={(event) => setMarket(event.target.value)} className={inputClass}>{['US', 'JP', 'FX'].map((value) => <option key={value}>{value}</option>)}</select></div>}</div>
      {error && <div role="alert" className="p-3 text-[var(--pm-accent)]">{error}<button type="button" className="pm-button ml-2" onClick={() => void reload()}>再試行</button></div>}
      <div className="max-h-[360px] overflow-auto min-[900px]:max-h-[calc(100vh-310px)]">{visible.map((memo) => <button type="button" key={memo.id} disabled={switching} aria-pressed={selection?.memo?.id === memo.id} onClick={() => void switchTo(memo)} className={`flex w-full min-w-0 flex-col gap-1 border-b border-[var(--pm-divider)] px-3 py-2 text-left hover:bg-[var(--pm-heading)] ${selection?.memo?.id === memo.id ? 'bg-[var(--pm-selected-row)]' : ''}`}><span className="flex w-full flex-wrap items-center gap-1 text-[10px]"><time className="pm-muted">{dateText(memo.created_at).slice(0, 10)}</time>{memo.symbols.map((item) => <span key={priceKey(item.symbol, item.market)} className="rounded bg-[#17253a] px-1 text-[#9cc4ff]">{item.symbol} · {item.market}</span>)}{memo.tag && <span className="ml-auto rounded border border-[var(--pm-input-border)] px-1 pm-muted">{TAGS.find((item) => item.key === memo.tag)?.label}</span>}</span><span className="w-full truncate font-semibold">{memo.title}</span><span className="w-full truncate text-[11px] pm-muted">{memo.body.split('\n')[0] || '本文なし'}</span></button>)}{loading && <p role="status" className="p-3 pm-muted">読み込み中…</p>}{!loading && !error && !visible.length && <p className="p-3 pm-muted">該当するメモはありません。</p>}</div>
    </section>
    {selection ? <MemoEditor key={selection.key} ref={editor} initial={selection.memo} symbols={selection.symbols} catalog={candidates} onSymbols={setContextSymbols} onSaved={onSaved} onDeleted={(id) => { setMemos((previous) => previous.filter((memo) => memo.id !== id)); setSelection(null); setContextSymbols([]); }} /> : <div className={`${panel} p-4 pm-muted`}>メモを選ぶか「＋ 新規」から作成してください。</div>}
    <div className="min-w-0">{(catalog.error || tickers.error) && <p role="status" className="mb-1 p-2 text-[var(--pm-accent)]">銘柄情報の一部を取得できませんでした。</p>}<MemoContext selected={contextSymbols[0]} memos={memos} holdings={catalog.holdings} watchlist={catalog.watchlist} cachedPrices={catalog.prices} onSelect={(memo) => void switchTo(memo)} /></div>
  </div>;
}
