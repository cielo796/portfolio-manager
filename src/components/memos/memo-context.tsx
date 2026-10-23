'use client';

import Link from 'next/link';
import type { Holding, MemoSymbol, StockMemo, StockPrice, WatchlistItem } from '@/types';
import { priceKey } from '@/lib/price-key';
import { getProfitLossColor } from '@/lib/utils';
import { useDetailResource } from '@/components/detail/data';
import { WATCHLIST_TABS } from '@/components/watchlist/constants';
import { dateText, moneyText, panel } from './shared';

export function MemoContext({ selected, memos, holdings, watchlist, cachedPrices, onSelect }: {
  selected?: MemoSymbol; memos: StockMemo[]; holdings: Holding[]; watchlist: WatchlistItem[];
  cachedPrices: Record<string, StockPrice>; onSelect: (memo: StockMemo) => void;
}) {
  const quotes = useDetailResource<{ prices: Record<string, StockPrice> }>('/api/prices', JSON.stringify({ symbols: selected ? [selected] : [] }));
  if (!selected) return <aside aria-label="銘柄の状況" className={`${panel} p-3 pm-muted`}>銘柄を紐づけると、現在の状況とメモの時系列が表示されます。</aside>;
  const { symbol, market } = selected;
  const key = priceKey(symbol, market);
  const owned = holdings.filter((item) => priceKey(item.symbol, item.market) === key);
  const watched = watchlist.filter((item) => priceKey(item.symbol, item.market) === key);
  const quote = quotes.data?.prices[key] ?? cachedPrices[key];
  const timeline = memos.filter((memo) => memo.symbols.some((item) => priceKey(item.symbol, item.market) === key));
  return <aside aria-label="銘柄の状況" className={panel}>
    <div className="border-b border-[var(--pm-border)] px-3 py-3"><div className="flex flex-wrap items-baseline gap-2"><span className="pm-muted">{symbol} · {market}</span><h2 className="text-sm font-semibold">{owned[0]?.name ?? watched[0]?.name ?? quote?.name ?? symbol}</h2></div><div className="mt-1 flex flex-wrap items-baseline gap-2 tabular-nums"><strong className="text-lg">{quote ? moneyText(quote.price, quote.currency) : '価格未取得'}</strong>{quote && <span className={getProfitLossColor(quote.change)}>{quote.change > 0 ? '+' : ''}{quote.change.toLocaleString()}（{quote.change_percent > 0 ? '+' : ''}{quote.change_percent.toFixed(2)}%）</span>}</div>{quote && <p className="text-[10px] pm-muted">価格更新 {dateText(quote.updated_at)}</p>}{quotes.error && <p className="mt-1 text-[11px] pm-muted">現在値を更新できませんでした。{quote ? '保存済みの値を表示中です。' : ''}</p>}</div>
    <dl className="border-b border-[var(--pm-border)] px-3 py-2">{[['保有', owned.length ? `${owned.reduce((sum, item) => sum + item.shares, 0).toLocaleString()}${market === 'FX' ? ' 通貨' : ' 株'}` : '保有なし'], ['登録リスト', watched.map((item) => WATCHLIST_TABS.find((tab) => tab.key === item.list_key)?.label ?? item.list_key).join('、') || '—']].map(([label, value]) => <div className="flex justify-between gap-2 border-b border-[var(--pm-divider)] py-1" key={label}><dt className="pm-muted">{label}</dt><dd className="text-right tabular-nums">{value}</dd></div>)}</dl>
    <div className="px-3 py-3"><h3 className="mb-3 text-[11px] pm-muted">この銘柄のメモ（時系列）</h3>{timeline.length ? <ol className="border-l border-[var(--pm-input-border)]">{timeline.map((memo) => <li key={memo.id} className="relative pb-4 pl-3"><span className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-[var(--pm-accent)]" /><time className="text-[10px] pm-muted">{dateText(memo.created_at)}</time><span className="ml-2 text-[11px] tabular-nums">{memo.price_snapshot[key] ? moneyText(memo.price_snapshot[key].price, memo.price_snapshot[key].currency) : '価格記録なし'}</span><button type="button" className="mt-0.5 block w-full break-words text-left hover:text-[var(--pm-link)]" onClick={() => onSelect(memo)}>{memo.title}</button></li>)}</ol> : <p className="pm-muted">この銘柄のメモはありません。</p>}</div>
    <div className="border-t border-[var(--pm-border)] p-2"><Link className="pm-button inline-flex items-center" href={`/detail?symbol=${encodeURIComponent(symbol)}&market=${market}`}>銘柄詳細</Link></div>
  </aside>;
}
