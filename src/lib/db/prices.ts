import 'server-only';

import { StockPrice } from '@/types';
import { isValidMarket } from './validators';
import { getDb } from './connection';

export function listStockPrices(): Record<string, StockPrice> {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT *
      FROM stock_prices
      ORDER BY updated_at DESC
    `)
    .all() as StockPrice[];

  return rows.reduce<Record<string, StockPrice>>((acc, price) => {
    acc[price.symbol] = price;
    return acc;
  }, {});
}

export function upsertStockPrices(prices: StockPrice[]) {
  if (prices.length === 0) return;

  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO stock_prices (symbol, market, name, price, change, change_percent, currency, updated_at)
    VALUES (@symbol, @market, @name, @price, @change, @change_percent, @currency, @updated_at)
    ON CONFLICT(symbol, market) DO UPDATE SET
      name = excluded.name,
      price = excluded.price,
      change = excluded.change,
      change_percent = excluded.change_percent,
      currency = excluded.currency,
      updated_at = excluded.updated_at
  `);

  const tx = db.transaction(() => {
    for (const price of prices) {
      if (!price.symbol || !isValidMarket(price.market) || !Number.isFinite(price.price)) continue;
      insert.run({
        symbol: price.symbol.toUpperCase().trim(),
        market: price.market,
        name: price.name || price.symbol,
        price: price.price,
        change: Number.isFinite(price.change) ? price.change : 0,
        change_percent: Number.isFinite(price.change_percent) ? price.change_percent : 0,
        currency: price.currency,
        updated_at: price.updated_at,
      });
    }
  });
  tx();
}
