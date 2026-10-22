import 'server-only';

import { Holding, WatchlistKey } from '@/types';

const MARKET_VALUES = ['US', 'JP', 'FX'] as const;
const WATCHLIST_KEYS = ['main', 'sub1', 'sub2', 'sub3', 'sub4'] as const;

export const isValidMarket = (market: string): market is Holding['market'] =>
  MARKET_VALUES.includes(market as (typeof MARKET_VALUES)[number]);
export const isValidWatchlistKey = (value: string): value is WatchlistKey =>
  WATCHLIST_KEYS.includes(value as WatchlistKey);
