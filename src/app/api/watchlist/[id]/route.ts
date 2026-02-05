import { NextResponse } from 'next/server';
import { deleteWatchlistItemById, updateWatchlistItemById } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type UpdateWatchlistRequest = {
  target_price?: number | null;
  memo?: string | null;
};

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

  if (body.target_price === undefined && body.memo === undefined) {
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

  try {
    const watchlistItem = updateWatchlistItemById(id, {
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
