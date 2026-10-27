import { NextResponse } from 'next/server';
import { listHoldings, listNewsItems, listPortfolios, listStockPrices, listTransactions, recordCurrentSnapshots } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const portfolios = listPortfolios();
  const holdings = listHoldings();
  const transactions = listTransactions();
  const stockPrices = listStockPrices();
  const news = listNewsItems();
  recordCurrentSnapshots();

  return NextResponse.json({
    portfolios,
    holdings,
    transactions,
    stockPrices,
    news,
  });
}
