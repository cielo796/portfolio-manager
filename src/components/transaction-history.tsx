'use client';

import React from 'react';
import { Transaction } from '@/types';
import { formatCurrency, formatDate, getMarketCurrency, getProfitLossColor } from '@/lib/utils';

interface TransactionHistoryProps {
  transactions: Transaction[];
  maxItems?: number;
}

const TYPE_LABEL: Record<Transaction['type'], string> = {
  buy: '買付',
  sell: '売却',
  dividend: '配当',
};

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({ transactions, maxItems }) => {
  const displayItems = maxItems ? transactions.slice(0, maxItems) : transactions;

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-left text-sm text-slate-400 border-b border-slate-700/50">
            <th className="pb-3 pl-2 font-medium">取引日</th>
            <th className="pb-3 font-medium">銘柄</th>
            <th className="pb-3 font-medium">種別</th>
            <th className="pb-3 font-medium text-right">数量</th>
            <th className="pb-3 font-medium text-right">単価</th>
            <th className="pb-3 pr-2 font-medium text-right">受払金額</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/30">
          {displayItems.map((item) => {
            const currency = getMarketCurrency(item.market, item.symbol);
            const gross = item.total_amount;
            const net = item.type === 'buy' ? -(gross + item.fees) : gross - item.fees;

            return (
              <tr key={item.id} className="hover:bg-slate-700/20 transition-colors">
                <td className="py-3 pl-2 text-sm text-slate-300">{formatDate(item.transaction_date, 'short')}</td>
                <td className="py-3 text-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.symbol}</span>
                    <span className="text-xs text-slate-500">{item.market}</span>
                  </div>
                </td>
                <td className="py-3 text-sm text-slate-300">{TYPE_LABEL[item.type]}</td>
                <td className="py-3 text-right text-slate-300">{item.shares.toLocaleString()}</td>
                <td className="py-3 text-right text-slate-300">{formatCurrency(item.price, currency)}</td>
                <td className="py-3 pr-2 text-right">
                  <div className={`font-medium ${getProfitLossColor(net)}`}>
                    {net >= 0 ? '+' : ''}
                    {formatCurrency(net, currency)}
                  </div>
                  {item.fees > 0 && <div className="text-xs text-slate-500">手数料 {formatCurrency(item.fees, currency)}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {displayItems.length === 0 && (
        <div className="py-10 text-center text-slate-500">売買履歴がありません</div>
      )}
    </div>
  );
};
