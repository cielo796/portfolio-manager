import Link from 'next/link';
import type { ReactNode } from 'react';

export function HomePanel({ title, href, link, children, bodyClassName = '' }: { title: string; href?: string; link?: string; children: ReactNode; bodyClassName?: string }) {
  return <section aria-label={title} className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded border border-[var(--pm-border)] bg-[var(--pm-panel)] min-[1100px]:h-full">
    <header className="flex h-[30px] shrink-0 items-center gap-2 border-b border-[var(--pm-border)] bg-[var(--pm-heading)] px-2.5">
      <h2 className="min-w-0 flex-1 truncate text-xs font-semibold">{title}</h2>
      {href && <Link href={href} className="shrink-0 text-[var(--pm-link)] hover:underline">{link} →</Link>}
    </header>
    <div className={`min-h-0 min-w-0 flex-1 overflow-auto ${bodyClassName}`}>{children}</div>
  </section>;
}

export function PanelSkeleton() {
  return <div role="status" aria-label="取得中" className="space-y-2 p-3">
    {[0, 1, 2, 3].map((index) => <div key={index} className="h-4 animate-pulse rounded bg-[var(--pm-input-border)]" style={{ width: `${95 - index * 12}%` }} />)}
  </div>;
}

export function PanelError({ retry }: { retry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-2 p-3 pm-muted">
    <span>取得できませんでした</span><button type="button" onClick={retry} className="pm-button">再試行</button>
  </div>;
}

export function PanelEmpty({ children }: { children: ReactNode }) {
  return <p className="p-3 pm-muted">{children}</p>;
}
