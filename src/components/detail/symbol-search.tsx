'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DetailSymbol } from '@/types';
import { detailHref, fallbackSymbol, searchSymbols, useDetailCatalog, useDetailResource, type SearchTickers } from './data';

function SearchOptions({ items, fallback, active, loading, error, choose, select }: { items: DetailSymbol[]; fallback: boolean; active: number; loading: boolean; error: boolean; choose: (href: string) => void; select: (index: number) => void }) {
  return <div id="pm-symbol-options" role="listbox" aria-label="銘柄候補" className="absolute left-0 top-8 z-[80] max-h-[65vh] w-[min(360px,85vw)] overflow-auto rounded border border-[var(--pm-input-border)] bg-[var(--pm-panel)] shadow-xl">
    {items.map((item, i) => <button type="button" role="option" aria-selected={i === active} id={`pm-symbol-option-${i}`} key={`${item.symbol}|${item.market}`} data-search-href={detailHref(item)} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => select(i)} onClick={() => choose(detailHref(item))} className={`flex w-full items-center gap-2 px-3 py-2 text-left ${i === active ? 'bg-[var(--pm-selected-row)]' : ''}`}>
      <span className="font-semibold text-[var(--pm-link)]">{item.symbol}</span><span className="min-w-0 flex-1 truncate">{fallback ? `（${item.market === 'JP' ? '日本' : '米国'}）で開く` : item.name}</span><span className="pm-muted">{item.market}</span>
    </button>)}
    {items.length === 0 && <p role="status" className="p-3 pm-muted">{loading ? '候補を読み込み中…' : '候補がありません。'}</p>}
    {error && <p role="status" className="px-3 py-1 text-[11px] pm-muted">一部の検索対象を取得できませんでした。</p>}
  </div>;
}

export function SymbolSearch() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const catalog = useDetailCatalog();
  const tickers = useDetailResource<SearchTickers>('/api/tickers');
  const options = searchSymbols([...catalog.holdings, ...catalog.watchlist, ...(tickers.data?.tickerPresets ?? [])], query);
  const fallback = options.length === 0 ? fallbackSymbol(query) : undefined;
  const items = fallback ? [fallback] : options;
  const active = items.length ? Math.min(index, items.length - 1) : -1;
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.current?.focus(); input.current?.select(); }
    };
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('keydown', shortcut);
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', shortcut); document.removeEventListener('pointerdown', outside); };
  }, []);
  const choose = (href: string) => { setOpen(false); setQuery(''); setIndex(0); input.current?.blur(); router.push(href); };
  const expanded = open && query.trim().length > 0;
  return <div ref={root} className="relative min-w-24 max-w-64 flex-1">
    <input ref={input} role="combobox" aria-label="銘柄検索" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? 'pm-symbol-options' : undefined} aria-activedescendant={expanded && active >= 0 ? `pm-symbol-option-${active}` : undefined} placeholder="銘柄検索 Ctrl+K" value={query} onFocus={() => { setOpen(true); void catalog.reload(); void tickers.reload(); }} onBlur={(event) => { if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false); }} onChange={(event) => { setQuery(event.target.value); setIndex(0); setOpen(true); }} onKeyDown={(event) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Escape') { setOpen(false); return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); setOpen(true);
        const count = items.length;
        if (count) setIndex((previous) => (Math.min(previous, count - 1) + (event.key === 'ArrowDown' ? 1 : count - 1)) % count);
      }
      if (event.key === 'Enter' && expanded && active >= 0) { event.preventDefault(); choose(detailHref(items[active])); }
    }} className="h-7 w-full rounded border border-[var(--pm-input-border)] bg-[var(--pm-bg)] px-2 text-xs" />
    {expanded && <SearchOptions items={items} fallback={Boolean(fallback)} active={active} loading={catalog.loading || tickers.loading} error={Boolean(catalog.error || tickers.error)} choose={choose} select={setIndex} />}
  </div>;
}
