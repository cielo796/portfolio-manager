import { NextResponse } from 'next/server';
import { FundamentalMetrics, Market } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type FundamentalSymbolRequest = {
  symbol?: string;
  market?: Market;
};

type FundamentalsRequest = {
  symbols?: FundamentalSymbolRequest[];
};

type YahooFundamentalPoint = {
  asOfDate?: string;
  currencyCode?: string;
  dataValue?: number;
  reportedValue?: {
    raw?: number;
    fmt?: string;
  };
};

type YahooTimeseriesResult = {
  meta?: {
    type?: string[];
  };
  [key: string]: unknown;
};

type YahooTimeseriesResponse = {
  timeseries?: {
    result?: YahooTimeseriesResult[];
    error?: unknown;
  };
};

type NasdaqCalendarResponse = {
  data?: {
    rows?: Array<{
      symbol?: string;
    }>;
  } | null;
};

type CacheEntry = {
  expiresAt: number;
  value?: string;
};

type GlobalWithFundamentalsCache = typeof globalThis & {
  __portfolioEarningsDateCache?: Map<string, CacheEntry>;
};

const YAHOO_TIMESERIES_URL = 'https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries';
const NASDAQ_EARNINGS_URL = 'https://api.nasdaq.com/api/calendar/earnings';
const EARNINGS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const FUNDAMENTAL_TYPES = [
  'trailingMarketCap',
  'trailingPeRatio',
  'trailingForwardPeRatio',
  'trailingPbRatio',
  'trailingPsRatio',
  'trailingTotalRevenue',
  'trailingOperatingIncome',
  'trailingNetIncome',
  'trailingDilutedEPS',
  'quarterlyTotalRevenue',
  'quarterlyOperatingIncome',
  'quarterlyNetIncome',
  'quarterlyDilutedEPS',
  'quarterlyStockholdersEquity',
  'quarterlyTotalAssets',
  'quarterlyTotalDebt',
  'quarterlyCashAndCashEquivalents',
  'quarterlyCashCashEquivalentsAndShortTermInvestments',
  'trailingFreeCashFlow',
  'trailingDividendYield',
  'dividendPayoutRatio',
  'trailingRepurchaseOfCapitalStock',
] as const;

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'application/json,*/*;q=0.8',
};

const globalWithFundamentalsCache = globalThis as GlobalWithFundamentalsCache;

const getEarningsDateCache = () => {
  const cache = globalWithFundamentalsCache.__portfolioEarningsDateCache ?? new Map<string, CacheEntry>();
  globalWithFundamentalsCache.__portfolioEarningsDateCache = cache;
  return cache;
};

const isValidMarket = (market: unknown): market is Market =>
  market === 'US' || market === 'JP' || market === 'FX';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const normalizeSymbol = (symbol: string) => symbol.toUpperCase().trim();

const toYahooSymbol = (symbol: string, market: Market) => {
  const normalized = normalizeSymbol(symbol);
  if (market === 'JP') {
    if (normalized.endsWith('.T')) return normalized;
    if (normalized.endsWith('.JP')) return `${normalized.slice(0, -3)}.T`;
    return `${normalized}.T`;
  }
  return normalized;
};

const metricKey = (symbol: string, market: Market) => `${normalizeSymbol(symbol)}|${market}`;

const valueFromPoint = (point?: YahooFundamentalPoint) => {
  const value = point?.reportedValue?.raw ?? point?.dataValue;
  return isFiniteNumber(value) ? value : undefined;
};

const sortSeries = (series: YahooFundamentalPoint[]) =>
  [...series]
    .filter((point) => point.asOfDate && valueFromPoint(point) !== undefined)
    .sort((a, b) => new Date(a.asOfDate ?? '').getTime() - new Date(b.asOfDate ?? '').getTime());

const latestPoint = (series: YahooFundamentalPoint[]) => {
  const sorted = sortSeries(series);
  return sorted[sorted.length - 1];
};

const latestValue = (series: YahooFundamentalPoint[]) => valueFromPoint(latestPoint(series));

const getSeries = (data: YahooTimeseriesResponse, type: string) => {
  const result = data.timeseries?.result?.find((item) => item.meta?.type?.includes(type));
  const series = result?.[type];
  return Array.isArray(series) ? (series as YahooFundamentalPoint[]) : [];
};

const dividePercent = (numerator?: number, denominator?: number) => {
  if (!isFiniteNumber(numerator) || !isFiniteNumber(denominator) || denominator === 0) {
    return undefined;
  }
  return (numerator / denominator) * 100;
};

