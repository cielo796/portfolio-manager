import type { HistoryPoint, PortfolioSnapshot, SnapshotInput } from '@/types';

export type HistoryRange = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '全期間';
export const HISTORY_RANGES: HistoryRange[] = ['1M', '3M', '6M', 'YTD', '1Y', '全期間'];

export function snapshotId(date: string, portfolioId: string | null): string {
  return `${date}|${portfolioId ?? 'ALL'}`;
}

export function validSnapshot(input: SnapshotInput): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(input.snapshot_date)
    && Number.isFinite(Date.parse(input.snapshot_date))
    && new Date(input.snapshot_date).toISOString().slice(0, 10) === input.snapshot_date
    && (input.portfolio_id === null || (typeof input.portfolio_id === 'string' && input.portfolio_id.length > 0 && input.portfolio_id !== 'ALL'))
    && [input.market_value_jpy, input.cost_basis_jpy].every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)
    && (input.cash_jpy === null || (typeof input.cash_jpy === 'number' && Number.isFinite(input.cash_jpy) && input.cash_jpy >= 0))
    && (input.usd_jpy === null || (typeof input.usd_jpy === 'number' && Number.isFinite(input.usd_jpy) && input.usd_jpy > 0))
    && (input.is_estimate === 0 || input.is_estimate === 1);
}

export function rangeStart(range: HistoryRange, today: string): string {
  if (range === '全期間') return '0000-01-01';
  if (range === 'YTD') return `${today.slice(0, 4)}-01-01`;
  const date = new Date(`${today}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - ({ '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }[range]));
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString().slice(0, 10);
}

export function historyMetrics(points: readonly HistoryPoint[]) {
  const first = points[0]?.value;
  const last = points.at(-1)?.value;
  let peak = 0;
  let drawdown = 0;
  for (const { value } of points) {
    peak = Math.max(peak, value);
    if (peak > 0) drawdown = Math.min(drawdown, (value / peak - 1) * 100);
  }
  return { periodReturn: points.length >= 2 && first! > 0 ? (last! / first! - 1) * 100 : null,
    maxDrawdown: points.length >= 2 ? drawdown : null };
}

export function indexed(points: readonly HistoryPoint[]): HistoryPoint[] {
  const base = points[0]?.value;
  return base && base > 0 ? points.map((point) => ({ ...point, value: point.value / base * 100 })) : [];
}

export function historySegments(points: readonly HistoryPoint[], estimates: ReadonlySet<string>) {
  const segments: Array<{ estimate: boolean; points: HistoryPoint[] }> = [];
  for (const [i, point] of points.entries()) {
    const estimate = estimates.has(point.date);
    const last = segments.at(-1);
    if (last?.estimate === estimate) last.points.push(point);
    else segments.push({ estimate, points: i > 0 ? [points[i - 1], point] : [point] });
  }
  return segments;
}

// 休場日は直近終値を使用するが、長い欠損は補完しない。
export function closeOnOrBefore(points: readonly HistoryPoint[], date: string): number | null {
  let low = 0, high = points.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (points[mid].date <= date) low = mid + 1;
    else high = mid - 1;
  }
  const point = points[high];
  return point && Date.parse(date) - Date.parse(point.date) <= 7 * 86400000 && point.value > 0 ? point.value : null;
}

export function comparisonSeries(rows: readonly PortfolioSnapshot[], sp500: HistoryPoint[], nikkei: HistoryPoint[], fx: HistoryPoint[], yen: boolean) {
  const aligned = rows.flatMap((row) => {
    const sp = closeOnOrBefore(sp500, row.snapshot_date);
    const jp = closeOnOrBefore(nikkei, row.snapshot_date);
    const rate = yen ? closeOnOrBefore(fx, row.snapshot_date) : 1;
    return sp === null || jp === null || rate === null ? [] : [{ row, sp: sp * rate, jp }];
  });
  return {
    portfolio: indexed(aligned.map(({ row }) => ({ date: row.snapshot_date, value: row.market_value_jpy }))),
    sp500: indexed(aligned.map(({ row, sp }) => ({ date: row.snapshot_date, value: sp }))),
    nikkei: indexed(aligned.map(({ row, jp }) => ({ date: row.snapshot_date, value: jp }))),
  };
}

export function monthlyRows(rows: readonly PortfolioSnapshot[]) {
  const months = new Map<string, PortfolioSnapshot>();
  for (const row of rows) months.set(row.snapshot_date.slice(0, 7), row);
  return [...months].map(([month, row], i, entries) => {
    const previous = entries[i - 1]?.[1];
    const consecutive = previous && new Date(`${previous.snapshot_date.slice(0, 7)}-01T00:00:00Z`);
    if (consecutive) consecutive.setUTCMonth(consecutive.getUTCMonth() + 1);
    const change = previous && consecutive?.toISOString().slice(0, 7) === month && previous.market_value_jpy > 0
      ? (row.market_value_jpy / previous.market_value_jpy - 1) * 100 : null;
    return { month, row, change };
  });
}

export function historyCsv(rows: readonly PortfolioSnapshot[], start = '0000-01-01'): string {
  return '\uFEFF月,記録日,評価額（円）,前月比（%）,取得額（円）,評価損益（円）,区分\r\n'
    + monthlyRows(rows).filter(({ row }) => row.snapshot_date >= start).map(({ month, row, change }) => [month, row.snapshot_date, row.market_value_jpy,
      change ?? '', row.cost_basis_jpy, row.market_value_jpy - row.cost_basis_jpy, row.is_estimate ? '参考' : '実測'].join(',')).join('\r\n');
}
