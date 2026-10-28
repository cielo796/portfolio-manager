'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { SECTORS } from '@/lib/sectors';
import { Market, TickerPreset } from '@/types';
import { normalizeFxSymbol } from '@/lib/utils';

type PositionType = 'stock' | 'fx' | 'cash';
const SUPPORTED_FX_QUOTES = ['JPY', 'USD'] as const;

const defaultCashName = (market: Market) => (market === 'US' ? '米ドル現金' : '日本円現金');

const isDefaultCashName = (name?: string) => {
  const normalizedName = name?.trim();
  return !normalizedName || normalizedName === defaultCashName('US') || normalizedName === defaultCashName('JP');
};

const parseNumericInput = (value: string): number => {
  const normalized = value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[，,]/g, '')
    .replace(/．/g, '.')
    .replace(/[^\d.-]/g, '')
    .trim();

  return normalized ? Number(normalized) : 0;
};

interface AddHoldingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: HoldingFormData) => Promise<void> | void;
  portfolios: { id: string; name: string }[];
  tickerPresets: TickerPreset[];
  initial?: Partial<HoldingFormData>;
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

export const AddHoldingModal: React.FC<AddHoldingModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  portfolios,
  tickerPresets,
  initial,
}) => {
  const [positionType, setPositionType] = useState<PositionType>(initial?.symbol === 'CASH' ? 'cash' : initial?.market === 'FX' ? 'fx' : 'stock');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [cashAmountInput, setCashAmountInput] = useState('');
  const [quantityInput, setQuantityInput] = useState('');
  const [avgCostInput, setAvgCostInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<HoldingFormData>({
    portfolio_id: portfolios[0]?.id || '',
    symbol: '',
    market: 'US',
    shares: 0,
    avg_cost: 0,
    sector: '',
    memo: '',
    ...initial,
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
      sector: preset.market === 'FX' ? '' : prev.sector,
    }));
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof HoldingFormData, string>> = {};
    const shares = parseNumericInput(isCashPosition ? cashAmountInput : quantityInput);
    const avgCost = parseNumericInput(avgCostInput);
    
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
    if (!Number.isFinite(shares) || shares <= 0) {
      newErrors.shares = isCashPosition
        ? '金額は0より大きい値を直接入力してください'
        : isFxPosition
        ? '取引数量は0より大きい値を入力してください'
        : '株数は1以上を入力してください';
    }
    if (!isCashPosition && (!Number.isFinite(avgCost) || avgCost <= 0)) {
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
      setIsSubmitting(true);
      try {
        const normalizedFxSymbol = normalizeFxSymbol(formData.symbol);
        const cashMarket: Market = formData.market === 'US' ? 'US' : 'JP';
        const cashAmount = parseNumericInput(cashAmountInput);
        const quantity = parseNumericInput(quantityInput);
        const avgCost = parseNumericInput(avgCostInput);
        const payload: HoldingFormData = isCashPosition
          ? {
              ...formData,
              symbol: 'CASH',
              market: cashMarket,
              shares: cashAmount,
              name: formData.name?.trim() || defaultCashName(cashMarket),
              avg_cost: 1,
              sector: undefined,
            }
          : isFxPosition
          ? {
              ...formData,
              market: 'FX',
              symbol: normalizedFxSymbol,
              shares: quantity,
              avg_cost: avgCost,
              name: `${normalizedFxSymbol.slice(0, 3)}/${normalizedFxSymbol.slice(3, 6)}`,
              sector: undefined,
            }
          : {
              ...formData,
              symbol: formData.symbol.toUpperCase().trim(),
              shares: quantity,
              avg_cost: avgCost,
            };

        await onSubmit({
          ...payload,
        });

        onClose();
        setPositionType('stock');
        setSelectedPresetId('');
        setCashAmountInput('');
        setQuantityInput('');
        setAvgCostInput('');
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
      } finally {
        setIsSubmitting(false);
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
              setQuantityInput('');
              setAvgCostInput('');
              if (nextType === 'cash') {
                setCashAmountInput('');
                setFormData((prev) => ({
                  ...prev,
                  symbol: 'CASH',
                  market: 'JP',
                  shares: 0,
                  name: defaultCashName('JP'),
                  avg_cost: 1,
                  sector: undefined,
                }));
                return;
              }
              if (nextType === 'fx') {
                setCashAmountInput('');
                setFormData((prev) => ({
                  ...prev,
                  symbol: '',
                  market: 'FX',
                  shares: 0,
                  name: '',
                  avg_cost: 0,
                  sector: undefined,
                }));
                return;
              }

              setFormData((prev) => ({
                ...prev,
                symbol: '',
                market: 'US',
                shares: 0,
                name: '',
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
                const nextMarket = e.target.value as Market;
                setFormData((prev) => ({
                  ...prev,
                  market: nextMarket,
                  name: isCashPosition && isDefaultCashName(prev.name)
                    ? defaultCashName(nextMarket)
                    : prev.name,
                }));
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

          {isCashPosition && (
            <Input
              label="表示名（任意）"
              placeholder={defaultCashName(formData.market)}
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          )}

          <div className={`grid gap-4 ${isCashPosition ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {isCashPosition ? (
              <Input
                key="cash-amount"
                id="cash-amount"
                label="金額"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="1,000,000"
                value={cashAmountInput}
                onChange={(e) => setCashAmountInput(e.currentTarget.value)}
                error={errors.shares}
              />
            ) : (
              <Input
                key={`position-quantity-${positionType}`}
                id="position-quantity"
                label={isFxPosition ? '取引数量' : '株数'}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder={isFxPosition ? '10,000' : '100'}
                value={quantityInput}
                onChange={(e) => setQuantityInput(e.currentTarget.value)}
                error={errors.shares}
              />
            )}

            {!isCashPosition && (
              <Input
                key={`position-avg-cost-${positionType}`}
                id="position-avg-cost"
                label={isFxPosition ? '建値' : '取得単価'}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder={isFxPosition ? '150.25' : '1,000.00'}
                value={avgCostInput}
                onChange={(e) => setAvgCostInput(e.currentTarget.value)}
                error={errors.avg_cost}
              />
            )}
          </div>

          {!isCashPosition && !isFxPosition && (
            <Select
              label="セクター"
              value={formData.sector || ''}
              onChange={(e) => setFormData({ ...formData, sector: e.target.value })}
              options={[
                { value: '', label: 'セクターを自動判定' },
                ...SECTORS.map(({ key, label }) => ({ value: key, label })),
              ]}
            />
          )}

          {isCashPosition && (
            <p className="text-xs text-slate-500">
              現金ポジションはティッカー登録なしで金額を直接入力できます。カンマ付きの貼り付けにも対応しています。
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
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1" disabled={isSubmitting}>
              キャンセル
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              追加
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
