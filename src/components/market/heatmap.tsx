'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { MarketHeatTile } from '@/types';
import { getSectorLabel, SECTORS } from '@/lib/sectors';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { detailHref } from '@/components/detail/data';
import { heatBackground } from './model';
import { MarketMessage, MarketPanel, MarketToggle } from './panel';

export function Heatmap({ tiles, loading, loaded, error }: { tiles: MarketHeatTile[]; loading: boolean; loaded: boolean; error: boolean }) {
  const [scope, setScope] = useState<'all' | 'held'>('all');
  const visible = tiles.filter((tile) => scope === 'all' || tile.held);
  const total = visible.reduce((sum, tile) => sum + (tile.value ?? 0), 0);
  const groups = [...SECTORS.map((sector) => sector.key), 'fx'].map((key) => ({
    key, name: key === 'fx' ? 'FX' : getSectorLabel(key), tiles: visible.filter((tile) => tile.sector === key),
  })).filter((group) => group.tiles.length > 0);
  return <MarketPanel title="ヒートマップ（保有＋登録銘柄・前日比）" controls={<MarketToggle label="対象" value={scope} options={[
    ['all', '保有＋登録'], ['held', '保有のみ'],
  ]} onChange={setScope} />}>
    {loading && !loaded ? <MarketMessage>保有・登録銘柄を取得中…</MarketMessage> : <div className="space-y-2 p-2">
      {groups.map((group) => <div key={group.key}>
        <h3 className="mb-1 text-[11px] pm-muted">{group.name}</h3>
        <div className="flex flex-wrap gap-[3px]">{group.tiles.map((tile) => <Link key={tile.key} href={detailHref(tile)}
          title={`${tile.name ?? tile.symbol}（${tile.market}・${tile.held ? '保有' : '登録'}）${tile.held ? ` 評価額 ${tile.value === undefined ? '未取得' : formatCurrency(tile.value)}` : ''}`}
          aria-label={`${tile.symbol} ${tile.market} ${tile.changePercent === undefined ? '価格未取得' : formatPercent(tile.changePercent)}の銘柄詳細`}
          className="flex h-[52px] min-w-[80px] max-w-full flex-col justify-center overflow-hidden rounded-[3px] px-2 text-[#f3f6fa] hover:outline hover:outline-1 hover:outline-[var(--pm-accent)]"
          style={{ width: tile.held && tile.value !== undefined && total > 0 ? `max(80px, ${tile.value / total * 100}%)` : '80px', background: heatBackground(tile.changePercent) }}>
          <span className="truncate font-semibold">{tile.symbol}</span><span className="num !text-left text-[11px]">{tile.changePercent === undefined ? '価格未取得' : formatPercent(tile.changePercent)}</span>
        </Link>)}</div>
      </div>)}
      {loaded && !visible.length && <MarketMessage>対象の銘柄がありません。</MarketMessage>}
      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] pm-muted" aria-label="前日比の凡例 -3%から+3%">
        <span>-3%</span><span className="flex h-2 w-[180px] overflow-hidden rounded-sm">{[-3, -1, 0, 1, 3].map((percent) => <span key={percent} className="flex-1" style={{ background: heatBackground(percent) }} />)}</span><span>+3%</span>
        <span className="ml-2">幅＝保有の評価額（円換算）／登録は一定</span>
      </div>
      {visible.some((tile) => tile.changePercent === undefined) && <p className="text-[11px] pm-muted">中立色の「価格未取得」は騰落率を計算できない銘柄です。</p>}
    </div>}
    {error && <MarketMessage error>保有・登録銘柄の一部を更新できませんでした。取得済みデータは前回値です。価格更新で再試行できます。</MarketMessage>}
  </MarketPanel>;
}
