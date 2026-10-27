import type { Candle, ChartInterval, Transaction } from '@/types';

function bucket(date: string, interval: ChartInterval): string {
  const value = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (interval === 'w') value.setUTCDate(value.getUTCDate() - (value.getUTCDay() + 6) % 7);
  if (interval === 'm') value.setUTCDate(1);
  return value.toISOString().slice(0, 10);
}

export function tradeMarkers(candles: Candle[], transactions: Transaction[], interval: ChartInterval) {
  const dates = new Map(candles.map((candle) => [bucket(candle.date, interval), candle.date]));
  return transactions.filter((item) => item.type === 'buy' || item.type === 'sell').flatMap((item) => {
    const time = dates.get(bucket(item.transaction_date, interval));
    return time ? [{ time, type: item.type as 'buy' | 'sell', shares: item.shares }] : [];
  }).sort((a, b) => a.time.localeCompare(b.time));
}
