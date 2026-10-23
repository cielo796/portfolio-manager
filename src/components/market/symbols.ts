import type { MarketItem, MarketTarget } from '@/types';
import { getSectorLabel, type SectorKey } from '@/lib/sectors';

const sectorEtfs: Array<[string, SectorKey]> = [
  ['XLK', 'technology'], ['XLC', 'communication'], ['XLY', 'consumer_discretionary'],
  ['XLP', 'consumer_staples'], ['XLV', 'healthcare'], ['XLF', 'financials'],
  ['XLI', 'industrials'], ['XLE', 'energy'], ['XLB', 'materials'],
  ['XLU', 'utilities'], ['XLRE', 'real_estate'],
];

export const MARKET_TARGETS: MarketTarget[] = [
  { key: '^N225', name: '日経225', group: 'index' },
  { key: '^DJI', name: 'NYダウ', group: 'index' },
  { key: '^GSPC', name: 'S&P500', group: 'index' },
  { key: '^IXIC', name: 'NASDAQ', group: 'index' },
  { key: '^SOX', name: 'SOX', group: 'index' },
  { key: '^VIX', name: 'VIX', group: 'commodity' },
  { key: '^TNX', name: '米10年債', group: 'rate' },
  { key: 'USDJPY=X', name: 'USD/JPY', group: 'fx' },
  { key: 'EURJPY=X', name: 'EUR/JPY', group: 'fx' },
  { key: 'CL=F', name: 'WTI', group: 'commodity' },
  { key: 'GC=F', name: '金', group: 'commodity' },
  { key: '^RUT', name: 'ラッセル2000', group: 'index' },
  { key: 'EURUSD=X', name: 'EUR/USD', group: 'fx' },
  { key: 'GBPJPY=X', name: 'GBP/JPY', group: 'fx' },
  { key: 'AUDJPY=X', name: 'AUD/JPY', group: 'fx' },
  { key: '2YY=F', name: '米2年債（利回り先物）', group: 'rate' },
  { key: '^TYX', name: '米30年債', group: 'rate' },
  { key: 'HG=F', name: '銅', group: 'commodity' },
  { key: 'BTC-USD', name: 'ビットコイン', group: 'commodity' },
  ...sectorEtfs.map(([key, sector]): MarketTarget => ({ key, name: getSectorLabel(sector), group: 'sector' })),
];

export const SECTOR_TARGETS = MARKET_TARGETS.filter((item) => item.group === 'sector');
export const QUOTE_TARGETS = MARKET_TARGETS.filter((item) => item.group !== 'sector');

// ティッカーはT16以前からの11項目だけを従来の順序で表示する
export const TICKER_SYMBOLS = ['^N225', '^DJI', '^GSPC', '^IXIC', '^SOX', '^VIX', '^TNX', 'USDJPY=X', 'EURJPY=X', 'CL=F', 'GC=F'];

export function pickTickerItems(items: MarketItem[]): MarketItem[] {
  const byKey = new Map(items.filter((item) => item.group !== 'sector').map((item) => [item.key, item]));
  return TICKER_SYMBOLS.flatMap((key) => {
    const item = byKey.get(key);
    return item ? [item] : [];
  });
}
