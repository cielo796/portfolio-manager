import { NextResponse } from 'next/server';
import { createHolding } from '@/lib/sqlite';
import { Market } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CreateHoldingRequest = {
  portfolio_id?: string;
  name?: string;
  symbol?: string;
  market?: Market;
  shares?: number;
  avg_cost?: number;
  sector?: string;
  memo?: string;
};

const isValidMarket = (market: unknown): market is Market =>
  market === 'US' || market === 'JP' || market === 'FX';
const normalizeFxSymbol = (symbol: string) => symbol.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
const isSupportedFxSymbol = (symbol: string) => {
  const normalized = normalizeFxSymbol(symbol);
  if (normalized.length !== 6) return false;
  const quote = normalized.slice(3, 6);
  return quote === 'JPY' || quote === 'USD';
};

export async function POST(request: Request) {
  let body: CreateHoldingRequest;

  try {
    body = (await request.json()) as CreateHoldingRequest;
  } catch {
    return NextResponse.json({ error: '不正なリクエストです。' }, { status: 400 });
  }

  if (!body.portfolio_id || !body.symbol || !isValidMarket(body.market)) {
    return NextResponse.json({ error: '必須項目が不足しています。' }, { status: 400 });
  }

  const shares = Number(body.shares);
  const avgCost = Number(body.avg_cost);

  if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(avgCost) || avgCost <= 0) {
    return NextResponse.json({ error: '株数と取得単価は0より大きい値を指定してください。' }, { status: 400 });
  }
  if (body.market === 'FX' && !isSupportedFxSymbol(body.symbol)) {
    return NextResponse.json({ error: 'FX通貨ペアはJPY/USDクォートのみ対応しています。' }, { status: 400 });
  }

  try {
    const holding = createHolding({
      portfolio_id: body.portfolio_id,
      name: body.name,
      symbol: body.symbol,
      market: body.market,
      shares,
      avg_cost: avgCost,
      sector: body.sector,
      memo: body.memo,
    });
    return NextResponse.json({ holding }, { status: 201 });
  } catch {
    return NextResponse.json({ error: '銘柄の保存に失敗しました。' }, { status: 500 });
  }
}
