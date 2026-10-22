'use client';

import type { WatchlistState } from '@/hooks/use-watchlist';
import { ChevronDown, ChevronUp, GripVertical, Pencil, Save, Trash2 } from 'lucide-react';
import { SectorKey, getSectorDefinition } from '@/lib/sectors';
import { priceKey } from '@/lib/price-key';
import { formatCurrency, formatDate, formatPercent, getMarketCurrency } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { SECTOR_OPTIONS } from './constants';
import { getMarketLabel } from './format';
import { FundamentalMetricsPanel } from './fundamental-metrics-panel';
import { WatchlistFilters, WatchlistToolbar } from './watchlist-toolbar';

type WatchlistTableProps = Pick<WatchlistState,
  | 'activeListKey'
  | 'sortActiveListBySector'
  | 'searchQuery'
  | 'sectorFilter'
  | 'sectorCounts'
  | 'reorderWithinActiveList'
  | 'handleDragEnd'
  | 'sectorGroups'
  | 'priceMap'
  | 'fundamentalMap'
  | 'editingId'
  | 'dragOverId'
  | 'setDragOverId'
  | 'isSavingLayout'
  | 'setDraggedId'
  | 'startEdit'
  | 'isSavingEdit'
  | 'handleDelete'
  | 'handleSaveEdit'
  | 'editCompanyName'
  | 'setEditCompanyName'
  | 'editSector'
  | 'setEditSector'
  | 'editTargetPrice'
  | 'setEditTargetPrice'
  | 'editMemo'
  | 'setEditMemo'
  | 'cancelEdit'
  | 'expandedFundamentalIds'
  | 'setExpandedFundamentalIds'
  | 'visibleItemCount'
  | 'activeItems'
  | 'setSearchQuery'
  | 'setSectorFilter'
>;

