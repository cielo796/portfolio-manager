import { getProfitLossColor } from '@/lib/utils';

export function WatchlistSparkline({ closes }: { closes?: number[] }) {
  const values = (closes ?? []).filter(Number.isFinite);
  if (values.length < 2) return <span className="pm-muted">—</span>;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const points = values.map((value, index) => `${2 + index / (values.length - 1) * 76},${high === low ? 9 : 16 - (value - low) / (high - low) * 14}`).join(' ');
  return <svg viewBox="0 0 80 18" className={`h-[18px] w-full ${getProfitLossColor(values[values.length - 1] - values[0])}`} role="img" aria-label={`5日終値: ${values.join(' → ')}`}>
    <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.2" />
  </svg>;
}
