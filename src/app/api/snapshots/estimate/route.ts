import { NextResponse } from 'next/server';
import { generateEstimateSnapshots } from '@/lib/db/snapshots';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let pending: Promise<Awaited<ReturnType<typeof generateEstimateSnapshots>>> | null = null;

export async function POST() {
  try {
    pending ??= generateEstimateSnapshots().finally(() => { pending = null; });
    return NextResponse.json(await pending);
  } catch {
    return NextResponse.json({ error: '参考推移を作成できませんでした。' }, { status: 500 });
  }
}
