'use client';

import { useEffect, useRef } from 'react';
import { CandlestickSeries, ColorType, HistogramSeries, LineSeries, LineStyle, createChart, createSeriesMarkers } from 'lightweight-charts';
import type { SeriesMarker, Time } from 'lightweight-charts';
import type { Candle, ChartSettings, Transaction } from '@/types';
import { aggregateCandles, chartRangeStart, simpleMovingAverage } from '@/lib/chart-data';
import { useDisplaySettings } from '@/hooks/use-display-settings';
import { tradeMarkers } from './chart-model';

export function CandlestickChart({ candles, settings, cost, targets, transactions, symbol }: {
  candles: Candle[]; settings: ChartSettings; cost?: number; targets: number[]; transactions: Transaction[]; symbol: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const { settings: display } = useDisplaySettings();
  useEffect(() => {
    if (!container.current) return;
    const tokens = getComputedStyle(container.current);
    const color = (name: string) => tokens.getPropertyValue(name).trim();
    const up = color('--pm-up');
    const down = color('--pm-down');
    const chart = createChart(container.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: color('--pm-panel') }, textColor: color('--pm-muted'), fontSize: 11, attributionLogo: true, panes: { separatorColor: color('--pm-border'), separatorHoverColor: color('--pm-border'), enableResize: false } },
      grid: { vertLines: { color: color('--pm-divider') }, horzLines: { color: color('--pm-divider') } },
      rightPriceScale: { borderColor: color('--pm-border') },
      timeScale: { borderColor: color('--pm-border') },
      localization: { locale: 'ja-JP' },
    });
    const series = chart.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false, priceFormat: { type: 'price', precision: 4, minMove: 0.0001 } });
    const aggregated = aggregateCandles(candles, settings.interval);
    const today = new Date().toISOString().slice(0, 10);
    const start = chartRangeStart(settings.range, today);
    const visible = aggregated.filter((item) => item.date >= start);
    series.setData(visible.map((item) => item.open === null || item.high === null || item.low === null
      ? { time: item.date }
      : { time: item.date, open: item.open, high: item.high, low: item.low, close: item.close }));
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false }, 1);
    volume.setData(visible.map((item) => item.volume === null ? { time: item.date } : { time: item.date, value: item.volume, color: item.close >= (item.open ?? item.close) ? up : down }));
    chart.panes()[0].setStretchFactor(4);
    chart.panes()[1].setStretchFactor(1);
    const maColors = ['#f5b955', '#a78bfa', '#2dd4bf'];
    ([5, 25, 75] as const).forEach((period, index) => {
      if (!settings[`ma${period}`]) return;
      const values = simpleMovingAverage(aggregated.map((item) => item.close), period);
      const ma = chart.addSeries(LineSeries, { color: maColors[index], lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: `MA${period}` });
      ma.setData(aggregated.flatMap((item, i) => item.date >= start && values[i] !== null ? [{ time: item.date, value: values[i]! }] : []));
    });
    const priceLine = (price: number, title: string, lineColor: string) => {
      if (Number.isFinite(price) && price > 0) series.createPriceLine({ price, title, color: lineColor, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true });
    };
    if (settings.cost && cost !== undefined) priceLine(cost, '取得単価', color('--pm-accent'));
    if (settings.target) targets.forEach((price) => priceLine(price, '目標価格', '#2dd4bf'));
    if (settings.trades) {
      const markers: SeriesMarker<Time>[] = tradeMarkers(visible, transactions, settings.interval).map((item) => ({
        time: item.time, position: item.type === 'buy' ? 'belowBar' : 'aboveBar', shape: item.type === 'buy' ? 'arrowUp' : 'arrowDown',
        color: item.type === 'buy' ? '#7fb3ff' : '#f5b955', text: `${item.type === 'buy' ? '▲購入' : '▼売却'} ${item.shares}`,
      }));
      createSeriesMarkers(series, markers);
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, settings, cost, targets, transactions, display.updown]);
  return <div><div ref={container} role="img" aria-label={`${symbol}のローソク足・移動平均・出来高チャート`} className="h-[360px] min-w-0 min-[1500px]:h-[440px]" /><div className="px-3 py-1 text-right text-[10px] pm-muted">出来高（下段） · <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer" className="text-[var(--pm-link)]">TradingView Lightweight Charts™</a></div></div>;
}
