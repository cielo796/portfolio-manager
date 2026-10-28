'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Transaction } from '@/types';
import { readJson, useDetailResource } from '@/components/detail/data';
import { ConfirmDialog } from '@/components/shell/confirm-dialog';
import { hasLinkedTransactions } from './context-menu-items';
import type { HoldingRow } from './columns';

export function DeleteHoldingDialog({ row, onDelete, onClose }: {
  row: HoldingRow; onDelete: () => Promise<void>; onClose: () => void;
}) {
  const resource = useDetailResource<{ transactions: Transaction[] }>('/api/transactions');
  const [linkedAfterOpen, setLinkedAfterOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const linked = linkedAfterOpen || hasLinkedTransactions(row.holding.id, resource.data?.transactions ?? []);
  const remove = async () => {
    setBusy(true); setError('');
    try {
      const current = await readJson<{ transactions: Transaction[] }>('/api/transactions');
      if (hasLinkedTransactions(row.holding.id, current.transactions)) { setLinkedAfterOpen(true); return; }
      await onDelete(); onClose();
    } catch {
      setError('保有を削除できませんでした。連動する売買記録と通信状態を確認してください。');
      void resource.reload();
    } finally { setBusy(false); }
  };
  return <ConfirmDialog title="保有を削除" busy={busy} disabled={linked || resource.loading || !!resource.error || !resource.data}
    onClose={onClose} onConfirm={() => void remove()} action={linked
      ? <Link className="pm-button" href={`/records?holding=${encodeURIComponent(row.holding.id)}`}>記録画面を開く</Link> : undefined}>
    <p>{row.values.name}（{row.values.account}）の保有を削除します。</p>
    {resource.loading && <p role="status" className="pm-muted">売買記録との連動を確認中…</p>}
    {linked && <p>売買記録と連動しています。記録画面で記録を削除すると保有も再計算されます</p>}
    {resource.error && <p role="alert">売買記録を確認できませんでした。<button className="pm-button ml-2" onClick={() => void resource.reload()}>再試行</button></p>}
    {error && <p role="alert" className="text-[#ff5c5c]">{error}</p>}
  </ConfirmDialog>;
}
