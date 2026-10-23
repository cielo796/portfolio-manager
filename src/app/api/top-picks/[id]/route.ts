import { NextResponse } from 'next/server';
import { deleteTopPick, updateTopPick } from '@/lib/db';
import { validateTopPickInput } from '@/lib/db/top-picks';
import { pickError } from '../response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const input = validateTopPickInput(await request.json(), true);
    return NextResponse.json({ topPick: updateTopPick((await context.params).id, input) });
  } catch (error) { return pickError(error); }
}

export async function DELETE(_request: Request, context: Context) {
  try { deleteTopPick((await context.params).id); return NextResponse.json({ success: true }); }
  catch (error) { return pickError(error); }
}
