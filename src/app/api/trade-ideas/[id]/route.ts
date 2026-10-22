import { NextResponse } from 'next/server';
import { deleteTradeIdeaById, updateTradeIdeaById } from '@/lib/db';
import { Market } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type UpdateTradeIdeaRequest = {
  symbol?: string;
  market?: Market;
  note?: string;
};

type Context = {
  params: Promise<{ id: string }>;
};

const isValidMarket = (market: unknown): market is Market =>
  market === 'US' || market === 'JP' || market === 'FX';

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  let body: UpdateTradeIdeaRequest;

  try {
    body = (await request.json()) as UpdateTradeIdeaRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const updates: UpdateTradeIdeaRequest = {};
  if (body.symbol !== undefined) {
    const symbol = body.symbol.trim().toUpperCase();
    if (!symbol) {
      return NextResponse.json({ error: 'symbol is required.' }, { status: 400 });
    }
    updates.symbol = symbol;
  }
  if (body.market !== undefined) {
    if (!isValidMarket(body.market)) {
      return NextResponse.json({ error: 'Invalid market.' }, { status: 400 });
    }
    updates.market = body.market;
  }
  if (body.note !== undefined) {
    const note = body.note.trim();
    if (!note) {
      return NextResponse.json({ error: 'note is required.' }, { status: 400 });
    }
    updates.note = note;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update.' }, { status: 400 });
  }

  try {
    const tradeIdea = updateTradeIdeaById(id, updates);
    if (!tradeIdea) {
      return NextResponse.json({ error: 'Trade idea not found.' }, { status: 404 });
    }
    return NextResponse.json({ tradeIdea });
  } catch {
    return NextResponse.json({ error: 'Failed to update trade idea.' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const deleted = deleteTradeIdeaById(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Trade idea not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete trade idea.' }, { status: 500 });
  }
}
