import path from 'node:path';
import { NextResponse } from 'next/server';
import { readMarket } from '@/lib/market';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const snapshot = await readMarket(new URL(request.url).searchParams.get('refresh') === '1');
  return NextResponse.json({
    ...snapshot,
    dbFile: path.basename(process.env.SQLITE_DB_PATH?.trim() || 'portfolio.db'),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
