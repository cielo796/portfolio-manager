import { handleSync } from '@/lib/sync/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  return handleSync(request, 'peers');
}

export async function GET(request: Request) {
  return handleSync(request, 'peers');
}
