import { Suspense } from 'react';
import { MemosWorkspace } from '@/components/memos/memos-workspace';

export default function MemosPage() {
  return <Suspense fallback={<p role="status" className="p-3 pm-muted">メモを読み込み中…</p>}><MemosWorkspace /></Suspense>;
}
