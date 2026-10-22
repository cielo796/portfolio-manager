import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMarketReader, MARKET_SYMBOLS } from './market';

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
      key: '^N225', name: '日経225', value: 110, change: 10, changePercent: 10,
      updatedAt: new Date(1792651503 * 1000).toISOString(),
    });
    const url = fetchStub.mock.calls[0][0] as URL;
    expect(url.pathname).toContain('%5EN225');
    expect(url.searchParams.get('range')).toBe('5d');
    expect(url.searchParams.get('interval')).toBe('1d');
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
