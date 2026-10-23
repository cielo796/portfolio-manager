'use client';

import { useEffect, useRef, useState } from 'react';
import type { DetailSymbol, Market, StockPrice, TopPickInput } from '@/types';
import { fallbackSymbol, searchSymbols } from '@/components/detail/data';
import { priceKey } from '@/lib/price-key';
import { convictionText, horizonText, inputClass, pickRequest } from './shared';

type Quote = { symbol: string; market: Market; price: number; currency: string };

const todayInTokyo = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });

export function AddPickDialog({ candidates, onClose, onAdded }: { candidates: DetailSymbol[]; onClose: () => void; onAdded: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<TopPickInput>({ symbol: '', market: 'US', conviction: 'high', horizon: 'medium', pickedAt: todayInTokyo() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const priceRequest = useRef<Promise<void> | null>(null);
  const requestId = useRef(0);
  const choices = searchSymbols(candidates, query);
  const fallback = fallbackSymbol(query);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);

  // 1銘柄の現在値を取得して保存する。失敗しても手入力で追加できるよう、エラーは握りつぶす。
  const loadPrice = (symbol: string, market: Market) => {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) return Promise.resolve();
    if (quote?.symbol === normalized && quote.market === market) return Promise.resolve();
    const id = ++requestId.current;
    const key = priceKey(normalized, market);
    setPendingKey(key);
    const task = (async () => {
      try {
        const result = await pickRequest<{ prices: Record<string, StockPrice> }>('/api/prices', 'POST', { symbols: [{ symbol: normalized, market }] });
        const price = result.prices?.[key];
        if (id === requestId.current && price) setQuote({ symbol: normalized, market, price: price.price, currency: price.currency });
      } catch { /* 取得できない場合は手入力を促す既存のエラー表示に任せる */ }
      finally { if (id === requestId.current) setPendingKey(null); }
    })();
    priceRequest.current = task;
    return task;
  };

  const currentKey = priceKey(draft.symbol.trim().toUpperCase(), draft.market);
  const currentQuote = quote && priceKey(quote.symbol, quote.market) === currentKey ? quote : null;
  const placeholder = currentQuote
    ? `現在値 ${currentQuote.currency === 'JPY' ? '¥' : '$'}${currentQuote.price.toLocaleString('ja-JP', { maximumFractionDigits: 4 })}（空欄なら この値で記録）`
    : pendingKey === currentKey ? '現在値を取得中…' : '空欄なら保存済みの現在値';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await priceRequest.current;
      await pickRequest('/api/top-picks', 'POST', draft);
      await onAdded(); onClose();
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : '追加できませんでした。'); }
    finally { setBusy(false); }
  };
  return <dialog ref={dialog} aria-labelledby="add-pick-title" onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }} className="m-auto max-h-[90vh] w-[min(620px,95vw)] overflow-auto rounded border border-[var(--pm-border)] bg-[var(--pm-panel)] p-4 text-[var(--pm-text)] backdrop:bg-black/60">
    <form onSubmit={(event) => void submit(event)} className="space-y-3"><h2 id="add-pick-title" className="text-sm font-semibold">ピックを追加</h2>
      <label className="block">銘柄を検索<input autoFocus type="search" placeholder="コード・銘柄名" className={`${inputClass} mt-1 w-full`} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {query && <div role="group" aria-label="銘柄候補" className="max-h-32 overflow-auto rounded border border-[var(--pm-border)]">{[...choices, ...(!choices.length && fallback ? [fallback] : [])].map((item) => <button type="button" key={`${item.symbol}|${item.market}`} className="block w-full px-2 py-1 text-left hover:bg-[var(--pm-heading)]" onClick={() => { setDraft({ ...draft, symbol: item.symbol, market: item.market }); setQuery(''); void loadPrice(item.symbol, item.market); }}>{item.symbol} · {item.name ?? item.market}</button>)}{!choices.length && !fallback && <p className="p-2 pm-muted">下の銘柄コードと市場を入力してください。</p>}</div>}
      <div className="grid grid-cols-2 gap-2"><label>銘柄コード<input required maxLength={32} className={`${inputClass} mt-1 w-full`} value={draft.symbol} onChange={(event) => setDraft({ ...draft, symbol: event.target.value.toUpperCase() })} onBlur={() => void loadPrice(draft.symbol, draft.market)} /></label><label>市場<select className={`${inputClass} mt-1 w-full`} value={draft.market} onChange={(event) => { const market = event.target.value as Market; setDraft({ ...draft, market }); void loadPrice(draft.symbol, market); }}>{['US', 'JP', 'FX'].map((market) => <option key={market}>{market}</option>)}</select></label>
        <label>テーマ<input className={`${inputClass} mt-1 w-full`} value={draft.theme ?? ''} onChange={(event) => setDraft({ ...draft, theme: event.target.value })} /></label>
        <label>確信度<select className={`${inputClass} mt-1 w-full`} value={draft.conviction ?? ''} onChange={(event) => setDraft({ ...draft, conviction: event.target.value as TopPickInput['conviction'] })}>{Object.entries(convictionText).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
        <label>期間<select className={`${inputClass} mt-1 w-full`} value={draft.horizon ?? ''} onChange={(event) => setDraft({ ...draft, horizon: event.target.value as TopPickInput['horizon'] })}>{Object.entries(horizonText).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
        <label>選定日<input type="date" className={`${inputClass} mt-1 w-full`} value={draft.pickedAt ?? ''} onChange={(event) => setDraft({ ...draft, pickedAt: event.target.value || undefined })} /></label>
        <label>選定時の価格<input type="number" min="0.00000001" step="any" placeholder={placeholder} className={`${inputClass} mt-1 w-full`} onChange={(event) => setDraft({ ...draft, pickedPrice: event.target.value ? Number(event.target.value) : undefined })} /></label>
        <label>目標価格<input type="number" min="0.00000001" step="any" className={`${inputClass} mt-1 w-full`} onChange={(event) => setDraft({ ...draft, targetPrice: event.target.value ? Number(event.target.value) : null })} /></label>
        <label>見直し日<input type="date" className={`${inputClass} mt-1 w-full`} onChange={(event) => setDraft({ ...draft, reviewOn: event.target.value || null })} /></label></div>
      {([['thesis', '選定理由'], ['catalysts', 'カタリスト'], ['risks', 'リスク'], ['exitRule', '外す条件']] as const).map(([key, text]) => <label key={key} className="block">{text}<textarea rows={2} maxLength={20000} className={`${inputClass} mt-1 w-full resize-y`} value={draft[key] ?? ''} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
      {error && <p role="alert" className="text-[var(--pm-accent)]">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" disabled={busy} className="pm-button" onClick={onClose}>キャンセル</button><button type="submit" disabled={busy} className="pm-button !bg-[var(--pm-accent)] !text-[#1a1205]">{busy ? '追加中…' : '追加する'}</button></div>
    </form>
  </dialog>;
}
