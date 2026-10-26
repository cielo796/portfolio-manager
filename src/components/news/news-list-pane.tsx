'use client';

import type { NewsItem } from '@/types';
import { formatFetchedAt, formatNewsDateTime } from './format';
import { NEWS_LIST_COLUMNS, newsListGridStyle, type NewsListColumn } from './list-columns';
import { NewsColumnSeparator } from './news-column-separator';
import type { NewsListColumnControls } from './use-news-list-columns';

type NewsListPaneProps = {
  columns: NewsListColumnControls;
  news: NewsItem[];
  selectedId: string | null;
  onSelect: (item: NewsItem) => void;
  fetchedAt: Date | null;
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  onRefresh: () => void;
  onRetry: () => void;
};

export function NewsListPane({
  columns,
  news,
  selectedId,
  onSelect,
  fetchedAt,
  loading,
  refreshing,
  error,
  onRefresh,
  onRetry,
}: NewsListPaneProps) {
  const gridStyle = newsListGridStyle(columns.widths);
  return (
    <section aria-labelledby="news-list" className="flex min-h-0 min-w-0 flex-col rounded border border-[var(--pm-border)] bg-[var(--pm-panel)] min-[900px]:h-full">
      <div className="flex min-h-[30px] shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--pm-border)] px-2.5 py-1">
        <h2 id="news-list" className="shrink-0 text-xs font-semibold">見出し</h2>
        <span className="shrink-0 text-[11px] text-[var(--pm-muted)]">{news.length}件・新しい順</span>
        <span className="flex-1" />
        <span className="shrink-0 tabular-nums text-[11px] text-[var(--pm-muted)]">取得 {formatFetchedAt(fetchedAt)}</span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading || refreshing}
          className="pm-button !h-[22px] !px-2 !text-[11px]"
        >
          {refreshing ? '更新中…' : 'ニュース更新'}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto max-[899px]:max-h-[calc(60vh+22px)]">
        <div aria-label="ニュース一覧の列" className="sticky top-0 z-10 grid h-[22px] shrink-0 items-center gap-2 border-b border-[var(--pm-border)] bg-[var(--pm-heading)] px-2.5 text-[var(--pm-muted)]" style={gridStyle}>
          {(Object.keys(NEWS_LIST_COLUMNS) as NewsListColumn[]).map((column) => <span key={column} className="relative h-full content-center">
            {NEWS_LIST_COLUMNS[column].label}<NewsColumnSeparator column={column} controls={columns} />
          </span>)}
          <span>見出し</span>
        </div>
        {error ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p>ニュースを取得できませんでした</p>
            <button type="button" onClick={onRetry} className="pm-button">再試行</button>
          </div>
        ) : loading ? (
          <p className="p-6 text-center text-[var(--pm-muted)]">読み込み中…</p>
        ) : news.length === 0 ? (
          <p className="p-6 text-center text-[var(--pm-muted)]">条件に一致するニュースはありません。</p>
        ) : (
          <div aria-label="ニュース見出し一覧">
            {news.map((item) => {
              const selected = item.id === selectedId;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected}
                  title={item.title}
                  onClick={() => onSelect(item)}
                  className={`grid w-full items-center gap-2 border-b border-[var(--pm-divider)] px-2.5 text-left ${selected ? 'bg-[var(--pm-selected-row)]' : 'hover:bg-[var(--pm-heading)]'}`}
                  style={{ ...gridStyle, height: 'var(--pm-row-h)' }}
                >
                  <span className="truncate whitespace-nowrap tabular-nums text-[var(--pm-muted)]">{formatNewsDateTime(item.published_at)}</span>
                  <span className="truncate text-[var(--pm-link)]">{item.symbol}</span>
                  <span className="truncate text-[var(--pm-muted)]">{item.source}</span>
                  <span className="truncate">{item.title}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
