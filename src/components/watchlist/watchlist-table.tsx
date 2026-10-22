'use client';

import { Fragment, useMemo, useRef } from 'react';
import { getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import type { WatchlistState } from '@/hooks/use-watchlist';
import { useColumnSettings } from '@/hooks/use-column-settings';
import { priceKey } from '@/lib/price-key';
import { getProfitLossColor } from '@/lib/utils';
import { normalizeSectorKey } from '@/lib/sectors';
import { AddWatchItemForm } from './add-watch-item-form';
import { WatchlistTabs } from './watchlist-tabs';
import { WatchlistToolbar } from './watchlist-toolbar';
import { WatchlistEditRow } from './watchlist-edit-row';
import { WatchlistSparkline } from './sparkline';
import { WATCHLIST_COLUMNS, formatWatchlistCell, targetGap, type WatchlistColumnId, type WatchlistRow } from './columns';

export function WatchlistTable(props: WatchlistState) {
  const scrollArea = useRef<HTMLElement>(null);
  const startEdit = (row: WatchlistRow) => {
    props.startEdit(row.item);
    if (scrollArea.current) scrollArea.current.scrollLeft = 0;
  };
  const { visibility, setVisibility, sizing, setSizing } = useColumnSettings('watchlist');
  const rows = useMemo<WatchlistRow[]>(() => props.sectorGroups.flatMap((group) => group.items.map((item) => {
    const key = priceKey(item.symbol, item.market);
    return { item, price: props.priceMap[key], fundamental: props.fundamentalMap[key], sparkline: props.sparklineMap[key] };
  })), [props.sectorGroups, props.priceMap, props.fundamentalMap, props.sparklineMap]);
  const columns = useMemo<ColumnDef<WatchlistRow>[]>(() => WATCHLIST_COLUMNS.map((column) => ({
    id: column.id, header: column.label, size: column.size, minSize: 40, maxSize: 600,
  })), []);
  // TanStackの列設定はReact Compilerのメモ化対象から外す。
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows, columns, getRowId: (row) => row.item.id,
    state: { columnVisibility: visibility, columnSizing: sizing },
    onColumnVisibilityChange: setVisibility, onColumnSizingChange: setSizing,
    getCoreRowModel: getCoreRowModel(), columnResizeMode: 'onChange',
  });
  const visible = table.getVisibleLeafColumns();
  const sizes = visible.map((column, index) => Math.max(column.getSize(), index === visible.length - 1 ? 100 : 40));
  const gridStyle = { gridTemplateColumns: sizes.map((size, index) => index === visible.length - 1 ? `minmax(${size}px, 1fr)` : `${size}px`).join(' '), height: 'var(--pm-row-h)' };
  const columnsMenu = <details className="relative" onKeyDown={(event) => { if (event.key === 'Escape') event.currentTarget.open = false; }}>
    <summary className="pm-button list-none">列 {visible.length}/19</summary>
    <div className="absolute right-0 top-8 z-30 grid max-h-[65vh] w-52 gap-1 overflow-auto rounded border border-[var(--pm-border)] bg-[var(--pm-panel)] p-3 shadow-xl">
      {table.getAllLeafColumns().map((column) => <label key={column.id} className="flex items-center gap-2 py-1"><input type="checkbox" checked={column.getIsVisible()} disabled={column.getIsVisible() && visible.length === 1} onChange={column.getToggleVisibilityHandler()} />{String(column.columnDef.header)}</label>)}
      <button type="button" className="pm-button" onClick={() => { setVisibility({}); setSizing({}); }}>初期設定に戻す</button>
      <span className="text-[11px] pm-muted">列幅は見出しの右端をドラッグ</span>
    </div>
  </details>;

  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
    <div className="shrink-0 rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]">
      <WatchlistTabs {...props} />
      <WatchlistToolbar {...props} columnsMenu={columnsMenu} />
      <AddWatchItemForm {...props} />
    </div>
    {props.metricsError && <p role="status" className="text-[11px] text-[var(--pm-accent)]">{props.metricsError}</p>}
    <section ref={scrollArea} aria-label="登録銘柄一覧" aria-busy={props.isSavingLayout} className="min-h-0 min-w-0 flex-1 overflow-auto rounded border border-[var(--pm-border)] bg-[var(--pm-panel)] max-[899px]:max-h-[60vh]"
      onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); props.reorderWithinActiveList(null); props.handleDragEnd(); }}>
      <div role="table" aria-label="登録銘柄" className="w-full text-[12px]" style={{ minWidth: sizes.reduce((total, size) => total + size, 0) }}>
        <div role="row" className="sticky top-0 z-10 grid items-center border-b border-[var(--pm-border)] bg-[var(--pm-heading)] pm-muted" style={{ ...gridStyle, height: 26 }}>
          {table.getHeaderGroups()[0].headers.map((header) => {
            const meta = WATCHLIST_COLUMNS.find((column) => column.id === header.id)!;
            return <div key={header.id} role="columnheader" className={`relative min-w-0 truncate px-2 ${'numeric' in meta ? 'text-right' : ''}`} title={meta.label}>
              {meta.id === 'grip' ? <span className="sr-only">{meta.label}</span> : meta.label}
              <span role="separator" aria-label={`${meta.label}の列幅`} aria-orientation="vertical" tabIndex={0} onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()} onDoubleClick={() => header.column.resetSize()}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                  event.preventDefault();
                  setSizing((previous) => ({ ...previous, [header.id]: Math.min(600, Math.max(40, header.column.getSize() + (event.key === 'ArrowRight' ? 8 : -8))) }));
                }} className="absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none hover:bg-[var(--pm-accent)]" />
            </div>;
          })}
        </div>
        {props.sectorGroups.map((group) => <div role="rowgroup" key={group.definition.key}>
          <div role="row" className="grid items-center border-b border-[var(--pm-divider)] bg-[var(--pm-group)]" style={gridStyle}>
            <div role="cell" className="col-span-full flex items-center gap-2 px-2"><span className={`rounded border px-1.5 text-[11px] ${group.definition.badgeClass}`}>{group.definition.label}</span><span className="pm-muted">{group.items.length}銘柄</span></div>
          </div>
          {table.getRowModel().rows.filter((row) => normalizeSectorKey(row.original.item.sector) === group.definition.key).map((row) => {
            const { item } = row.original;
            const editing = props.editingId === item.id;
            return <Fragment key={item.id}>
              <div role="row" data-watchlist-symbol={item.symbol} tabIndex={0} onDoubleClick={() => { if (!props.isSavingEdit) startEdit(row.original); }} onKeyDown={(event) => { if (event.key === 'Enter' && event.target === event.currentTarget && !props.isSavingEdit) startEdit(row.original); }}
                onDragOver={(event) => { event.preventDefault(); props.setDragOverId(item.id); }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); props.reorderWithinActiveList(item.id); props.handleDragEnd(); }} onDragEnd={props.handleDragEnd}
                className={`grid items-center border-b border-[var(--pm-divider)] hover:bg-[#18212d] ${editing ? 'bg-[#1a2638]' : ''} ${props.dragOverId === item.id ? 'outline outline-[var(--pm-accent)]' : ''}`} style={gridStyle}>
                {row.getVisibleCells().map((cell, index) => {
                  const id = cell.column.id as WatchlistColumnId;
                  const meta = WATCHLIST_COLUMNS.find((column) => column.id === id)!;
                  const content = formatWatchlistCell(row.original, id);
                  const gap = targetGap(row.original);
                  const signed = id === 'change' ? row.original.price?.change : id === 'changePercent' ? row.original.price?.change_percent : undefined;
                  return <div key={cell.id} role="cell" className={`flex min-w-0 items-center gap-1 px-2 ${'numeric' in meta ? 'justify-end text-right tabular-nums' : ''} ${content === '—' || content === '未設定' ? 'pm-muted' : signed !== undefined ? getProfitLossColor(signed) : id === 'toTarget' && gap !== undefined && Math.abs(gap) <= 3 + 1e-9 ? 'font-semibold text-[var(--pm-accent)]' : ''}`}>
                    <div className="min-w-0 flex-1 truncate" title={id === 'price' && row.original.price ? `${content}（更新: ${row.original.price.updated_at}）` : content}>
                      {id === 'grip' ? <span draggable={!editing && !props.isSavingLayout && !props.isSavingEdit} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id); props.setDraggedId(item.id); }} title="ドラッグして並べ替え・別リストへ移動" className="flex cursor-grab pm-muted active:cursor-grabbing"><GripVertical className="h-3.5 w-3.5" /></span>
                        : id === 'sparkline' ? <WatchlistSparkline closes={row.original.sparkline?.closes} /> : content}
                    </div>
                    {index === visible.length - 1 && <div className="flex shrink-0 items-center gap-1" onDoubleClick={(event) => event.stopPropagation()}>
                      <button type="button" className="pm-muted hover:text-[var(--pm-link)]" aria-label={`${item.symbol}を編集`} onClick={() => startEdit(row.original)} disabled={props.isSavingEdit}><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" className="pm-muted hover:text-[var(--pm-down)]" aria-label={`${item.symbol}を削除`} onClick={() => props.handleDelete(item.id)} disabled={props.isSavingEdit}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>}
                  </div>;
                })}
              </div>
              {editing && <WatchlistEditRow {...props} item={item} />}
            </Fragment>;
          })}
        </div>)}
        {props.visibleItemCount === 0 && <div className="p-6 text-center pm-muted">
          {props.activeItems.length === 0 ? 'このリストにはまだ銘柄がありません。' : '検索条件に一致する銘柄がありません。'}
          {props.activeItems.length > 0 && <button type="button" className="mx-auto mt-2 block text-[var(--pm-link)]" onClick={() => { props.setSearchQuery(''); props.setSectorFilter('all'); }}>絞り込みを解除</button>}
        </div>}
      </div>
    </section>
  </div>;
}
