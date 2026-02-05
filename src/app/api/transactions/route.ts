import { NextResponse } from 'next/server';
import { createTransaction, listTransactions } from '@/lib/sqlite';
import { Market, TransactionType } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CreateTransactionRequest = {
  portfolio_id?: string;
  symbol?: string;
  market?: Market;
  type?: TransactionType;
  shares?: number;
  price?: number;
  fees?: number;
  transaction_date?: string;
  memo?: string;
};

const isValidMarket = (market: unknown): market is Market =>
  market === 'US' || market === 'JP' || market === 'FX';
const isValidType = (type: unknown): type is TransactionType =>
  type === 'buy' || type === 'sell' || type === 'dividend';
const normalizeFxSymbol = (symbol: string) => symbol.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
const isSupportedFxSymbol = (symbol: string) => {
  const normalized = normalizeFxSymbol(symbol);
  if (normalized.length !== 6) return false;
  const quote = normalized.slice(3, 6);
  return quote === 'JPY' || quote === 'USD';
};

export async function GET() {
  const transactions = listTransactions();
  return NextResponse.json({ transactions });
}

export async function POST(request: Request) {
  let body: CreateTransactionRequest;

  try {
    body = (await request.json()) as CreateTransactionRequest;
  } catch {
    return NextResponse.json({ error: '不正なリクエストです。' }, { status: 400 });
  }

  if (!body.portfolio_id || !body.symbol || !isValidMarket(body.market) || !isValidType(body.type)) {
    return NextResponse.json({ error: '必須項目が不足しています。' }, { status: 400 });
  }

  const shares = Number(body.shares);
  const price = Number(body.price);
  const fees = Number(body.fees ?? 0);
  const transactionDate = (body.transaction_date || '').trim();

  if (!Number.isFinite(shares) || shares < 0 || !Number.isFinite(price) || price < 0 || !Number.isFinite(fees) || fees < 0) {
    return NextResponse.json({ error: '数量・単価・手数料の値が不正です。' }, { status: 400 });
  }
  if (!transactionDate) {
    return NextResponse.json({ error: '取引日を指定してください。' }, { status: 400 });
  }
  if (shares <= 0) {
    return NextResponse.json({ error: '数量は0より大きい値を指定してください。' }, { status: 400 });
  }
  if (body.market === 'FX' && !isSupportedFxSymbol(body.symbol)) {
    return NextResponse.json({ error: 'FX通貨ペアはJPY/USDクォートのみ対応しています。' }, { status: 400 });
  }

  try {
    const transaction = createTransaction({
      portfolio_id: body.portfolio_id,
      symbol: body.symbol,
      market: body.market,
      type: body.type,
      shares,
      price,
      fees,
      transaction_date: transactionDate,
      memo: body.memo,
    });
    return NextResponse.json({ transaction }, { status: 201 });
  } catch {
    return NextResponse.json({ error: '取引履歴の保存に失敗しました。' }, { status: 500 });
  }
}
