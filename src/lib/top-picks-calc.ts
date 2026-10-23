import type { TopPickView } from '@/types';

const positive = (value: number | null | undefined): value is number => value != null && Number.isFinite(value) && value > 0;

export function topPickPerformance(pick: Pick<TopPickView, 'picked_price' | 'benchmark_at_pick' | 'removed_at' | 'removed_price' | 'benchmark_at_remove' | 'target_price' | 'current_price' | 'current_benchmark'>) {
  const price = pick.removed_at ? pick.removed_price : pick.current_price;
  const benchmark = pick.removed_at ? pick.benchmark_at_remove : pick.current_benchmark;
  const change = positive(price) && positive(pick.picked_price) ? (price - pick.picked_price) / pick.picked_price : null;
  const alpha = change !== null && positive(benchmark) && positive(pick.benchmark_at_pick)
    ? change - (benchmark - pick.benchmark_at_pick) / pick.benchmark_at_pick : null;
  const toTarget = positive(pick.target_price) && positive(price) ? (pick.target_price - price) / price : null;
  return { change, alpha, toTarget };
}

export function topPicksSummary(picks: TopPickView[], today: string) {
  const performance = picks.map(topPickPerformance);
  const average = (values: (number | null)[]) => {
    const known = values.filter((value): value is number => value !== null);
    return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
  };
  const nextReview = picks.flatMap((pick) => [
    ...(pick.review_on ? [{ date: pick.review_on, symbol: pick.symbol, reason: '見直し' }] : []),
    ...(pick.next_earnings_date && pick.next_earnings_date.slice(0, 10) >= today
      ? [{ date: pick.next_earnings_date.slice(0, 10), symbol: pick.symbol, reason: '決算' }] : []),
  ]).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  return { count: picks.length, averageChange: average(performance.map((item) => item.change)),
    averageAlpha: average(performance.map((item) => item.alpha)),
    winners: performance.filter((item) => item.change !== null && item.change > 0).length,
    pricedCount: performance.filter((item) => item.change !== null).length, nextReview };
}