const ratioToPercent = (value?: number) => (isFiniteNumber(value) ? value * 100 : undefined);

const yearOverYearGrowth = (series: YahooFundamentalPoint[]) => {
  const sorted = sortSeries(series);
  if (sorted.length < 5) return undefined;

  const current = valueFromPoint(sorted[sorted.length - 1]);
  const previousYear = valueFromPoint(sorted[sorted.length - 5]);
  if (!isFiniteNumber(current) || !isFiniteNumber(previousYear) || previousYear === 0) {
    return undefined;
  }

  return ((current - previousYear) / Math.abs(previousYear)) * 100;
};

const addMonths = (date: Date, months: number) => {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);

const parseDateOnly = (value?: string) => {
  if (!value) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const getLatestQuarterEnd = (data: YahooTimeseriesResponse) => {
  const candidateTypes = [
    'quarterlyTotalRevenue',
    'quarterlyNetIncome',
    'quarterlyTotalAssets',
    'quarterlyStockholdersEquity',
  ];

  const dates = candidateTypes
    .flatMap((type) => sortSeries(getSeries(data, type)).map((point) => parseDateOnly(point.asOfDate)))
    .filter((date): date is Date => date !== undefined)
    .sort((a, b) => a.getTime() - b.getTime());

  return dates[dates.length - 1];
};

const fetchNasdaqEarningsOnDate = async (symbol: string, date: string) => {
  try {
    const url = new URL(NASDAQ_EARNINGS_URL);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('date', date);

    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        ...REQUEST_HEADERS,
        Origin: 'https://www.nasdaq.com',
        Referer: 'https://www.nasdaq.com/',
      },
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return undefined;

    const data = (await response.json()) as NasdaqCalendarResponse;
    const rows = data.data?.rows ?? [];
    const normalized = normalizeSymbol(symbol);
    return rows.some((row) => normalizeSymbol(row.symbol ?? '') === normalized) ? date : undefined;
  } catch {
    return undefined;
  }
};

const findNextNasdaqEarningsDate = async (symbol: string, latestQuarterEnd?: Date) => {
  if (!latestQuarterEnd) return undefined;

  const nextQuarterEnd = addMonths(latestQuarterEnd, 3);
  const candidate = addDays(nextQuarterEnd, 30);
  const searchWindowDays = 7;
  const cacheKey = `${normalizeSymbol(symbol)}|${toDateOnly(candidate)}|${searchWindowDays}`;
  const cache = getEarningsDateCache();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const offsets = [0];
  for (let offset = 1; offset <= searchWindowDays; offset += 1) {
    offsets.push(-offset, offset);
  }

  const candidates = offsets.map((offset) => toDateOnly(addDays(candidate, offset)));
  const results = await Promise.all(
    candidates.map(async (date) => ({
      date,
      earningsDate: await fetchNasdaqEarningsOnDate(symbol, date),
    }))
  );
  const match = results.find((result) => result.earningsDate);

  if (match?.earningsDate) {
    cache.set(cacheKey, {
      expiresAt: Date.now() + EARNINGS_CACHE_TTL_MS,
      value: match.earningsDate,
    });
    return match.earningsDate;
  }

  cache.set(cacheKey, {
    expiresAt: Date.now() + EARNINGS_CACHE_TTL_MS,
    value: undefined,
  });
  return undefined;
};

