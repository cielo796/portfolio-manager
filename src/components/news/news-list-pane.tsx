'use client';

import type { NewsItem } from '@/types';
import { formatFetchedAt, formatNewsDateTime } from './format';

const ROW_GRID = 'grid-cols-[78px_60px_96px_minmax(0,1fr)]';

type NewsListPaneProps = {
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
  return (
    <section aria-labelledby="news-list" className="flex min-h-0 min-w-0 flex-col rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]">
      <div className="flex h-[30px] shrink-0 items-center gap-2 border-b border-[var(--pm-border)] px-2.5">
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
      <div aria-hidden="true" className={`grid ${ROW_GRID} h-[22px] shrink-0 items-center gap-2 border-b border-[var(--pm-border)] bg-[var(--pm-heading)] px-2.5 text-[var(--pm-muted)]`}>
        <span>日時</span>
        <span>銘柄</span>
        <span>配信元</span>
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
        <div aria-label="ニュース見出し一覧" className="min-h-0 flex-1 overflow-auto max-[899px]:max-h-[60vh]">
          {news.map((item) => {
            const selected = item.id === selectedId;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={selected}
                title={item.title}
                onClick={() => onSelect(item)}
                className={`grid ${ROW_GRID} w-full items-center gap-2 border-b border-[var(--pm-divider)] px-2.5 text-left ${selected ? 'bg-[var(--pm-selected-row)]' : 'hover:bg-[var(--pm-heading)]'}`}
                style={{ height: 'var(--pm-row-h)' }}
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
    </section>
  );
}
