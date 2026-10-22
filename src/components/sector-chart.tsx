'use client';

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { SectorAllocation } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface SectorChartProps {
  data: SectorAllocation[];
}

type PieLabelProps = {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  payload?: SectorAllocation;
};

const CustomTooltip: React.FC<{
  active?: boolean;
  payload?: { payload: SectorAllocation }[];
}> = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
        <p className="font-medium text-slate-100">{item.label}</p>
        <p className="text-sm text-slate-400 mt-1">
          {formatCurrency(item.value)} ({item.percent.toFixed(1)}%)
        </p>
      </div>
    );
  }
  return null;
};

export const SectorChart: React.FC<SectorChartProps> = ({ data }) => {
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
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderCustomLabel}
            outerRadius={100}
            innerRadius={60}
            dataKey="value"
            nameKey="label"
            strokeWidth={2}
            stroke="#1e293b"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value) => <span className="text-sm text-slate-300">{value}</span>}
            wrapperStyle={{ paddingTop: '20px' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
