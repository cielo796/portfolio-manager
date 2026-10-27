'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { StockPrice, TopPickView, TransactionType, WatchlistItem, WatchlistKey } from '@/types';
import { detailHref, readJson, useDetailResource } from '@/components/detail/data';
import { TopPickBadge } from '@/components/top-picks/top-pick-badge';
import { ContextMenu } from '@/components/shell/context-menu';
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type Row, type SortingState } from '@tanstack/react-table';
import { useColumnSettings } from '@/hooks/use-column-settings';
import { computeHoldingSubtotal } from '@/lib/portfolio-calc';
import { formatCurrency, formatNumber, formatPercent, getProfitLossColor } from '@/lib/utils';
import { createHoldingsCsv, holdingsCsvFilename } from './csv';
import { HOLDING_COLUMNS, formatHoldingCell, holdingMarket, type HoldingColumnId, type HoldingRow } from './columns';
import { HoldingDetailPane } from './detail-pane';
import { HoldingsAllocationPopover } from './allocation-popover';
import { buildHoldingMenuItems, toYahooSymbol, type HoldingMenuActions } from './context-menu-items';
import { HoldingActionModal } from './action-modal';
import { DeleteHoldingDialog } from './delete-dialog';

type Grouping = 'market' | 'sector' | 'account' | 'none';

