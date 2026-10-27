'use client';

import { useId } from 'react';
import type { ReactNode } from 'react';

export type AllocationView = 'holding' | 'sector' | 'market';
const VIEWS = [['holding', '銘柄別'], ['sector', 'セクター別'], ['market', '市場別']] as const;

export function AllocationTabs({ view, onChange, market = false, children }: {
  view: AllocationView;
  onChange: (view: AllocationView) => void;
  market?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const views = VIEWS.filter(([key]) => market || key !== 'market');
  return <>
    <div role="tablist" aria-label="配分の内訳" className="mb-1 flex gap-1">
      {views.map(([key, label], index) => <button key={key} type="button" role="tab" id={`${id}-${key}`} aria-selected={view === key} aria-controls={`${id}-panel`} tabIndex={view === key ? 0 : -1} onClick={() => onChange(key)} onKeyDown={(event) => {
        const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!offset && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? views.length - 1 : (index + offset + views.length) % views.length;
        onChange(views[next][0]);
        document.getElementById(`${id}-${views[next][0]}`)?.focus();
      }} className={`pm-button !px-2 !text-[11px] ${view === key ? '!border-[var(--pm-accent)] !bg-[var(--pm-active-bg)] !text-[var(--pm-active-text)]' : ''}`}>{label}</button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${view}`}>{children}</div>
  </>;
}
