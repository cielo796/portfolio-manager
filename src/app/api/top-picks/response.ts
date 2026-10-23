import { NextResponse } from 'next/server';
import { TopPickError } from '@/lib/db/top-picks';

export function pickError(error: unknown) {
  return NextResponse.json({ error: error instanceof TopPickError ? error.message : 'ピックの処理に失敗しました。' },
    { status: error instanceof TopPickError ? error.status : error instanceof SyntaxError ? 400 : 500 });
}
