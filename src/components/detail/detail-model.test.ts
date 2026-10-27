import { describe, expect, it } from 'vitest';
import type { Candle, DetailSymbol, Transaction } from '@/types';
import { aggregateCandles } from '@/lib/chart-data';
import { tradeMarkers } from './chart-model';
import { defaultChartSettings, parseChartSettings } from './chart-settings';
import { detailHref, fallbackSymbol, searchSymbols } from './data';

const candle = (date: string): Candle => ({ date, open: 10, high: 12, low: 9, close: 11, volume: null });
const trade = (transaction_date: string, type: Transaction['type'] = 'buy'): Transaction => ({
  id: `${transaction_date}-${type}`, portfolio_id: 'test', symbol: 'NVDA', market: 'US', type,
  shares: 2, price: 10, total_amount: 20, fees: 0, transaction_date, created_at: transaction_date,
});

describe('銘柄詳細の売買マーカー', () => {
  it('日足では該当日だけを表示し、配当と範囲外を除いて日付順に並べる', () => {
    expect(tradeMarkers([candle('2026-10-20'), candle('2026-10-21')], [
      trade('2026-10-21', 'sell'), trade('2026-10-20T12:00:00Z'), trade('2026-10-19'), trade('2026-10-20', 'dividend'),
    ], 'd')).toEqual([
      { time: '2026-10-20', type: 'buy', shares: 2 }, { time: '2026-10-21', type: 'sell', shares: 2 },
    ]);
  });

  it('月曜休場の週足でも、その週の最初の取引日に購入・売却を重ねる', () => {
    const weekly = aggregateCandles([candle('2026-10-20'), candle('2026-10-23'), candle('2026-10-26')], 'w');
    expect(tradeMarkers(weekly, [trade('2026-10-23', 'sell'), trade('2026-10-20'), trade('2026-10-18')], 'w')).toEqual([
      { time: '2026-10-20', type: 'sell', shares: 2 }, { time: '2026-10-20', type: 'buy', shares: 2 },
    ]);
  });

  it('年末年始をまたぐ月足を区別し、同日の複数取引も保持する', () => {
    const monthly = aggregateCandles([candle('2025-12-01'), candle('2025-12-31'), candle('2026-01-05'), candle('2026-01-30')], 'm');
    expect(tradeMarkers(monthly, [trade('2026-01-30'), trade('2025-12-31'), trade('2026-01-30', 'sell')], 'm')).toEqual([
      { time: '2025-12-01', type: 'buy', shares: 2 }, { time: '2026-01-05', type: 'buy', shares: 2 }, { time: '2026-01-05', type: 'sell', shares: 2 },
    ]);
    expect(tradeMarkers([], [trade('2026-01-01')], 'm')).toEqual([]);
  });
});

describe('銘柄検索', () => {
  const items: DetailSymbol[] = [
    { symbol: 'NVDA', market: 'US', name: 'NVIDIA' }, { symbol: 'NVDA', market: 'US', name: 'NVIDIA（重複）' },
    { symbol: '7203', market: 'JP', name: 'トヨタ自動車' }, { symbol: 'ABC', market: 'US' }, { symbol: 'ABC', market: 'JP' },
    { symbol: 'CASH', market: 'US', name: 'Cash' },
  ];
  it('コード・名称を部分一致で検索し、同じコードでも市場が異なれば別候補にする', () => {
    expect(searchSymbols(items, ' nVd ')).toEqual([items[0]]);
    expect(searchSymbols(items, '自動車')).toEqual([items[2]]);
    expect(searchSymbols(items, 'abc')).toEqual([items[3], items[4]]);
    expect(searchSymbols(items, 'cash')).toEqual([]);
    expect(searchSymbols(items, ' ')).toEqual([]);
  });
  it('候補は最大10件に制限する', () => {
    expect(searchSymbols(Array.from({ length: 15 }, (_, i) => ({ symbol: `S${i}`, market: 'US' as const })), 'S')).toHaveLength(10);
  });
  it('未登録コードの直行候補は米国らしい英字と日本の4桁コードに限定する', () => {
    expect(fallbackSymbol(' nvda ')).toEqual({ symbol: 'NVDA', market: 'US' });
    expect(fallbackSymbol('BRK.B')).toEqual({ symbol: 'BRK.B', market: 'US' });
    expect(fallbackSymbol('7203')).toEqual({ symbol: '7203', market: 'JP' });
    for (const input of ['日本語', '123', '<script>', 'NVDA&market=FX', '']) expect(fallbackSymbol(input)).toBeUndefined();
    expect(detailHref({ symbol: 'BRK.B', market: 'US' })).toBe('/detail?symbol=BRK.B&market=US');
  });
});

describe('保存済みチャート設定', () => {
  it('壊れたJSONや古い・不正な項目は既定値に戻す', () => {
    for (const raw of [null, '{', 'null', '[]', '"bad"', '{"range":"99y","interval":"h","cost":"false"}']) {
      expect(parseChartSettings(raw)).toEqual(defaultChartSettings);
    }
  });
  it('有効な設定だけを復元し、欠けた項目を補う', () => {
    expect(parseChartSettings('{"range":"5y","interval":"m","ma5":false,"cost":false}')).toEqual({
      ...defaultChartSettings, range: '5y', interval: 'm', ma5: false, cost: false,
    });
  });
});
