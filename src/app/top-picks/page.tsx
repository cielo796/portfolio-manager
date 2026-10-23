import { Suspense } from 'react';
import { TopPicksWorkspace } from '@/components/top-picks/top-picks-workspace';

export default function TopPicksPage() {
  return <Suspense fallback={<p role="status" className="p-3 pm-muted">トップピックを読み込み中…</p>}><TopPicksWorkspace /></Suspense>;
}
