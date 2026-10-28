'use client';

import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';

export function ConfirmDialog({ title, children, confirmLabel = '削除', disabled, busy, onConfirm, onClose, action }: {
  title: string; children: ReactNode; confirmLabel?: string; disabled?: boolean; busy?: boolean;
  onConfirm: () => void; onClose: () => void; action?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    className="m-auto w-[min(420px,95vw)] rounded border border-[var(--pm-border)] bg-[var(--pm-panel)] p-4 text-xs text-[var(--pm-text)] shadow-xl backdrop:bg-black/60">
    <h2 id={titleId} className="mb-3 text-sm font-semibold">{title}</h2>
    <div id={descriptionId} className="space-y-2">{children}</div>
    <div className="mt-4 flex flex-wrap justify-end gap-2">
      <button type="button" autoFocus disabled={busy} className="pm-button" onClick={onClose}>キャンセル</button>
      {action}
      <button type="button" disabled={disabled || busy} className="pm-button !text-[#ff5c5c] disabled:opacity-50" onClick={onConfirm}>{busy ? '処理中…' : confirmLabel}</button>
    </div>
  </dialog>;
}
