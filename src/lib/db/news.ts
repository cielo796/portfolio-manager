import 'server-only';

import { NewsItem } from '@/types';
import { getDb } from './connection';

export function listNewsItems(limit = 30): NewsItem[] {
  const db = getDb();
  return db
    .prepare(`
      SELECT *
      FROM news_items
      ORDER BY published_at DESC
      LIMIT ?
    `)
    .all(limit) as NewsItem[];
}

export function upsertNewsItems(news: NewsItem[]) {
  if (news.length === 0) return;

  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO news_items (id, symbol, title, summary, source, url, image_url, published_at, sentiment)
    VALUES (@id, @symbol, @title, @summary, @source, @url, @image_url, @published_at, @sentiment)
    ON CONFLICT(symbol, url) DO UPDATE SET
      id = excluded.id,
      title = excluded.title,
      summary = excluded.summary,
      source = excluded.source,
      image_url = excluded.image_url,
      published_at = excluded.published_at,
      sentiment = excluded.sentiment
  `);

  const tx = db.transaction(() => {
    for (const item of news) {
      if (!item.id || !item.symbol || !item.title || !item.url) continue;
      insert.run({
        id: item.id,
        symbol: item.symbol.toUpperCase().trim(),
        title: item.title,
        summary: item.summary ?? null,
        source: item.source || 'Unknown',
        url: item.url,
        image_url: item.image_url ?? null,
        published_at: item.published_at,
        sentiment: item.sentiment ?? null,
      });
    }
  });
  tx();
}
