import { NextResponse } from 'next/server';
import { createTransaction, listTransactions } from '@/lib/db';
import { TradeLedgerError } from '@/lib/trade-ledger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ transactions: listTransactions() });
}

export async function POST(request: Request) {
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: '不正なリクエストです。' }, { status: 400 });
  }
  try {
    return NextResponse.json({ transaction: createTransaction(body) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof TradeLedgerError ? error.message : '記録の保存に失敗しました。' },
      { status: error instanceof TradeLedgerError ? 400 : 500 });
  }
}
