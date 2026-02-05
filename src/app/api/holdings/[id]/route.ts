import { NextResponse } from 'next/server';
import { deleteHoldingById, updateHoldingById } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type UpdateHoldingRequest = {
  name?: string;
  shares?: number;
  avg_cost?: number;
  sector?: string;
  memo?: string;
};

type Context = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;

  let body: UpdateHoldingRequest;
  try {
    body = (await request.json()) as UpdateHoldingRequest;
  } catch {
    return NextResponse.json({ error: '不正なリクエストです。' }, { status: 400 });
  }

  const updates: UpdateHoldingRequest = {};

  if (body.name !== undefined) {
    updates.name = body.name.trim() || undefined;
  }
  if (body.shares !== undefined) {
    const shares = Number(body.shares);
    if (!Number.isFinite(shares) || shares <= 0) {
      return NextResponse.json({ error: '数量は0より大きい値を指定してください。' }, { status: 400 });
    }
    updates.shares = shares;
  }
  if (body.avg_cost !== undefined) {
    const avgCost = Number(body.avg_cost);
    if (!Number.isFinite(avgCost) || avgCost < 0) {
      return NextResponse.json({ error: '取得単価は0以上の値を指定してください。' }, { status: 400 });
    }
    updates.avg_cost = avgCost;
  }
  if (body.sector !== undefined) {
    updates.sector = body.sector.trim() || undefined;
  }
  if (body.memo !== undefined) {
    updates.memo = body.memo.trim() || undefined;
  }

  const holding = updateHoldingById(id, updates);
  if (!holding) {
    return NextResponse.json({ error: '保有銘柄が見つかりません。' }, { status: 404 });
  }

  return NextResponse.json({ holding });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;

  const deleted = deleteHoldingById(id);
  if (!deleted) {
    return NextResponse.json({ error: '保有銘柄が見つかりません。' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
