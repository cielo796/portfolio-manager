import type { Candle, ChartInterval, ChartRange } from '@/types';

const finite = (value: number | null): value is number => value !== null && Number.isFinite(value);

export function chartRangeStart(range: ChartRange, today: string): string {
  const date = new Date(`${today}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - ({ '3m': 3, '6m': 6, '1y': 12, '5y': 60 }[range]));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

export function aggregateCandles(candles: readonly Candle[], interval: ChartInterval): Candle[] {
  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  if (interval === 'd') return sorted.map((candle) => ({ ...candle }));
  const groups = new Map<string, Candle>();
  for (const candle of sorted) {
    const date = new Date(`${candle.date}T00:00:00Z`);
    if (interval === 'w') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    else date.setUTCDate(1);
    const key = date.toISOString().slice(0, 10);
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { ...candle });
      continue;
    }
    // 日付と始値はその期間の最初の取引日を維持する
    group.high = finite(candle.high) ? Math.max(group.high ?? candle.high, candle.high) : group.high;
    group.low = finite(candle.low) ? Math.min(group.low ?? candle.low, candle.low) : group.low;
    group.close = candle.close;
    group.volume = group.volume === null || candle.volume === null ? null : group.volume + candle.volume;
  }
  return [...groups.values()];
}

export function simpleMovingAverage(values: readonly number[], period: number): Array<number | null> {
  if (!Number.isInteger(period) || period < 1) throw new RangeError('period must be a positive integer');
  let sum = 0;
  return values.map((value, index) => {
    sum += value;
    if (index >= period) sum -= values[index - period];
    return index + 1 < period ? null : sum / period;
  });
}

export function get52WeekHighLow(candles: readonly Candle[], today: string): { high52w?: number; low52w?: number } {
  const start = chartRangeStart('1y', today);
  let high: number | undefined;
  let low: number | undefined;
  for (const candle of candles) {
    if (candle.date < start || candle.date > today) continue;
    if (finite(candle.high)) high = Math.max(high ?? candle.high, candle.high);
    if (finite(candle.low)) low = Math.min(low ?? candle.low, candle.low);
  }
  return { ...(high === undefined ? {} : { high52w: high }), ...(low === undefined ? {} : { low52w: low }) };
}
