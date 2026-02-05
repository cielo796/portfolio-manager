import { NextResponse } from 'next/server';
import { createWatchlistItem, listWatchlistItems } from '@/lib/sqlite';
import { Market } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CreateWatchlistItemRequest = {
  symbol?: string;
  market?: Market;
  target_price?: number | string | null;
  memo?: string;
};

const isValidMarket = (market: unknown): market is Market =>
  market === 'US' || market === 'JP' || market === 'FX';
const normalizeFxSymbol = (symbol: string) => symbol.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
const isSupportedFxSymbol = (symbol: string) => {
  const normalized = normalizeFxSymbol(symbol);
  if (normalized.length !== 6) return false;
  const quote = normalized.slice(3, 6);
  return quote === 'JPY' || quote === 'USD';
};

export async function GET() {
  const watchlistItems = listWatchlistItems();
  return NextResponse.json({ watchlistItems });
}

export async function POST(request: Request) {
  let body: CreateWatchlistItemRequest;

  try {
    body = (await request.json()) as CreateWatchlistItemRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!body.symbol || !isValidMarket(body.market)) {
    return NextResponse.json({ error: 'symbol and market are required.' }, { status: 400 });
  }

  const rawTargetPrice = body.target_price;
  const targetPrice =
    rawTargetPrice === undefined || rawTargetPrice === null || String(rawTargetPrice).trim() === ''
      ? undefined
      : Number(rawTargetPrice);

  if (targetPrice !== undefined && (!Number.isFinite(targetPrice) || targetPrice <= 0)) {
    return NextResponse.json({ error: 'target_price must be a positive number.' }, { status: 400 });
  }
  if (body.market === 'FX' && !isSupportedFxSymbol(body.symbol)) {
    return NextResponse.json({ error: 'FX symbols must be a 6-letter pair with JPY or USD quote.' }, { status: 400 });
  }

  try {
    const watchlistItem = createWatchlistItem({
      symbol: body.symbol,
      market: body.market,
      target_price: targetPrice,
      memo: body.memo,
    });
    return NextResponse.json({ watchlistItem }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return NextResponse.json({ error: 'This symbol is already in the watchlist.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create watchlist item.' }, { status: 500 });
  }
}
