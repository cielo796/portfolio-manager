import { NextResponse } from 'next/server';
import { updateWatchlistItemsLayout } from '@/lib/sqlite';
import { WatchlistKey } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ReorderRequest = {
  items?: Array<{
    id?: string;
    list_key?: WatchlistKey;
    sort_order?: number;
  }>;
};

const isValidWatchlistKey = (value: unknown): value is WatchlistKey =>
  value === 'main' || value === 'sub1' || value === 'sub2' || value === 'sub3' || value === 'sub4';

export async function PATCH(request: Request) {
  let body: ReorderRequest;

  try {
    body = (await request.json()) as ReorderRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const items = body.items ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items are required.' }, { status: 400 });
  }

  const updates = items
    .map((item) => ({
      id: item.id?.trim() ?? '',
      list_key: item.list_key,
      sort_order: item.sort_order,
    }))
    .filter(
      (item): item is { id: string; list_key: WatchlistKey; sort_order: number } =>
        Boolean(item.id) &&
        isValidWatchlistKey(item.list_key) &&
        typeof item.sort_order === 'number' &&
        Number.isInteger(item.sort_order) &&
        item.sort_order >= 0
    );

  if (updates.length !== items.length) {
    return NextResponse.json({ error: 'Invalid layout update.' }, { status: 400 });
  }

  try {
    const watchlistItems = updateWatchlistItemsLayout(updates);
    return NextResponse.json({ watchlistItems });
  } catch {
    return NextResponse.json({ error: 'Failed to reorder watchlist items.' }, { status: 500 });
  }
}
