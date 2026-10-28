import { Children, isValidElement, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Holding } from '@/types';
import { computeHoldingsWithPrices, computeSummary } from '@/lib/portfolio-calc';
import { createHoldingRows } from '@/components/holdings/columns';
import { HomeHoldings, HomeMovers } from './portfolio-panels';

type Element = ReactElement<HTMLAttributes<HTMLElement> & { children?: ReactNode; 'data-holding-menu'?: string }>;
function descendants(node: ReactNode): Element[] {
  return Children.toArray(node).flatMap((child) => isValidElement(child)
    ? [child as Element, ...descendants((child as Element).props.children)] : []);
}

const holding = (symbol: string): Holding => ({ id: symbol, symbol, market: 'US', portfolio_id: 'account',
  shares: 2, avg_cost: 100, sort_order: 0, created_at: '', updated_at: '' });
const holdings = computeHoldingsWithPrices([holding('AAPL'), holding('CASH')], {}, 150);
const summary = computeSummary(holdings, 150);
const rows = createHoldingRows(holdings, [], {}, 150, summary.total_value_jpy);
const state = { loading: false, error: false, retry: vi.fn() };
const target = (panel = 'holdings') => ({ dataset: { holdingMenu: panel },
  getBoundingClientRect: () => ({ left: 20, bottom: 80 }) }) as unknown as HTMLElement;

function render(panel: 'holdings' | 'movers', activePanel?: string) {
  const menu = { openMenu: vi.fn(), activeRowId: activePanel ? 'AAPL' : undefined,
    activeTarget: activePanel ? target(activePanel) : undefined };
  const tree = panel === 'holdings' ? HomeHoldings({ rows, summary, menu, ...state }) : HomeMovers({ rows, menu, ...state });
  const elements = descendants(tree);
  const dataRows = elements.filter((element) => element.props['data-holding-menu']);
  return { menu, tree, elements, dataRows };
}

describe.each(['holdings', 'movers'] as const)('ホームの%sカード', (panel) => {
  it('行と行内リンクの右クリックは対象行のメニューを開いて伝播を止める', () => {
    const { menu, dataRows } = render(panel);
    const row = dataRows[0];
    expect(row.props.tabIndex).toBe(0);
    expect(descendants(row).some((element) => typeof (element.props as { href?: string }).href === 'string')).toBe(true);
    const event = { clientX: 45, clientY: 60, currentTarget: target(panel), target: { tagName: 'A' },
      preventDefault: vi.fn(), stopPropagation: vi.fn() };
    row.props.onContextMenu!(event as unknown as Parameters<NonNullable<typeof row.props.onContextMenu>>[0]);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(menu.openMenu).toHaveBeenCalledExactlyOnceWith(45, 60, event.currentTarget, rows[0]);
  });

  it.each([['F10', true], ['ContextMenu', false]] as const)('%sキーで行の下にメニューを開く', (key, shiftKey) => {
    const { menu, dataRows } = render(panel);
    const row = dataRows[0];
    const event = { key, shiftKey, currentTarget: target(panel), preventDefault: vi.fn(), stopPropagation: vi.fn() };
    row.props.onKeyDown!(event as unknown as Parameters<NonNullable<typeof row.props.onKeyDown>>[0]);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(menu.openMenu).toHaveBeenCalledExactlyOnceWith(36, 80, event.currentTarget, rows[0]);
  });

  it('通常のF10では開かず、メニュー中は操作したカードの行だけを選択する', () => {
    const { menu, dataRows } = render(panel, panel);
    const row = dataRows[0];
    row.props.onKeyDown!({ key: 'F10', shiftKey: false } as Parameters<NonNullable<typeof row.props.onKeyDown>>[0]);
    expect(menu.openMenu).not.toHaveBeenCalled();
    expect(row.props['aria-selected']).toBe(true);
    expect(row.props.className).toContain('aria-selected:bg-[var(--pm-selected-row)]');
    expect(render(panel, panel === 'holdings' ? 'movers' : 'holdings').dataRows[0].props['aria-selected']).toBe(false);
    expect(render(panel).dataRows[0].props['aria-selected']).toBe(false);
  });

  it('空白は行なしメニュー、ヘッダー・合計行はメニューを開かない', () => {
    const { menu, tree, elements } = render(panel);
    const area = (tree.props as { children: ReactElement<{ menu: typeof menu; children: ReactNode }> }).children;
    const component = area.type as (props: typeof area.props) => Element;
    const wrapper = component(area.props);
    const event = { clientX: 10, clientY: 15, currentTarget: target(panel), target: { closest: vi.fn(() => null) },
      preventDefault: vi.fn(), stopPropagation: vi.fn() };
    wrapper.props.onContextMenu!(event as unknown as Parameters<NonNullable<typeof wrapper.props.onContextMenu>>[0]);
    expect(menu.openMenu).toHaveBeenCalledExactlyOnceWith(10, 15, event.currentTarget);
    menu.openMenu.mockClear();
    for (const row of elements.filter((element) => (element.type === 'tr' || element.props.role === 'row') && !element.props['data-holding-menu'])) {
      expect(row.props.onContextMenu).toBeUndefined();
      const rowEvent = { ...event, target: { closest: vi.fn(() => target(panel)) } };
      wrapper.props.onContextMenu!(rowEvent as unknown as Parameters<NonNullable<typeof wrapper.props.onContextMenu>>[0]);
    }
    expect(menu.openMenu).not.toHaveBeenCalled();
  });
});

it('現金は保有カードのメニュー対象になり、騰落カードでは従来どおり除外する', () => {
  const { menu, dataRows } = render('holdings');
  expect(dataRows).toHaveLength(2);
  const cash = dataRows[1];
  const event = { clientX: 0, clientY: 0, currentTarget: target(), preventDefault: vi.fn(), stopPropagation: vi.fn() };
  cash.props.onContextMenu!(event as unknown as Parameters<NonNullable<typeof cash.props.onContextMenu>>[0]);
  expect(menu.openMenu.mock.calls[0][3]).toBe(rows[1]);
  expect(render('movers').dataRows).toHaveLength(1);
});
