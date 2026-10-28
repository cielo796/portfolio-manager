import { NextResponse } from 'next/server';
import { deleteHoldingById, getDb, listTransactions, updateHoldingById } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type UpdateHoldingRequest = {
  name?: string;
  shares?: number;
  avg_cost?: number;
  sector?: string | null;
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

  const updates: Omit<UpdateHoldingRequest, 'sector'> & { sector?: string } = {};

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
    updates.sector = body.sector?.trim() || '';
  }
  if (body.memo !== undefined) {
    updates.memo = body.memo.trim() || undefined;
  }

  const holding = updateHoldingById(id, updates);
  if (!holding) {
    return NextResponse.json({ error: '保有銘柄が見つかりません。' }, { status: 404 });
  }

  return NextResponse.json({ holding: { ...holding, sector: holding.sector ?? null } });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;

  // 確認後に別の画面で記録が増えた場合も、連動する保有を削除しない。
  const result = getDb().transaction(() => {
    if (listTransactions().some((entry) => entry.holding_id === id && !entry.deleted_at)) return 'linked';
    return deleteHoldingById(id) ? 'deleted' : 'missing';
  }).immediate();
  if (result === 'linked') {
    return NextResponse.json({ error: '売買記録と連動しています。記録画面で記録を削除すると保有も再計算されます。' }, { status: 409 });
  }
  const deleted = result === 'deleted';
  if (!deleted) {
    return NextResponse.json({ error: '保有銘柄が見つかりません。' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
