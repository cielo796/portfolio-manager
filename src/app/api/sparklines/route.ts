import { NextResponse } from 'next/server';
import type { SparklineItem } from '@/types';
import { get52WeekHighLow } from '@/lib/chart-data';
import { isChartMarket, isChartSymbol, priceHistoryToday, readPriceHistory } from '@/lib/db/price-history';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || !('items' in body) || !Array.isArray(body.items) || body.items.length > 100) {
    return NextResponse.json({ error: 'items must be an array of at most 100 entries.' }, { status: 400 });
  }
  const days = 'days' in body ? body.days : 5;
  if (typeof days !== 'number' || !Number.isSafeInteger(days) || days < 1) {
    return NextResponse.json({ error: 'days must be a positive integer.' }, { status: 400 });
  }
  const items: Array<Pick<SparklineItem, 'symbol' | 'market'>> = [];
  for (const item of body.items) {
    if (!item || !isChartSymbol(item.symbol) || !isChartMarket(item.market)) {
      return NextResponse.json({ error: 'Invalid sparkline item.' }, { status: 400 });
    }
    items.push({ symbol: item.symbol.trim().toUpperCase(), market: item.market });
  }
  const results = await Promise.all(items.map(async ({ symbol, market }): Promise<SparklineItem> => {
    try {
      const data = await readPriceHistory(symbol, market);
      const today = priceHistoryToday(symbol, market);
      return { symbol, market, closes: data.candles.slice(-days).map((candle) => candle.close), ...get52WeekHighLow(data.candles, today) };
    } catch {
      return { symbol, market, closes: [] };
    }
  }));
  return NextResponse.json({ items: results });
}
