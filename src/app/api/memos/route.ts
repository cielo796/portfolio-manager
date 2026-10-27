import { NextResponse } from 'next/server';
import { createMemo, listMemos } from '@/lib/db';
import type { MemoInput, MemoTag } from '@/types';
import { memoTags, validateMemoInput } from './validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const market = params.get('market') || undefined;
  const tag = params.get('tag') || undefined;
  const limit = params.has('limit') ? Number(params.get('limit')) : undefined;
  if ((market && !['US', 'JP', 'FX'].includes(market)) || (tag && !memoTags.includes(tag as MemoTag))
    || (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 1000))) {
    return NextResponse.json({ error: '絞り込み条件が不正です。' }, { status: 400 });
  }
  try {
    return NextResponse.json({ memos: listMemos({ symbol: params.get('symbol') || undefined, market, tag: tag as MemoTag | undefined, q: params.get('q') || undefined, limit }) });
  } catch {
    return NextResponse.json({ error: 'メモを取得できませんでした。' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let input: MemoInput;
  try { input = validateMemoInput(await request.json()) as MemoInput; }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '入力が不正です。' }, { status: 400 }); }
  try { return NextResponse.json({ memo: createMemo(input) }, { status: 201 }); }
  catch { return NextResponse.json({ error: 'メモの保存に失敗しました。' }, { status: 500 }); }
}
