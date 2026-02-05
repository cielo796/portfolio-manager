import { NextResponse } from 'next/server';
import { deleteTickerPresetById } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  }

  try {
    const deleted = deleteTickerPresetById(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Ticker preset not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete ticker preset.' }, { status: 500 });
  }
}
