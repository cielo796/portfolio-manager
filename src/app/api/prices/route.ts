import { NextResponse } from 'next/server';
import { Market, StockPrice } from '@/types';
import { getMarketCurrency } from '@/lib/utils';
import { priceKey } from '@/lib/price-key';
import { listStockPrices, upsertStockPrices } from '@/lib/db';

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

const toYahooSymbol = (symbol: string, market: Market) => {
  const normalized = normalizeSymbol(symbol);
  if (market === 'US') return normalized;
  if (market === 'JP') {
    if (normalized.endsWith('.T')) return normalized;
    if (normalized.endsWith('.JP')) return `${normalized.slice(0, -3)}.T`;
    return `${normalized}.T`;
  }

  if (normalized.endsWith('=X')) return normalized;

  const pair = normalized.replace(/[^A-Z]/g, '');
  return pair.length === 6 ? `${pair}=X` : normalized;
};

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        regularMarketVolume?: number;
        chartPreviousClose?: number;
        currency?: string;
      };
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: unknown;
  };
};

type YahooQuote = {
  close: number;
  previousClose?: number;
  volume?: number;
};

const isPositiveFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const getPreviousCloseFromSeries = (closes: Array<number | null> | undefined) => {
  const validCloses = (closes ?? []).filter(isPositiveFiniteNumber);
  if (validCloses.length < 2) return undefined;
  return validCloses[validCloses.length - 2];
};

const parseYahooChart = (data: YahooChartResponse): YahooQuote | null => {
  const result = data.chart?.result?.[0];
  if (!result || data.chart?.error) return null;

  const close = result.meta?.regularMarketPrice;
  if (!isPositiveFiniteNumber(close)) return null;

  const seriesPreviousClose = getPreviousCloseFromSeries(result.indicators?.quote?.[0]?.close);
  const previousClose = seriesPreviousClose ?? (
    isPositiveFiniteNumber(result.meta?.chartPreviousClose) ? result.meta.chartPreviousClose : undefined
  );

  return {
    close,
    previousClose,
    volume: [result.meta?.regularMarketVolume, ...(result.indicators?.quote?.[0]?.volume ?? []).slice().reverse()]
      .find((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0),
  };
};

const fetchYahooQuote = async (symbol: string, market: Market): Promise<YahooQuote | null> => {
  try {
    const yahooSymbol = toYahooSymbol(symbol, market);
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`);
    url.searchParams.set('range', '5d');
    url.searchParams.set('interval', '1d');

    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) return null;

    const data = (await response.json()) as YahooChartResponse;
    return parseYahooChart(data);
  } catch {
    return null;
  }
};

export async function GET() {
  return NextResponse.json({ prices: listStockPrices() });
}

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
    const key = priceKey(symbol, item.market);
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
      const quote = await fetchYahooQuote(item.symbol, item.market);
      if (!quote) return null;

      const change = quote.previousClose !== undefined ? quote.close - quote.previousClose : 0;
      const changePercent = quote.previousClose !== undefined ? (change / quote.previousClose) * 100 : 0;
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
        volume: quote.volume ?? null,
        currency,
        updated_at: now,
      };

      return [priceKey(item.symbol, item.market), stockPrice] as const;
    })
  );

  const prices = Object.fromEntries(priceEntries.filter((entry): entry is readonly [string, StockPrice] => entry !== null));
  upsertStockPrices(Object.values(prices));

  return NextResponse.json({
    prices,
    updatedAt: now,
  });
}
