'use client';

import React, { useState } from 'react';
import { HoldingWithPrice, Market } from '@/types';
import { formatCurrency, formatPercent, getProfitLossColor, getMarketCurrency } from '@/lib/utils';
import { GripVertical, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface HoldingsTableProps {
  holdings: HoldingWithPrice[];
  onHoldingClick?: (holding: HoldingWithPrice) => void;
  onReorder?: (holdings: HoldingWithPrice[]) => void | Promise<void>;
  isReordering?: boolean;
}

export const HoldingsTable: React.FC<HoldingsTableProps> = ({
  holdings,
  onHoldingClick,
  onReorder,
  isReordering = false,
}) => {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const canReorder = Boolean(onReorder) && holdings.length > 1;

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="w-4 h-4" />;
    if (change < 0) return <TrendingDown className="w-4 h-4" />;
    return <Minus className="w-4 h-4" />;
  };

  const getMarketBadge = (market: Market, isCash: boolean) => {
    const styles = isCash
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      : market === 'FX'
      ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
      : market === 'US'
      ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      : 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded border ${styles}`}>
        {isCash ? 'CASH' : market}
      </span>
    );
  };

  const resetDragState = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDrop = (targetId: string | null) => {
    if (!canReorder || !draggedId || draggedId === targetId) {
      resetDragState();
      return;
    }

    const movingHolding = holdings.find((holding) => holding.id === draggedId);
    if (!movingHolding) {
      resetDragState();
      return;
    }

    const remainingHoldings = holdings.filter((holding) => holding.id !== draggedId);
    const targetIndex = targetId
      ? remainingHoldings.findIndex((holding) => holding.id === targetId)
      : remainingHoldings.length;
    const insertIndex = targetIndex < 0 ? remainingHoldings.length : targetIndex;
    const nextHoldings = [
      ...remainingHoldings.slice(0, insertIndex),
      movingHolding,
      ...remainingHoldings.slice(insertIndex),
    ];

    void onReorder?.(nextHoldings);
    resetDragState();
  };

  return (
    <div className="overflow-x-auto" aria-busy={isReordering}>
      <table className="w-full">
        <thead>
          <tr className="text-left text-sm text-slate-400 border-b border-slate-700/50">
            {canReorder && <th className="w-10 pb-3 pl-2 font-medium" aria-label="Order" />}
            <th className="pb-3 pl-2 font-medium">銘柄</th>
            <th className="pb-3 font-medium text-right">数量</th>
            <th className="pb-3 font-medium text-right">現在値</th>
            <th className="pb-3 font-medium text-right">評価額</th>
            <th className="pb-3 pr-2 font-medium text-right">損益</th>
          </tr>
        </thead>
        <tbody
          className="divide-y divide-slate-700/30"
          onDragOver={(event) => {
            if (!canReorder) return;
            event.preventDefault();
          }}
          onDrop={(event) => {
            if (!canReorder) return;
            event.preventDefault();
            handleDrop(null);
          }}
        >
          {holdings.map((holding) => {
            const isCash = holding.symbol === 'CASH';
            const isMissing = holding.price_status === 'missing';
            const isFx = holding.market === 'FX';
            const currency = getMarketCurrency(holding.market, holding.symbol);
            const profitLossPercent = holding.profit_loss_percent ?? 0;
            const profitLoss = holding.profit_loss ?? 0;
            const changePercent = holding.change_percent ?? 0;
            const isDragging = draggedId === holding.id;
            const isDragOver = dragOverId === holding.id && draggedId !== holding.id;

            return (
              <tr 
                key={holding.id}
                onDragOver={(event) => {
                  if (!canReorder) return;
                  event.preventDefault();
                  setDragOverId(holding.id);
                }}
                onDrop={(event) => {
                  if (!canReorder) return;
                  event.preventDefault();
                  event.stopPropagation();
                  handleDrop(holding.id);
                }}
                className={`group hover:bg-slate-700/20 transition-colors cursor-pointer ${
                  isDragOver ? 'bg-blue-500/10 shadow-[inset_3px_0_0_rgba(96,165,250,0.9)]' : ''
                } ${isDragging ? 'opacity-50' : ''}`}
                onClick={() => onHoldingClick?.(holding)}
              >
                {canReorder && (
                  <td className="w-10 py-4 pl-2 align-top">
                    <button
                      type="button"
                      draggable={!isReordering}
                      aria-label="Drag to reorder"
                      title="Drag to reorder"
                      onClick={(event) => event.stopPropagation()}
                      onDragStart={(event) => {
                        event.stopPropagation();
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', holding.id);
                        setDraggedId(holding.id);
                      }}
                      onDragEnd={resetDragState}
                      className="mt-0.5 inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-slate-200 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={isReordering}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                  </td>
                )}
                <td className="py-4 pl-2">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-100">
                          {holding.symbol}
                        </span>
                        {getMarketBadge(holding.market, isCash)}
                      </div>
                      <p className="text-sm text-slate-400 mt-0.5">
                        {holding.name}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="py-4 text-right">
                  {isCash ? (
                    <span className="text-slate-200">
                      {formatCurrency(holding.shares, currency)}
                    </span>
                  ) : isFx ? (
                    <>
                      <span className="text-slate-200">
                        {holding.shares.toLocaleString()}
                      </span>
                      <span className="text-slate-500 text-sm ml-1">通貨</span>
                    </>
                  ) : (
                    <>
                      <span className="text-slate-200">
                        {holding.shares.toLocaleString()}
                      </span>
                      <span className="text-slate-500 text-sm ml-1">株</span>
                    </>
                  )}
                </td>
                <td className="py-4 text-right">
                  {isMissing ? (
                    <span className="text-slate-400">価格未取得</span>
                  ) : (
                    <div className="flex flex-col items-end">
                      <span className="text-slate-200">
                        {isCash ? '-' : formatCurrency(holding.current_price ?? 0, currency)}
                      </span>
                      {!isCash && (
                        <div className={`flex items-center gap-1 text-sm ${getProfitLossColor(changePercent)}`}>
                          {getChangeIcon(changePercent)}
                          <span>{formatPercent(changePercent)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td className="py-4 text-right">
                  <div className="flex flex-col items-end">
                    <span className="text-slate-200">
                      {formatCurrency(holding.current_value_jpy ?? 0, 'JPY')}
                    </span>
                    {(holding.market === 'US' || currency === 'USD') && (
                      <span className="text-sm text-slate-500">
                        {formatCurrency(holding.current_value ?? 0, 'USD')}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-4 pr-2 text-right">
                  {isMissing ? (
                    <span className="text-slate-400">価格未取得</span>
                  ) : (
                    <div className={`flex flex-col items-end ${getProfitLossColor(profitLoss)}`}>
                      <span className="font-medium">
                        {profitLoss >= 0 ? '+' : ''}{formatCurrency(profitLoss, 'JPY')}
                      </span>
                      <span className="text-sm">
                        {isCash ? '-' : formatPercent(profitLossPercent)}
                      </span>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      
      {holdings.length === 0 && (
        <div className="py-12 text-center text-slate-500">
          保有銘柄がありません
        </div>
      )}
    </div>
  );
};
