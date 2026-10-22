import type {
  Holding,
  HoldingWithPrice,
  StockPrice,
  PortfolioSummary,
  SectorAllocation,
  HoldingAllocation,
} from '@/types';
import { getMarketCurrency } from '@/lib/utils';
import { getSectorLabel, normalizeSectorKey, SECTOR_CHART_COLORS } from '@/lib/sectors';
import { priceKey } from '@/lib/price-key';

const isCashHolding = (holding: Holding) => holding.symbol === 'CASH';
const isFxHolding = (holding: Holding) => holding.market === 'FX';
const HOLDING_ALLOCATION_COLORS = [
  '#38bdf8',
  '#22c55e',
  '#f472b6',
  '#60a5fa',
  '#a78bfa',
  '#f59e0b',
  '#14b8a6',
  '#ef4444',
  '#eab308',
  '#94a3b8',
  '#fb7185',
  '#2dd4bf',
];

export function computeHoldingsWithPrices(
  holdings: Holding[],
  prices: Record<string, StockPrice>,
  usdJpy: number
): HoldingWithPrice[] {
  return holdings.map((holding) => {
    const isCash = isCashHolding(holding);
    const isFx = isFxHolding(holding);
    const priceData = prices[priceKey(holding.symbol, holding.market)];
    const priceStatus = isCash ? 'cash' : priceData ? 'live' : 'missing';
    const currentPrice = isCash ? 1 : priceData?.price;
    const currentValue = isCash ? holding.shares : (currentPrice ?? holding.avg_cost) * holding.shares;
    const costBasis = isCash ? holding.shares : holding.avg_cost * holding.shares;
    const quoteCurrency = getMarketCurrency(holding.market, holding.symbol);
    const isUsdQuotedFx = isFx && quoteCurrency === 'USD';
    const currentValueJpy = (holding.market === 'US' || isUsdQuotedFx) ? currentValue * usdJpy : currentValue;
    const costBasisJpy = (holding.market === 'US' || isUsdQuotedFx) ? costBasis * usdJpy : costBasis;
    const profitLoss = currentValueJpy - costBasisJpy;
    const profitLossPercent = costBasisJpy > 0 ? (profitLoss / costBasisJpy) * 100 : 0;

    return {
      ...holding,
      name: isCash
        ? (holding.name || (holding.market === 'US' ? '米ドル現金' : '日本円現金'))
        : isFx
        ? (priceData?.name ?? holding.name ?? `${holding.symbol.slice(0, 3)}/${holding.symbol.slice(3, 6)}`)
        : (priceData?.name ?? holding.name),
      price_status: priceStatus,
      current_price: currentPrice,
      current_value: currentValue,
      current_value_jpy: currentValueJpy,
      profit_loss: priceStatus === 'missing' ? undefined : profitLoss,
      profit_loss_percent: priceStatus === 'missing' ? undefined : profitLossPercent,
      change_percent: isCash ? 0 : priceData?.change_percent,
    };
  });
}

export function computeSummary(holdings: HoldingWithPrice[], usdJpy: number): PortfolioSummary {
  let pricedValueJpy = 0;
  const summary = holdings.reduce<PortfolioSummary>((acc, holding) => {
    const isCash = isCashHolding(holding);
    const isFx = isFxHolding(holding);
    const valueJpy = holding.current_value_jpy ?? 0;
    const quoteCurrency = getMarketCurrency(holding.market, holding.symbol);
    const isUsdQuotedFx = isFx && quoteCurrency === 'USD';
    const cost = isCash ? holding.shares : holding.avg_cost * holding.shares;
    const costJpy = (holding.market === 'US' || isUsdQuotedFx) ? cost * usdJpy : cost;

    acc.total_value_jpy += valueJpy;
    if (holding.price_status === 'missing') {
      acc.missing_price_count += 1;
    } else {
      acc.total_cost_jpy += costJpy;
      pricedValueJpy += valueJpy;
    }

    if (isCash) {
      acc.cash_value_jpy += valueJpy;
      if (holding.market === 'US') {
        acc.cash_value_usd += holding.current_value ?? 0;
      }
    } else if (isFx) {
      acc.fx_value_jpy += valueJpy;
      if (quoteCurrency === 'USD') {
        acc.fx_value_usd += holding.current_value ?? 0;
      }
    } else if (holding.market === 'US') {
      acc.us_stock_value_usd += holding.current_value ?? 0;
      acc.us_stock_value_jpy += valueJpy;
    } else {
      acc.jp_stock_value_jpy += valueJpy;
    }

    // 未取得の銘柄は日次損益に含めない
    if (holding.price_status === 'live') {
      acc.daily_change += (holding.change_percent ?? 0) / 100 * valueJpy;
    }
    return acc;
  }, {
    total_value_jpy: 0,
    total_cost_jpy: 0,
    total_profit_loss: 0,
    total_profit_loss_percent: 0,
    us_stock_value_usd: 0,
    us_stock_value_jpy: 0,
    jp_stock_value_jpy: 0,
    fx_value_usd: 0,
    fx_value_jpy: 0,
    cash_value_usd: 0,
    cash_value_jpy: 0,
    daily_change: 0,
    daily_change_percent: 0,
    missing_price_count: 0,
  });

  summary.total_profit_loss = pricedValueJpy - summary.total_cost_jpy;
  summary.total_profit_loss_percent = summary.total_cost_jpy > 0
    ? (summary.total_profit_loss / summary.total_cost_jpy) * 100
    : 0;
  summary.daily_change_percent = summary.total_value_jpy > 0
    ? (summary.daily_change / (summary.total_value_jpy - summary.daily_change)) * 100
    : 0;
  return summary;
}

export function computeSectorAllocation(holdings: HoldingWithPrice[], total: number): SectorAllocation[] {
  return Array.from(
    holdings.reduce((acc, holding) => {
      const sector = isCashHolding(holding)
        ? 'cash'
        : isFxHolding(holding)
        ? 'fx'
        : normalizeSectorKey(holding.sector);
      acc.set(sector, (acc.get(sector) ?? 0) + (holding.current_value_jpy ?? 0));
      return acc;
    }, new Map<SectorAllocation['sector'], number>())
  ).map(([sector, value]) => ({
    sector,
    label: sector === 'cash' ? '現金' : sector === 'fx' ? 'FX' : getSectorLabel(sector),
    value,
    percent: total > 0 ? (value / total) * 100 : 0,
    color: SECTOR_CHART_COLORS[sector],
  }));
}

export function computeHoldingAllocation(holdings: HoldingWithPrice[], total: number): HoldingAllocation[] {
  return Array.from(
    holdings.reduce((acc, holding) => {
      const key = priceKey(holding.symbol, holding.market);
      const current = acc.get(key);
      const value = holding.current_value_jpy ?? 0;
      if (current) {
        current.value += value;
        return acc;
      }
      acc.set(key, {
        symbol: holding.symbol,
        name: holding.name,
        market: holding.market,
        value,
        percent: 0,
        color: '',
      });
      return acc;
    }, new Map<string, HoldingAllocation>()).values()
  )
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((item, index) => ({
      ...item,
      percent: total > 0 ? (item.value / total) * 100 : 0,
      color: HOLDING_ALLOCATION_COLORS[index % HOLDING_ALLOCATION_COLORS.length],
    }));
}
