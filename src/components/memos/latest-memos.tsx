'use client';

import Link from 'next/link';
import type { MemoSymbol, StockMemo } from '@/types';
import { useDetailResource } from '@/components/detail/data';
import { dateText, memoHref } from './shared';

export function LatestMemos({ symbol, market }: MemoSymbol) {
  const resource = useDetailResource<{ memos: StockMemo[] }>(`/api/memos?symbol=${encodeURIComponent(symbol)}&market=${market}&limit=3`);
  return <section aria-label="最新の銘柄メモ" className="border-t border-[var(--pm-border)] p-3">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">銘柄メモ</h2><Link className="text-[var(--pm-link)]" href={memoHref({ symbol, market }, true)}>＋ メモを書く</Link></div>
    {resource.loading ? <p role="status" className="pm-muted">読み込み中…</p> : resource.error ? <button type="button" className="text-[var(--pm-link)]" onClick={() => void resource.reload()}>メモを取得できませんでした（再試行）</button> : resource.data?.memos.length ? <ul className="space-y-2">{resource.data.memos.map((memo) => <li key={memo.id}><Link href={`${memoHref({ symbol, market })}&id=${encodeURIComponent(memo.id)}`} className="block text-[var(--pm-link)]"><time className="mr-2 text-[10px] pm-muted">{dateText(memo.created_at)}</time>{memo.title}</Link></li>)}</ul> : <p className="pm-muted">メモはありません。</p>}
  </section>;
}
