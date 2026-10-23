import { Suspense } from 'react';
import { RecordsWorkspace } from '@/components/records/records-workspace';

export default function RecordsPage() {
  return <Suspense fallback={<p className="p-3 pm-muted">読み込み中…</p>}><RecordsWorkspace /></Suspense>;
}
