import { NextResponse } from 'next/server';
import { deleteTransactionById, updateTransactionById } from '@/lib/db';
import { TradeLedgerError } from '@/lib/trade-ledger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof TradeLedgerError ? error.message : '記録の更新に失敗しました。' },
    { status: error instanceof TradeLedgerError ? 400 : 500 });
}

export async function PATCH(request: Request, context: Context) {
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: '不正なリクエストです。' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: '不正なリクエストです。' }, { status: 400 });
  try {
    const transaction = updateTransactionById((await context.params).id, body);
    return transaction ? NextResponse.json({ transaction }) : NextResponse.json({ error: '記録がありません。' }, { status: 404 });
  } catch (error) { return failure(error); }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    return deleteTransactionById((await context.params).id)
      ? NextResponse.json({ success: true }) : NextResponse.json({ error: '記録がありません。' }, { status: 404 });
  } catch (error) { return failure(error); }
}
