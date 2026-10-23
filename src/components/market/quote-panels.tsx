import type { MarketGroup, MarketSnapshot, SparklineItem } from '@/types';
import { formatNumber, formatPercent, getProfitLossColor } from '@/lib/utils';
import { WatchlistSparkline } from '@/components/watchlist/sparkline';
import { MarketMessage, MarketPanel } from './panel';
import { QUOTE_TARGETS } from './symbols';

const GROUPS: Array<[MarketGroup, string]> = [['index', '株価指数'], ['fx', '為替'], ['rate', '金利'], ['commodity', '商品・その他']];

export function QuotePanels({ snapshot, lines, loading, error, lineError }: { snapshot?: MarketSnapshot; lines: SparklineItem[]; loading: boolean; error: boolean; lineError: boolean }) {
  return <div className="grid grid-cols-1 items-start gap-1 min-[850px]:grid-cols-2 min-[1700px]:grid-cols-4">
    {GROUPS.map(([group, title]) => <MarketPanel key={group} title={title}>
      {loading && !snapshot ? <MarketMessage>市況を取得中…</MarketMessage> : <div className="overflow-x-auto">
        <table className="w-full min-w-[390px] table-fixed border-collapse text-[11px]" aria-label={title}>
          <thead className="h-[22px] bg-[var(--pm-heading)] pm-muted"><tr>
            <th className="w-[30%] px-2 text-left font-normal">名称</th><th className="num w-[22%] px-1 font-normal">現在値</th><th className="num w-[18%] px-1 font-normal">前日比</th><th className="num w-[16%] px-1 font-normal">騰落率</th><th className="w-[14%] px-2 font-normal">5日</th>
          </tr></thead>
          <tbody>{QUOTE_TARGETS.filter((target) => target.group === group).map((target) => {
            const item = snapshot?.items.find((item) => item.key === target.key);
            const line = lines.find((line) => line.symbol === target.key);
            const stale = snapshot?.failed.includes(target.key) && item;
            const digits = group === 'fx' ? target.key === 'EURUSD=X' ? 4 : 3 : group === 'rate' || target.key === 'HG=F' ? 3 : 2;
            return <tr key={target.key} className="border-b border-[var(--pm-divider)]" style={{ height: 'var(--pm-row-h)' }} title={item ? `${target.name} ${item.updatedAt}${stale ? '（取得失敗・前回値）' : ''}` : target.name}>
              <th scope="row" className="truncate px-2 text-left font-normal">{target.name}{stale && <span className="ml-1 text-[10px] pm-muted">前回値</span>}</th>
              <td className="num px-1 font-semibold">{item ? `${formatNumber(item.value, digits)}${group === 'rate' ? '%' : ''}` : <span className="text-[10px] pm-muted">価格未取得</span>}</td>
              <td className={`num px-1 ${item ? getProfitLossColor(item.change) : 'pm-muted'}`}>{item ? `${item.change > 0 ? '+' : ''}${formatNumber(item.change, digits)}` : '—'}</td>
              <td className={`num px-1 ${item ? getProfitLossColor(item.changePercent) : 'pm-muted'}`}>{item ? formatPercent(item.changePercent) : '—'}</td>
              <td className="px-1" title={!line?.closes.length ? '価格履歴未取得' : undefined}><WatchlistSparkline closes={line?.closes} /></td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
      {error && <MarketMessage error>市況の更新に失敗しました。価格更新で再試行できます。</MarketMessage>}
      {lineError && <MarketMessage error>価格履歴の一部を取得できませんでした。</MarketMessage>}
    </MarketPanel>)}
  </div>;
}
