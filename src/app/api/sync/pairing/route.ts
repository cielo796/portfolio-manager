import { handleSync } from '@/lib/sync/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  return handleSync(request, 'pairing');
}

export async function DELETE(request: Request) {
  return handleSync(request, 'pairing');
}
