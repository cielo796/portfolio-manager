import { NextResponse } from 'next/server';
import { createTickerPreset, listTickerPresets } from '@/lib/db';
import { Market } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CreateTickerPresetRequest = {
  symbol?: string;
  market?: Market;
  name?: string;
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
  const tickerPresets = listTickerPresets();
  return NextResponse.json({ tickerPresets });
}

export async function POST(request: Request) {
  let body: CreateTickerPresetRequest;

  try {
    body = (await request.json()) as CreateTickerPresetRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!body.symbol || !isValidMarket(body.market)) {
    return NextResponse.json({ error: 'symbol and market are required.' }, { status: 400 });
  }

  if (body.market === 'FX' && !isSupportedFxSymbol(body.symbol)) {
    return NextResponse.json(
      { error: 'FX symbols must be a 6-letter pair with JPY or USD quote.' },
      { status: 400 }
    );
  }

  try {
    const tickerPreset = createTickerPreset({
      symbol: body.symbol,
      market: body.market,
      name: body.name,
    });
    return NextResponse.json({ tickerPreset }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return NextResponse.json({ error: 'This symbol is already registered.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create ticker preset.' }, { status: 500 });
  }
}
