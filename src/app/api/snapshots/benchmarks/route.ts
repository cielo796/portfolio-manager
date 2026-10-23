import { NextResponse } from 'next/server';
import type { HistoryBenchmarks } from '@/types';
import { readPriceHistory } from '@/lib/db/price-history';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const result: HistoryBenchmarks = { sp500: [], nikkei: [], usdJpy: [], warnings: [] };
  await Promise.all(([
    ['sp500', '^GSPC', 'INDEX'], ['nikkei', '^N225', 'INDEX'], ['usdJpy', 'USDJPY', 'FX'],
  ] as const).map(async ([key, symbol, market]) => {
    try {
      const data = await readPriceHistory(symbol, market);
      result[key] = data.candles.map((candle) => ({ date: candle.date, value: candle.close }));
      if (data.stale) result.warnings.push(`${symbol}: 保存済みの価格履歴を表示中です。`);
    } catch { result.warnings.push(`${symbol}: 価格履歴を取得できませんでした。`); }
  }));
  return NextResponse.json(result);
}
