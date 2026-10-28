'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StockPrice, TopPickView, TransactionType, WatchlistItem, WatchlistKey } from '@/types';
import { detailHref, readJson, useDetailResource } from '@/components/detail/data';
import { ContextMenu } from '@/components/shell/context-menu';
import { buildHoldingMenuItems, toYahooSymbol, type HoldingMenuActions } from './context-menu-items';
import { HoldingActionModal } from './action-modal';
import { DeleteHoldingDialog } from './delete-dialog';
import type { HoldingRow } from './columns';

type HoldingContextMenuOptions = {
  onAdd: () => void;
  onEdit: (row: HoldingRow) => void;
  onDelete: (row: HoldingRow) => Promise<void>;
  onSelect?: (row: HoldingRow) => void;
  onCsv?: () => void;
  onColumns?: () => void;
  variant?: 'workspace' | 'home';
};

export function useHoldingContextMenu({ onAdd, onEdit, onDelete, onSelect, onCsv, onColumns, variant = 'workspace' }: HoldingContextMenuOptions) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; row?: HoldingRow; target: HTMLElement; key: number }>();
  const menuSequence = useRef(0);
  const [actionModal, setActionModal] = useState<{ mode: 'add' | TransactionType; row: HoldingRow }>();
  const [deleting, setDeleting] = useState<HoldingRow>();
  const watchlist = useDetailResource<{ watchlistItems: WatchlistItem[] }>('/api/watchlist');
  const picks = useDetailResource<{ topPicks: TopPickView[] }>('/api/top-picks');
  const topPicks = picks.data?.topPicks ?? [];
  const openMenu = (x: number, y: number, target: HTMLElement, row?: HoldingRow) => {
    if (row) onSelect?.(row);
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
    csv: () => onCsv?.(),
    columns: () => onColumns?.(),
    portfolio: () => router.push(menuHolding ? `/portfolio?symbol=${encodeURIComponent(menuHolding.symbol)}&market=${menuHolding.market}` : '/portfolio'),
  };
  const menuItems = buildHoldingMenuItems({ holding: menuHolding,
    watchlist: watchlist.loading || watchlist.error ? undefined : watchlist.data?.watchlistItems,
    picks: picks.loading || picks.error ? undefined : picks.data?.topPicks, actions, variant });
  return {
    openMenu,
    activeRowId: menu?.row?.holding.id,
    activeTarget: menu?.target,
    topPicks,
    setError,
    errorElement: error ? <p role="alert" className="text-[var(--pm-accent)]">{error}</p> : null,
    element: <>
      {menu && <ContextMenu key={menu.key} items={menuItems} x={menu.x} y={menu.y} returnFocus={menu.target} onClose={() => setMenu(undefined)} />}
      {actionModal && <HoldingActionModal mode={actionModal.mode} row={actionModal.row} onClose={() => setActionModal(undefined)} />}
      {deleting && <DeleteHoldingDialog row={deleting} onClose={() => setDeleting(undefined)} onDelete={() => onDelete(deleting)} />}
    </>,
  };
}
