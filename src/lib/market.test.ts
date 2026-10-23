import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMarketReader, MARKET_SYMBOLS } from './market';
import type { Candle, Holding, StockPrice, WatchlistItem } from '@/types';
import { heatBackground, heatTiles, sectorReturn } from '@/components/market/model';
import { pickTickerItems, TICKER_SYMBOLS } from '@/components/market/symbols';
import { getSectorLabel } from '@/lib/sectors';

const chart = (value = 110, closes: Array<number | null> = [90, 100, 110], previous = 80) => ({
  chart: { result: [{
    meta: { regularMarketPrice: value, regularMarketTime: 1792651503, chartPreviousClose: previous },
    indicators: { quote: [{ close: closes }] },
  }] },
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('指数の取得とキャッシュ', () => {
  it('chart APIの値と直前営業日の終値から前日比を計算する', async () => {
    const fetchStub = vi.fn().mockImplementation(async () => Response.json(chart()));
    vi.stubGlobal('fetch', fetchStub);
    const snapshot = await createMarketReader()();
    expect(snapshot.failed).toEqual([]);
    expect(snapshot.items).toHaveLength(MARKET_SYMBOLS.length);
    expect(snapshot.items[0]).toEqual({
      key: '^N225', name: '日経225', group: 'index', value: 110, change: 10, changePercent: 10,
      updatedAt: new Date(1792651503 * 1000).toISOString(),
    });
    const url = fetchStub.mock.calls[0][0] as URL;
    expect(url.pathname).toContain('%5EN225');
    expect(url.searchParams.get('range')).toBe('5d');
    expect(url.searchParams.get('interval')).toBe('1d');
  });

  it('追加対象にグループを付け、11セクターの名称を共通定義に合わせる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json(chart())));
    const snapshot = await createMarketReader()();
    expect(snapshot.items).toHaveLength(30);
    expect(snapshot.items.filter((item) => item.group === 'sector')).toHaveLength(11);
    expect(snapshot.items.find((item) => item.key === 'XLK')).toMatchObject({ group: 'sector', name: getSectorLabel('technology') });
    expect(snapshot.items.find((item) => item.key === 'XLI')?.name).toBe(getSectorLabel('industrials'));
    expect(snapshot.items.find((item) => item.key === '2YY=F')?.group).toBe('rate');
    expect(snapshot.items.find((item) => item.key === '^TYX')?.group).toBe('rate');
    expect(snapshot.items.find((item) => item.key === 'EURUSD=X')?.group).toBe('fx');
    expect(snapshot.items.find((item) => item.key === 'BTC-USD')?.group).toBe('commodity');
    expect(snapshot.items.find((item) => item.key === '^RUT')?.group).toBe('index');
  });

  it('終値のnullを除き、時系列が足りなければchartPreviousCloseを使う', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json(chart(75, [null, 75], 100))));
    const snapshot = await createMarketReader()();
    expect(snapshot.items[0]).toMatchObject({ value: 75, change: -25, changePercent: -25 });
  });

  it('米10年債の利回りはYahooの値をそのまま返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json(chart(4.112, [4, 4.1, 4.112]))));
    const snapshot = await createMarketReader()();
    expect(snapshot.items.find((item) => item.key === '^TNX')?.value).toBe(4.112);
  });

  it('60秒キャッシュし、明示更新と期限切れでは再取得する', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-10-23T00:00:00Z');
    const fetchStub = vi.fn().mockImplementation(async () => Response.json(chart()));
    vi.stubGlobal('fetch', fetchStub);
    const read = createMarketReader();
    const initial = await read();
    expect(await read()).toBe(initial);
    expect(fetchStub).toHaveBeenCalledTimes(MARKET_SYMBOLS.length);
    await read(true);
    expect(fetchStub).toHaveBeenCalledTimes(MARKET_SYMBOLS.length * 2);
    vi.setSystemTime('2026-10-23T00:01:01Z');
    await read();
    expect(fetchStub).toHaveBeenCalledTimes(MARKET_SYMBOLS.length * 3);
  });

  it('ネットワーク失敗をfailedに入れ、取得済みの値と時刻を保持する', async () => {
    const fetchStub = vi.fn().mockImplementation(async () => Response.json(chart()));
    vi.stubGlobal('fetch', fetchStub);
    const read = createMarketReader();
    const initial = await read();
    fetchStub.mockRejectedValue(new Error('offline'));
    const fallback = await read(true);
    expect(fallback.items).toEqual(initial.items);
    expect(fallback.failed).toEqual(MARKET_SYMBOLS.map(({ key }) => key));
  });

  it('一部のHTTPエラーだけをfailedに入れ、他の項目は返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: URL) =>
      url.pathname.endsWith('%5EDJI') ? new Response(null, { status: 429 }) : Response.json(chart())
    ));
    const snapshot = await createMarketReader()();
    expect(snapshot.failed).toEqual(['^DJI']);
    expect(snapshot.items).toHaveLength(MARKET_SYMBOLS.length - 1);
  });

  it('同時リクエストの取得処理をまとめる', async () => {
    const fetchStub = vi.fn().mockImplementation(async () => Response.json(chart()));
    vi.stubGlobal('fetch', fetchStub);
    const read = createMarketReader();
    const [first, second] = await Promise.all([read(), read(true)]);
    expect(first).toBe(second);
    expect(fetchStub).toHaveBeenCalledTimes(MARKET_SYMBOLS.length);
  });

  it('marketルートは全取得失敗でも200のJSONとDBファイル名だけを返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    vi.stubEnv('SQLITE_DB_PATH', 'C:/temporary/t10/api-test.db');
    const { GET } = await import('@/app/api/market/route');
    const response = await GET(new Request('http://localhost/api/market?refresh=1'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toMatchObject({
      items: [], failed: MARKET_SYMBOLS.map(({ key }) => key), dbFile: 'api-test.db',
    });
  });

  it.each([
    ['HTTPエラー', () => new Response(null, { status: 503 })],
    ['不正JSON', () => new Response('invalid')],
    ['Yahooエラー', () => Response.json({ chart: { result: null, error: { code: 'Not Found' } } })],
    ['不正値', () => Response.json(chart(-1))],
    ['比較値なし', () => Response.json(chart(110, [110], 0))],
  ])('初回の%sでは値を捏造せず全項目をfailedで返す', async (_name, response) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => response()));
    const snapshot = await createMarketReader()();
    expect(snapshot.items).toEqual([]);
    expect(snapshot.failed).toEqual(MARKET_SYMBOLS.map(({ key }) => key));
  });
});

