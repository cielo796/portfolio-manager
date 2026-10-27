import { NextResponse } from 'next/server';
import type { ChartInterval, ChartRange } from '@/types';
import { aggregateCandles, chartRangeStart } from '@/lib/chart-data';
import { isChartMarket, isChartSymbol, priceHistoryToday, readPriceHistory } from '@/lib/db/price-history';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const symbol = params.get('symbol');
  const market = params.get('market');
  const range = params.get('range') ?? '1y';
  const interval = params.get('interval') ?? 'd';
  if (!isChartSymbol(symbol) || !isChartMarket(market)
    || !['3m', '6m', '1y', '5y'].includes(range) || !['d', 'w', 'm'].includes(interval)) {
    return NextResponse.json({ error: 'Invalid chart parameters.' }, { status: 400 });
  }
  try {
    const data = await readPriceHistory(symbol, market);
    const today = priceHistoryToday(symbol, market);
    const start = chartRangeStart(range as ChartRange, today);
    return NextResponse.json({ ...data, candles: aggregateCandles(data.candles.filter((candle) => candle.date >= start && candle.date <= today), interval as ChartInterval) });
  } catch {
    return NextResponse.json({ error: 'Price history unavailable.' }, { status: 502 });
  }
}
