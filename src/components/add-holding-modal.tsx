'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Market, TickerPreset } from '@/types';
import { normalizeFxSymbol } from '@/lib/utils';

type PositionType = 'stock' | 'fx' | 'cash';
const SUPPORTED_FX_QUOTES = ['JPY', 'USD'] as const;

interface AddHoldingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: HoldingFormData) => Promise<void> | void;
  portfolios: { id: string; name: string }[];
  tickerPresets: TickerPreset[];
}

export interface HoldingFormData {
  portfolio_id: string;
  name?: string;
  symbol: string;
  market: Market;
  shares: number;
  avg_cost: number;
  sector?: string;
  memo?: string;
}

const SECTORS = [
  { value: '', label: 'セクターを選択' },
  { value: 'Technology', label: 'テクノロジー' },
  { value: 'Healthcare', label: 'ヘルスケア' },
  { value: 'Finance', label: '金融' },
  { value: 'Consumer', label: '一般消費財' },
  { value: 'Energy', label: 'エネルギー' },
  { value: 'Industrial', label: '資本財' },
  { value: 'Materials', label: '素材' },
  { value: 'Utilities', label: '公益事業' },
  { value: 'Real Estate', label: '不動産' },
  { value: 'Communication', label: '通信' },
];

export const AddHoldingModal: React.FC<AddHoldingModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  portfolios,
  tickerPresets,
}) => {
  const [positionType, setPositionType] = useState<PositionType>('stock');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [formData, setFormData] = useState<HoldingFormData>({
    portfolio_id: portfolios[0]?.id || '',
    symbol: '',
    market: 'US',
    shares: 0,
    avg_cost: 0,
    sector: '',
    memo: '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof HoldingFormData, string>>>({});
  const isCashPosition = positionType === 'cash';
  const isFxPosition = positionType === 'fx';

  const handlePresetSelect = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (!presetId) return;

    const preset = tickerPresets.find((item) => item.id === presetId);
    if (!preset) return;

    const nextPositionType: PositionType = preset.market === 'FX' ? 'fx' : 'stock';
    setPositionType(nextPositionType);
    setFormData((prev) => ({
      ...prev,
      symbol: preset.symbol,
      market: preset.market,
      name: preset.name ?? prev.name,
      sector: preset.market === 'FX' ? 'FX' : prev.sector,
    }));
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof HoldingFormData, string>> = {};
    
    if (!isCashPosition && !formData.symbol.trim()) {
      newErrors.symbol = 'ティッカーシンボルを入力してください';
    }
    if (isFxPosition && normalizeFxSymbol(formData.symbol).length !== 6) {
      newErrors.symbol = 'FX通貨ペアは6文字で入力してください（例: USDJPY）';
    }
    if (isFxPosition && normalizeFxSymbol(formData.symbol).length === 6) {
      const quote = normalizeFxSymbol(formData.symbol).slice(3, 6);
      if (!SUPPORTED_FX_QUOTES.includes(quote as (typeof SUPPORTED_FX_QUOTES)[number])) {
        newErrors.symbol = '現在はJPY/USDクォートのFX通貨ペアのみ対応しています';
      }
    }
    if (formData.shares <= 0) {
      newErrors.shares = isCashPosition
        ? '金額は0より大きい値を入力してください'
        : isFxPosition
        ? '取引数量は0より大きい値を入力してください'
        : '株数は1以上を入力してください';
    }
    if (!isCashPosition && formData.avg_cost <= 0) {
      newErrors.avg_cost = isFxPosition
        ? '建値は0より大きい値を入力してください'
        : '取得単価は0より大きい値を入力してください';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      try {
        const normalizedFxSymbol = normalizeFxSymbol(formData.symbol);
        const payload: HoldingFormData = isCashPosition
          ? {
              ...formData,
              symbol: 'CASH',
              name: formData.market === 'US' ? '米ドル現金' : '日本円現金',
              avg_cost: 1,
              sector: 'Cash',
            }
          : isFxPosition
          ? {
              ...formData,
              market: 'FX',
              symbol: normalizedFxSymbol,
              name: `${normalizedFxSymbol.slice(0, 3)}/${normalizedFxSymbol.slice(3, 6)}`,
              sector: 'FX',
            }
          : {
              ...formData,
              symbol: formData.symbol.toUpperCase().trim(),
            };

        await onSubmit({
          ...payload,
        });

        onClose();
        setPositionType('stock');
        setSelectedPresetId('');
        // Reset form
        setFormData({
          portfolio_id: portfolios[0]?.id || '',
          symbol: '',
          market: 'US',
          shares: 0,
          avg_cost: 0,
          sector: '',
          memo: '',
        });
      } catch {
        // エラー表示は呼び出し側で実施
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">ポジションを追加</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Select
            label="ポジション種別"
            value={positionType}
            onChange={(e) => {
              const nextType = e.target.value as PositionType;
              setSelectedPresetId('');
              setPositionType(nextType);
              if (nextType === 'cash') {
                setFormData((prev) => ({
                  ...prev,
                  symbol: 'CASH',
                  market: 'JP',
                  avg_cost: 1,
                  sector: 'Cash',
                }));
                return;
              }
              if (nextType === 'fx') {
                setFormData((prev) => ({
                  ...prev,
                  symbol: '',
                  market: 'FX',
                  avg_cost: 0,
                  sector: 'FX',
                }));
                return;
              }

              setFormData((prev) => ({
                ...prev,
                symbol: '',
                market: 'US',
                avg_cost: 0,
                sector: '',
              }));
            }}
            options={[
              { value: 'stock', label: '株式' },
              { value: 'fx', label: 'FX' },
              { value: 'cash', label: '現金' },
            ]}
          />

          {!isCashPosition && (
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
          )}

          <Select
            label="口座"
            value={formData.portfolio_id}
            onChange={(e) => setFormData({ ...formData, portfolio_id: e.target.value })}
            options={portfolios.map(p => ({ value: p.id, label: p.name }))}
          />

          <div className={`grid gap-4 ${isCashPosition ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {!isCashPosition && (
              <Input
                label={isFxPosition ? '通貨ペア' : 'ティッカー'}
                placeholder={isFxPosition ? 'USDJPY, EURUSD' : 'AAPL, 7203'}
                value={formData.symbol}
                onChange={(e) => {
                  setSelectedPresetId('');
                  setFormData({ ...formData, symbol: e.target.value });
                }}
                error={errors.symbol}
              />
            )}
            <Select
              label={isCashPosition ? '通貨' : isFxPosition ? '市場' : '市場'}
              value={formData.market}
              onChange={(e) => {
                setSelectedPresetId('');
                setFormData({ ...formData, market: e.target.value as Market });
              }}
              options={
                isCashPosition
                  ? [
                      { value: 'US', label: '米ドル (USD)' },
                      { value: 'JP', label: '日本円 (JPY)' },
                    ]
                  : isFxPosition
                  ? [{ value: 'FX', label: 'FX (通貨ペア)' }]
                  : [
                      { value: 'US', label: '米国株' },
                      { value: 'JP', label: '日本株' },
                    ]
              }
            />
          </div>

          <div className={`grid gap-4 ${isCashPosition ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <Input
              label={isCashPosition ? '金額' : isFxPosition ? '取引数量' : '株数'}
              type="number"
              min="1"
              value={formData.shares || ''}
              onChange={(e) => setFormData({ ...formData, shares: Number(e.target.value) })}
              error={errors.shares}
            />

            {!isCashPosition && (
              <Input
                label={isFxPosition ? '建値' : '取得単価'}
                type="number"
                min="0"
                step="0.01"
                value={formData.avg_cost || ''}
                onChange={(e) => setFormData({ ...formData, avg_cost: Number(e.target.value) })}
                error={errors.avg_cost}
              />
            )}
          </div>

          {!isCashPosition && !isFxPosition && (
            <Select
              label="セクター"
              value={formData.sector || ''}
              onChange={(e) => setFormData({ ...formData, sector: e.target.value })}
              options={SECTORS}
            />
          )}

          {isCashPosition && (
            <p className="text-xs text-slate-500">
              現金ポジションは評価額と取得額を同額として管理します。
            </p>
          )}
          {isFxPosition && (
            <p className="text-xs text-slate-500">
              FXは通貨ペア（6文字）で入力してください。数量 x 建値で評価額を計算します。
            </p>
          )}

          <Input
            label="メモ（任意）"
            placeholder="投資理由など"
            value={formData.memo || ''}
            onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
          />

          {/* Actions */}
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
