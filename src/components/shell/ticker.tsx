import type { MarketSnapshot } from '@/types';
import { formatPercent, getProfitLossColor } from '@/lib/utils';

export function Ticker({ market, error }: { market: MarketSnapshot | null; error: boolean }) {
  return <div className="pm-ticker" role="region" aria-label="主要指数" tabIndex={0}>
    {market?.items.map((item) => <div key={item.key} className="pm-tick" title={`${item.name} ${item.updatedAt}${market.failed.includes(item.key) ? '（取得失敗・前回値）' : ''}`}>
      <span className="pm-muted">{item.name}</span>
      <span className="num">{item.value.toLocaleString('ja-JP', { minimumFractionDigits: item.key === '^TNX' ? 3 : 2, maximumFractionDigits: item.key === '^TNX' || item.key.endsWith('=X') ? 3 : 2 })}{item.key === '^TNX' ? '%' : ''}</span>
      <span className={`num ${getProfitLossColor(item.changePercent)}`}>{formatPercent(item.changePercent)}</span>
      {market.failed.includes(item.key) && <span className="pm-stale">前回値</span>}
    </div>)}
    {!market?.items.length && <span className="pm-muted px-3">{error || market ? '指数を取得できませんでした' : '指数を取得中…'}</span>}
  </div>;
}
