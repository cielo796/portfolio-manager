import 'server-only';

import { Holding, Transaction, TransactionType } from '@/types';
import { getDb } from './connection';

export function listTransactions(): Transaction[] {
  const db = getDb();
  return db
    .prepare(`
      SELECT *
      FROM transactions
      ORDER BY transaction_date DESC, created_at DESC
    `)
    .all() as Transaction[];
}

type NewTransactionInput = {
  portfolio_id: string;
  symbol: string;
  market: Holding['market'];
  type: TransactionType;
  shares: number;
  price: number;
  fees?: number;
  transaction_date: string;
  memo?: string;
};

export function createTransaction(input: NewTransactionInput): Transaction {
  const db = getDb();
  const now = new Date().toISOString();
  const totalAmount = Number((input.shares * input.price).toFixed(4));
  const transaction: Transaction = {
    id: crypto.randomUUID(),
    portfolio_id: input.portfolio_id,
    symbol: input.symbol.toUpperCase().trim(),
    market: input.market,
    type: input.type,
    shares: input.shares,
    price: input.price,
    total_amount: totalAmount,
    fees: input.fees ?? 0,
    transaction_date: input.transaction_date,
    memo: input.memo?.trim() || undefined,
    created_at: now,
  };

  db.prepare(`
    INSERT INTO transactions (id, portfolio_id, symbol, market, type, shares, price, total_amount, fees, transaction_date, memo, created_at)
    VALUES (@id, @portfolio_id, @symbol, @market, @type, @shares, @price, @total_amount, @fees, @transaction_date, @memo, @created_at)
  `).run({
    ...transaction,
    memo: transaction.memo ?? null,
  });

  return transaction;
}
