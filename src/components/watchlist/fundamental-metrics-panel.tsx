import { FundamentalMetrics } from '@/types';
import { formatDate } from '@/lib/utils';
import { formatMetricCurrency, formatMetricMultiple, formatMetricPercent } from './format';

export const FundamentalMetricsPanel = ({ metrics }: { metrics: FundamentalMetrics }) => {
  const currency = metrics.currency;
  const groups = [
    {
      title: 'バリュエーション指標',
      items: [
        ['時価総額', formatMetricCurrency(metrics.market_cap, currency)],
        ['PER', formatMetricMultiple(metrics.trailing_pe)],
        ['予想PER', formatMetricMultiple(metrics.forward_pe)],
        ['PBR', formatMetricMultiple(metrics.pbr)],
        ['PSR', formatMetricMultiple(metrics.psr)],
      ],
    },
    {
      title: '収益性指標',
      items: [
        ['売上高', formatMetricCurrency(metrics.revenue, currency)],
        ['営業利益率', formatMetricPercent(metrics.operating_margin)],
        ['純利益率', formatMetricPercent(metrics.net_margin)],
        ['ROE', formatMetricPercent(metrics.roe)],
        ['ROA', formatMetricPercent(metrics.roa)],
      ],
    },
    {
      title: '成長性指標',
      items: [
        ['売上成長率', formatMetricPercent(metrics.revenue_growth, true)],
        ['営業利益成長率', formatMetricPercent(metrics.operating_income_growth, true)],
        ['EPS成長率', formatMetricPercent(metrics.eps_growth, true)],
      ],
    },
    {
      title: '財務指標',
      items: [
        ['自己資本比率', formatMetricPercent(metrics.equity_ratio)],
        ['有利子負債', formatMetricCurrency(metrics.interest_bearing_debt, currency)],
        ['ネットキャッシュ', formatMetricCurrency(metrics.net_cash, currency)],
        ['フリーCF', formatMetricCurrency(metrics.free_cash_flow, currency)],
      ],
    },
    {
      title: '株主還元',
      items: [
        ['配当利回り', formatMetricPercent(metrics.dividend_yield)],
        ['配当性向', formatMetricPercent(metrics.payout_ratio)],
        ['自社株買い', formatMetricCurrency(metrics.share_buyback, currency)],
      ],
    },
  ] as const;

  return (
    <div className="col-span-full border-t border-slate-700/50 pt-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-200">財務指標</div>
        <div className="text-xs text-slate-500">
          次回決算日: {metrics.next_earnings_date ? formatDate(metrics.next_earnings_date, 'short') : '-'}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {groups.map((group) => (
          <div key={group.title} className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-3">
            <div className="mb-2 text-xs font-semibold text-slate-400">{group.title}</div>
            <dl className="space-y-1.5">
              {group.items.map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 text-xs">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-right font-medium text-slate-200">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
};
