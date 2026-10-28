import { describe, expect, it, vi } from 'vitest';
import type { ContextMenuItem } from '@/components/shell/context-menu';
import { buildHoldingMenuItems, hasLinkedTransactions, toYahooSymbol, type HoldingMenuActions } from './context-menu-items';

const makeActions = (): HoldingMenuActions => ({ detail: vi.fn(), memo: vi.fn(), record: vi.fn(), edit: vi.fn(), add: vi.fn(),
  watch: vi.fn(), pick: vi.fn(), refresh: vi.fn(), copyCode: vi.fn(), copyName: vi.fn(), yahoo: vi.fn(), remove: vi.fn(), csv: vi.fn(), columns: vi.fn() });
const stock = { symbol: 'AAPL', market: 'US' as const, current_price: 200, price_status: 'live' as const };
const pick = { ...stock, removed_at: null, deleted_at: null };
const entry = (items: ContextMenuItem[], id: string) => {
  const result = items.find((item) => item !== 'separator' && item.id === id);
  if (!result || result === 'separator') throw new Error(`項目がありません: ${id}`);
  return result;
};
const ids = (items: ContextMenuItem[]) => items.map((item) => item === 'separator' ? item : item.id);

describe('保有の右クリックメニュー', () => {
  it.each(['workspace', 'home'] as const)('株式の項目順と操作を既存機能へ接続する (%s)', (variant) => {
    const actions = makeActions();
    const items = buildHoldingMenuItems({ holding: stock, watchlist: [], picks: [], actions, variant });
    expect(ids(items)).toEqual(['detail', 'memo', 'separator', 'record', 'edit', 'add', 'separator', 'watch', 'pick', 'refresh',
      'separator', 'copy-code', 'copy-name', 'yahoo', 'separator', 'remove']);
    expect(entry(items, 'detail').shortcut).toBe('Enter');
    expect(entry(items, 'remove').danger).toBe(true);
    for (const [id, action] of [['detail', 'detail'], ['memo', 'memo'], ['edit', 'edit'], ['add', 'add'], ['pick', 'pick'],
      ['refresh', 'refresh'], ['copy-code', 'copyCode'], ['copy-name', 'copyName'], ['yahoo', 'yahoo'], ['remove', 'remove']] as const) {
      entry(items, id).onSelect?.(); expect(actions[action]).toHaveBeenCalledOnce();
    }
    expect(entry(items, 'pick').disabled).toBe(false);
    const records = entry(items, 'record').children!;
    expect(ids(records)).toEqual(['buy', 'sell', 'dividend']);
    records.forEach((item) => { if (item !== 'separator') item.onSelect?.(); });
    for (const type of ['buy', 'sell', 'dividend']) expect(actions.record).toHaveBeenCalledWith(type);
    const lists = entry(items, 'watch').children!;
    expect(ids(lists)).toEqual(['main', 'sub1', 'sub2', 'sub3', 'sub4']);
    lists.forEach((item) => { if (item !== 'separator') item.onSelect?.(); });
    for (const list of ['main', 'sub1', 'sub2', 'sub3', 'sub4']) expect(actions.watch).toHaveBeenCalledWith(list);
  });

  it('FXも全操作を使え、現金には編集・追加・削除だけを表示する', () => {
    const actions = makeActions();
    const items = buildHoldingMenuItems({ holding: { ...stock, symbol: 'USDJPY', market: 'FX' }, watchlist: [], picks: [], actions });
    expect(entry(items, 'record').children).toHaveLength(3);
    expect(entry(items, 'pick').disabled).toBe(false);
    const cash = buildHoldingMenuItems({ holding: { ...stock, symbol: 'CASH' }, actions });
    expect(ids(cash)).toEqual(['edit', 'add', 'remove']);
    entry(cash, 'add').onSelect?.(); expect(actions.add).toHaveBeenCalledOnce();
  });

  it('空白部分は追加・CSV・列設定を表示する', () => {
    const actions = makeActions();
    const items = buildHoldingMenuItems({ actions });
    expect(ids(items)).toEqual(['add', 'csv', 'columns']);
    items.forEach((item) => { if (item !== 'separator') item.onSelect?.(); });
    for (const action of ['add', 'csv', 'columns'] as const) expect(actions[action]).toHaveBeenCalledOnce();
  });

  it('ホームの空白部分は追加と保有銘柄ページへの移動だけを表示する', () => {
    const actions = { ...makeActions(), portfolio: vi.fn() };
    const items = buildHoldingMenuItems({ variant: 'home', actions });
    expect(ids(items)).toEqual(['add', 'portfolio']);
    expect(entry(items, 'add').label).toBe('保有を追加…');
    expect(entry(items, 'portfolio').label).toBe('保有銘柄ページを開く');
    entry(items, 'add').onSelect?.();
    entry(items, 'portfolio').onSelect?.();
    expect(actions.add).toHaveBeenCalledOnce();
    expect(actions.portfolio).toHaveBeenCalledOnce();
    expect(actions.csv).not.toHaveBeenCalled();
    expect(actions.columns).not.toHaveBeenCalled();
  });

  it.each([stock, { ...stock, symbol: 'CASH' }, { ...stock, symbol: 'USDJPY', market: 'FX' as const }])(
    'ホームの行ありメニューはworkspaceと同じ項目・状態を持つ ($symbol)', (holding) => {
      const input = { holding, watchlist: [], picks: [], actions: makeActions() };
      expect(JSON.stringify(buildHoldingMenuItems({ ...input, variant: 'home' }))).toBe(JSON.stringify(buildHoldingMenuItems(input)));
    }
  );

  it('登録は市場とリストを区別し、論理削除された登録を除外する', () => {
    const watchlist = [{ ...stock, list_key: 'main' as const }, { ...stock, market: 'JP' as const, list_key: 'sub1' as const },
      { ...stock, list_key: 'sub2' as const, deleted_at: '2026-01-01' }];
    const snapshot = structuredClone(watchlist);
    const lists = entry(buildHoldingMenuItems({ holding: stock, watchlist, picks: [], actions: makeActions() }), 'watch').children!;
    expect(entry(lists, 'main')).toMatchObject({ label: '✓ メイン', disabled: true, disabledReason: expect.any(String) });
    for (const id of ['sub1', 'sub2', 'sub3', 'sub4']) expect(entry(lists, id).disabled).toBe(false);
    expect(watchlist).toEqual(snapshot);
  });

  it('現在のピックに同一市場の銘柄がある場合は理由付きで無効にする', () => {
    const items = (picks: Parameters<typeof buildHoldingMenuItems>[0]['picks']) => buildHoldingMenuItems({ holding: stock, watchlist: [], picks, actions: makeActions() });
    expect(entry(items([pick]), 'pick')).toMatchObject({ disabled: true, disabledReason: expect.stringContaining('既に') });
    for (const picks of [[{ ...pick, market: 'JP' as const }], [{ ...pick, removed_at: '2026-01-01' }], [{ ...pick, deleted_at: '2026-01-01' }]]) {
      expect(entry(items(picks), 'pick').disabled).toBe(false);
    }
  });

  it('10件満杯・現在値なし・確認中は誤って追加できない', () => {
    const make = (holding = stock, picks: Parameters<typeof buildHoldingMenuItems>[0]['picks'] = []) =>
      buildHoldingMenuItems({ holding, picks, actions: makeActions() });
    const full = Array.from({ length: 10 }, (_, index) => ({ ...pick, symbol: `TEST${index}` }));
    expect(entry(make(stock, full), 'pick')).toMatchObject({ disabled: true, disabledReason: expect.stringContaining('10件') });
    expect(entry(make({ ...stock, current_price: 0 }), 'pick')).toMatchObject({ disabled: true, disabledReason: expect.stringContaining('現在値') });
    const unavailable = buildHoldingMenuItems({ holding: stock, actions: makeActions() });
    expect(entry(unavailable, 'pick').disabledReason).toContain('確認');
    expect(entry(entry(unavailable, 'watch').children!, 'main').disabledReason).toContain('確認');
    const missing = buildHoldingMenuItems({ holding: { ...stock, price_status: 'missing' }, picks: [], actions: makeActions() });
    expect(entry(missing, 'pick').disabled).toBe(true);
  });
});

describe('Yahooシンボル', () => {
  it.each([
    [' aapl ', 'US', 'AAPL'], ['BRK-B', 'US', 'BRK-B'], ['7203', 'JP', '7203.T'], ['7203.t', 'JP', '7203.T'],
    ['7203.JP', 'JP', '7203.T'], ['USDJPY', 'FX', 'USDJPY=X'], ['usd/jpy', 'FX', 'USDJPY=X'], ['EURUSD=X', 'FX', 'EURUSD=X'],
  ] as const)('%s (%s) → %s', (symbol, market, expected) => {
    expect(toYahooSymbol(symbol, market)).toBe(expected);
  });
});

describe('削除時の連動判定', () => {
  it('未削除でholding_idが一致する記録だけを対象にする', () => {
    expect(hasLinkedTransactions('a', [{ holding_id: 'a' }])).toBe(true);
    expect(hasLinkedTransactions('a', [{ holding_id: 'b' }, { holding_id: 'a', deleted_at: '2026-01-01' }, { holding_id: null }])).toBe(false);
    expect(hasLinkedTransactions('a', [])).toBe(false);
  });
});
