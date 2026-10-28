'use client';

import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

export type ContextMenuItem = {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  disabledReason?: string;
  danger?: boolean;
  children?: ContextMenuItem[];
  onSelect?: () => void;
} | 'separator';

type Point = { x: number; y: number; parentLeft?: number };

function MenuLevel({ items, point, label, close, back }: {
  items: ContextMenuItem[]; point: Point; label: string; close: () => void; back?: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [child, setChild] = useState<{ id: string; point: Point }>();
  const id = useId();
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    const x = point.parentLeft !== undefined && point.x + width > window.innerWidth - 4 ? point.parentLeft - width : point.x;
    element.style.left = `${Math.max(4, Math.min(x, window.innerWidth - width - 4))}px`;
    element.style.top = `${Math.max(4, Math.min(point.y, window.innerHeight - height - 4))}px`;
    element.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [point]);

  const openChild = (item: Exclude<ContextMenuItem, string>, button: HTMLButtonElement) => {
    if (item.disabled || !item.children?.length) { setChild(undefined); return; }
    if (child?.id === item.id) {
      document.getElementById(`${id}-child`)?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
      return;
    }
    const rect = button.getBoundingClientRect();
    setChild({ id: item.id, point: { x: rect.right, y: rect.top, parentLeft: rect.left } });
  };
  const selected = items.find((item) => item !== 'separator' && item.id === child?.id);
  const style: CSSProperties = { left: point.x, top: point.y, maxHeight: 'calc(100vh - 8px)', maxWidth: 'calc(100vw - 8px)' };
  return <>
    <div ref={menu} role="menu" aria-label={label} style={style} className="fixed min-w-48 overflow-y-auto rounded border border-[var(--pm-border)] bg-[var(--pm-panel)] py-1 text-[12px] text-[var(--pm-text)] shadow-xl" onKeyDown={(event) => {
      event.stopPropagation();
      const entries = [...buttons.current.values()];
      const index = entries.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
        event.preventDefault(); setChild(undefined);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length;
        entries[next]?.focus();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        const item = items.find((entry) => entry !== 'separator' && entry.id === entries[index]?.dataset.itemId);
        if (item && item !== 'separator' && entries[index]) openChild(item, entries[index]);
      } else if (event.key === 'ArrowLeft' && back) { event.preventDefault(); back(); }
      else if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); close(); }
    }}>
      {items.map((item, index) => item === 'separator'
        ? <div key={`separator-${index}`} role="separator" className="my-1 border-t border-[var(--pm-border)]" />
        : <button key={item.id} ref={(element) => { if (element) buttons.current.set(item.id, element); else buttons.current.delete(item.id); }}
          type="button" role="menuitem" tabIndex={-1} data-item-id={item.id} aria-disabled={item.disabled || undefined}
          aria-haspopup={item.children ? 'menu' : undefined} aria-expanded={item.children ? child?.id === item.id : undefined}
          aria-controls={item.children && child?.id === item.id ? `${id}-child` : undefined}
          title={item.disabled ? item.disabledReason : undefined} aria-label={item.label}
          aria-describedby={item.disabled && item.disabledReason ? `${id}-${item.id}-reason` : undefined}
          onMouseEnter={(event) => { event.currentTarget.focus({ preventScroll: true }); openChild(item, event.currentTarget); }}
          onClick={(event) => {
            if (item.disabled) return;
            if (item.children) { openChild(item, event.currentTarget); return; }
            close(); item.onSelect?.();
          }}
          className={`flex h-6 w-full items-center gap-5 whitespace-nowrap px-3 text-left outline-none hover:bg-[var(--pm-selected-row)] focus:bg-[var(--pm-selected-row)] ${item.disabled ? 'opacity-50' : ''} ${item.danger ? 'text-[#ff5c5c]' : ''}`}>
          <span className="flex-1">{item.label}</span><span className="ml-auto text-[11px] pm-muted">{item.children ? '▶' : item.shortcut}</span>
          {item.disabled && item.disabledReason && <span id={`${id}-${item.id}-reason`} className="sr-only">{item.disabledReason}</span>}
        </button>)}
    </div>
    {child && selected && selected !== 'separator' && selected.children && <div id={`${id}-child`}>
      <MenuLevel key={child.id} items={selected.children} point={child.point} label={selected.label} close={close} back={() => {
        setChild(undefined); buttons.current.get(child.id)?.focus();
      }} />
    </div>}
  </>;
}

export function ContextMenu({ items, x, y, returnFocus, onClose }: {
  items: ContextMenuItem[]; x: number; y: number; returnFocus: HTMLElement | null; onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const point = useMemo(() => ({ x, y }), [x, y]);
  const close = () => { if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); onClose(); };
  const latestClose = useRef(close);
  useLayoutEffect(() => { latestClose.current = close; });
  useLayoutEffect(() => {
    const dismiss = () => latestClose.current();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) dismiss(); };
    const scroll = (event: Event) => { if (!root.current?.contains(event.target as Node)) dismiss(); };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('contextmenu', dismiss, true);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('contextmenu', dismiss, true);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
    };
  }, []);
  return createPortal(<div ref={root} className="fixed inset-0 z-[100] pointer-events-none" onContextMenu={(event) => event.preventDefault()}>
    <div className="pointer-events-auto"><MenuLevel items={items} point={point} label="操作メニュー" close={close} /></div>
  </div>, document.body);
}
