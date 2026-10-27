import { NextResponse } from 'next/server';
import { deleteWatchlistItemById, updateWatchlistItemById } from '@/lib/db';
import { WatchlistKey } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type UpdateWatchlistRequest = {
  name?: string | null;
  list_key?: WatchlistKey | null;
  sort_order?: number | null;
  sector?: string | null;
  target_price?: number | null;
  memo?: string | null;
};

const isValidWatchlistKey = (value: unknown): value is WatchlistKey =>
  value === 'main' || value === 'sub1' || value === 'sub2' || value === 'sub3' || value === 'sub4';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: UpdateWatchlistRequest;

  try {
    body = (await request.json()) as UpdateWatchlistRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (
    body.name === undefined &&
    body.target_price === undefined &&
    body.memo === undefined &&
    body.list_key === undefined &&
    body.sort_order === undefined &&
    body.sector === undefined
  ) {
    return NextResponse.json({ error: 'No fields to update.' }, { status: 400 });
  }

  let targetPrice: number | null | undefined;
  if (body.target_price === undefined) {
    targetPrice = undefined;
  } else if (body.target_price === null) {
    targetPrice = null;
  } else {
    const parsed = Number(body.target_price);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return NextResponse.json({ error: 'target_price must be a positive number.' }, { status: 400 });
    }
    targetPrice = parsed;
  }

  const memo = body.memo === undefined ? undefined : body.memo?.trim() || null;
  const sector = body.sector === undefined ? undefined : body.sector?.trim() || null;
  const name = body.name === undefined ? undefined : body.name?.trim() || null;
  const listKey = body.list_key === undefined || body.list_key === null ? undefined : body.list_key;
  if (listKey !== undefined && !isValidWatchlistKey(listKey)) {
    return NextResponse.json({ error: 'Invalid watchlist page.' }, { status: 400 });
  }

  let sortOrder: number | null | undefined;
  if (body.sort_order === undefined) {
    sortOrder = undefined;
  } else if (body.sort_order === null) {
    sortOrder = null;
  } else if (!Number.isInteger(body.sort_order) || body.sort_order < 0) {
    return NextResponse.json({ error: 'sort_order must be a non-negative integer.' }, { status: 400 });
  } else {
    sortOrder = body.sort_order;
  }

  try {
    const watchlistItem = updateWatchlistItemById(id, {
      name,
      list_key: listKey,
      sort_order: sortOrder,
      sector,
      target_price: targetPrice,
      memo,
    });
    if (!watchlistItem) {
      return NextResponse.json({ error: 'Watchlist item not found.' }, { status: 404 });
    }
    return NextResponse.json({ watchlistItem });
  } catch {
    return NextResponse.json({ error: 'Failed to update watchlist item.' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const deleted = deleteWatchlistItemById(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Watchlist item not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete watchlist item.' }, { status: 500 });
  }
}