export function HoldingsWorkspace({ rows, usdJpy, total, initialSelectedId, onAdd, onRecord, onEdit, onClosePosition, onSaveMemo, onReorder }: {
  rows: HoldingRow[];
  usdJpy: number;
  total: number;
  initialSelectedId?: string;
  onAdd: () => void;
  onRecord: () => void;
  onEdit: (row: HoldingRow) => void;
  onClosePosition: (row: HoldingRow) => Promise<void>;
  onSaveMemo: (row: HoldingRow, memo: string) => Promise<void>;
  onReorder: (ids: string[]) => Promise<void>;
}) {
  const [grouping, setGrouping] = useState<Grouping>('market');
  const [filter, setFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(initialSelectedId);
  const [draggedId, setDraggedId] = useState<string>();
  const [dropId, setDropId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const columnSettings = useRef<HTMLDetailsElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; row?: HoldingRow; target: HTMLElement; key: number }>();
  const menuSequence = useRef(0);
  const [actionModal, setActionModal] = useState<{ mode: 'add' | TransactionType; row: HoldingRow }>();
  const [deleting, setDeleting] = useState<HoldingRow>();
  const watchlist = useDetailResource<{ watchlistItems: WatchlistItem[] }>('/api/watchlist');
  const picks = useDetailResource<{ topPicks: TopPickView[] }>('/api/top-picks');
  const topPicks = picks.data?.topPicks ?? [];
  const { visibility, setVisibility, sizing, setSizing } = useColumnSettings();
  const filtered = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    return rows.filter((row) => [row.values.symbol, row.values.name, row.values.memo].some((value) => String(value).toLocaleLowerCase().includes(query)));
  }, [rows, filter]);
  const columns = useMemo<ColumnDef<HoldingRow>[]>(() => HOLDING_COLUMNS.map((column) => ({
    id: column.id,
    header: column.label,
    accessorFn: (row) => row.values[column.id],
    size: column.size,
    minSize: 40,
    maxSize: 600,
    sortDescFirst: false,
    sortUndefined: 'last',
    cell: (context) => formatHoldingCell(context.row.original, column.id),
  })), []);
  // TanStackの状態は列設定フックで保存する。
  const table = useReactTable({
    data: filtered, columns, getRowId: (row) => row.holding.id,
    state: { sorting, columnVisibility: visibility, columnSizing: sizing },
    onSortingChange: setSorting, onColumnVisibilityChange: setVisibility, onColumnSizingChange: setSizing,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
    enableMultiSort: false, columnResizeMode: 'onChange',
  });
  const visibleColumns = table.getVisibleLeafColumns();
  const sortedRows = table.getRowModel().rows;
  const groups = new Map<string, Row<HoldingRow>[]>();
  for (const row of sortedRows) {
    const label = grouping === 'none' ? '' : grouping === 'market'
      ? holdingMarket(row.original.holding) : String(row.original.values[grouping]);
    groups.set(label, [...(groups.get(label) ?? []), row]);
  }
  const displayRows = Array.from(groups.values()).flat();
  const selected = displayRows.find((row) => row.id === selectedId)?.original ?? displayRows[0]?.original;
  const canReorder = grouping === 'none' && sorting.length === 0 && !busy;
  const template = visibleColumns.map((column) => column.id === 'name' ? `minmax(${column.getSize()}px, 1fr)` : `${column.getSize()}px`).join(' ');
  const gridStyle = { gridTemplateColumns: template, height: 'var(--pm-row-h)' };
  const exportCsv = () => {
    const content = createHoldingsCsv(visibleColumns.map((column) => String(column.columnDef.header)),
      displayRows.map((row) => visibleColumns.map((column) => formatHoldingCell(row.original, column.id as HoldingColumnId))));
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = holdingsCsvFilename();
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const openMenu = (x: number, y: number, target: HTMLElement, row?: HoldingRow) => {
    if (row) setSelectedId(row.holding.id);
    target.focus({ preventScroll: true });
    setMenu({ x, y, target, row, key: ++menuSequence.current });
    void watchlist.reload(); void picks.reload();
  };
  const runMenuAction = (action: () => Promise<void>) => {
    setError('');
    void Promise.resolve().then(action).catch((cause) => setError(cause instanceof Error ? cause.message : '操作に失敗しました。'));
  };
  const menuRow = menu?.row;
  const menuHolding = menuRow?.holding;
  const actions: HoldingMenuActions = {
    detail: () => { if (menuHolding) router.push(detailHref(menuHolding)); },
    memo: () => { if (menuHolding) router.push(`/memos?symbol=${encodeURIComponent(menuHolding.symbol)}&market=${menuHolding.market}&new=1`); },
    record: (mode) => { if (menuRow) setActionModal({ mode, row: menuRow }); },
    edit: () => { if (menuRow) onEdit(menuRow); },
    add: () => { if (menuRow) setActionModal({ mode: 'add', row: menuRow }); else onAdd(); },
    watch: (list: WatchlistKey) => { if (menuHolding) runMenuAction(async () => {
      await readJson('/api/watchlist', undefined, { symbol: menuHolding.symbol, market: menuHolding.market, name: menuHolding.name,
        sector: menuHolding.sector, list_key: list });
      await watchlist.reload();
    }); },
    pick: () => { if (menuHolding) runMenuAction(async () => {
      // 選定価格はAPI側で保存済みの現在値を採用する。
      await readJson('/api/top-picks', undefined, { symbol: menuHolding.symbol, market: menuHolding.market });
      await picks.reload();
    }); },
    refresh: () => { if (menuHolding) runMenuAction(async () => {
      const result = await readJson<{ prices: Record<string, StockPrice> }>('/api/prices', undefined,
        { symbols: [{ symbol: menuHolding.symbol, market: menuHolding.market, name: menuHolding.name }] });
      if (!result.prices[`${menuHolding.symbol}|${menuHolding.market}`]) throw new Error('価格を取得できませんでした。時間をおいて再試行してください。');
      window.location.reload();
    }); },
    copyCode: () => { if (menuHolding) runMenuAction(() => navigator.clipboard.writeText(menuHolding.symbol)); },
    copyName: () => { if (menuRow) runMenuAction(() => navigator.clipboard.writeText(String(menuRow.values.name))); },
    yahoo: () => { if (menuHolding) window.open(`https://finance.yahoo.com/quote/${encodeURIComponent(toYahooSymbol(menuHolding.symbol, menuHolding.market))}`, '_blank', 'noopener,noreferrer'); },
    remove: () => { if (menuRow) setDeleting(menuRow); },
    csv: exportCsv,
    columns: () => { if (columnSettings.current) { columnSettings.current.open = true; columnSettings.current.querySelector('summary')?.focus(); } },
  };
  const menuItems = buildHoldingMenuItems({ holding: menuHolding,
    watchlist: watchlist.loading || watchlist.error ? undefined : watchlist.data?.watchlistItems,
    picks: picks.loading || picks.error ? undefined : picks.data?.topPicks, actions });
  const subtotal = (label: string, members: Row<HoldingRow>[]) => {
    const summary = computeHoldingSubtotal(members.map((row) => row.original.holding), usdJpy, total);
    const values: Partial<Record<HoldingColumnId, [string, number?]>> = {
      valueJpy: [formatCurrency(summary.total_value_jpy)],
      profit: [formatCurrency(summary.total_profit_loss), summary.total_profit_loss],
      profitPercent: [formatPercent(summary.total_profit_loss_percent), summary.total_profit_loss],
      daily: [formatCurrency(summary.daily_change), summary.daily_change],
      weight: [`${formatNumber(summary.weight, 1)}%`],
    };
    const firstAggregate = visibleColumns.findIndex((column) => column.id in values);
    const labelSpan = firstAggregate > 0 ? firstAggregate : 1;
    return <div role="row" className="grid items-center border-b border-[var(--pm-divider)] bg-[var(--pm-group)] font-semibold" style={gridStyle}>
      <div role="cell" className="truncate px-2" title={`${label} ${summary.count}銘柄`} style={{ gridColumn: `span ${labelSpan}` }}>{label} <span className="pm-muted font-normal">{summary.count}銘柄</span></div>
      {visibleColumns.slice(labelSpan).map((column) => {
        const value = values[column.id as HoldingColumnId];
        return <div role="cell" key={column.id} className={`truncate px-2 text-right tabular-nums ${value?.[1] !== undefined ? getProfitLossColor(value[1]) : ''}`} title={value?.[0]}>{value?.[0]}</div>;
      })}
    </div>;
  };
  const drop = async (target: string) => {
    setDropId(undefined);
    const movingId = draggedId;
    setDraggedId(undefined);
    if (!canReorder || !movingId || target === movingId) return;
    // 非表示行の位置を維持して、絞り込み中の行だけを入れ替える。
    const visibleIds = displayRows.map((row) => row.id);
    const reordered = visibleIds.filter((id) => id !== movingId);
    reordered.splice(reordered.indexOf(target), 0, movingId);
    const visibleSet = new Set(visibleIds);
    let index = 0;
    const ids = rows.map((row) => visibleSet.has(row.holding.id) ? reordered[index++] : row.holding.id);
    setBusy(true);
    setError('');
    try { await onReorder(ids); } catch { setError('銘柄の並び順の保存に失敗しました。'); } finally { setBusy(false); }
  };

  return <>
    <div className="flex shrink-0 items-center gap-2 py-1">
      <h1 className="mr-2 shrink-0 text-sm font-semibold">保有銘柄</h1>
      <div role="group" aria-label="グループ化" className="flex shrink-0">
        {([['market', '市場'], ['sector', 'セクター'], ['account', '口座'], ['none', 'なし']] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={grouping === key} onClick={() => setGrouping(key)} className={`pm-button rounded-none first:rounded-l last:rounded-r ${grouping === key ? '!border-[#6b5226] !bg-[var(--pm-active-bg)] !text-[var(--pm-active-text)]' : ''}`}>{label}</button>)}
      </div>
      <input type="search" aria-label="保有銘柄を絞り込み" placeholder="コード・銘柄名・メモで絞り込み" value={filter} onChange={(event) => setFilter(event.target.value)} className="h-7 min-w-20 flex-1 rounded border border-[var(--pm-input-border)] bg-[var(--pm-bg)] px-2" />
      <HoldingsAllocationPopover holdings={filtered.map((row) => row.holding)} usdJpy={usdJpy} />
      <details ref={columnSettings} className="relative shrink-0" onKeyDown={(event) => { if (event.key === 'Escape') event.currentTarget.open = false; }}>
        <summary className="pm-button list-none">列 {visibleColumns.length}/18</summary>
        <div className="absolute right-0 top-8 z-30 grid max-h-[65vh] w-56 gap-1 overflow-auto rounded border border-[var(--pm-border)] bg-[var(--pm-panel)] p-3 shadow-xl">
          {table.getAllLeafColumns().map((column) => <label key={column.id} className="flex items-center gap-2 py-1"><input type="checkbox" checked={column.getIsVisible()} disabled={column.getIsVisible() && visibleColumns.length === 1} onChange={column.getToggleVisibilityHandler()} />{String(column.columnDef.header)}</label>)}
          <button type="button" className="pm-button" onClick={() => { setVisibility({ account: false, memo: false, updated: false }); setSizing({}); }}>初期設定に戻す</button>
          <span className="pm-muted text-[11px]">列幅は見出しの右端をドラッグ</span>
        </div>
      </details>
      <button type="button" className="pm-button" onClick={exportCsv}>CSV出力</button>
      <button type="button" className="pm-button !border-[var(--pm-accent)] !bg-[var(--pm-accent)] !text-[#1a1205]" onClick={onAdd}>＋ 保有を追加</button>
      <button type="button" className="pm-button" onClick={onRecord}>売買を記録</button>
    </div>
    {error && <p role="alert" className="text-[var(--pm-accent)]">{error}</p>}
    <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-1 min-[900px]:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-label="保有銘柄一覧" aria-busy={busy} tabIndex={-1} onContextMenu={(event) => {
        event.preventDefault(); openMenu(event.clientX, event.clientY, event.currentTarget);
      }} className="min-h-0 min-w-0 self-stretch overflow-auto rounded border border-[var(--pm-border)] bg-[var(--pm-panel)] max-[899px]:max-h-[60vh]">
        <div role="table" aria-label="保有銘柄" className="w-full text-[12px]" style={{ minWidth: Math.max(table.getTotalSize(), 120) }}>
          <div role="row" className="sticky top-0 z-10 grid items-center border-b border-[var(--pm-border)] bg-[var(--pm-heading)] pm-muted" style={{ ...gridStyle, height: 26 }}>
            {table.getHeaderGroups()[0].headers.map((header) => {
              const meta = HOLDING_COLUMNS.find((column) => column.id === header.id)!;
              return <div key={header.id} role="columnheader" aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : 'none'} className="relative min-w-0 px-2">
                <button type="button" className={`block w-full truncate ${'numeric' in meta ? 'text-right' : 'text-left'}`} title={`${meta.label}で並べ替え（昇順→降順→解除）`} onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{header.column.getIsSorted() === 'asc' ? ' ↑' : header.column.getIsSorted() === 'desc' ? ' ↓' : ''}</button>
                <span role="separator" aria-label={`${meta.label}の列幅`} aria-orientation="vertical" tabIndex={0} onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()} onDoubleClick={() => header.column.resetSize()} onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                  event.preventDefault();
                  setSizing((previous) => ({ ...previous, [header.id]: Math.min(600, Math.max(40, header.column.getSize() + (event.key === 'ArrowRight' ? 8 : -8))) }));
                }} className="absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none hover:bg-[var(--pm-accent)]" />
              </div>;
            })}
          </div>
          {Array.from(groups.entries()).map(([label, members]) => <div role="rowgroup" key={label}>
            {grouping !== 'none' && subtotal(label, members)}
            {members.map((row) => <div key={row.id} role="row" tabIndex={0} aria-selected={selected?.holding.id === row.id} draggable={canReorder && displayRows.length > 1} onClick={() => setSelectedId(row.id)} onContextMenu={(event) => {
              event.preventDefault(); event.stopPropagation(); openMenu(event.clientX, event.clientY, event.currentTarget, row.original);
            }} onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                openMenu(rect.left + 16, rect.bottom, event.currentTarget, row.original);
                return;
              }
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(row.id); }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const index = displayRows.findIndex((item) => item.id === row.id) + (event.key === 'ArrowDown' ? 1 : -1);
                const nextId = displayRows[index]?.id;
                if (nextId) { setSelectedId(nextId); document.getElementById(`holding-${nextId}`)?.focus(); }
              }
            }} id={`holding-${row.id}`} onDragStart={(event) => { if (!canReorder) return; setDraggedId(row.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', row.id); }} onDragEnd={() => { setDraggedId(undefined); setDropId(undefined); }} onDragOver={(event) => { if (canReorder && draggedId) { event.preventDefault(); setDropId(row.id); } }} onDrop={(event) => { event.preventDefault(); void drop(row.id); }} className={`grid cursor-pointer items-center border-b border-[var(--pm-divider)] hover:bg-[#18212d] ${selected?.holding.id === row.id ? '!bg-[#1a2638]' : ''} ${dropId === row.id ? 'outline outline-[var(--pm-accent)]' : ''} ${draggedId === row.id ? 'opacity-50' : ''}`} style={gridStyle}>
              {row.getVisibleCells().map((cell) => {
                const meta = HOLDING_COLUMNS.find((column) => column.id === cell.column.id)!;
                const value = row.original.values[meta.id];
                const content = formatHoldingCell(row.original, meta.id);
                return <div key={cell.id} role="cell" title={content} className={`truncate px-2 ${'numeric' in meta ? 'text-right tabular-nums' : ''} ${content === '価格未取得' ? 'pm-muted !px-1 text-[10px]' : 'signed' in meta && typeof value === 'number' ? getProfitLossColor(value) : ''}`}>
                  {meta.id === 'name' && row.original.holding.symbol !== 'CASH' ? <div className="flex items-center gap-1"><Link href={detailHref(row.original.holding)} className="min-w-0 flex-1 truncate text-left text-[var(--pm-link)] hover:underline" onClick={(event) => event.stopPropagation()}>{content}</Link><TopPickBadge symbol={row.original.holding.symbol} market={row.original.holding.market} picks={topPicks} /></div> : content}
                </div>;
              })}
            </div>)}
          </div>)}
          {displayRows.length === 0 && <p className="p-6 text-center pm-muted">{filter ? '条件に一致する銘柄はありません。' : '保有銘柄がありません。'}</p>}
          {subtotal('合計', displayRows)}
        </div>
      </section>
      <HoldingDetailPane key={selected?.holding.id ?? 'empty'} row={selected} topPicks={topPicks} onEdit={() => { if (selected) onEdit(selected); }} onClosePosition={async () => { if (selected) await onClosePosition(selected); }} onSaveMemo={async (memo) => { if (selected) await onSaveMemo(selected, memo); }} />
    </div>
    {menu && <ContextMenu key={menu.key} items={menuItems} x={menu.x} y={menu.y} returnFocus={menu.target} onClose={() => setMenu(undefined)} />}
    {actionModal && <HoldingActionModal mode={actionModal.mode} row={actionModal.row} onClose={() => setActionModal(undefined)} />}
    {deleting && <DeleteHoldingDialog row={deleting} onClose={() => setDeleting(undefined)} onDelete={async () => {
      const index = displayRows.findIndex((row) => row.id === deleting.holding.id);
      const nextId = displayRows[index + 1]?.id ?? displayRows[index - 1]?.id;
      await onClosePosition(deleting);
      setSelectedId(nextId);
      requestAnimationFrame(() => document.getElementById(`holding-${nextId}`)?.focus());
    }} />}
  </>;
}
