'use client';

import React from 'react';
import { HoldingWithPrice, Market } from '@/types';
import { formatCurrency, formatPercent, getProfitLossColor, getMarketCurrency } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface HoldingsTableProps {
  holdings: HoldingWithPrice[];
  onHoldingClick?: (holding: HoldingWithPrice) => void;
}

export const HoldingsTable: React.FC<HoldingsTableProps> = ({ holdings, onHoldingClick }) => {
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-left text-sm text-slate-400 border-b border-slate-700/50">
            <th className="pb-3 pl-2 font-medium">銘柄</th>
            <th className="pb-3 font-medium text-right">数量</th>
            <th className="pb-3 font-medium text-right">現在値</th>
            <th className="pb-3 font-medium text-right">評価額</th>
            <th className="pb-3 pr-2 font-medium text-right">損益</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/30">
          {holdings.map((holding) => {
            const isCash = holding.symbol === 'CASH';
            const isFx = holding.market === 'FX';
            const currency = getMarketCurrency(holding.market, holding.symbol);
            const profitLossPercent = holding.profit_loss_percent ?? 0;
            const profitLoss = holding.profit_loss ?? 0;
            const changePercent = holding.change_percent ?? 0;

            return (
              <tr 
                key={holding.id}
                className="group hover:bg-slate-700/20 transition-colors cursor-pointer"
                onClick={() => onHoldingClick?.(holding)}
              >
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
                  <div className={`flex flex-col items-end ${getProfitLossColor(profitLoss)}`}>
                    <span className="font-medium">
                      {profitLoss >= 0 ? '+' : ''}{formatCurrency(profitLoss, 'JPY')}
                    </span>
                    <span className="text-sm">
                      {isCash ? '-' : formatPercent(profitLossPercent)}
                    </span>
                  </div>
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
