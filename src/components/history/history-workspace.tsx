'use client';

import { useState } from 'react';
import type { HistoryBenchmarks, Portfolio, PortfolioSnapshot } from '@/types';
import { readJson, useDetailResource } from '@/components/detail/data';
import { usePageRefresh } from '@/components/shell/refresh-context';
import { formatCurrency, formatPercent, getProfitLossColor } from '@/lib/utils';
import { HistoryChart } from './history-chart';
import { comparisonSeries, HISTORY_RANGES, historyCsv, historyMetrics, monthlyRows, rangeStart, type HistoryRange } from './model';

export interface SnapshotResponse { snapshots: PortfolioSnapshot[]; portfolios: Portfolio[]; today: string }

function Comparison({ rows, yen }: { rows: PortfolioSnapshot[]; yen: boolean }) {
  const resource = useDetailResource<HistoryBenchmarks>('/api/snapshots/benchmarks');
  const data = resource.data;
  const compared = data ? comparisonSeries(rows, data.sp500, data.nikkei, data.usdJpy, yen) : null;
  if (resource.loading) return <p role="status" className="p-6 pm-muted">比較指標を読み込み中…</p>;
  if (resource.error) return <button type="button" className="pm-button m-3" onClick={() => void resource.reload()}>比較指標を再取得</button>;
  return <>
    {data?.warnings.map((warning) => <p key={warning} role="status" className="px-3 py-1 pm-muted">{warning}</p>)}
    {compared?.portfolio.length ? <><p className="px-3 pt-2 pm-muted">共通開始日 {compared.portfolio[0].date} = 100 · 資産（円） / S&P500（{yen ? '円換算' : '米ドル'}） / 日経平均（円）</p>
      <HistoryChart rows={rows} comparison yen={yen} benchmarks={data} />
      {compared.portfolio.length < rows.length && <p className="px-3 pb-2 pm-muted">指標と為替が揃う日を表示しています。休場日は直近7日以内の終値を使用します。</p>}</>
      : <p className="p-6 pm-muted">比較に必要な共通日の価格履歴がありません。</p>}
  </>;
}

