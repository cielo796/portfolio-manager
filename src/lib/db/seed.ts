import 'server-only';

import type Database from 'better-sqlite3';
import { getDeviceId } from './device';
import { mockHoldings, mockPortfolios, mockTransactions } from '@/lib/mock-data';
import { resolveHoldingSector } from '@/lib/sectors';

export function seedIfEmpty(db: Database.Database) {
  const portfolioCount = db.prepare('SELECT COUNT(*) as count FROM portfolios').get() as { count: number };
  if (portfolioCount.count > 0) return;

  const now = new Date().toISOString();
  const updatedBy = getDeviceId(db);
  const insertPortfolio = db.prepare(`
    INSERT INTO portfolios (id, name, broker, description, created_at, updated_at, updated_by)
    VALUES (@id, @name, @broker, @description, @created_at, @updated_at, @updated_by)
  `);
  const insertHolding = db.prepare(`
    INSERT INTO holdings (id, portfolio_id, symbol, name, market, shares, avg_cost, sort_order, sector, memo, created_at, updated_at, updated_by)
    VALUES (@id, @portfolio_id, @symbol, @name, @market, @shares, @avg_cost, @sort_order, @sector, @memo, @created_at, @updated_at, @updated_by)
  `);
  const insertTransaction = db.prepare(`
    INSERT INTO transactions (id, portfolio_id, symbol, market, type, shares, price, total_amount, fees, transaction_date, memo, created_at, updated_at, updated_by)
    VALUES (@id, @portfolio_id, @symbol, @market, @type, @shares, @price, @total_amount, @fees, @transaction_date, @memo, @created_at, @updated_at, @updated_by)
  `);

  const tx = db.transaction(() => {
    for (const portfolio of mockPortfolios) {
      insertPortfolio.run({
        ...portfolio,
        updated_at: now,
        updated_by: updatedBy,
        broker: portfolio.broker ?? '',
        description: portfolio.description ?? null,
      });
    }
    for (const holding of mockHoldings) {
      insertHolding.run({
        ...holding,
        updated_at: now,
        updated_by: updatedBy,
        symbol: holding.symbol.toUpperCase().trim(),
        name: holding.name ?? null,
        sector: resolveHoldingSector(holding.symbol, holding.market, holding.sector),
        memo: holding.memo ?? null,
      });
    }
    for (const transaction of mockTransactions) {
      insertTransaction.run({
        ...transaction,
        updated_at: now,
        updated_by: updatedBy,
        symbol: transaction.symbol.toUpperCase().trim(),
        memo: transaction.memo ?? null,
      });
    }
  });

  tx();
}
