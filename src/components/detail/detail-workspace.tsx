'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ChartData, DetailSymbol, FundamentalMetrics, Holding, NewsItem, StockPrice, Transaction, WatchlistItem, WatchlistKey } from '@/types';
import { priceKey } from '@/lib/price-key';
import { getSectorLabel, resolveSectorForSymbol } from '@/lib/sectors';
import { getMarketLabel, getProfitLossColor } from '@/lib/utils';
import { WATCHLIST_TABS } from '@/components/watchlist/constants';
import { usePageRefresh } from '@/components/shell/refresh-context';
import { detailHref, useDetailCatalog, useDetailResource } from './data';
import { useChartSettings } from './chart-settings';
import { CandlestickChart } from './candlestick-chart';
import { MetricsPane, moneyText, numberText, percentText } from './metrics-pane';

const panel = 'min-w-0 rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]';
const activeButton = '!border-[#6b5226] !bg-[var(--pm-active-bg)] !text-[var(--pm-active-text)]';

export function DetailWorkspace() {
  const params = useSearchParams();
  const router = useRouter();
  const catalog = useDetailCatalog();
  const [tab, setTab] = useState<'holdings' | WatchlistKey>('holdings');
  const symbolParam = params.get('symbol')?.trim().toUpperCase();
  const marketParam = params.get('market')?.toUpperCase();
  const validMarket = marketParam === 'US' || marketParam === 'JP' || marketParam === 'FX';
  const invalid = Boolean(symbolParam) && (!/^[A-Z0-9][A-Z0-9.=-]{0,31}$/.test(symbolParam!) || !validMarket);
  const first = catalog.holdings.find((item) => item.symbol !== 'CASH') ?? catalog.watchlist[0];
  const selected: DetailSymbol | undefined = symbolParam && validMarket && !invalid ? { symbol: symbolParam, market: marketParam } : !symbolParam ? first : undefined;
  const selectedHref = selected ? detailHref(selected) : '';
  useEffect(() => { if (!symbolParam && selectedHref) router.replace(selectedHref, { scroll: false }); }, [symbolParam, selectedHref, router]);
  const list = tab === 'holdings' ? catalog.holdings.filter((item) => item.symbol !== 'CASH') : catalog.watchlist.filter((item) => item.list_key === tab);
  const unique = [...new Map(list.map((item) => [priceKey(item.symbol, item.market), item])).values()];
  return <div className="grid min-h-full min-w-0 grid-cols-1 items-start gap-1 min-[1100px]:grid-cols-[240px_minmax(0,1fr)]">
    <section aria-label="銘柄リスト" className={`${panel} min-[1100px]:sticky min-[1100px]:top-0`}>
      <div role="group" aria-label="銘柄リスト切替" className="flex flex-wrap border-b border-[var(--pm-border)] px-1">
        {([{ key: 'holdings', label: '保有' }, ...WATCHLIST_TABS] as const).map((item) => <button type="button" key={item.key} aria-pressed={tab === item.key} onClick={() => setTab(item.key)} className={`h-7 border-b-2 px-2 ${tab === item.key ? 'border-[var(--pm-accent)] text-[var(--pm-active-text)]' : 'border-transparent pm-muted'}`}>{item.label}</button>)}
      </div>
      <div className="grid grid-cols-[48px_minmax(0,1fr)_64px_48px] gap-1 bg-[var(--pm-heading)] px-2 py-1 text-[10px] pm-muted"><span>コード</span><span>名称</span><span className="text-right">現在値</span><span className="text-right">前日比%</span></div>
      <div className="max-h-[250px] overflow-auto min-[1100px]:max-h-[calc(100vh-185px)]">
        {unique.map((item) => {
          const price = catalog.prices[priceKey(item.symbol, item.market)];
          const current = item.symbol === selected?.symbol && item.market === selected.market;
          return <Link key={priceKey(item.symbol, item.market)} href={detailHref(item)} scroll={false} aria-current={current ? 'true' : undefined} title={`${item.symbol} ${item.name ?? price?.name ?? ''}（${item.market}）`} className={`grid grid-cols-[48px_minmax(0,1fr)_64px_48px] items-center gap-1 border-b border-[var(--pm-divider)] px-2 text-[11px] hover:bg-[var(--pm-heading)] ${current ? 'bg-[var(--pm-selected-row)]' : ''}`} style={{ minHeight: 'var(--pm-row-h)' }}>
            <span className="truncate pm-muted">{item.symbol}</span><span className="truncate">{item.name ?? price?.name ?? item.symbol}</span><span className="truncate text-right tabular-nums" title={price ? `${price.price}` : '価格未取得'}>{price ? numberText(price.price) : '—'}</span><span className={`text-right tabular-nums ${price ? getProfitLossColor(price.change_percent) : 'pm-muted'}`}>{percentText(price?.change_percent)}</span>
          </Link>;
        })}
        {catalog.loading && <p role="status" className="p-3 pm-muted">読み込み中…</p>}
        {!catalog.loading && unique.length === 0 && <p className="p-3 pm-muted">このリストには銘柄がありません。</p>}
        {catalog.error && <p role="alert" className="p-3 text-[var(--pm-accent)]">銘柄リストの一部を取得できませんでした。</p>}
      </div>
    </section>
    {invalid ? <p role="alert" className={`${panel} p-4`}>銘柄コードと市場（US / JP / FX）を確認してください。</p> : selected ? <DetailContent key={priceKey(selected.symbol, selected.market)} selected={selected} holdings={catalog.holdings} watchlist={catalog.watchlist} cachedPrice={catalog.prices[priceKey(selected.symbol, selected.market)]} /> : <p role="status" className={`${panel} p-4 pm-muted`}>{catalog.loading ? '銘柄を読み込み中…' : '保有・登録銘柄がありません。上部の銘柄検索から開いてください。'}</p>}
  </div>;
}

