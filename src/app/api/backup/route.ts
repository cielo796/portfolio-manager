import { NextResponse } from 'next/server';
import { clearAllData, exportBackupData, importBackupData } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const data = exportBackupData();
  return NextResponse.json({
    ...data,
    exportedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    importBackupData(body);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'インポートに失敗しました。' }, { status: 400 });
  }
}

export async function DELETE() {
  clearAllData();
  return NextResponse.json({ success: true });
}
