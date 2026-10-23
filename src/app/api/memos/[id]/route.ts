import { NextResponse } from 'next/server';
import { deleteMemoById, updateMemoById } from '@/lib/db';
import type { MemoInput } from '@/types';
import { validateMemoInput } from '../validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  let input: Partial<MemoInput>;
  try { input = validateMemoInput(await request.json(), true); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '入力が不正です。' }, { status: 400 }); }
  const { id } = await context.params;
  try {
    const memo = updateMemoById(id, input);
    return memo ? NextResponse.json({ memo }) : NextResponse.json({ error: 'メモが見つかりません。' }, { status: 404 });
  } catch { return NextResponse.json({ error: 'メモの保存に失敗しました。' }, { status: 500 }); }
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  try {
    return deleteMemoById(id) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'メモが見つかりません。' }, { status: 404 });
  } catch { return NextResponse.json({ error: 'メモの削除に失敗しました。' }, { status: 500 }); }
}
