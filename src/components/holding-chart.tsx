'use client';

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { HoldingAllocation } from '@/types';
import { formatCurrency, getMarketLabel } from '@/lib/utils';

interface HoldingChartProps {
  data: HoldingAllocation[];
}

type PieLabelProps = {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  payload?: HoldingAllocation;
};

const getDisplayName = (item: HoldingAllocation) => {
  if (item.symbol === 'CASH') return item.market === 'US' ? '米ドル現金' : '日本円現金';
  return item.symbol;
};

const CustomTooltip: React.FC<{
  active?: boolean;
  payload?: { payload: HoldingAllocation }[];
}> = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
        <p className="font-medium text-slate-100">{getDisplayName(item)}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {item.name && item.name !== getDisplayName(item) ? item.name : getMarketLabel(item.market)}
        </p>
        <p className="text-sm text-slate-400 mt-1">
          {formatCurrency(item.value)} ({item.percent.toFixed(1)}%)
        </p>
      </div>
    );
  }
  return null;
};

export const HoldingChart: React.FC<HoldingChartProps> = ({ data }) => {
  const positiveData = data.filter((item) => Number.isFinite(item.value) && item.value > 0);
  const chartTotal = positiveData.reduce((sum, item) => sum + item.value, 0);
  const chartData = positiveData
    .map((item) => ({
      ...item,
      percent: chartTotal > 0 ? (item.value / chartTotal) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const renderCustomLabel = (props: PieLabelProps) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, payload } = props;
    if (
      cx === undefined ||
      cy === undefined ||
      midAngle === undefined ||
      innerRadius === undefined ||
      outerRadius === undefined ||
      !payload ||
      payload.percent < 5
    ) {
      return null;
    }

    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        className="text-xs font-medium"
      >
        {`${payload.percent.toFixed(1)}%`}
      </text>
    );
  };

  if (chartData.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-sm text-slate-500">
        表示できる配分データがありません
      </div>
    );
  }

  return (
    <div className="h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="45%"
            labelLine={false}
            label={renderCustomLabel}
            outerRadius={96}
            innerRadius={58}
            dataKey="value"
            nameKey="symbol"
            strokeWidth={2}
            stroke="#1e293b"
          >
            {chartData.map((entry, index) => (
              <Cell key={`${entry.symbol}-${entry.market}-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(_, entry) => {
              const item = entry.payload as HoldingAllocation | undefined;
              return <span className="text-sm text-slate-300">{item ? getDisplayName(item) : ''}</span>;
            }}
            wrapperStyle={{ paddingTop: '12px' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
