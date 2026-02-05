'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Market, TickerPreset, TransactionType } from '@/types';
import { normalizeFxSymbol } from '@/lib/utils';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TransactionFormData) => Promise<void> | void;
  portfolios: { id: string; name: string }[];
  tickerPresets: TickerPreset[];
}

export interface TransactionFormData {
  portfolio_id: string;
  symbol: string;
  market: Market;
  type: TransactionType;
  shares: number;
  price: number;
  fees: number;
  transaction_date: string;
  memo?: string;
}

const TODAY = new Date().toISOString().split('T')[0];

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  portfolios,
  tickerPresets,
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [formData, setFormData] = useState<TransactionFormData>({
    portfolio_id: portfolios[0]?.id || '',
    symbol: '',
    market: 'US',
    type: 'buy',
    shares: 0,
    price: 0,
    fees: 0,
    transaction_date: TODAY,
    memo: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof TransactionFormData, string>>>({});
  const isFx = formData.market === 'FX';

  const handlePresetSelect = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (!presetId) return;

    const preset = tickerPresets.find((item) => item.id === presetId);
    if (!preset) return;

    setFormData((prev) => ({
      ...prev,
      symbol: preset.symbol,
      market: preset.market,
      type: preset.market === 'FX' && prev.type === 'dividend' ? 'buy' : prev.type,
    }));
  };

  const validate = (): boolean => {
    const nextErrors: Partial<Record<keyof TransactionFormData, string>> = {};

    if (!formData.symbol.trim()) {
      nextErrors.symbol = 'シンボルを入力してください';
    }
    if (formData.market === 'FX') {
      const normalized = normalizeFxSymbol(formData.symbol);
      if (normalized.length !== 6) {
        nextErrors.symbol = 'FX通貨ペアは6文字で入力してください（例: USDJPY）';
      } else {
        const quote = normalized.slice(3, 6);
        if (quote !== 'JPY' && quote !== 'USD') {
          nextErrors.symbol = '現在はJPY/USDクォートのFX通貨ペアのみ対応しています';
        }
      }
    }
    if ((formData.type === 'buy' || formData.type === 'sell') && formData.shares <= 0) {
      nextErrors.shares = '売買数量は0より大きい値を入力してください';
    }
    if (formData.type === 'dividend' && formData.shares <= 0) {
      nextErrors.shares = '配当数量は0より大きい値を入力してください';
    }
    if (formData.price < 0) {
      nextErrors.price = '単価は0以上を入力してください';
    }
    if (formData.fees < 0) {
      nextErrors.fees = '手数料は0以上を入力してください';
    }
    if (!formData.transaction_date) {
      nextErrors.transaction_date = '取引日を入力してください';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const resetForm = () => {
    setSelectedPresetId('');
    setFormData({
      portfolio_id: portfolios[0]?.id || '',
      symbol: '',
      market: 'US',
      type: 'buy',
      shares: 0,
      price: 0,
      fees: 0,
      transaction_date: TODAY,
      memo: '',
    });
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    await onSubmit({
      ...formData,
      symbol: formData.symbol.toUpperCase().trim(),
      memo: formData.memo?.trim() || undefined,
    });
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">売買履歴を追加</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Select
            label="口座"
            value={formData.portfolio_id}
            onChange={(e) => setFormData({ ...formData, portfolio_id: e.target.value })}
            options={portfolios.map((p) => ({ value: p.id, label: p.name }))}
          />

          <Select
            label="Registered Ticker (optional)"
            value={selectedPresetId}
            onChange={(e) => handlePresetSelect(e.target.value)}
            options={[
              { value: '', label: 'Select a registered ticker' },
              ...tickerPresets.map((preset) => ({
                value: preset.id,
                label: `${preset.symbol} (${preset.market})${preset.name ? ` - ${preset.name}` : ''}`,
              })),
            ]}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="シンボル"
              placeholder="AAPL, 7203, USDJPY, CASH"
              value={formData.symbol}
              onChange={(e) => {
                setSelectedPresetId('');
                setFormData({ ...formData, symbol: e.target.value });
              }}
              error={errors.symbol}
            />
            <Select
              label="市場"
              value={formData.market}
              onChange={(e) => {
                const nextMarket = e.target.value as Market;
                setSelectedPresetId('');
                setFormData((prev) => ({
                  ...prev,
                  market: nextMarket,
                  type: nextMarket === 'FX' && prev.type === 'dividend' ? 'buy' : prev.type,
                }));
              }}
              options={[
                { value: 'US', label: '米国 (USD)' },
                { value: 'JP', label: '日本 (JPY)' },
                { value: 'FX', label: 'FX' },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="取引種別"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as TransactionType })}
              options={
                isFx
                  ? [
                      { value: 'buy', label: '買い' },
                      { value: 'sell', label: '売り' },
                    ]
                  : [
                      { value: 'buy', label: '買付' },
                      { value: 'sell', label: '売却' },
                      { value: 'dividend', label: '配当' },
                    ]
              }
            />
            <Input
              label="取引日"
              type="date"
              value={formData.transaction_date}
              onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
              error={errors.transaction_date}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input
              label={isFx ? '取引数量' : '数量'}
              type="number"
              min="0"
              step="0.0001"
              value={formData.shares || ''}
              onChange={(e) => setFormData({ ...formData, shares: Number(e.target.value) })}
              error={errors.shares}
            />
            <Input
              label={isFx ? '約定レート' : '単価'}
              type="number"
              min="0"
              step="0.0001"
              value={formData.price || ''}
              onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
              error={errors.price}
            />
            <Input
              label="手数料"
              type="number"
              min="0"
              step="0.0001"
              value={formData.fees || ''}
              onChange={(e) => setFormData({ ...formData, fees: Number(e.target.value) })}
              error={errors.fees}
            />
          </div>

          <Input
            label="メモ（任意）"
            placeholder="約定メモなど"
            value={formData.memo || ''}
            onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
          />

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              キャンセル
            </Button>
            <Button type="submit" className="flex-1">
              追加
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