export function HistoryWorkspace() {
  const [portfolioId, setPortfolioId] = useState('');
  const [range, setRange] = useState<HistoryRange>('3M');
  const [comparison, setComparison] = useState(false);
  const [yen, setYen] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  const resource = useDetailResource<SnapshotResponse>(`/api/snapshots${portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : ''}`);
  const refresh = async () => {
    await readJson('/api/portfolio-data');
    await resource.reload();
  };
  usePageRefresh(refresh, resource.loading || creating, resource.data?.snapshots.at(-1)?.updated_at ?? null, !resource.error);
  const allRows = resource.data?.snapshots ?? [];
  const today = resource.data?.today ?? '';
  const start = today ? rangeStart(range, today) : '';
  const rows = allRows.filter((row) => row.snapshot_date >= start && row.snapshot_date <= today);
  const last = rows.at(-1);
  const metrics = historyMetrics(rows.map((row) => ({ date: row.snapshot_date, value: row.market_value_jpy })));
  const months = monthlyRows(allRows).filter(({ row }) => row.snapshot_date >= start && row.snapshot_date <= today);
  const generate = async () => {
    setCreating(true);
    setMessage('');
    try {
      const response = await fetch('/api/snapshots/estimate', { method: 'POST', signal: AbortSignal.timeout(300000) });
      if (!response.ok) throw new Error('estimate_failed');
      const result = await response.json() as { written: number; skippedDays: number; warnings: string[] };
      setMessage(`${result.written}件を作成しました。価格欠損により全口座合計を記録できなかった日: ${result.skippedDays}日。${result.warnings.join(' ')}`);
      await resource.reload();
    } catch { setMessage('参考推移を作成できませんでした。再試行してください。'); }
    finally { setCreating(false); }
  };
  const download = () => {
    const exportRows = allRows.filter((row) => row.snapshot_date <= today);
    const csv = historyCsv(exportRows, start);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `asset-history-${portfolioId || 'ALL'}-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return <div className="space-y-1 text-xs">
    <section className="rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--pm-border)] bg-[var(--pm-heading)] px-3 py-2">
        <h1 className="mr-2 font-semibold">資産推移</h1>
        <div className="flex flex-wrap gap-1" aria-label="表示期間">{HISTORY_RANGES.map((item) => <button type="button" key={item} aria-pressed={range === item} className="pm-button" style={range === item ? { color: 'var(--pm-accent)', background: '#2a2214' } : undefined} onClick={() => setRange(item)}>{item}</button>)}</div>
        <select aria-label="口座" value={portfolioId} className="h-7 rounded border border-[var(--pm-input-border)] bg-[var(--pm-panel)] px-2" onChange={(event) => setPortfolioId(event.target.value)}><option value="">全口座</option>{resource.data?.portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select>
        <button type="button" className="pm-button ml-auto" disabled={creating || resource.loading} onClick={() => void generate()}>{creating ? '参考推移を作成中…' : '参考推移を作成'}</button>
      </header>
      <p className="px-3 py-2 pm-muted">参考推移は現在の保有数量と過去の終値・当時の為替で計算した近似です。売買・入出金履歴は考慮しません。騰落率も入出金調整前の資産額の変化です。</p>
      <p className="px-3 pb-2 pm-muted">価格・円換算レートが欠ける口座は記録しません。全口座合計は全保有の価格が揃った日のみ記録します。</p>
      {message && <p role="status" className="border-t border-[var(--pm-border)] px-3 py-2">{message}</p>}
      <div className="grid grid-cols-2 gap-1 border-t border-[var(--pm-border)] p-2 sm:grid-cols-5">
        {([
          ['評価額', last ? formatCurrency(last.market_value_jpy) : '—'],
          ['取得額', last ? formatCurrency(last.cost_basis_jpy) : '—'],
          ['評価損益', last ? formatCurrency(last.market_value_jpy - last.cost_basis_jpy) : '—'],
          ['期間騰落率', metrics.periodReturn === null ? '—' : formatPercent(metrics.periodReturn)],
          ['最大ドローダウン', metrics.maxDrawdown === null ? '—' : formatPercent(metrics.maxDrawdown)],
        ]).map(([label, value]) => <div key={label} className="px-2 py-1"><div className="pm-muted">{label}</div><div className="num mt-1 text-base">{value}</div></div>)}
      </div>
      {last && <p className="px-3 pb-2 pm-muted">表示期間 {rows[0].snapshot_date} ～ {last.snapshot_date} · 最新値は{last.is_estimate ? '参考推移' : '実測'}（Asia/Tokyo）</p>}
    </section>
    <section className="overflow-hidden rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--pm-border)] bg-[var(--pm-heading)] px-3 py-2">
        <label className="flex items-center gap-1"><input type="checkbox" checked={comparison} onChange={(event) => setComparison(event.target.checked)} />指数で比較</label>
        {comparison ? <select aria-label="S&P500の通貨" value={yen ? 'JPY' : 'USD'} className="h-7 rounded border border-[var(--pm-input-border)] bg-[var(--pm-panel)] px-2" onChange={(event) => setYen(event.target.value === 'JPY')}><option value="JPY">S&P500 円換算</option><option value="USD">S&P500 現地通貨</option></select>
          : <span className="pm-muted"><span className="text-[#7fb3ff]">━</span> 評価額　<span className="text-[#f5b955]">┄</span> 取得額　<span className="text-[#2dd4bf]">━</span> 評価損益（下段）</span>}
        <span className="pm-muted">淡色・破線 = 参考推移</span>
      </div>
      {resource.loading ? <p role="status" className="p-6 pm-muted">資産記録を読み込み中…</p>
        : resource.error ? <p role="alert" className="p-6">資産記録を取得できませんでした。<button type="button" className="pm-button ml-2" onClick={() => void resource.reload()}>再試行</button></p>
          : !rows.length ? <p className="p-6 pm-muted">この期間の資産記録がありません。価格更新後に記録されます。過去の近似は「参考推移を作成」で追加できます。</p>
            : comparison ? <Comparison rows={rows} yen={yen} /> : <HistoryChart rows={rows} />}
    </section>
    <section className="overflow-hidden rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]">
      <header className="flex items-center justify-between border-b border-[var(--pm-border)] bg-[var(--pm-heading)] px-3 py-2"><h2 className="font-semibold">月末の資産（各月の最終記録・当月は途中）</h2><button type="button" className="pm-button" disabled={!months.length || resource.loading || Boolean(resource.error)} onClick={download}>CSV出力</button></header>
      <div className="overflow-auto"><table className="w-full min-w-[620px] border-collapse"><thead className="pm-muted"><tr>{['月 / 記録日', '評価額（円）', '前月比', '取得額（円）', '評価損益（円）', '区分'].map((label, i) => <th key={label} className={`${i === 0 ? 'text-left' : 'num'} px-3 py-2 font-normal`}>{label}</th>)}</tr></thead>
        <tbody>{months.map(({ month, row, change }) => <tr key={month} className="border-t border-[var(--pm-divider)]"><td className="px-3 py-1.5">{month}<span className="ml-2 pm-muted">{row.snapshot_date}</span></td>
          <td className="num px-3">{formatCurrency(row.market_value_jpy)}</td><td className={`num px-3 ${change === null ? 'pm-muted' : getProfitLossColor(change)}`}>{change === null ? '—' : formatPercent(change)}</td>
          <td className="num px-3">{formatCurrency(row.cost_basis_jpy)}</td><td className={`num px-3 ${getProfitLossColor(row.market_value_jpy - row.cost_basis_jpy)}`}>{formatCurrency(row.market_value_jpy - row.cost_basis_jpy)}</td><td className="num px-3 pm-muted">{row.is_estimate ? '参考' : '実測'}</td></tr>)}</tbody>
      </table></div>
      {!months.length && <p className="p-3 pm-muted">月次データはありません。</p>}
    </section>
  </div>;
}
