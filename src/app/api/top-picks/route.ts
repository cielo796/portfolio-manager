import { NextResponse } from 'next/server';
import { createTopPick, listTopPicks } from '@/lib/db';
import { validateTopPickInput } from '@/lib/db/top-picks';
import type { TopPickInput } from '@/types';
import { pickError } from './response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const status = new URL(request.url).searchParams.get('status') ?? 'current';
  if (status !== 'current' && status !== 'removed') return NextResponse.json({ error: '表示条件が不正です。' }, { status: 400 });
  try { return NextResponse.json({ topPicks: listTopPicks(status) }); } catch (error) { return pickError(error); }
}

export async function POST(request: Request) {
  try {
    const input = validateTopPickInput(await request.json()) as TopPickInput;
    return NextResponse.json({ topPick: createTopPick(input) }, { status: 201 });
  } catch (error) { return pickError(error); }
}