const fetchYahooFundamentals = async (symbol: string, market: Market): Promise<FundamentalMetrics | null> => {
  if (market === 'FX' || normalizeSymbol(symbol) === 'CASH') return null;

  const yahooSymbol = toYahooSymbol(symbol, market);
  const period2 = Math.floor((Date.now() + 370 * 24 * 60 * 60 * 1000) / 1000);
  const period1 = Math.floor((Date.now() - 6 * 365 * 24 * 60 * 60 * 1000) / 1000);
  const url = new URL(`${YAHOO_TIMESERIES_URL}/${encodeURIComponent(yahooSymbol)}`);
  url.searchParams.set('symbol', yahooSymbol);
  url.searchParams.set('type', FUNDAMENTAL_TYPES.join(','));
  url.searchParams.set('merge', 'false');
  url.searchParams.set('period1', String(period1));
  url.searchParams.set('period2', String(period2));

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: REQUEST_HEADERS,
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as YahooTimeseriesResponse;
    if (data.timeseries?.error) return null;

    const marketCapPoint = latestPoint(getSeries(data, 'trailingMarketCap'));
    const revenue = latestValue(getSeries(data, 'trailingTotalRevenue'));
    const operatingIncome = latestValue(getSeries(data, 'trailingOperatingIncome'));
    const netIncome = latestValue(getSeries(data, 'trailingNetIncome'));
    const equity = latestValue(getSeries(data, 'quarterlyStockholdersEquity'));
    const totalAssets = latestValue(getSeries(data, 'quarterlyTotalAssets'));
    const totalDebt = latestValue(getSeries(data, 'quarterlyTotalDebt'));
    const cashAndInvestments =
      latestValue(getSeries(data, 'quarterlyCashCashEquivalentsAndShortTermInvestments')) ??
      latestValue(getSeries(data, 'quarterlyCashAndCashEquivalents'));
    const shareBuyback = latestValue(getSeries(data, 'trailingRepurchaseOfCapitalStock'));
    const latestQuarterEnd = getLatestQuarterEnd(data);
    const nextEarningsDate =
      market === 'US' ? await findNextNasdaqEarningsDate(normalizeSymbol(symbol), latestQuarterEnd) : undefined;

    return {
      symbol: normalizeSymbol(symbol),
      market,
      currency: marketCapPoint?.currencyCode ?? (market === 'US' ? 'USD' : 'JPY'),
      updated_at: new Date().toISOString(),
      source: nextEarningsDate ? 'yahoo_finance_nasdaq' : 'yahoo_finance',
      market_cap: valueFromPoint(marketCapPoint),
      trailing_pe: latestValue(getSeries(data, 'trailingPeRatio')),
      forward_pe: latestValue(getSeries(data, 'trailingForwardPeRatio')),
      pbr: latestValue(getSeries(data, 'trailingPbRatio')),
      psr: latestValue(getSeries(data, 'trailingPsRatio')),
      revenue,
      operating_margin: dividePercent(operatingIncome, revenue),
      net_margin: dividePercent(netIncome, revenue),
      roe: dividePercent(netIncome, equity),
      roa: dividePercent(netIncome, totalAssets),
      revenue_growth: yearOverYearGrowth(getSeries(data, 'quarterlyTotalRevenue')),
      operating_income_growth: yearOverYearGrowth(getSeries(data, 'quarterlyOperatingIncome')),
      eps_growth: yearOverYearGrowth(getSeries(data, 'quarterlyDilutedEPS')),
      equity_ratio: dividePercent(equity, totalAssets),
      interest_bearing_debt: totalDebt,
      net_cash:
        isFiniteNumber(cashAndInvestments) && isFiniteNumber(totalDebt)
          ? cashAndInvestments - totalDebt
          : undefined,
      free_cash_flow: latestValue(getSeries(data, 'trailingFreeCashFlow')),
      dividend_yield: ratioToPercent(latestValue(getSeries(data, 'trailingDividendYield'))),
      payout_ratio: ratioToPercent(latestValue(getSeries(data, 'dividendPayoutRatio'))),
      share_buyback: isFiniteNumber(shareBuyback) ? Math.abs(shareBuyback) : undefined,
      next_earnings_date: nextEarningsDate,
    };
  } catch {
    return null;
  }
};

export async function POST(request: Request) {
  let body: FundamentalsRequest;

  try {
    body = (await request.json()) as FundamentalsRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const requestedSymbols = body.symbols ?? [];
  if (!Array.isArray(requestedSymbols) || requestedSymbols.length === 0) {
    return NextResponse.json({ fundamentals: {} as Record<string, FundamentalMetrics> });
  }

  const unique = new Map<string, { symbol: string; market: Market }>();
  for (const item of requestedSymbols) {
    if (!item?.symbol || !isValidMarket(item.market)) continue;
    const symbol = normalizeSymbol(item.symbol);
    if (!symbol || symbol === 'CASH' || item.market === 'FX') continue;
    const key = metricKey(symbol, item.market);
    if (!unique.has(key)) {
      unique.set(key, {
        symbol,
        market: item.market,
      });
    }
  }

  const entries = await Promise.all(
    Array.from(unique.values()).map(async (item) => {
      const metrics = await fetchYahooFundamentals(item.symbol, item.market);
      return metrics ? ([metricKey(item.symbol, item.market), metrics] as const) : null;
    })
  );

  return NextResponse.json({
    fundamentals: Object.fromEntries(
      entries.filter((entry): entry is readonly [string, FundamentalMetrics] => entry !== null)
    ),
    updatedAt: new Date().toISOString(),
  });
}
