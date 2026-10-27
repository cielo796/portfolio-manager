import { NextResponse } from 'next/server';
import { removeTopPick } from '@/lib/db';
import { pickError } from '../../response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json({ topPick: removeTopPick((await context.params).id) }); }
  catch (error) { return pickError(error); }
}
