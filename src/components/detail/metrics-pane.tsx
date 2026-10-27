import type { FundamentalMetrics, Holding, StockPrice } from '@/types';
import { getMarketCurrency, getProfitLossColor } from '@/lib/utils';

export const numberText = (value: number | null | undefined, digits = 2) => value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toLocaleString('ja-JP', { maximumFractionDigits: digits });
export const percentText = (value: number | undefined) => value === undefined || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${numberText(value)}%`;
export const moneyText = (value: number | undefined, currency: string, compact = false) => value === undefined || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('ja-JP', { style: 'currency', currency, maximumFractionDigits: currency === 'JPY' ? 2 : 4, ...(compact ? { notation: 'compact' as const } : {}) }).format(value);

export function MetricsPane({ holdings, price, metrics, error, loading }: { holdings: Holding[]; price?: StockPrice; metrics?: FundamentalMetrics; error?: string; loading: boolean }) {
  const shares = holdings.reduce((sum, item) => sum + item.shares, 0);
  const cost = holdings.reduce((sum, item) => sum + item.avg_cost * item.shares, 0);
  const currency = price?.currency ?? (holdings[0] ? getMarketCurrency(holdings[0].market, holdings[0].symbol) : metrics?.currency ?? 'JPY');
  const profit = price ? price.price * shares - cost : undefined;
  const daily = price ? price.change * shares : undefined;
  const rows: Array<[string, string, number?]> = [
    ['保有数量', numberText(shares, 4)], ['取得単価', moneyText(shares ? cost / shares : undefined, currency)],
    ['評価額', price ? moneyText(price.price * shares, currency) : '価格未取得'],
    ['評価損益', price ? moneyText(profit, currency) : '価格未取得', profit],
    ['損益率', price ? percentText(cost > 0 ? profit! / cost * 100 : undefined) : '—', profit],
    ['当日損益', price ? moneyText(daily, currency) : '価格未取得', daily],
  ];
  const financial: Array<[string, string]> = [
    ['時価総額', moneyText(metrics?.market_cap, metrics?.currency ?? currency, true)],
    ['PER（実績／予想）', `${numberText(metrics?.trailing_pe)}／${numberText(metrics?.forward_pe)}`],
    ['PBR', numberText(metrics?.pbr)], ['PSR', numberText(metrics?.psr)],
    ['売上高成長率', percentText(metrics?.revenue_growth)], ['営業利益率', percentText(metrics?.operating_margin)],
    ['ROE', percentText(metrics?.roe)], ['自己資本比率', percentText(metrics?.equity_ratio)],
    ['ネットキャッシュ', moneyText(metrics?.net_cash, metrics?.currency ?? currency, true)],
    ['配当利回り', percentText(metrics?.dividend_yield)], ['次回決算', metrics?.next_earnings_date ?? '—'],
  ];
  const list = (items: Array<[string, string, number?]>) => <dl>{items.map(([label, value, signed]) => <div key={label} className="flex min-h-[24px] items-center justify-between gap-2 border-b border-[var(--pm-divider)] py-0.5"><dt className="pm-muted">{label}</dt><dd className={`text-right tabular-nums ${signed === undefined ? '' : getProfitLossColor(signed)}`}>{value}</dd></div>)}</dl>;
  return <aside aria-label="指標と保有情報" className="flex min-w-0 flex-col gap-1">
    {holdings.length > 0 && <section className="rounded border border-[var(--pm-border)] bg-[var(--pm-panel)] px-2.5 pb-2"><h2 className="flex h-8 items-center font-semibold">保有情報</h2>{list(rows)}<p className="pt-1 text-[10px] pm-muted">{currency}建て・全口座合算</p></section>}
    <section className="rounded border border-[var(--pm-border)] bg-[var(--pm-panel)] px-2.5 pb-2"><h2 className="flex h-8 items-center justify-between gap-1 font-semibold">財務・バリュエーション<span className="text-[10px] font-normal pm-muted">24時間キャッシュ</span></h2>{list(financial)}{loading && <p role="status" className="pt-2 pm-muted">指標を読み込み中…</p>}{error && <p role="status" className="pt-2 pm-muted">指標を取得できませんでした。</p>}{metrics && <p className="pt-2 text-[10px] pm-muted">更新: {new Date(metrics.updated_at).toLocaleString('ja-JP')}</p>}</section>
  </aside>;
}
