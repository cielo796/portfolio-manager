import type { Market } from '@/types';

export function priceKey(symbol: string, market: Market): string {
  return `${symbol.toUpperCase().trim()}|${market}`;
}
