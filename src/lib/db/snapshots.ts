import 'server-only';

import type { HistoryPoint, Holding, Portfolio, PortfolioSnapshot, SnapshotInput, StockPrice } from '@/types';
import { computeHoldingsWithPrices, computeSummary } from '@/lib/portfolio-calc';
import { getMarketCurrency } from '@/lib/utils';
import { priceKey } from '@/lib/price-key';
import { closeOnOrBefore, rangeStart, snapshotId, validSnapshot } from '@/components/history/model';
import { getDb } from './connection';
import { getDeviceId } from './device';
import { listHoldings } from './holdings';
import { listPortfolios } from './portfolios';
import { listStockPrices } from './prices';
import { exchangeDate, listPriceHistory, readPriceHistory } from './price-history';

export function snapshotToday(now = new Date()): string {
  return exchangeDate(now, 'Asia/Tokyo');
}

export function listSnapshots(portfolioId: string | null = null): PortfolioSnapshot[] {
  return getDb().prepare(`SELECT * FROM portfolio_snapshots
    WHERE portfolio_id IS ? AND deleted_at IS NULL ORDER BY snapshot_date`).all(portfolioId) as PortfolioSnapshot[];
}

export function calculateSnapshots(portfolios: Portfolio[], holdings: Holding[], prices: Record<string, StockPrice>, date: string, estimate: 0 | 1 = 0): SnapshotInput[] {
  const rate = prices[priceKey('USDJPY', 'FX')]?.price;
  const inputs: SnapshotInput[] = [];
  for (const portfolioId of [null, ...portfolios.map((portfolio) => portfolio.id)]) {
    const selected = holdings.filter((holding) => portfolioId === null || holding.portfolio_id === portfolioId);
    const needsFx = selected.some((holding) => getMarketCurrency(holding.market, holding.symbol) === 'USD');
    if (needsFx && !(Number.isFinite(rate) && rate! > 0)) continue;
    if (selected.some((holding) => holding.symbol !== 'CASH' && !(prices[priceKey(holding.symbol, holding.market)]?.price > 0))) continue;
    const summary = computeSummary(computeHoldingsWithPrices(selected, prices, rate ?? 1), rate ?? 1);
    const input: SnapshotInput = { snapshot_date: date, portfolio_id: portfolioId,
      market_value_jpy: summary.total_value_jpy, cost_basis_jpy: summary.total_cost_jpy,
      cash_jpy: summary.cash_value_jpy, usd_jpy: Number.isFinite(rate) && rate! > 0 ? rate! : null, is_estimate: estimate };
    if (validSnapshot(input)) inputs.push(input);
  }
  return inputs;
}

export function upsertSnapshot(input: SnapshotInput): boolean {
  if (!validSnapshot(input)) throw new Error('資産記録の値が不正です。');
  const db = getDb();
  const now = new Date().toISOString();
  const columns = Object.keys(input);
  const result = db.prepare(`INSERT INTO portfolio_snapshots
    (id, ${columns.join(', ')}, created_at, updated_at, updated_by)
    VALUES (@id, ${columns.map((column) => `@${column}`).join(', ')}, @now, @now, @device)
    ON CONFLICT(id) DO UPDATE SET ${columns.map((column) => `${column} = excluded.${column}`).join(', ')},
      updated_at = excluded.updated_at, updated_by = excluded.updated_by, deleted_at = NULL
    WHERE (portfolio_snapshots.is_estimate = 1 OR excluded.is_estimate = 0)
      AND (portfolio_snapshots.deleted_at IS NOT NULL OR ${columns.map((column) => `portfolio_snapshots.${column} IS NOT excluded.${column}`).join(' OR ')})`)
    .run({ ...input, id: snapshotId(input.snapshot_date, input.portfolio_id), now, device: getDeviceId() });
  return result.changes > 0;
}

export function recordCurrentSnapshots(): number {
  return getDb().transaction(() => calculateSnapshots(listPortfolios(), listHoldings(), listStockPrices(), snapshotToday())
    .filter(upsertSnapshot).length)();
}

export async function generateEstimateSnapshots() {
  const portfolios = listPortfolios();
  const holdings = listHoldings();
  if (!holdings.length) return { written: 0, skippedDays: 0, warnings: ['保有銘柄がありません。'] };
  const today = snapshotToday();
  const start = rangeStart('1Y', today);
  const symbols = new Map(holdings.filter((holding) => holding.symbol !== 'CASH').map((holding) => [priceKey(holding.symbol, holding.market), { symbol: holding.symbol, market: holding.market }]));
  if (holdings.some((holding) => getMarketCurrency(holding.market, holding.symbol) === 'USD')) {
    symbols.set(priceKey('USDJPY', 'FX'), { symbol: 'USDJPY', market: 'FX' });
  }
  const histories = new Map<string, HistoryPoint[]>();
  const warnings: string[] = [];
  // キャッシュを優先し、1年前まで揃わない銘柄だけ既存のチャート取得処理で補う。
  const queue = [...symbols];
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const [key, item] = queue.shift()!;
      let candles = listPriceHistory(item.symbol, item.market);
      if (!candles.length || candles[0].date > start || candles.at(-1)!.date < new Date(Date.parse(today) - 7 * 86400000).toISOString().slice(0, 10)) {
        try {
          const data = await readPriceHistory(item.symbol, item.market);
          candles = data.candles;
          if (data.stale) warnings.push(`${item.symbol}: 保存済みの価格履歴を使用しました。`);
        } catch { warnings.push(`${item.symbol}: 価格履歴を取得できませんでした。`); }
      }
      histories.set(key, candles.map((candle) => ({ date: candle.date, value: candle.close })));
    }
  }));
  let written = 0, skippedDays = 0;
  getDb().transaction(() => {
    for (let time = Date.parse(start); time < Date.parse(today); time += 86400000) {
      const date = new Date(time).toISOString().slice(0, 10);
      const prices: Record<string, StockPrice> = {};
      for (const [key, item] of symbols) {
        const value = closeOnOrBefore(histories.get(key) ?? [], date);
        if (value !== null) prices[key] = { ...item, name: item.symbol, price: value, currency: getMarketCurrency(item.market, item.symbol), change: 0, change_percent: 0, updated_at: date };
      }
      const inputs = calculateSnapshots(portfolios, holdings, prices, date, 1);
      if (!inputs.some((input) => input.portfolio_id === null)) skippedDays++;
      for (const input of inputs) {
        const exists = getDb().prepare('SELECT 1 FROM portfolio_snapshots WHERE id = ?').get(snapshotId(date, input.portfolio_id));
        if (!exists && upsertSnapshot(input)) written++;
      }
    }
  })();
  return { written, skippedDays, warnings };
}
