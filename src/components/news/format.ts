import type { NewsItem } from '@/types';

const pad = (value: number) => String(value).padStart(2, '0');

const publishedTime = (value: string) => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

export const formatNewsDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const formatFetchedAt = (date: Date | null) =>
  date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : '—';

export const sortNewsNewestFirst = (items: NewsItem[]) =>
  [...items].sort((a, b) => publishedTime(b.published_at) - publishedTime(a.published_at));
