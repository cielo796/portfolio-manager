'use client';

import type { WatchlistState } from '@/hooks/use-watchlist';
import type { WatchlistItem } from '@/types';
import type { SectorKey } from '@/lib/sectors';
import { Input, Select } from '@/components/ui/input';
import { SECTOR_OPTIONS } from './constants';

export function WatchlistEditRow(props: WatchlistState & { item: WatchlistItem }) {
  const { item, isSavingEdit } = props;
  return <div role="row" className="border-b border-[var(--pm-border)] bg-[#1a2638] p-2">
    <div role="cell">
      <form aria-label={`${item.symbol}の編集`} onSubmit={(event) => { event.preventDefault(); void props.handleSaveEdit(); }} onKeyDown={(event) => { if (event.key === 'Escape' && !isSavingEdit) props.cancelEdit(); }} className="grid max-w-4xl gap-2 sm:grid-cols-4">
        {item.market === 'JP' && <Input id={`name-${item.id}`} label="会社名" value={props.editCompanyName} onChange={(event) => props.setEditCompanyName(event.target.value)} disabled={isSavingEdit} />}
        <Select id={`sector-${item.id}`} label="セクター" value={props.editSector} onChange={(event) => props.setEditSector(event.target.value as SectorKey)} options={SECTOR_OPTIONS} disabled={isSavingEdit} />
        <Input id={`target-${item.id}`} label="目標価格" type="number" min="0" step="0.0001" placeholder="未設定（任意）" value={props.editTargetPrice} onChange={(event) => props.setEditTargetPrice(event.target.value)} disabled={isSavingEdit} />
        <div>
          <label htmlFor={`memo-${item.id}`} className="mb-1.5 block text-sm font-medium text-slate-300">メモ</label>
          <textarea id={`memo-${item.id}`} rows={2} value={props.editMemo} onChange={(event) => props.setEditMemo(event.target.value)} disabled={isSavingEdit} className="w-full rounded border border-[var(--pm-input-border)] bg-[var(--pm-bg)] px-2 py-1" />
        </div>
        <div className="col-span-full flex justify-end gap-2">
          <button type="button" className="pm-button" onClick={props.cancelEdit} disabled={isSavingEdit}>取消</button>
          <button type="submit" className="pm-button" disabled={isSavingEdit}>{isSavingEdit ? '保存中…' : '保存'}</button>
        </div>
      </form>
    </div>
  </div>;
}
