import { handleSync } from '@/lib/sync/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) { return handleSync(request, 'auto'); }
export async function POST(request: Request) { return handleSync(request, 'auto'); }
