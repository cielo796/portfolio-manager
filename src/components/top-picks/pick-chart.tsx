'use client';

import type { ChartData, TopPickView } from '@/types';
import { useDetailResource } from '@/components/detail/data';
import { priceText } from './shared';

export function PickChart({ pick }: { pick: TopPickView }) {
  const history = useDetailResource<ChartData>(`/api/chart?symbol=${encodeURIComponent(pick.symbol)}&market=${pick.market}&range=5y&interval=d`);
  const end = pick.removed_at?.slice(0, 10);
  const candles = (history.data?.candles ?? []).filter((candle) => candle.date >= pick.picked_at && (!end || candle.date <= end));
  const levels = [pick.picked_price, ...(pick.target_price ? [pick.target_price] : []), ...candles.map((item) => item.close)];
  const low = Math.min(...levels), high = Math.max(...levels);
  const span = high - low || high * 0.1 || 1;
  const y = (price: number) => 105 - (price - low) / span * 90;
  const x = (date: string) => 8 + (Date.parse(date) - Date.parse(pick.picked_at)) / Math.max(86400000, Date.parse(candles.at(-1)?.date ?? pick.picked_at) - Date.parse(pick.picked_at)) * 300;
  const path = candles.map((item, i) => `${i ? 'L' : 'M'} ${x(item.date)} ${y(item.close)}`).join(' ');
  return <section aria-label="選定日からの価格チャート" className="border-b border-[var(--pm-border)] px-3 py-2">
    <p className="text-[11px] pm-muted">選定日 {pick.picked_at} から{end ? ` ${end} まで` : ''}</p>
    {history.loading ? <p role="status" className="py-4 pm-muted">チャートを読み込み中…</p> : history.error ? <button type="button" className="py-4 text-[var(--pm-link)]" onClick={() => void history.reload()}>価格履歴を取得できませんでした（再試行）</button> : candles.length ? <>
      <svg viewBox="0 0 320 120" className="h-36 w-full" role="img" aria-label="終値の折れ線、選定価格と目標価格の点線"><title>{pick.symbol} 選定日からの終値</title>
        <line x1="0" x2="320" y1={y(pick.picked_price)} y2={y(pick.picked_price)} stroke="#f0a33a" strokeDasharray="4 3" />
        {pick.target_price !== null && <line x1="0" x2="320" y1={y(pick.target_price)} y2={y(pick.target_price)} stroke="#2dd4bf" strokeDasharray="4 3" />}
        <path d={path} fill="none" stroke="#7fb3ff" strokeWidth="1.5" />
        {candles.map((item) => <circle key={item.date} cx={x(item.date)} cy={y(item.close)} r="2" fill="#7fb3ff"><title>{item.date}: {priceText(item.close)}</title></circle>)}
      </svg><div className="flex justify-between text-[10px] pm-muted"><span>{candles[0].date}</span><span>{candles.at(-1)?.date}</span></div>
      {history.data?.stale && <p className="pm-muted">保存済みの価格履歴を表示中です。</p>}
      {candles[0].date > pick.picked_at && <p className="text-[10px] pm-muted">履歴の取得範囲内のデータを表示しています。</p>}
    </> : <p className="py-4 pm-muted">選定日以降の価格履歴がありません。</p>}
    <div className="flex flex-wrap gap-3 text-[11px] pm-muted"><span><span className="text-[#f0a33a]">┄</span> 選定時 {priceText(pick.picked_price)}</span><span><span className="text-[#2dd4bf]">┄</span> 目標 {pick.target_price === null ? '未設定' : priceText(pick.target_price)}</span></div>
  </section>;
}
