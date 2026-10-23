import { describe, expect, it } from 'vitest';
import { applyTrade, replayTrades, transactionYenRate } from './trade-ledger';
import type { TransactionType } from '@/types';

const buy = { type: 'buy' as const, shares: 10, price: 100, fees: 10 };
const entry = (id: string, type: TransactionType, shares: number, price: number, date: string) =>
  ({ id, type, shares, price, fees: 0, transaction_date: date, created_at: date });

describe('売買記録の計算', () => {
  it('購入を移動平均し、手数料を取得費に含める', () => {
    const result = applyTrade({ shares: 10, avg_cost: 80 }, buy);
    expect(result.shares).toBe(20);
    expect(result.avg_cost).toBe(90.5);
    expect(result.total_amount).toBe(1000);
    expect(result.realized_pl).toBeNull();
  });
  it('売却後も平均単価を維持し、手数料を実現損益から引く', () => {
    expect(applyTrade({ shares: 10, avg_cost: 100 }, { type: 'sell', shares: 4, price: 120, fees: 5 }))
      .toEqual({ shares: 6, avg_cost: 100, realized_pl: 75, total_amount: 480 });
  });
  it('全数売却、超過売却、少数数量の丸め誤差を扱う', () => {
    expect(applyTrade({ shares: 10, avg_cost: 100 }, { ...buy, type: 'sell' }).shares).toBe(0);
    expect(() => applyTrade({ shares: 9, avg_cost: 100 }, { ...buy, type: 'sell' })).toThrow('保有数量');
    expect(applyTrade({ shares: 0.1 + 0.2, avg_cost: 1 }, { ...buy, type: 'sell', shares: 0.3 }).shares).toBe(0);
    expect(() => applyTrade({ shares: 0, avg_cost: 0 }, { ...buy, type: 'sell', shares: 1e-12 })).toThrow();
  });
  it('配当は保有を変えず数量×単価を記録する', () => {
    expect(applyTrade({ shares: 10, avg_cost: 100 }, { type: 'dividend', shares: 10, price: 2, fees: 0 }))
      .toEqual({ shares: 10, avg_cost: 100, realized_pl: null, total_amount: 20 });
  });
  it('日付順に並べ、編集・削除後の数量と実現損益を再計算する', () => {
    const purchase = entry('b', 'buy', 10, 100, '2026-01-01');
    const sale = entry('s', 'sell', 5, 150, '2026-02-01');
    expect(replayTrades([sale, purchase]).shares).toBe(5);
    expect(replayTrades([sale, { ...purchase, price: 120 }]).transactions[1].realized_pl).toBe(150);
    expect(replayTrades([purchase]).shares).toBe(10);
    expect(() => replayTrades([sale])).toThrow();
    expect(() => replayTrades([sale, { ...purchase, transaction_date: '2026-03-01' }])).toThrow();
  });
  it('全数売却後の再購入は新しい取得単価になる', () => {
    expect(replayTrades([entry('1', 'buy', 5, 100, '2026-01-01'), entry('2', 'sell', 5, 90, '2026-01-02'), entry('3', 'buy', 2, 200, '2026-01-03')]).avg_cost).toBe(200);
  });
  it('不正値や計算のオーバーフローを拒否する', () => {
    for (const shares of [0, -1, NaN, Infinity]) expect(() => applyTrade({ shares: 0, avg_cost: 0 }, { ...buy, shares })).toThrow();
    expect(() => applyTrade({ shares: 0, avg_cost: 0 }, { ...buy, shares: 1e308, price: 1e308 })).toThrow();
  });
  it('円建て、米国株、USDクォートFXの取引時レートを区別する', () => {
    expect(transactionYenRate({ symbol: '7203', market: 'JP' })).toBe(1);
    expect(transactionYenRate({ symbol: 'USDJPY', market: 'FX' })).toBe(1);
    expect(transactionYenRate({ symbol: 'AAPL', market: 'US' })).toBeNull();
    expect(transactionYenRate({ symbol: 'EURUSD', market: 'FX', fx_rate: 150 })).toBe(150);
  });
});
