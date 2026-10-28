import type { HoldingWithPrice, Market, TopPickView, Transaction, TransactionType, WatchlistItem, WatchlistKey } from '@/types';
import type { ContextMenuItem } from '@/components/shell/context-menu';

type SymbolMarket = { symbol: string; market: Market };
type MenuHolding = Pick<HoldingWithPrice, 'symbol' | 'market' | 'current_price' | 'price_status'>;
type WatchEntry = SymbolMarket & Pick<WatchlistItem, 'list_key' | 'deleted_at'>;
type PickEntry = SymbolMarket & Pick<TopPickView, 'removed_at' | 'deleted_at'>;

export type HoldingMenuActions = {
  detail: () => void;
  memo: () => void;
  record: (type: TransactionType) => void;
  edit: () => void;
  add: () => void;
  watch: (list: WatchlistKey) => void;
  pick: () => void;
  refresh: () => void;
  copyCode: () => void;
  copyName: () => void;
  yahoo: () => void;
  remove: () => void;
  csv: () => void;
  columns: () => void;
};

export function toYahooSymbol(symbol: string, market: Market): string {
  const normalized = symbol.trim().toUpperCase();
  if (market === 'JP') return normalized.endsWith('.T') ? normalized : `${normalized.replace(/\.JP$/, '')}.T`;
  if (market === 'FX') return normalized.endsWith('=X') ? normalized : `${normalized.replace(/[^A-Z]/g, '')}=X`;
  return normalized;
}

export const hasLinkedTransactions = (holdingId: string, transactions: Pick<Transaction, 'holding_id' | 'deleted_at'>[]) =>
  transactions.some((entry) => entry.holding_id === holdingId && !entry.deleted_at);

export function buildHoldingMenuItems({ holding, watchlist, picks, actions }: {
  holding?: MenuHolding; watchlist?: WatchEntry[]; picks?: PickEntry[]; actions: HoldingMenuActions;
}): ContextMenuItem[] {
  const add: ContextMenuItem = { id: 'add', label: '保有を追加…', onSelect: actions.add };
  if (!holding) return [add, { id: 'csv', label: 'CSV出力', onSelect: actions.csv }, { id: 'columns', label: '列設定…', onSelect: actions.columns }];
  const edit: ContextMenuItem = { id: 'edit', label: '編集…', onSelect: actions.edit };
  const remove: ContextMenuItem = { id: 'remove', label: '削除…', danger: true, onSelect: actions.remove };
  if (holding.symbol === 'CASH') return [edit, add, remove];
  const sameSymbol = (entry: SymbolMarket) => entry.symbol === holding.symbol && entry.market === holding.market;
  const currentPicks = picks?.filter((entry) => !entry.removed_at && !entry.deleted_at);
  const pickReason = !currentPicks ? 'ピック状況を確認できていません。メニューを開き直してください。'
    : currentPicks.some(sameSymbol) ? '既にトップピックに追加されています。'
    : currentPicks.length >= 10 ? 'トップピックは最大10件です。'
    : holding.price_status === 'missing' || !Number.isFinite(holding.current_price) || (holding.current_price ?? 0) <= 0 ? '保存済みの現在値がありません。価格を更新してください。' : undefined;
  return [
    { id: 'detail', label: '銘柄詳細を開く', shortcut: 'Enter', onSelect: actions.detail },
    { id: 'memo', label: '銘柄メモを書く', onSelect: actions.memo },
    'separator',
    { id: 'record', label: '売買を記録', children: ([['buy', '購入'], ['sell', '売却'], ['dividend', '配当']] as const)
      .map(([type, label]) => ({ id: type, label, onSelect: () => actions.record(type) })) },
    edit, add,
    'separator',
    { id: 'watch', label: '登録リストに追加', children: (['main', 'sub1', 'sub2', 'sub3', 'sub4'] as const).map((list, index) => {
      const exists = watchlist?.some((entry) => !entry.deleted_at && sameSymbol(entry) && entry.list_key === list);
      return { id: list, label: `${exists ? '✓ ' : ''}${index === 0 ? 'メイン' : `サブ${index}`}`, disabled: !watchlist || exists,
        disabledReason: !watchlist ? '登録状況を確認できていません。メニューを開き直してください。' : exists ? '既にこのリストに登録されています。' : undefined,
        onSelect: () => actions.watch(list) };
    }) },
    { id: 'pick', label: 'トップピックに追加', disabled: !!pickReason, disabledReason: pickReason, onSelect: actions.pick },
    { id: 'refresh', label: '価格を更新', onSelect: actions.refresh },
    'separator',
    { id: 'copy-code', label: 'コードをコピー', onSelect: actions.copyCode },
    { id: 'copy-name', label: '銘柄名をコピー', onSelect: actions.copyName },
    { id: 'yahoo', label: 'Yahoo Finance で開く', onSelect: actions.yahoo },
    'separator', remove,
  ];
}
