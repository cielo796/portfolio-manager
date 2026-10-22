'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { HoldingWithPrice } from '@/types';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { SECTORS, normalizeSectorKey } from '@/lib/sectors';
import { formatCurrency, getMarketCurrency } from '@/lib/utils';

interface EditHoldingModalProps {
  isOpen: boolean;
  holding: HoldingWithPrice | null;
  onClose: () => void;
  onSave: (id: string, updates: EditHoldingData) => Promise<void> | void;
  onClosePosition: (id: string) => Promise<void> | void;
}

export interface EditHoldingData {
  name?: string;
  shares: number;
  avg_cost: number;
  sector?: string;
  memo?: string;
}

export const EditHoldingModal: React.FC<EditHoldingModalProps> = ({
  isOpen,
  holding,
  onClose,
  onSave,
  onClosePosition,
}) => {
  const isCash = holding?.symbol === 'CASH';
  const isFx = holding?.market === 'FX';
  const [formData, setFormData] = useState<EditHoldingData>({
    name: '',
    shares: 0,
    avg_cost: 0,
    sector: '',
    memo: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof EditHoldingData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!holding || !isOpen) return;
    setFormData({
      name: holding.name || '',
      shares: holding.shares,
      avg_cost: isCash ? 1 : holding.avg_cost,
      sector: isCash || isFx ? '' : holding.sector ? normalizeSectorKey(holding.sector) : '',
      memo: holding.memo || '',
    });
    setErrors({});
  }, [holding, isCash, isFx, isOpen]);

  const currency = useMemo(() => {
    if (!holding) return 'JPY' as const;
    return getMarketCurrency(holding.market, holding.symbol);
  }, [holding]);

  const validate = () => {
    const nextErrors: Partial<Record<keyof EditHoldingData, string>> = {};
    if (formData.shares <= 0) {
      nextErrors.shares = isCash
        ? '金額は0より大きい値を入力してください'
        : isFx
        ? '取引数量は0より大きい値を入力してください'
        : '数量は0より大きい値を入力してください';
    }
    if (!isCash && formData.avg_cost < 0) {
      nextErrors.avg_cost = isFx ? '建値は0以上を入力してください' : '取得単価は0以上を入力してください';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holding || !validate()) return;

    setIsSubmitting(true);
    try {
      await onSave(holding.id, {
        ...formData,
        avg_cost: isCash ? 1 : formData.avg_cost,
        sector: isCash || isFx ? undefined : (formData.sector || ''),
        memo: formData.memo?.trim() || undefined,
        name: formData.name?.trim() || undefined,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClosePosition = async () => {
    if (!holding) return;
    const confirmed = confirm(`「${holding.symbol}」を決済して保有一覧から削除します。よろしいですか？`);
    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      await onClosePosition(holding.id);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !holding) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">ポジションを編集</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div className="text-sm text-slate-400">
            <p className="text-slate-200 font-medium">{holding.symbol}</p>
            <p className="mt-1">
              現在評価額: {formatCurrency(holding.current_value ?? 0, currency)}
              {(holding.market === 'US' || currency === 'USD') ? ` / ${formatCurrency(holding.current_value_jpy ?? 0, 'JPY')}` : ''}
            </p>
          </div>

          <Input
            label="名称"
            value={formData.name || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
          />

          <Input
            label={isCash ? '金額' : isFx ? '取引数量' : '数量'}
            type="number"
            min="0"
            step="0.0001"
            value={formData.shares || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, shares: Number(e.target.value) }))}
            error={errors.shares}
          />

          {!isCash && (
            <>
              <Input
                label={isFx ? '建値' : '取得単価'}
                type="number"
                min="0"
                step="0.0001"
                value={formData.avg_cost || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, avg_cost: Number(e.target.value) }))}
                error={errors.avg_cost}
              />

              {!isFx && (
                <Select
                  label="セクター"
                  value={formData.sector || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, sector: e.target.value }))}
                  options={[
                    { value: '', label: 'セクターを自動判定' },
                    ...SECTORS.map(({ key, label }) => ({ value: key, label })),
                  ]}
                />
              )}
            </>
          )}

          {isCash && (
            <p className="text-xs text-slate-500">現金ポジションは「金額」を編集してください。</p>
          )}
          {isFx && (
            <p className="text-xs text-slate-500">FXポジションは「取引数量」と「建値」を編集してください。</p>
          )}

          <Input
            label="メモ（任意）"
            value={formData.memo || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, memo: e.target.value }))}
          />

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="danger" onClick={handleClosePosition} disabled={isSubmitting} className="flex-1">
              決済
            </Button>
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting} className="flex-1">
              キャンセル
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              保存
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
