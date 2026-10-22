import type { ExchangeRate, PortfolioSummary } from '@/types';
import { formatCurrency, formatNumber, formatPercent, getProfitLossColor } from '@/lib/utils';

export function HoldingsSummaryStrip({ summary, exchangeRate }: { summary: PortfolioSummary; exchangeRate: ExchangeRate }) {
  const allocations = [
    ['米国株', summary.us_stock_value_jpy], ['日本株', summary.jp_stock_value_jpy],
    ['FX', summary.fx_value_jpy], ['現金', summary.cash_value_jpy],
  ] as const;
  return (
    <section aria-label="資産サマリー" className="flex shrink-0 items-center gap-4 overflow-x-auto whitespace-nowrap rounded border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-2 tabular-nums">
      <span><span className="pm-muted mr-2">総資産</span><strong>{formatCurrency(summary.total_value_jpy)}</strong></span>
      <span><span className="pm-muted mr-2">前日比</span><span className={getProfitLossColor(summary.daily_change)}>{formatCurrency(summary.daily_change)}（{formatPercent(summary.daily_change_percent)}）</span></span>
      <span><span className="pm-muted mr-2">評価損益</span><span className={getProfitLossColor(summary.total_profit_loss)}>{formatCurrency(summary.total_profit_loss)}（{formatPercent(summary.total_profit_loss_percent)}）</span></span>
      {allocations.map(([label, value]) => <span key={label}><span className="pm-muted mr-2">{label}</span>{formatCurrency(value)} <span className="pm-muted">{formatNumber(summary.total_value_jpy > 0 ? value / summary.total_value_jpy * 100 : 0, 1)}%</span></span>)}
      <span><span className="pm-muted mr-2">USD/JPY</span>{formatNumber(exchangeRate.rate, 3)}</span>
      {summary.missing_price_count > 0 && <span className="pm-muted">価格未取得 {summary.missing_price_count}銘柄（評価額は取得額で計算）</span>}
    </section>
  );
}
