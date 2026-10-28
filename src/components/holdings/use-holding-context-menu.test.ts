import { Children, type ComponentProps, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockExchangeRate, mockHoldings, mockPortfolios, mockStockPrices } from '@/lib/mock-data';
import { computeHoldingsWithPrices, computeSummary } from '@/lib/portfolio-calc';
import { createHoldingRows } from './columns';
import { ContextMenu, type ContextMenuItem } from '@/components/shell/context-menu';
import { HoldingActionModal } from './action-modal';
import { DeleteHoldingDialog } from './delete-dialog';
import { AddHoldingModal } from '@/components/add-holding-modal';
import { EditHoldingModal } from '@/components/edit-holding-modal';
import HomePage from '@/app/page';
import { HomeLayout } from '@/components/home/home-layout';
import { useHoldingContextMenu } from './use-holding-context-menu';

const mocks = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0, push: vi.fn(), readJson: vi.fn(), watchReload: vi.fn(), picksReload: vi.fn(),
  reloadPortfolioData: vi.fn(), addHolding: vi.fn(), updateHolding: vi.fn(), removeHolding: vi.fn(),
}));

// DOMを使わず、イベント間のフック状態を保持してコールバックの接続を検証する。
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = mocks.cursor++;
    if (!(index in mocks.slots)) mocks.slots[index] = initial;
    return [mocks.slots[index], (value: unknown) => {
      mocks.slots[index] = typeof value === 'function' ? value(mocks.slots[index]) : value;
    }];
  },
  useRef: (initial: unknown) => {
    const index = mocks.cursor++;
    if (!(index in mocks.slots)) mocks.slots[index] = { current: initial };
    return mocks.slots[index];
  },
  useMemo: (compute: () => unknown) => compute(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/components/detail/data', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/components/detail/data')>(),
  readJson: mocks.readJson,
  useDetailResource: (url: string) => url === '/api/watchlist'
    ? { data: { watchlistItems: [] }, loading: false, reload: mocks.watchReload }
    : { data: { topPicks: [] }, loading: false, reload: mocks.picksReload },
}));
vi.mock('@/components/shell/refresh-context', () => ({ usePageRefresh: vi.fn() }));
vi.mock('@/hooks/use-ticker-presets', () => ({ useTickerPresets: () => ({ tickerPresets: [] }) }));
vi.mock('@/hooks/use-portfolio', () => ({ usePortfolio: () => ({
  portfolios: mockPortfolios, holdings, stockPrices: mockStockPrices, summary, exchangeRate: mockExchangeRate,
  reloadPortfolioData: mocks.reloadPortfolioData, addHolding: mocks.addHolding,
  updateHolding: mocks.updateHolding, removeHolding: mocks.removeHolding,
}) }));

const holdings = computeHoldingsWithPrices(mockHoldings, mockStockPrices, mockExchangeRate.rate);
const summary = computeSummary(holdings, mockExchangeRate.rate);
const rows = createHoldingRows(holdings, mockPortfolios, mockStockPrices, mockExchangeRate.rate, summary.total_value_jpy);
const options = { onAdd: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onSelect: vi.fn(), onCsv: vi.fn(), onColumns: vi.fn() };
const target = () => ({ focus: vi.fn(), dataset: { holdingMenu: 'holdings' } }) as unknown as HTMLElement;