function DetailContent({ selected, holdings, watchlist, cachedPrice }: { selected: DetailSymbol; holdings: Holding[]; watchlist: WatchlistItem[]; cachedPrice?: StockPrice }) {
  const { symbol, market } = selected;
  const key = priceKey(symbol, market);
  const owned = useMemo(() => holdings.filter((item) => item.symbol === symbol && item.market === market), [holdings, symbol, market]);
  const watched = useMemo(() => watchlist.filter((item) => item.symbol === symbol && item.market === market), [watchlist, symbol, market]);
  const body = JSON.stringify({ symbols: [selected] });
  const history = useDetailResource<ChartData>(`/api/chart?symbol=${encodeURIComponent(symbol)}&market=${market}&range=5y&interval=d`);
  const quotes = useDetailResource<{ prices: Record<string, StockPrice> }>('/api/prices', body);
  const fundamentals = useDetailResource<{ fundamentals: Record<string, FundamentalMetrics> }>('/api/fundamentals', body);
  const records = useDetailResource<{ transactions: Transaction[] }>('/api/transactions');
  const news = useDetailResource<{ news: NewsItem[] }>(`/api/news?symbols=${encodeURIComponent(market === 'FX' ? `${symbol}=X` : market === 'JP' ? `${symbol}.T` : symbol)}`);
  const { settings, update } = useChartSettings();
  const [lowerTab, setLowerTab] = useState<'news' | 'trades'>('news');
  const price = quotes.data?.prices[key] ?? cachedPrice;
  const candles = history.data?.candles ?? [];
  const latest = candles.at(-1);
  const transactions = useMemo(() => (records.data?.transactions ?? []).filter((item) => item.symbol === symbol && item.market === market).sort((a, b) => b.transaction_date.localeCompare(a.transaction_date)), [records.data, symbol, market]);
  const targets = useMemo(() => [...new Set(watched.flatMap((item) => item.target_price != null && item.target_price > 0 ? [item.target_price] : []))], [watched]);
  const shares = owned.reduce((sum, item) => sum + item.shares, 0);
  const cost = shares > 0 ? owned.reduce((sum, item) => sum + item.avg_cost * item.shares, 0) / shares : undefined;
  const currency = price?.currency ?? history.data?.currency ?? (market === 'US' ? 'USD' : market === 'FX' ? symbol.slice(-3) : 'JPY');
  const name = owned[0]?.name ?? watched[0]?.name ?? price?.name ?? symbol;
  const sector = owned[0]?.sector ?? watched[0]?.sector ?? resolveSectorForSymbol(symbol, market);
  const status = [owned.length ? '保有中' : '', ...watched.map((item) => WATCHLIST_TABS.find((tab) => tab.key === item.list_key)?.label)].filter(Boolean).join('／') || '未登録';
  const refresh = async () => {
    await Promise.all([quotes.reload(), history.reload()]);
  };
  usePageRefresh(refresh, quotes.loading || history.loading, price?.updated_at ?? history.data?.fetchedAt ?? null);
  const articles = (news.data?.news ?? []).filter((item) => item.symbol.replace(/\.T$|=X$/g, '') === symbol).sort((a, b) => b.published_at.localeCompare(a.published_at)).slice(0, 10);
  const toggle = (field: 'ma5' | 'ma25' | 'ma75' | 'cost' | 'target' | 'trades', label: string, disabled = false) => <button type="button" aria-pressed={settings[field]} disabled={disabled} onClick={() => update({ [field]: !settings[field] })} className={`pm-button !h-6 !px-2 ${settings[field] ? activeButton : ''}`}>{label}</button>;
  return <div className="grid min-w-0 grid-cols-1 items-start gap-1 min-[1100px]:grid-cols-[minmax(0,1fr)_260px]">
    <section aria-labelledby="detail-title" className={panel}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-[var(--pm-border)] px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-2"><span className="pm-muted">{symbol}</span><h1 id="detail-title" className="text-[15px] font-semibold">{name}</h1><span className="text-[11px] pm-muted">{getMarketLabel(market)}・{market === 'FX' ? '為替' : getSectorLabel(sector)}・{status}</span></div>
        <div className="flex items-baseline gap-2"><span className="text-[22px] font-semibold tabular-nums">{price ? moneyText(price.price, currency) : '価格未取得'}</span><span className={`tabular-nums ${price ? getProfitLossColor(price.change) : 'pm-muted'}`}>{price ? `${price.change > 0 ? '+' : ''}${numberText(price.change, 4)}（${percentText(price.change_percent)}）` : '—'}</span></div>
        <dl className="flex w-full flex-wrap gap-x-4 gap-y-1 text-[11px]">{[['始値', numberText(latest?.open, 4)], ['高値', numberText(latest?.high, 4)], ['安値', numberText(latest?.low, 4)], ['前日終値', numberText(price ? price.price - price.change : undefined, 4)], ['出来高', numberText(price?.volume ?? latest?.volume, 0)]].map(([label, value]) => <div key={label} className="flex gap-1"><dt className="pm-muted">{label}</dt><dd className="tabular-nums">{value}</dd></div>)}</dl>
        <p className="text-[10px] pm-muted">OHLC: {latest?.date ?? '—'} · 価格更新: {price?.updated_at ? new Date(price.updated_at).toLocaleString('ja-JP') : '—'}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--pm-border)] px-3 py-1.5">
        <div role="group" aria-label="期間" className="flex gap-0.5">{(['3m', '6m', '1y', '5y'] as const).map((range) => <button type="button" key={range} aria-pressed={settings.range === range} onClick={() => update({ range })} className={`pm-button !h-6 !px-2 ${settings.range === range ? activeButton : ''}`}>{range.toUpperCase()}</button>)}</div>
        <div role="group" aria-label="足" className="flex gap-0.5">{([['d', '日足'], ['w', '週足'], ['m', '月足']] as const).map(([interval, label]) => <button type="button" key={interval} aria-pressed={settings.interval === interval} onClick={() => update({ interval })} className={`pm-button !h-6 !px-2 ${settings.interval === interval ? activeButton : ''}`}>{label}</button>)}</div>
        {toggle('ma5', 'MA5')}{toggle('ma25', 'MA25')}{toggle('ma75', 'MA75')}{toggle('cost', '取得単価', !owned.length)}{toggle('target', '目標価格', !targets.length)}{toggle('trades', '▲▼ 売買記録')}
      </div>
      {quotes.error && <p role="status" className="px-3 py-1 text-[var(--pm-accent)]">現在値の更新に失敗しました。{cachedPrice ? '保存済みの価格を表示しています。' : ''}</p>}
      {history.loading ? <p role="status" className="flex h-[360px] items-center justify-center pm-muted">チャートを読み込み中…</p> : history.error || candles.length === 0 ? <div className="flex h-[360px] flex-col items-center justify-center gap-3 pm-muted"><p>{history.error ? 'チャートを取得できませんでした。' : 'チャートデータがありません。'}</p><button type="button" className="pm-button" onClick={() => void history.reload()}>再試行</button></div> : <CandlestickChart candles={candles} settings={settings} cost={cost} targets={targets} transactions={transactions} symbol={symbol} />}
      {history.data?.stale && <p role="status" className="px-3 py-1 text-[var(--pm-accent)]">最新履歴を取得できなかったため、保存済みチャートを表示しています。</p>}
      <div role="tablist" aria-label="銘柄の情報" className="flex border-y border-[var(--pm-border)] px-2">{([['news', 'ニュース'], ['trades', '売買記録']] as const).map(([tab, label]) => <button type="button" role="tab" key={tab} id={`detail-tab-${tab}`} aria-selected={lowerTab === tab} aria-controls={`detail-panel-${tab}`} onClick={() => setLowerTab(tab)} className={`h-8 border-b-2 px-3 ${lowerTab === tab ? 'border-[var(--pm-accent)] text-[var(--pm-active-text)]' : 'border-transparent pm-muted'}`}>{label}</button>)}</div>
      <div role="tabpanel" id={`detail-panel-${lowerTab}`} aria-labelledby={`detail-tab-${lowerTab}`} className="max-h-[320px] overflow-auto">
        {lowerTab === 'news' ? news.loading ? <p role="status" className="p-3 pm-muted">ニュースを読み込み中…</p> : news.error ? <p role="alert" className="p-3 pm-muted">ニュースを取得できませんでした。</p> : articles.length ? <ul>{articles.map((item) => <li key={item.id} className="flex gap-2 border-b border-[var(--pm-divider)] px-3 py-1.5"><time className="shrink-0 text-[11px] pm-muted">{new Date(item.published_at).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time><span className="max-w-24 shrink-0 truncate text-[11px] pm-muted">{item.source}</span><a href={item.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-[var(--pm-link)] hover:underline" title={item.title}>{item.title}</a></li>)}</ul> : <p className="p-3 pm-muted">この銘柄のニュースはありません。</p>
          : records.loading ? <p role="status" className="p-3 pm-muted">売買記録を読み込み中…</p> : records.error ? <p role="alert" className="p-3 pm-muted">売買記録を取得できませんでした。</p> : transactions.length ? <table className="w-full text-right tabular-nums"><thead className="bg-[var(--pm-heading)] pm-muted"><tr>{['日付', '種別', '数量', '単価', '金額', '手数料'].map((label) => <th className="px-2 py-1 font-normal" key={label}>{label}</th>)}</tr></thead><tbody>{transactions.map((item) => <tr key={item.id} className="border-b border-[var(--pm-divider)]"><td className="px-2 py-1">{item.transaction_date.slice(0, 10)}</td><td className="px-2">{item.type === 'buy' ? '▲購入' : item.type === 'sell' ? '▼売却' : '配当'}</td><td className="px-2">{numberText(item.shares, 4)}</td><td className="px-2">{moneyText(item.price, currency)}</td><td className="px-2">{moneyText(item.total_amount, currency)}</td><td className="px-2">{moneyText(item.fees, currency)}</td></tr>)}</tbody></table> : <p className="p-3 pm-muted">この銘柄の売買記録はありません。</p>}
      </div>
    </section>
    <MetricsPane holdings={owned} price={price} metrics={fundamentals.data?.fundamentals[key]} loading={fundamentals.loading} error={fundamentals.error} />
  </div>;
}
