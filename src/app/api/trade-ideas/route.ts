import { NextResponse } from 'next/server';
import { createTradeIdea, listTradeIdeas } from '@/lib/sqlite';
import { Market } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CreateTradeIdeaRequest = {
  symbol?: string;
  market?: Market;
  note?: string;
};

const isValidMarket = (market: unknown): market is Market =>
  market === 'US' || market === 'JP' || market === 'FX';

export async function GET() {
  const tradeIdeas = listTradeIdeas();
  return NextResponse.json({ tradeIdeas });
}

export async function POST(request: Request) {
  let body: CreateTradeIdeaRequest;

  try {
    body = (await request.json()) as CreateTradeIdeaRequest;
  } catch {
    return NextResponse.json({ error: '不正なリクエストです。' }, { status: 400 });
  }

  if (!body.symbol || !isValidMarket(body.market) || !body.note?.trim()) {
    return NextResponse.json({ error: '必須項目が不足しています。' }, { status: 400 });
  }

  try {
    const tradeIdea = createTradeIdea({
      symbol: body.symbol,
      market: body.market,
      note: body.note,
    });
    return NextResponse.json({ tradeIdea }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'トレードアイデアの保存に失敗しました。' }, { status: 500 });
  }
}
