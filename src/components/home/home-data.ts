import type { FundamentalMetrics, HoldingWithPrice, PortfolioSummary, SparklineItem } from '@/types';
import { SECTOR_CHART_COLORS } from '@/lib/sectors';

export const HOME_MARKETS = [
  { key: '^N225', symbol: '^N225', market: 'INDEX', name: '日経225' },
  { key: '^GSPC', symbol: '^GSPC', market: 'INDEX', name: 'S&P500' },
  { key: '^IXIC', symbol: '^IXIC', market: 'INDEX', name: 'NASDAQ' },
  { key: 'USDJPY=X', symbol: 'USDJPY', market: 'FX', name: 'USD/JPY' },
  { key: '^TNX', symbol: '^TNX', market: 'INDEX', name: '米10年債' },
  { key: '^VIX', symbol: '^VIX', market: 'INDEX', name: 'VIX' },
] as const satisfies ReadonlyArray<Pick<SparklineItem, 'symbol' | 'market'> & { key: string; name: string }>;

const tokyoClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

const tokyoParts = (date: Date) => Object.fromEntries(tokyoClock.formatToParts(date).map(({ type, value }) => [type, value]));

// ニュースの日時を Asia/Tokyo 基準で「今日は時刻、今年は月日、それ以前は年月日」にする
export function formatNewsTime(publishedAt: string, now: Date): string {
  const published = new Date(publishedAt);
  if (!Number.isFinite(published.getTime()) || !Number.isFinite(now.getTime())) return '—';
  const target = tokyoParts(published);
  const current = tokyoParts(now);
  if (target.year !== current.year) return `${target.year}/${target.month}/${target.day}`;
  if (target.month === current.month && target.day === current.day) return `${target.hour}:${target.minute}`;
  return `${target.month}/${target.day} ${target.hour}:${target.minute}`;
}

export function sparklinePoints(closes: number[]): string {
  const values = closes.filter(Number.isFinite);
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  return values.map((value, index) => `${index / (values.length - 1) * 160},${max === min ? 16 : 30 - (value - min) / (max - min) * 28}`).join(' ');
}

export function marketAllocation(summary: PortfolioSummary) {
  return [
    { label: '米国株', value: summary.us_stock_value_jpy, color: SECTOR_CHART_COLORS.technology },
    { label: '日本株', value: summary.jp_stock_value_jpy, color: SECTOR_CHART_COLORS.consumer_discretionary },
    { label: 'FX', value: summary.fx_value_jpy, color: SECTOR_CHART_COLORS.fx },
    { label: '現金', value: summary.cash_value_jpy, color: SECTOR_CHART_COLORS.cash },
  ].filter((item) => item.value > 0).map((item) => ({ ...item, percent: summary.total_value_jpy > 0 ? item.value / summary.total_value_jpy * 100 : 0 }));
}

export function upcomingEarnings(holdings: HoldingWithPrice[], metrics: Record<string, FundamentalMetrics>, today: string) {
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 21);
  const until = end.toISOString().slice(0, 10);
  const seen = new Set<string>();
  return holdings.flatMap((holding) => {
    if (holding.market !== 'US' || holding.symbol === 'CASH' || seen.has(holding.symbol)) return [];
    seen.add(holding.symbol);
    const date = metrics[`${holding.symbol}|${holding.market}`]?.next_earnings_date?.slice(0, 10);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || date < today || date > until) return [];
    return [{ symbol: holding.symbol, name: holding.name ?? holding.symbol, date }];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
}