const candle = (date: string, close: number): Candle => ({ date, close, open: close, high: close, low: close, volume: null });

describe('ティッカーの表示対象', () => {
  it('セクターを除く従来の11項目だけを定義順で返す', () => {
    const items = MARKET_SYMBOLS.map((target) => ({
      ...target, value: 100, change: 1, changePercent: 1, updatedAt: '2026-10-23T00:00:00.000Z',
    })).reverse();
    const ticker = pickTickerItems(items);
    expect(ticker).toHaveLength(11);
    expect(ticker.map((item) => item.key)).toEqual(TICKER_SYMBOLS);
  });
});

describe('セクターの期間騰落', () => {
  const candles = [candle('2025-12-31', 80), candle('2026-02-27', 90), candle('2026-03-23', 100), candle('2026-03-30', 110)];

  it('1週・1か月は暦日基準、年初来は前年最終終値から計算する', () => {
    expect(sectorReturn(candles, 'week', '2026-03-30')).toBeCloseTo(10);
    expect(sectorReturn(candles, 'month', '2026-03-30')).toBeCloseTo((110 / 90 - 1) * 100);
    expect(sectorReturn(candles, 'ytd', '2026-03-30')).toBeCloseTo(37.5);
  });

  it('月末と休場日は直前営業日を使い、未来の終値を含めない', () => {
    expect(sectorReturn([...candles, candle('2026-04-01', 999)], 'month', '2026-03-31')).toBeCloseTo((110 / 90 - 1) * 100);
  });

  it('基準値なし・期間内の価格なしは0%で埋めない', () => {
    expect(sectorReturn(candles.slice(1), 'ytd', '2026-03-30')).toBeUndefined();
    expect(sectorReturn([], 'week', '2026-03-30')).toBeUndefined();
    expect(sectorReturn([candle('2025-12-31', 100)], 'ytd', '2026-03-30')).toBeUndefined();
  });
});

describe('ヒートマップの統合と配色', () => {
  const holding = (overrides: Partial<Holding>): Holding => ({
    id: 'holding', symbol: 'AAPL', market: 'US', portfolio_id: 'account', shares: 2, avg_cost: 10,
    sector: 'technology', sort_order: 0, created_at: '', updated_at: '', ...overrides,
  });
  const watch = (overrides: Partial<WatchlistItem>): WatchlistItem => ({
    id: 'watch', symbol: 'AAPL', market: 'US', list_key: 'main', sort_order: 0, created_at: '', updated_at: '', ...overrides,
  });
  const price = (overrides: Partial<StockPrice>): StockPrice => ({
    symbol: 'AAPL', market: 'US', name: 'Apple', price: 100, change: 1, change_percent: 1, currency: 'USD', updated_at: '', ...overrides,
  });

  it('同一銘柄の複数口座を合算し、登録と現金を重複計上せず市場を区別する', () => {
    const tiles = heatTiles([holding({}), holding({ shares: 3 }), holding({ symbol: 'CASH' })],
      [watch({}), watch({ symbol: 'AAPL', market: 'JP' }), watch({ symbol: 'USDJPY', market: 'FX' })], {
        'AAPL|US': price({}), 'USDJPY|FX': price({ symbol: 'USDJPY', market: 'FX', price: 150, currency: 'JPY' }),
      });
    expect(tiles).toHaveLength(3);
    expect(tiles[0]).toMatchObject({ held: true, value: 75000, changePercent: 1, sector: 'technology' });
    expect(tiles[1]).toMatchObject({ held: false, key: 'AAPL|JP' });
    expect(tiles[2].sector).toBe('fx');
  });

  it('価格や円換算レートがなければ取得単価や仮レートで代用しない', () => {
    const missing = heatTiles([holding({})], [], {});
    expect(missing[0].value).toBeUndefined();
    expect(missing[0].changePercent).toBeUndefined();
    expect(heatTiles([holding({})], [], { 'AAPL|US': price({}) })[0].value).toBeUndefined();
  });

  it('±3%で色の濃さが飽和し、未取得は中立色にする', () => {
    expect(heatBackground(3)).toBe(heatBackground(20));
    expect(heatBackground(-3)).toBe(heatBackground(-20));
    expect(heatBackground(1)).toContain('var(--pm-up)');
    expect(heatBackground(-1)).toContain('var(--pm-down)');
    expect(heatBackground()).toBe(heatBackground(0));
    expect(heatBackground(Number.NaN)).toBe(heatBackground(0));
  });
});
