import { NextResponse } from 'next/server';
import { listHoldings, listPortfolios, listTransactions } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const portfolios = listPortfolios();
  const holdings = listHoldings();
  const transactions = listTransactions();

  return NextResponse.json({
    portfolios,
    holdings,
    transactions,
  });
}
