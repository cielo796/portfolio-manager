'use client';

import type { NewsItem } from '@/types';
import { formatNewsDateTime } from './format';

export function NewsPreviewPane({ item }: { item: NewsItem | null }) {
  return (
    <section aria-labelledby="news-preview" className="flex min-h-0 min-w-0 flex-col rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]">
      <div className="flex h-[30px] shrink-0 items-center border-b border-[var(--pm-border)] px-2.5">
        <h2 id="news-preview" className="text-xs font-semibold">プレビュー</h2>
      </div>
      {item ? (
        <article className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto p-3">
          <div className="flex flex-wrap gap-2.5 text-[11px] text-[var(--pm-muted)]">
            <span className="tabular-nums">{formatNewsDateTime(item.published_at)}</span>
            <span>{item.source}</span>
            <span className="text-[var(--pm-link)]">{item.symbol}</span>
          </div>
          <h3 className="m-0 break-words text-[15px] font-semibold leading-[1.5]">{item.title}</h3>
          <p className={`m-0 whitespace-pre-wrap break-words leading-[1.7] ${item.summary?.trim() ? '' : 'text-[var(--pm-muted)]'}`}>
            {item.summary?.trim() || '要約はありません'}
          </p>
          {item.image_url && (
            // 外部サイトの画像をそのまま表示する。
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url}
              alt=""
              loading="lazy"
              className="max-h-40 w-full rounded border border-[var(--pm-border)] object-cover"
            />
          )}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto inline-flex h-7 shrink-0 items-center self-start rounded bg-[var(--pm-accent)] px-3 font-semibold text-[#1a1205]"
          >
            元記事を開く ↗
          </a>
        </article>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-[var(--pm-muted)]">
          見出しを選ぶとここに表示されます
        </div>
      )}
    </section>
  );
}
