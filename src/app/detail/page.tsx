import { Suspense } from 'react';
import { DetailWorkspace } from '@/components/detail/detail-workspace';

export default function DetailPage() {
  return <Suspense fallback={<p role="status" className="p-3 pm-muted">銘柄詳細を読み込み中…</p>}><DetailWorkspace /></Suspense>;
}
