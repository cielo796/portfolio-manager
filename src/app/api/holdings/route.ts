import { NextResponse } from 'next/server';
import { createHolding } from '@/lib/db';
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
  sector?: string | null;
  memo?: string;
};

const isValidMarket = (market: unknown): market is Market =>
  market === 'US' || market === 'JP' || market === 'FX';
const normalizeFxSymbol = (symbol: string) => symbol.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
const normalizeStockSymbol = (symbol: string) => symbol.toUpperCase().trim();
const isCashSymbol = (symbol: string) => normalizeStockSymbol(symbol) === 'CASH';
const defaultCashName = (market: Market) => (market === 'US' ? '米ドル現金' : '日本円現金');
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

  const rawSymbol = body.symbol?.trim();
  if (!body.portfolio_id || !rawSymbol || !isValidMarket(body.market)) {
    return NextResponse.json({ error: '必須項目が不足しています。' }, { status: 400 });
  }

  const isCash = isCashSymbol(rawSymbol);
  const shares = Number(body.shares);
  const avgCost = isCash ? 1 : Number(body.avg_cost);

  if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(avgCost) || avgCost <= 0) {
    return NextResponse.json({ error: '株数と取得単価は0より大きい値を指定してください。' }, { status: 400 });
  }
  if (isCash && body.market === 'FX') {
    return NextResponse.json({ error: '現金ポジションは米ドルまたは日本円を指定してください。' }, { status: 400 });
  }
  if (body.market === 'FX' && !isSupportedFxSymbol(rawSymbol)) {
    return NextResponse.json({ error: 'FX通貨ペアはJPY/USDクォートのみ対応しています。' }, { status: 400 });
  }

  try {
    const symbol = isCash
      ? 'CASH'
      : body.market === 'FX'
      ? normalizeFxSymbol(rawSymbol)
      : normalizeStockSymbol(rawSymbol);
    const holding = createHolding({
      portfolio_id: body.portfolio_id,
      name: isCash ? body.name?.trim() || defaultCashName(body.market) : body.name,
      symbol,
      market: body.market,
      shares,
      avg_cost: avgCost,
      sector: body.sector ?? undefined,
      memo: body.memo,
    });
    return NextResponse.json({ holding: { ...holding, sector: holding.sector ?? null } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: '銘柄の保存に失敗しました。' }, { status: 500 });
  }
}
