'use client';

import type { NewsItem } from '@/types';
import { HomePanel, PanelEmpty, PanelError, PanelSkeleton } from './panel';
import { fetchHomeJson, useHomeResource } from './use-home-resource';

const loadNews = async (signal: AbortSignal) => {
  const data = await fetchHomeJson<{ news: NewsItem[]; provider?: string }>('/api/news', signal);
  if (!Array.isArray(data.news) || data.provider === 'mock') throw new Error('ニュース未取得');
  return data.news.filter((item) => /^https?:\/\//i.test(item.url))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at)).slice(0, 6);
};

export function HomeNews() {
  const news = useHomeResource(loadNews);
  return <HomePanel title="最新ニュース" href="/news" link="一覧">
    {news.loading ? <PanelSkeleton /> : news.error ? <PanelError retry={news.retry} /> : news.data?.length ? <ul>
      {news.data.map((item) => <li key={item.id} className="border-b border-[var(--pm-divider)]">
        <a href={item.url} target="_blank" rel="noopener noreferrer" title={`${item.title}（${item.source}）`} className="flex min-w-0 items-center gap-2 px-2.5 py-1.5 hover:bg-[var(--pm-selected-row)]" style={{ minHeight: 'var(--pm-row-h)' }}>
          <time dateTime={item.published_at} title={new Date(item.published_at).toLocaleString('ja-JP')} className="num pm-muted">{new Date(item.published_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</time>
          <span className="max-w-16 shrink-0 truncate text-[var(--pm-link)]">{item.symbol}</span><span className="min-w-0 flex-1 truncate">{item.title}</span>
        </a>
      </li>)}
    </ul> : <PanelEmpty>ニュースがありません。</PanelEmpty>}
  </HomePanel>;
}
