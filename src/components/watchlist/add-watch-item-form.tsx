'use client';

import type { WatchlistState } from '@/hooks/use-watchlist';
import { Plus } from 'lucide-react';
import { Market } from '@/types';
import { SectorKey, resolveSectorForSymbol } from '@/lib/sectors';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { MARKET_OPTIONS, SECTOR_OPTIONS } from './constants';

type AddWatchItemFormProps = Pick<WatchlistState,
  | 'showAddForm'
  | 'handleAddWatchItem'
  | 'selectedSymbol'
  | 'handleSymbolSelect'
  | 'symbolOptions'
  | 'isSubmittingWatchItem'
  | 'symbol'
  | 'setSelectedSymbol'
  | 'setSymbol'
  | 'setCompanyName'
  | 'setSector'
  | 'market'
  | 'setMarket'
  | 'companyName'
  | 'sector'
  | 'targetPrice'
  | 'setTargetPrice'
  | 'memo'
  | 'setMemo'
>;

export const AddWatchItemForm = ({
  showAddForm,
  handleAddWatchItem,
  selectedSymbol,
  handleSymbolSelect,
  symbolOptions,
  isSubmittingWatchItem,
  symbol,
  setSelectedSymbol,
  setSymbol,
  setCompanyName,
  setSector,
  market,
  setMarket,
  companyName,
  sector,
  targetPrice,
  setTargetPrice,
  memo,
  setMemo,
}: AddWatchItemFormProps) => {
  return (
    <>
    {showAddForm && <div className="border-t border-[var(--pm-border)] p-2">
      <form id="watchlist-add-form" onSubmit={handleAddWatchItem} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
        <div className="lg:col-span-3">
          <Select
            label="候補から選択"
            value={selectedSymbol}
            onChange={(event) => handleSymbolSelect(event.target.value)}
            options={[
              { value: '', label: '手入力する' },
              ...symbolOptions.map((option) => ({ value: option.value, label: option.label })),
            ]}
            disabled={isSubmittingWatchItem}
          />
        </div>
        <div className="lg:col-span-2">
          <Input
            label="銘柄"
            placeholder="AAPL / 7203 / USDJPY"
            value={symbol}
            onChange={(event) => {
              setSelectedSymbol('');
              setSymbol(event.target.value.toUpperCase());
              setCompanyName('');
              setSector(resolveSectorForSymbol(event.target.value.toUpperCase(), market));
            }}
            disabled={isSubmittingWatchItem}
          />
        </div>
        <div className="lg:col-span-2">
          <Select
            label="市場"
            value={market}
            onChange={(event) => {
              setSelectedSymbol('');
              setMarket(event.target.value as Market);
              setCompanyName('');
              setSector(resolveSectorForSymbol(symbol, event.target.value as Market));
            }}
            options={MARKET_OPTIONS}
            disabled={isSubmittingWatchItem}
          />
        </div>
        {market === 'JP' && (
          <div className="lg:col-span-2">
            <Input
              label="会社名"
              placeholder="トヨタ自動車"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              disabled={isSubmittingWatchItem}
            />
          </div>
        )}
        <div className="lg:col-span-3">
          <Select
            label="セクター"
            value={sector}
            onChange={(event) => setSector(event.target.value as SectorKey)}
            options={SECTOR_OPTIONS}
            disabled={isSubmittingWatchItem}
          />
        </div>
        <div className="lg:col-span-2">
          <Input
            label="目標価格"
            placeholder="未設定（任意）"
            type="number"
            min="0"
            step="0.0001"
            value={targetPrice}
            onChange={(event) => setTargetPrice(event.target.value)}
            disabled={isSubmittingWatchItem}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-10">
          <Input
            id="watchlist-add-memo"
            label="メモ"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            disabled={isSubmittingWatchItem}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-2 flex items-end justify-end">
          <Button type="submit" disabled={isSubmittingWatchItem}>
            <Plus className="w-4 h-4" />
            このリストに追加
          </Button>
        </div>
      </form>
    </div>}
    </>
  );
};
