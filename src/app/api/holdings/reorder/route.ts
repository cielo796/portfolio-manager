import { NextResponse } from 'next/server';
import { updateHoldingsOrder } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ReorderHoldingsRequest = {
  items?: Array<{
    id?: string;
    sort_order?: number;
  }>;
};

export async function PATCH(request: Request) {
  let body: ReorderHoldingsRequest;

  try {
    body = (await request.json()) as ReorderHoldingsRequest;
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
      sort_order: item.sort_order,
    }))
    .filter(
      (item): item is { id: string; sort_order: number } =>
        Boolean(item.id) &&
        typeof item.sort_order === 'number' &&
        Number.isInteger(item.sort_order) &&
        item.sort_order >= 0
    );

  if (updates.length !== items.length) {
    return NextResponse.json({ error: 'Invalid holding order update.' }, { status: 400 });
  }

  try {
    const holdings = updateHoldingsOrder(updates);
    return NextResponse.json({ holdings });
  } catch {
    return NextResponse.json({ error: 'Failed to reorder holdings.' }, { status: 500 });
  }
}
