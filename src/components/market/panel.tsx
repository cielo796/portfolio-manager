import type { ReactNode } from 'react';

export function MarketPanel({ title, controls, children }: { title: string; controls?: ReactNode; children: ReactNode }) {
  return <section aria-label={title} className="min-w-0 overflow-hidden rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]">
    <header className="flex min-h-[30px] flex-wrap items-center justify-between gap-1 border-b border-[var(--pm-border)] px-2.5 py-1">
      <h2 className="font-semibold">{title}</h2>{controls}
    </header>
    {children}
  </section>;
}

export function MarketMessage({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <p role={error ? 'alert' : 'status'} className="px-2.5 py-2 text-[11px] pm-muted">{children}</p>;
}

export function MarketToggle<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (value: T) => void }) {
  return <div role="group" aria-label={label} className="flex gap-0.5">
    {options.map(([key, text]) => <button key={key} type="button" aria-pressed={key === value} onClick={() => onChange(key)} className={`pm-button !h-6 !px-2 text-[11px] ${key === value ? '!border-[#6b5226] !bg-[var(--pm-active-bg)] !text-[var(--pm-active-text)]' : ''}`}>{text}</button>)}
  </div>;
}
