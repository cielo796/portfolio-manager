import { NextResponse } from 'next/server';
import { Market, StockPrice } from '@/types';
import { getMarketCurrency } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type PriceSymbolRequest = {
  symbol?: string;
  market?: Market;
  name?: string;
};

type PriceRequest = {
  symbols?: PriceSymbolRequest[];
};

const isValidMarket = (market: unknown): market is Market =>
  market === 'US' || market === 'JP' || market === 'FX';

const normalizeSymbol = (symbol: string) => symbol.toUpperCase().trim();

const toStooqSymbol = (symbol: string, market: Market) => {
  const normalized = normalizeSymbol(symbol);
  if (market === 'US') return `${normalized.toLowerCase()}.us`;
  if (market === 'JP') return `${normalized.toLowerCase()}.jp`;
  return normalized.replace(/[^A-Z]/g, '').toLowerCase();
};

type StooqQuote = {
  close: number;
  open?: number;
};

const parseStooqLine = (line: string): StooqQuote | null => {
  const parts = line.trim().split(',');
  if (parts.length < 7) return null;
  if (parts[0] === 'N/D') return null;

  const open = Number(parts[3]);
  const close = Number(parts[6]);

  if (!Number.isFinite(close) || close <= 0) return null;

  return {
    close,
    open: Number.isFinite(open) && open > 0 ? open : undefined,
  };
};

const fetchStooqQuote = async (symbol: string, market: Market): Promise<StooqQuote | null> => {
  try {
    const stooqSymbol = toStooqSymbol(symbol, market);
    const response = await fetch(`https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&i=1`, {
      cache: 'no-store',
    });

    if (!response.ok) return null;

    const text = await response.text();
    const firstLine = text.split('\n').find((line) => line.trim() !== '');
    if (!firstLine) return null;

    return parseStooqLine(firstLine);
  } catch {
    return null;
  }
};

export async function POST(request: Request) {
  let body: PriceRequest;

  try {
    body = (await request.json()) as PriceRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const requestedSymbols = body.symbols ?? [];
  if (!Array.isArray(requestedSymbols) || requestedSymbols.length === 0) {
    return NextResponse.json({ prices: {} as Record<string, StockPrice> });
  }

  const unique = new Map<string, { symbol: string; market: Market; name?: string }>();
  for (const item of requestedSymbols) {
    if (!item?.symbol || !isValidMarket(item.market)) continue;
    const symbol = normalizeSymbol(item.symbol);
    if (!symbol || symbol === 'CASH') continue;
    const key = `${symbol}|${item.market}`;
    if (!unique.has(key)) {
      unique.set(key, {
        symbol,
        market: item.market,
        name: item.name,
      });
    }
  }

  const now = new Date().toISOString();
  const priceEntries = await Promise.all(
    Array.from(unique.values()).map(async (item) => {
      const quote = await fetchStooqQuote(item.symbol, item.market);
      if (!quote) return null;

      const change = quote.open !== undefined ? quote.close - quote.open : 0;
      const changePercent = quote.open !== undefined ? (change / quote.open) * 100 : 0;
      const currency = getMarketCurrency(item.market, item.symbol);
      const label =
        item.name?.trim() ||
        (item.market === 'FX' && item.symbol.length === 6
          ? `${item.symbol.slice(0, 3)}/${item.symbol.slice(3, 6)}`
          : item.symbol);

      const stockPrice: StockPrice = {
        symbol: item.symbol,
        market: item.market,
        name: label,
        price: Number(quote.close.toFixed(6)),
        change: Number(change.toFixed(6)),
        change_percent: Number(changePercent.toFixed(4)),
        currency,
        updated_at: now,
      };

      return [item.symbol, stockPrice] as const;
    })
  );

  const prices = Object.fromEntries(priceEntries.filter((entry): entry is readonly [string, StockPrice] => entry !== null));

  return NextResponse.json({
    prices,
    updatedAt: now,
  });
}
