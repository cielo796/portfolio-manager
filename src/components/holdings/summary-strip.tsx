import type { ExchangeRate, PortfolioSummary } from '@/types';
import { formatCurrency, formatNumber, formatPercent, getProfitLossColor } from '@/lib/utils';

export function HoldingsSummaryStrip({ summary, exchangeRate }: { summary: PortfolioSummary; exchangeRate: ExchangeRate }) {
  const allocations = [
    ['米国株', summary.us_stock_value_jpy], ['日本株', summary.jp_stock_value_jpy],
    ['FX', summary.fx_value_jpy], ['現金', summary.cash_value_jpy],
  ] as const;
  return (
    <section aria-label="資産サマリー" className="flex shrink-0 flex-wrap rounded border border-[var(--pm-border)] bg-[var(--pm-panel)] [&>div]:flex-1 [&>div]:border-r [&>div]:border-[var(--pm-border)] [&>div]:px-3 [&>div]:py-2">
      <div className="min-w-36"><p className="pm-muted text-[11px]">総資産（円）</p><p className="num !text-left text-xl font-semibold">{formatCurrency(summary.total_value_jpy)}</p></div>
      <div className="min-w-32"><p className="pm-muted text-[11px]">前日比</p><p className={`num !text-left text-[15px] font-semibold ${getProfitLossColor(summary.daily_change)}`}>{formatCurrency(summary.daily_change)}</p><p className={`num !text-left text-[11px] ${getProfitLossColor(summary.daily_change)}`}>{formatPercent(summary.daily_change_percent)}</p></div>
      <div className="min-w-32"><p className="pm-muted text-[11px]">評価損益</p><p className={`num !text-left text-[15px] font-semibold ${getProfitLossColor(summary.total_profit_loss)}`}>{formatCurrency(summary.total_profit_loss)}</p><p className={`num !text-left text-[11px] ${getProfitLossColor(summary.total_profit_loss)}`}>{formatPercent(summary.total_profit_loss_percent)}</p></div>
      {allocations.map(([label, value]) => <div className="min-w-28" key={label}><p className="pm-muted text-[11px]">{label}</p><p className="num !text-left text-sm">{formatCurrency(value)}</p><p className="num pm-muted !text-left text-[11px]">{formatNumber(summary.total_value_jpy > 0 ? value / summary.total_value_jpy * 100 : 0, 1)}%</p></div>)}
      <div className="min-w-28"><p className="pm-muted text-[11px]">USD/JPY</p><p className="num !text-left text-sm">{formatNumber(exchangeRate.rate, 3)}</p></div>
      {summary.missing_price_count > 0 && <p className="pm-muted w-full px-3 pb-2">価格未取得 {summary.missing_price_count}銘柄（評価額は取得額で計算・損益は取得済み銘柄のみ）</p>}
    </section>
  );
}
