'use client';

import { useEffect, useRef } from 'react';
import { AreaSeries, ColorType, createChart, LineSeries, LineStyle } from 'lightweight-charts';
import type { HistoryBenchmarks, PortfolioSnapshot } from '@/types';
import { useDisplaySettings } from '@/hooks/use-display-settings';
import { comparisonSeries, historySegments } from './model';

export function HistoryChart({ rows, comparison, yen = true, benchmarks, compact = false }: {
  rows: PortfolioSnapshot[]; comparison?: boolean; yen?: boolean; benchmarks?: HistoryBenchmarks; compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { settings } = useDisplaySettings();
  useEffect(() => {
    if (!ref.current || !rows.length) return;
    const tokens = getComputedStyle(ref.current);
    const color = (name: string) => tokens.getPropertyValue(name).trim();
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: color('--pm-panel') }, textColor: color('--pm-muted'), fontSize: 11,
        panes: { separatorColor: color('--pm-border'), enableResize: false } },
      grid: { vertLines: { color: color('--pm-divider') }, horzLines: { color: color('--pm-divider') } },
      rightPriceScale: { borderColor: color('--pm-border') }, timeScale: { borderColor: color('--pm-border') },
      localization: { locale: 'ja-JP' }, handleScroll: !compact, handleScale: !compact,
    });
    const compared = comparison && benchmarks ? comparisonSeries(rows, benchmarks.sp500, benchmarks.nikkei, benchmarks.usdJpy, yen) : null;
    const main = compared?.portfolio ?? rows.map((row) => ({ date: row.snapshot_date, value: row.market_value_jpy }));
    const estimates = new Set(rows.filter((row) => row.is_estimate).map((row) => row.snapshot_date));
    // 種類が切り替わる境界を共有し、推計区間を破線でつなぐ。
    const segments = historySegments(main, estimates);
    for (const [i, { estimate, points }] of segments.entries()) {
      const line = chart.addSeries(LineSeries, { color: estimate ? '#7894b8' : '#7fb3ff', lineWidth: 2,
        lineStyle: estimate ? LineStyle.Dashed : LineStyle.Solid, priceLineVisible: false,
        lastValueVisible: i === segments.length - 1, pointMarkersVisible: points.length === 1,
        title: compact ? '' : estimate ? '評価額（参考）' : comparison ? '資産指数' : '評価額' });
      line.setData(points.map((point) => ({ time: point.date, value: point.value })));
    }
    if (compared) {
      for (const [points, lineColor, title] of [[compared.sp500, '#f5b955', yen ? 'S&P500（円）' : 'S&P500（USD）'], [compared.nikkei, '#2dd4bf', '日経平均']] as const) {
        chart.addSeries(LineSeries, { color: lineColor, lineWidth: 1, title, priceLineVisible: false })
          .setData(points.map((point) => ({ time: point.date, value: point.value })));
      }
    } else if (!compact) {
      chart.addSeries(LineSeries, { color: '#f5b955', lineStyle: LineStyle.Dotted, lineWidth: 1, title: '取得額', priceLineVisible: false })
        .setData(rows.map((row) => ({ time: row.snapshot_date, value: row.cost_basis_jpy })));
      const profitSegments = historySegments(rows.map((row) => ({ date: row.snapshot_date, value: row.market_value_jpy - row.cost_basis_jpy })), estimates);
      for (const [i, { estimate, points }] of profitSegments.entries()) {
        chart.addSeries(AreaSeries, { lineColor: estimate ? '#819c96' : '#2dd4bf', topColor: estimate ? '#819c9630' : '#2dd4bf40',
          bottomColor: '#2dd4bf00', lineWidth: 1, lineStyle: estimate ? LineStyle.Dashed : LineStyle.Solid,
          title: estimate ? '損益（参考）' : '評価損益', priceLineVisible: false,
          lastValueVisible: i === profitSegments.length - 1, pointMarkersVisible: points.length === 1 }, 1)
          .setData(points.map((point) => ({ time: point.date, value: point.value })));
      }
      chart.panes()[0].setStretchFactor(3);
      chart.panes()[1].setStretchFactor(1);
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [rows, comparison, yen, benchmarks, compact, settings.updown]);
  return <div><div ref={ref} role="img" aria-label={comparison ? '開始日を100とした資産・S&P500・日経平均の比較グラフ' : '資産評価額の推移グラフ'} className={compact ? 'h-36 min-w-0' : 'h-[420px] min-w-0'} />
    {!compact && <p className="px-3 py-1 text-right text-[10px] pm-muted"><a href="https://www.tradingview.com/" target="_blank" rel="noreferrer" className="text-[var(--pm-link)]">TradingView Lightweight Charts™</a></p>}
  </div>;
}
