import { describe, expect, it } from 'vitest';
import { priceKey } from '@/lib/price-key';

describe('priceKey', () => {
  it('シンボルを大文字に変換する', () => {
    expect(priceKey('aapl', 'US')).toBe('AAPL|US');
  });

  it('前後の空白を除去する', () => {
    expect(priceKey(' \tusdJpy\n ', 'FX')).toBe('USDJPY|FX');
  });

  it('同じシンボルでも市場を区別する', () => {
    expect(priceKey('abc', 'JP')).toBe('ABC|JP');
    expect(priceKey('abc', 'US')).not.toBe(priceKey('abc', 'JP'));
  });
});
