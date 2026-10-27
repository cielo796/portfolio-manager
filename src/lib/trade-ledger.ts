import type { Transaction, TransactionType } from '@/types';

export class TradeLedgerError extends Error {}

export interface LedgerBalance {
  shares: number;
  avg_cost: number;
}

type LedgerEntry = Pick<Transaction, 'type' | 'shares' | 'price' | 'fees'>;

export function applyTrade(balance: LedgerBalance, entry: LedgerEntry) {
  if (!['buy', 'sell', 'dividend'].includes(entry.type) ||
    !Number.isFinite(entry.shares) || entry.shares <= 0 ||
    !Number.isFinite(entry.price) || entry.price < 0 ||
    !Number.isFinite(entry.fees) || entry.fees < 0) {
    throw new TradeLedgerError('数量・単価・手数料の値が不正です。');
  }
  let { shares, avg_cost } = balance;
  let realized_pl: number | null = null;
  if (entry.type === 'buy') {
    const nextShares = shares + entry.shares;
    avg_cost = (shares * avg_cost + entry.shares * entry.price + entry.fees) / nextShares;
    shares = nextShares;
  } else if (entry.type === 'sell') {
    if (entry.shares > shares && entry.shares - shares > Math.max(shares, entry.shares) * Number.EPSILON * 8) {
      throw new TradeLedgerError('保有数量を超える売却は記録できません。日付と数量を確認してください。');
    }
    realized_pl = (entry.price - avg_cost) * entry.shares - entry.fees;
    shares = Math.max(0, shares - entry.shares);
    if (shares < Math.max(balance.shares, entry.shares) * Number.EPSILON * 8) shares = 0;
  }
  const total_amount = entry.shares * entry.price;
  if (![shares, avg_cost, total_amount, realized_pl ?? 0].every(Number.isFinite)) {
    throw new TradeLedgerError('計算可能な範囲の値を指定してください。');
  }
  return { shares, avg_cost, realized_pl, total_amount };
}

export function replayTrades<T extends LedgerEntry & { transaction_date: string; created_at: string; id: string }>(
  entries: T[], opening: LedgerBalance = { shares: 0, avg_cost: 0 }
) {
  let balance = opening;
  const transactions = [...entries].sort((a, b) =>
    a.transaction_date.localeCompare(b.transaction_date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  ).map((entry) => {
    const result = applyTrade(balance, entry);
    balance = { shares: result.shares, avg_cost: result.avg_cost };
    return { ...entry, realized_pl: result.realized_pl, total_amount: result.total_amount };
  });
  return { ...balance, transactions };
}

export const transactionLabels: Record<TransactionType, string> = { buy: '購入', sell: '売却', dividend: '配当' };

export function transactionYenRate(entry: Pick<Transaction, 'market' | 'symbol' | 'fx_rate'>): number | null {
  const usd = entry.market === 'US' || (entry.market === 'FX' && entry.symbol.endsWith('USD'));
  return usd ? (entry.fx_rate && Number.isFinite(entry.fx_rate) && entry.fx_rate > 0 ? entry.fx_rate : null) : 1;
}
