'use client';

import React from 'react';
import { PortfolioSummary, ExchangeRate } from '@/types';
import { formatCurrency, formatPercent, getProfitLossColor, getProfitLossBgColor } from '@/lib/utils';
import { TrendingUp, TrendingDown, DollarSign, Landmark, Wallet, CircleDollarSign, ArrowLeftRight } from 'lucide-react';

interface PortfolioSummaryCardProps {
  summary: PortfolioSummary;
  exchangeRate: ExchangeRate;
}

export const PortfolioSummaryCard: React.FC<PortfolioSummaryCardProps> = ({
  summary,
  exchangeRate,
}) => {
  const DailyChangeIcon = summary.daily_change >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
      {/* 総資産 */}
      <div className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 backdrop-blur-sm border border-blue-500/20 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <Wallet className="w-5 h-5 text-blue-400" />
          </div>
          <span className="text-sm text-slate-400">総資産</span>
        </div>
        <p className="text-2xl font-bold text-slate-100 tracking-tight">
          {formatCurrency(summary.total_value_jpy)}
        </p>
        <div className={`flex items-center gap-1.5 mt-2 ${getProfitLossColor(summary.total_profit_loss)}`}>
          <span className="text-sm font-medium">
            {summary.total_profit_loss >= 0 ? '+' : ''}{formatCurrency(summary.total_profit_loss)}
          </span>
          <span className="text-sm">
            ({formatPercent(summary.total_profit_loss_percent)})
          </span>
        </div>
        {summary.missing_price_count > 0 && (
          <p className="text-xs text-slate-400 mt-2">
            価格未取得 {summary.missing_price_count}銘柄（評価額は取得額で計算）
          </p>
        )}
      </div>

      {/* 日次損益 */}
      <div className={`backdrop-blur-sm border rounded-xl p-5 ${getProfitLossBgColor(summary.daily_change)} ${summary.daily_change >= 0 ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2 rounded-lg ${summary.daily_change >= 0 ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
            <DailyChangeIcon className={`w-5 h-5 ${summary.daily_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />
          </div>
          <span className="text-sm text-slate-400">本日の損益</span>
        </div>
        <p className={`text-2xl font-bold tracking-tight ${getProfitLossColor(summary.daily_change)}`}>
          {summary.daily_change >= 0 ? '+' : ''}{formatCurrency(summary.daily_change)}
        </p>
        <p className={`text-sm mt-2 ${getProfitLossColor(summary.daily_change)}`}>
          {formatPercent(summary.daily_change_percent)}
        </p>
      </div>

      {/* 米国株 */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-slate-700/50 rounded-lg">
            <DollarSign className="w-5 h-5 text-blue-400" />
          </div>
          <span className="text-sm text-slate-400">米国株</span>
        </div>
        <p className="text-2xl font-bold text-slate-100 tracking-tight">
          {formatCurrency(summary.us_stock_value_jpy)}
        </p>
        <p className="text-sm text-slate-500 mt-2">
          {formatCurrency(summary.us_stock_value_usd, 'USD')}
        </p>
      </div>

      {/* 日本株 */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-slate-700/50 rounded-lg">
            <Landmark className="w-5 h-5 text-rose-400" />
          </div>
          <span className="text-sm text-slate-400">日本株</span>
        </div>
        <p className="text-2xl font-bold text-slate-100 tracking-tight">
          {formatCurrency(summary.jp_stock_value_jpy)}
        </p>
        <p className="text-sm text-slate-500 mt-2">
          USD/JPY: {exchangeRate.rate.toFixed(2)}
        </p>
      </div>

      {/* 現金 */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-slate-700/50 rounded-lg">
            <CircleDollarSign className="w-5 h-5 text-emerald-400" />
          </div>
          <span className="text-sm text-slate-400">現金</span>
        </div>
        <p className="text-2xl font-bold text-slate-100 tracking-tight">
          {formatCurrency(summary.cash_value_jpy)}
        </p>
        <p className="text-sm text-slate-500 mt-2">
          {summary.cash_value_usd > 0 ? formatCurrency(summary.cash_value_usd, 'USD') : '-'}
        </p>
      </div>

      {/* FX */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-slate-700/50 rounded-lg">
            <ArrowLeftRight className="w-5 h-5 text-cyan-400" />
          </div>
          <span className="text-sm text-slate-400">FX</span>
        </div>
        <p className="text-2xl font-bold text-slate-100 tracking-tight">
          {formatCurrency(summary.fx_value_jpy)}
        </p>
        <p className="text-sm text-slate-500 mt-2">
          {summary.fx_value_usd > 0 ? formatCurrency(summary.fx_value_usd, 'USD') : '-'}
        </p>
      </div>
    </div>
  );
};
