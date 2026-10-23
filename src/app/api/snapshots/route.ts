import { NextResponse } from 'next/server';
import { listPortfolios } from '@/lib/db/portfolios';
import { listSnapshots, snapshotToday } from '@/lib/db/snapshots';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const portfolioId = new URL(request.url).searchParams.get('portfolioId');
  const portfolios = listPortfolios();
  // 削除済み口座の記録も全口座合計には残す。
  if (portfolioId && !portfolios.some((portfolio) => portfolio.id === portfolioId)) {
    return NextResponse.json({ error: '口座が見つかりません。' }, { status: 400 });
  }
  return NextResponse.json({ snapshots: listSnapshots(portfolioId || null), portfolios, today: snapshotToday() });
}