export const WatchlistTable = (props: WatchlistTableProps) => {
  const {
    reorderWithinActiveList,
    handleDragEnd,
    sectorGroups,
    priceMap,
    fundamentalMap,
    editingId,
    dragOverId,
    setDragOverId,
    isSavingLayout,
    setDraggedId,
    startEdit,
    isSavingEdit,
    handleDelete,
    handleSaveEdit,
    editCompanyName,
    setEditCompanyName,
    editSector,
    setEditSector,
    editTargetPrice,
    setEditTargetPrice,
    editMemo,
    setEditMemo,
    cancelEdit,
    expandedFundamentalIds,
    setExpandedFundamentalIds,
    visibleItemCount,
    activeItems,
    setSearchQuery,
    setSectorFilter,
  } = props;
  return (
    <Card>
      <WatchlistToolbar {...props} />
      <CardContent>
        <WatchlistFilters {...props} />
        <div
          className="space-y-6"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            reorderWithinActiveList(null);
            handleDragEnd();
          }}
        >
          {sectorGroups.map((group) => (
            <div key={group.definition.key} className="space-y-3">
              <div className="flex items-center gap-3 border-b border-slate-700/60 pb-2">
                <span
                  className={`inline-flex rounded border px-2.5 py-1 text-xs font-semibold ${group.definition.badgeClass}`}
                >
                  {group.definition.label}
                </span>
                <span className="text-xs text-slate-500">{group.items.length}銘柄</span>
              </div>
          {group.items.map((item) => {
            const price = priceMap[priceKey(item.symbol, item.market)];
            const fundamental = fundamentalMap[priceKey(item.symbol, item.market)];
            const currentPrice = price?.price;
            const currency = getMarketCurrency(item.market, item.symbol);
            const target = item.target_price != null && item.target_price > 0 ? item.target_price : undefined;
            const gap =
              currentPrice !== undefined && target !== undefined && currentPrice > 0
                ? (target / currentPrice - 1) * 100
                : undefined;
            const isEditing = editingId === item.id;
            const isDragOver = dragOverId === item.id;

            return (
              <div
                key={item.id}
                data-watchlist-symbol={item.symbol}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverId(item.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  reorderWithinActiveList(item.id);
                  handleDragEnd();
                }}
                onDragEnd={handleDragEnd}
                className={`grid grid-cols-2 gap-x-5 gap-y-4 rounded-xl border bg-slate-900/25 px-4 py-3 transition-colors sm:grid-cols-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_88px] lg:items-center hover:bg-slate-800/60 ${
                  isDragOver ? 'border-blue-400/70 bg-blue-500/10' : 'border-slate-700/60'
                }`}
              >
                <div className="col-span-full flex min-w-0 items-center gap-2 lg:col-span-1">
                  <span
                    draggable={!isEditing && !isSavingLayout}
                    onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id); setDraggedId(item.id); }}
                    title="ドラッグして並び替え・別のリストへ移動"
                    className="hidden shrink-0 cursor-grab rounded py-2 text-slate-500 hover:text-slate-200 active:cursor-grabbing lg:block"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold tracking-wide text-slate-100">{item.symbol}</span>
                      <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] text-slate-300">{getMarketLabel(item.market)}</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-400" title={item.name || price?.name}>{item.name || price?.name || getSectorDefinition(item.sector).label}</div>
                  </div>
                </div>
                <div className="min-w-0 lg:text-right" title={price?.updated_at ? `株価更新: ${formatDate(price.updated_at, 'full')}` : '株価は未更新です'}>
                  <div className="mb-1 text-xs text-slate-400">現在値</div>
                  <div className="whitespace-nowrap text-base font-semibold tabular-nums text-slate-100">{currentPrice == null ? '—' : formatCurrency(currentPrice, currency)}</div>
                  {price && <div className={`mt-0.5 text-xs tabular-nums ${price.change_percent >= 0 ? 'text-[var(--pm-up)]' : 'text-[var(--pm-down)]'}`}>{formatPercent(price.change_percent)}<span className="ml-1 text-[10px] text-slate-400">前日比</span></div>}
                </div>
                <div className="min-w-0 lg:text-right">
                  <div className="mb-1 text-xs text-slate-400">目標価格</div>
                  <div className={`whitespace-nowrap text-sm tabular-nums ${target === undefined ? 'text-slate-400' : 'font-medium text-slate-200'}`}>{target === undefined ? '未設定' : formatCurrency(target, currency)}</div>
                </div>
                <div className="min-w-0 lg:text-right">
                  <div className="mb-1 text-xs text-slate-400" title="（目標価格 ÷ 現在値 − 1）× 100">目標まで</div>
                  <div className={`whitespace-nowrap text-sm font-medium tabular-nums ${gap === undefined ? 'text-slate-400' : gap >= 0 ? 'text-[var(--pm-up)]' : 'text-[var(--pm-down)]'}`}>{gap === undefined ? '—' : formatPercent(gap)}</div>
                </div>
                <div className="min-w-0">
                  <div className="mb-1 text-xs text-slate-400">メモ</div>
                  <div className="line-clamp-2 break-words text-sm text-slate-300" title={item.memo || undefined}>{item.memo || '—'}</div>
                </div>
                <div className="col-span-full flex items-center justify-end gap-2 border-t border-slate-700/40 pt-3 lg:col-span-1 lg:border-0 lg:pt-0">
                  <Button type="button" size="sm" variant="ghost" className="h-9 w-9" aria-label={`${item.symbol}を編集`} title="編集" onClick={() => startEdit(item)} disabled={isSavingEdit}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-9 w-9 text-slate-400 hover:bg-rose-500/10 hover:text-[var(--pm-down)]" aria-label={`${item.symbol}を削除`} title="削除" onClick={() => handleDelete(item.id)} disabled={isSavingEdit}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {isEditing && (
                  <form onSubmit={(event) => { event.preventDefault(); void handleSaveEdit(); }} className="col-span-full grid gap-4 rounded-lg border border-blue-500/30 bg-slate-900/50 p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label={`${item.symbol}の編集`}>
                    {item.market === 'JP' && <Input id={`name-${item.id}`} label="会社名" value={editCompanyName} onChange={(event) => setEditCompanyName(event.target.value)} disabled={isSavingEdit} />}
                    <Select id={`sector-${item.id}`} label="セクター" value={editSector} onChange={(event) => setEditSector(event.target.value as SectorKey)} options={SECTOR_OPTIONS} disabled={isSavingEdit} />
                    <Input id={`target-${item.id}`} label="目標価格" type="number" min="0" step="0.0001" placeholder="未設定（任意）" value={editTargetPrice} onChange={(event) => setEditTargetPrice(event.target.value)} disabled={isSavingEdit} />
                    <div className="sm:col-span-2">
                      <label htmlFor={`memo-${item.id}`} className="mb-1.5 block text-sm font-medium text-slate-300">メモ</label>
                      <textarea id={`memo-${item.id}`} rows={2} value={editMemo} onChange={(event) => setEditMemo(event.target.value)} disabled={isSavingEdit} className="w-full rounded-lg border border-slate-600/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="col-span-full flex justify-end gap-2">
                      <Button type="button" size="sm" variant="secondary" onClick={cancelEdit} disabled={isSavingEdit}>取消</Button>
                      <Button type="submit" size="sm" disabled={isSavingEdit}><Save className="h-4 w-4" />{isSavingEdit ? '保存中…' : '保存'}</Button>
                    </div>
                  </form>
                )}
                {fundamental && <div className="col-span-full">
                  <button type="button" className="inline-flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200" aria-expanded={expandedFundamentalIds.has(item.id)} onClick={() => setExpandedFundamentalIds((previous) => { const next = new Set(previous); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}>
                    財務指標 {expandedFundamentalIds.has(item.id) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                  {expandedFundamentalIds.has(item.id) && <FundamentalMetricsPanel metrics={fundamental} />}
                </div>}
              </div>
            );
          })}

            </div>
          ))}

          {visibleItemCount === 0 && (
            <div className="rounded-lg border border-dashed border-slate-700 py-12 text-center text-slate-500">
              {activeItems.length === 0
                ? 'このページにはまだ銘柄がありません。'
                : '検索条件に一致する銘柄がありません。'}
              {activeItems.length > 0 && <button type="button" onClick={() => { setSearchQuery(''); setSectorFilter('all'); }} className="mx-auto mt-3 block text-sm text-blue-300 hover:text-blue-200">絞り込みを解除</button>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
