'use client';

import type { NewsFilterMode, NewsSymbolOption } from './types';

const MODES: [NewsFilterMode, string][] = [
  ['holdings', '保有'],
  ['watchlist', '登録'],
  ['all', 'すべて'],
];

type NewsFilterPaneProps = {
  mode: NewsFilterMode;
  onModeChange: (mode: NewsFilterMode) => void;
  symbols: NewsSymbolOption[];
  excludedSymbols: Set<string>;
  onToggleSymbol: (symbol: string) => void;
  sources: string[];
  excludedSources: Set<string>;
  onToggleSource: (source: string) => void;
};

export function NewsFilterPane({
  mode,
  onModeChange,
  symbols,
  excludedSymbols,
  onToggleSymbol,
  sources,
  excludedSources,
  onToggleSource,
}: NewsFilterPaneProps) {
  return (
    <section aria-labelledby="news-filter" className="flex min-h-0 min-w-0 flex-col rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]">
      <div className="flex h-[30px] shrink-0 items-center border-b border-[var(--pm-border)] px-2.5">
        <h2 id="news-filter" className="text-xs font-semibold">絞り込み</h2>
      </div>
      <div role="group" aria-label="銘柄の範囲" className="flex shrink-0 px-2.5 py-2">
        {MODES.map(([value, label], index) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => onModeChange(value)}
            className={`h-6 border px-2.5 text-[11px] ${index === 0 ? 'rounded-l' : ''} ${index === MODES.length - 1 ? 'rounded-r' : ''} ${index > 0 ? '-ml-px' : ''} ${
              mode === value
                ? 'border-[#6b5226] bg-[var(--pm-active-bg)] text-[var(--pm-active-text)]'
                : 'border-[var(--pm-input-border)] bg-[#1d2530] text-[#c3ccd8] hover:border-[var(--pm-accent)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto pb-2">
        <fieldset className="m-0 border-0 p-0">
          <legend className="px-2.5 py-1 text-[11px] text-[var(--pm-muted)]">銘柄</legend>
          {symbols.map((item) => (
            <label key={item.symbol} className="flex h-6 items-center gap-2 px-2.5">
              <input
                type="checkbox"
                checked={!excludedSymbols.has(item.symbol)}
                onChange={() => onToggleSymbol(item.symbol)}
                className="accent-[var(--pm-accent)]"
              />
              <span className="w-[52px] shrink-0 truncate text-[var(--pm-muted)]">{item.symbol}</span>
              <span className="min-w-0 flex-1 truncate" title={item.name}>{item.name}</span>
              <span className="shrink-0 tabular-nums text-[var(--pm-muted)]">{item.count}</span>
            </label>
          ))}
          {symbols.length === 0 && <p className="px-2.5 py-1 text-[var(--pm-muted)]">銘柄はありません</p>}
        </fieldset>
        <fieldset className="m-0 mt-2 border-0 p-0">
          <legend className="px-2.5 py-1 text-[11px] text-[var(--pm-muted)]">配信元</legend>
          {sources.map((source) => (
            <label key={source} className="flex h-6 items-center gap-2 px-2.5">
              <input
                type="checkbox"
                checked={!excludedSources.has(source)}
                onChange={() => onToggleSource(source)}
                className="accent-[var(--pm-accent)]"
              />
              <span className="min-w-0 flex-1 truncate" title={source}>{source}</span>
            </label>
          ))}
          {sources.length === 0 && <p className="px-2.5 py-1 text-[var(--pm-muted)]">配信元はありません</p>}
        </fieldset>
      </div>
    </section>
  );
}