function MenuHarness(variant: 'workspace' | 'home') {
  return useHoldingContextMenu({ ...options, variant });
}
function renderMenu(variant: 'workspace' | 'home' = 'workspace') {
  mocks.cursor = 0;
  return MenuHarness(variant);
}
function PageHarness() { mocks.cursor = 0; return HomePage(); }
function child<P>(element: ReactElement, type: unknown): ReactElement<P> {
  const children = Children.toArray((element.props as { children: ReactElement[] }).children) as ReactElement[];
  const found = children.find((entry) => entry.type === type);
  if (!found) throw new Error('要素がありません');
  return found as ReactElement<P>;
}
function item(items: ContextMenuItem[], id: string): Exclude<ContextMenuItem, string> {
  const found = items.find((entry) => entry !== 'separator' && entry.id === id);
  if (!found || found === 'separator') throw new Error(`項目がありません: ${id}`);
  return found;
}
const menuProps = (menu: ReturnType<typeof MenuHarness>) => child<ComponentProps<typeof ContextMenu>>(menu.element, ContextMenu).props;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => { mocks.slots = []; mocks.cursor = 0; vi.clearAllMocks(); mocks.readJson.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('共通の保有メニュー制御', () => {
  it('開いた行を選択・フォーカスし、登録状況を再取得して閉じると対象を解除する', () => {
    const element = target();
    renderMenu().openMenu(30, 50, element, rows[0]);
    const menu = renderMenu();
    expect(options.onSelect).toHaveBeenCalledWith(rows[0]);
    expect(element.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(mocks.watchReload).toHaveBeenCalledOnce();
    expect(mocks.picksReload).toHaveBeenCalledOnce();
    expect(menu.activeRowId).toBe(rows[0].holding.id);
    expect(menuProps(menu)).toMatchObject({ x: 30, y: 50, returnFocus: element });
    menuProps(menu).onClose();
    expect(renderMenu().activeRowId).toBeUndefined();
    expect(renderMenu().activeTarget).toBeUndefined();
  });

  it('workspaceの空白メニューは追加・CSV・列設定の既存操作を呼ぶ', () => {
    renderMenu().openMenu(0, 0, target());
    const items = menuProps(renderMenu()).items;
    for (const id of ['add', 'csv', 'columns']) item(items, id).onSelect?.();
    expect(options.onAdd).toHaveBeenCalledOnce();
    expect(options.onCsv).toHaveBeenCalledOnce();
    expect(options.onColumns).toHaveBeenCalledOnce();
  });

  it('ホームの空白メニューはホーム内追加と保有銘柄ページへの遷移を呼ぶ', () => {
    renderMenu('home').openMenu(0, 0, target());
    const items = menuProps(renderMenu('home')).items;
    item(items, 'add').onSelect?.(); item(items, 'portfolio').onSelect?.();
    expect(options.onAdd).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledWith('/portfolio');
  });

  it('詳細・メモ・編集の操作先を維持する', () => {
    renderMenu().openMenu(0, 0, target(), rows[0]);
    const items = menuProps(renderMenu()).items;
    for (const id of ['detail', 'memo', 'edit']) item(items, id).onSelect?.();
    expect(mocks.push).toHaveBeenCalledWith(`/detail?symbol=${rows[0].holding.symbol}&market=US`);
    expect(mocks.push).toHaveBeenCalledWith(`/memos?symbol=${rows[0].holding.symbol}&market=US&new=1`);
    expect(options.onEdit).toHaveBeenCalledWith(rows[0]);
  });

  it.each(['buy', 'sell', 'dividend', 'add'] as const)('%s操作は行を指定した既存モーダルを開く', (mode) => {
    renderMenu('home').openMenu(0, 0, target(), rows[0]);
    const items = menuProps(renderMenu('home')).items;
    (mode === 'add' ? item(items, 'add') : item(item(items, 'record').children!, mode)).onSelect?.();
    const modal = child<ComponentProps<typeof HoldingActionModal>>(renderMenu('home').element, HoldingActionModal);
    expect(modal.props).toMatchObject({ mode, row: rows[0] });
    modal.props.onClose();
    expect(Children.toArray(renderMenu('home').element.props.children)).toHaveLength(1);
  });

  it('削除は共通の連動確認ダイアログから呼び出す', async () => {
    renderMenu('home').openMenu(0, 0, target(), rows[0]);
    item(menuProps(renderMenu('home')).items, 'remove').onSelect?.();
    const dialog = child<ComponentProps<typeof DeleteHoldingDialog>>(renderMenu('home').element, DeleteHoldingDialog);
    expect(dialog.props.row).toBe(rows[0]);
    await dialog.props.onDelete();
    expect(options.onDelete).toHaveBeenCalledExactlyOnceWith(rows[0]);
  });

  it('登録とピックは対象銘柄を送信し、失敗時は共通エラーを表示する', async () => {
    renderMenu('home').openMenu(0, 0, target(), rows[0]);
    const items = menuProps(renderMenu('home')).items;
    item(item(items, 'watch').children!, 'sub2').onSelect?.();
    await settle();
    expect(mocks.readJson).toHaveBeenCalledWith('/api/watchlist', undefined, expect.objectContaining({
      symbol: rows[0].holding.symbol, market: 'US', list_key: 'sub2',
    }));
    expect(mocks.watchReload).toHaveBeenCalledTimes(2);
    mocks.readJson.mockRejectedValueOnce(new Error('保存失敗'));
    item(items, 'pick').onSelect?.(); await settle();
    expect(renderMenu('home').errorElement?.props.children).toBe('保存失敗');
  });
});

describe('ホーム内の保有変更', () => {
  it('行なし追加はホームで開き、保存後に再取得する', async () => {
    const layout = child<ComponentProps<typeof HomeLayout>>(PageHarness(), HomeLayout);
    const card = layout.props.holdings as ReactElement<{ menu: ReturnType<typeof MenuHarness> }>;
    card.props.menu.openMenu(0, 0, target());
    const page = PageHarness();
    const shared = page.props.children[1] as ReactElement;
    item(child<ComponentProps<typeof ContextMenu>>(shared, ContextMenu).props.items, 'add').onSelect?.();
    const modal = child<ComponentProps<typeof AddHoldingModal>>(PageHarness(), AddHoldingModal);
    const input = { portfolio_id: '1', symbol: 'AAPL', market: 'US' as const, shares: 2, avg_cost: 100 };
    await modal.props.onSubmit(input);
    expect(mocks.addHolding).toHaveBeenCalledWith(input);
    expect(mocks.reloadPortfolioData).toHaveBeenCalledOnce();
  });

  it('ホームの削除確認から削除し、成功後に保有データを再取得する', async () => {
    const layout = child<ComponentProps<typeof HomeLayout>>(PageHarness(), HomeLayout);
    const card = layout.props.holdings as ReactElement<{ menu: ReturnType<typeof MenuHarness> }>;
    card.props.menu.openMenu(0, 0, target(), rows[0]);
    const shared = PageHarness().props.children[1] as ReactElement;
    item(child<ComponentProps<typeof ContextMenu>>(shared, ContextMenu).props.items, 'remove').onSelect?.();
    const next = PageHarness().props.children[1] as ReactElement;
    const dialog = child<ComponentProps<typeof DeleteHoldingDialog>>(next, DeleteHoldingDialog);
    await dialog.props.onDelete();
    expect(mocks.removeHolding).toHaveBeenCalledWith(rows[0].holding.id);
    expect(mocks.reloadPortfolioData).toHaveBeenCalledOnce();
  });

  it('編集と削除はホーム内で保存し、失敗時はエラーを表示して再取得しない', async () => {
    const page = PageHarness();
    const layout = page.props.children[0] as ReactElement<{ holdings: ReactElement<{ menu: ReturnType<typeof MenuHarness> }> }>;
    layout.props.holdings.props.menu.openMenu(0, 0, target(), rows[0]);
    const shared = PageHarness().props.children[1] as ReactElement;
    item(child<ComponentProps<typeof ContextMenu>>(shared, ContextMenu).props.items, 'edit').onSelect?.();
    const modal = child<ComponentProps<typeof EditHoldingModal>>(PageHarness(), EditHoldingModal);
    expect(modal.props.holding?.id).toBe(rows[0].holding.id);
    await modal.props.onSave(rows[0].holding.id, { shares: 3, avg_cost: 100 });
    expect(mocks.updateHolding).toHaveBeenCalledWith(rows[0].holding.id, { shares: 3, avg_cost: 100 });
    expect(mocks.reloadPortfolioData).toHaveBeenCalledOnce();
    mocks.removeHolding.mockRejectedValueOnce(new Error('削除失敗'));
    await expect(modal.props.onClosePosition(rows[0].holding.id)).rejects.toThrow('削除失敗');
    expect(mocks.reloadPortfolioData).toHaveBeenCalledOnce();
    const next = child<ComponentProps<typeof HomeLayout>>(PageHarness(), HomeLayout);
    const card = next.props.holdings as ReactElement<{ menu: ReturnType<typeof MenuHarness> }>;
    expect(card.props.menu.errorElement?.props.children).toBe('変更の保存に失敗しました。もう一度お試しください。');
  });
});
