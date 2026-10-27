import { NextResponse } from 'next/server';
import { reorderTopPicks } from '@/lib/db';
import { TopPickError } from '@/lib/db/top-picks';
import { pickError } from '../response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    if (!body || !Array.isArray(body.ids) || body.ids.some((id: unknown) => typeof id !== 'string')) throw new TopPickError('idsにピックのIDを指定してください。');
    return NextResponse.json({ topPicks: reorderTopPicks(body.ids) });
  } catch (error) { return pickError(error); }
}
