'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Holding, Portfolio, StockPrice, TickerPreset, Transaction, TransactionType } from '@/types';
import { transactionLabels, transactionYenRate } from '@/lib/trade-ledger';
import { getProfitLossColor } from '@/lib/utils';
import { RecordForm, type RecordInput } from './record-form';

const panel = 'min-w-0 rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]';
const money = (value: number | null | undefined, currency = 'JPY') => value == null ? '—' :
  new Intl.NumberFormat('ja-JP', { style: 'currency', currency, maximumFractionDigits: currency === 'JPY' ? 0 : 4 }).format(value);
const headers = ['日付', '種別', 'コード', '銘柄名', '数量', '単価', '金額', '手数料', '実現損益', 'メモ', '操作'];

export function RecordsWorkspace() {
  const params = useSearchParams();
  const [data, setData] = useState<{ portfolios: Portfolio[]; holdings: Holding[]; transactions: Transaction[]; stockPrices?: Record<string, StockPrice> }>();
  const [presets, setPresets] = useState<TickerPreset[]>([]);
  const [error, setError] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [filter, setFilter] = useState<TransactionType | 'all'>('all');
  const [editing, setEditing] = useState<Transaction>();
  const [deleteId, setDeleteId] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const load = useCallback(async () => {
    const response = await fetch('/api/portfolio-data', { cache: 'no-store' });
    if (!response.ok) throw new Error('記録を読み込めませんでした。');
    setData(await response.json());
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load).catch((cause) => setError(cause.message));
    void fetch('/api/tickers', { cache: 'no-store' }).then(async (response) => {
      if (response.ok) setPresets((await response.json()).tickerPresets ?? []);
    }).catch(() => {});
  }, [load]);
  if (!data) return <div className="p-3">{error ? <p role="alert">{error}<button className="pm-button ml-2" onClick={() => void load().catch((cause) => setError(cause.message))}>再試行</button></p> : <p role="status">読み込み中…</p>}</div>;
  const selected = data.transactions.filter((entry) => entry.transaction_date.slice(0, 4) === year);
  const rows = selected.filter((entry) => filter === 'all' || entry.type === filter);
  const years = Array.from(new Set([String(new Date().getFullYear()), ...data.transactions.map((entry) => entry.transaction_date.slice(0, 4))])).sort().reverse();
  const byMonth = Array<number>(12).fill(0);
  let realized = 0, dividend = 0, fees = 0, unknownFx = 0, unknownRealized = 0;
  let realizedCount = 0, dividendCount = 0, feeCount = 0;
  for (const entry of selected) {
    const rate = transactionYenRate(entry);
    if (rate === null) unknownFx++;
    else {
      fees += entry.fees * rate; feeCount++;
      if (entry.type === 'dividend') {
        const amount = entry.total_amount * rate;
        dividend += amount; dividendCount++;
        byMonth[Number(entry.transaction_date.slice(5, 7)) - 1] += amount;
      }
      if (entry.type === 'sell' && entry.realized_pl != null) { realized += entry.realized_pl * rate; realizedCount++; }
    }
    if (entry.type === 'sell' && entry.realized_pl == null) unknownRealized++;
  }
  const nameOf = (entry: Transaction) => data.holdings.find((holding) => holding.symbol === entry.symbol && holding.market === entry.market)?.name ??
    presets.find((preset) => preset.symbol === entry.symbol && preset.market === entry.market)?.name ?? entry.symbol;
  const localCurrency = (entry: Transaction) => entry.market === 'US' || (entry.market === 'FX' && entry.symbol.endsWith('USD')) ? 'USD' : 'JPY';
  const csv = () => {
    const values = [headers.slice(0, -1), ...rows.map((entry) => [entry.transaction_date, transactionLabels[entry.type], entry.symbol, nameOf(entry), entry.shares,
      money(entry.price, localCurrency(entry)), money(entry.total_amount, localCurrency(entry)), money(entry.fees, localCurrency(entry)), money(entry.realized_pl, localCurrency(entry)), entry.memo ?? ''])];
    const content = '\uFEFF' + values.map((row) => row.map((value) => `"${String(value).replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `records-${year}-${filter}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const holding = data.holdings.find((item) => item.id === params.get('holding'));
  const initial = holding ? { portfolio_id: holding.portfolio_id, symbol: holding.symbol, market: holding.market,
    shares: holding.shares, price: data.stockPrices?.[`${holding.symbol}|${holding.market}`]?.price ?? 0,
    type: (params.get('type') === 'sell' ? 'sell' : 'buy') as TransactionType } : undefined;
  const mutate = async (method: string, id?: string, input?: RecordInput) => {
    const response = await fetch(`/api/transactions${id ? `/${id}` : ''}`, { method,
      headers: { 'Content-Type': 'application/json' }, body: input ? JSON.stringify(input) : undefined });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? '記録を保存できませんでした。');
    await load();
    setError(''); setDeleteId(''); setEditing(undefined); setRevision((value) => value + 1);
  };
  return <div className="flex min-h-full min-w-0 flex-col gap-1 text-xs">
    <section aria-label={`${year}年の集計`} className={`${panel} flex flex-wrap`}>
      {[
        [`${year}年 実現損益（円）`, money(realizedCount || !selected.some((entry) => entry.type === 'sell') ? realized : null)],
        [`${year}年 配当（円・税引前）`, money(dividendCount || !selected.some((entry) => entry.type === 'dividend') ? dividend : null)],
        ['取引件数', `${selected.length}件`], ['手数料合計（円）', money(feeCount || selected.length === 0 ? fees : null)],
      ].map(([label, value], index) => <div key={label} className="min-w-28 flex-1 border-r border-[var(--pm-border)] px-3 py-2"><div className="pm-muted text-[11px]">{label}</div><div className={`text-[17px] font-semibold tabular-nums ${index === 0 ? getProfitLossColor(realized) : ''}`}>{value}</div></div>)}
      <div className="min-w-64 flex-[2] px-3 py-2"><p className="pm-muted text-[11px]">月別配当（円・税引前）</p><div className="mt-1 flex h-10 items-end gap-1" aria-label="月別配当グラフ">
        {byMonth.map((value, index) => <div key={index} className="flex flex-1 flex-col items-center gap-0.5" title={`${index + 1}月 ${money(value)}`}><div className={`w-full rounded-t-sm ${value > 0 ? 'bg-[#2dd4bf]' : 'bg-[#232b36]'}`} style={{ height: value ? Math.max(3, value / Math.max(...byMonth) * 26) : 1 }} /><span className="pm-muted text-[10px]">{index + 1}</span></div>)}
      </div></div>
      {(unknownFx > 0 || unknownRealized > 0) && <p className="w-full border-t border-[var(--pm-border)] px-3 py-1 pm-muted">円換算レート不明：{unknownFx}件、実現損益未計算：{unknownRealized}件（該当金額は「—」として集計から除外）。</p>}
    </section>
    {error && <p role="alert" className="px-2 py-1 text-[var(--pm-accent)]">{error}</p>}
    <div className="flex min-w-0 flex-1 flex-wrap items-start gap-1">
      <section className={`${panel} flex-[999_1_640px]`} aria-label="売買・配当の記録">
        <div className="flex min-h-[30px] flex-wrap items-center gap-2 border-b border-[var(--pm-border)] px-2 py-1"><h1 className="font-semibold">売買・配当の記録</h1>
          <div role="group" aria-label="種別の絞り込み" className="flex">{(['all', 'buy', 'sell', 'dividend'] as const).map((type) => <button key={type} className={`pm-button !h-6 ${filter === type ? '!border-[#6b5226] !bg-[#2a2214] !text-[#f5b955]' : ''}`} aria-pressed={filter === type} onClick={() => setFilter(type)}>{type === 'all' ? 'すべて' : transactionLabels[type]}</button>)}</div>
          <label className="ml-auto flex items-center gap-1 pm-muted">年<select className="pm-button" value={year} onChange={(event) => setYear(event.target.value)}>{years.map((value) => <option key={value}>{value}</option>)}</select></label><button className="pm-button" onClick={csv}>CSV出力</button>
        </div>
        <div className="max-h-[70vh] overflow-auto"><table className="w-full min-w-[1080px] border-collapse whitespace-nowrap text-left"><thead className="sticky top-0 bg-[var(--pm-heading)] pm-muted"><tr>{headers.map((header, index) => <th key={header} className={`h-[26px] px-2 font-medium ${index >= 4 && index <= 8 ? 'text-right' : ''}`}>{header}</th>)}</tr></thead>
          <tbody>{rows.map((entry) => <tr key={entry.id} className="h-[var(--pm-row-h)] border-b border-[var(--pm-divider)] hover:bg-[#18212d]">
            <td className="px-2 tabular-nums">{entry.transaction_date}</td><td className="px-2"><span className={`rounded border px-1 text-[11px] ${entry.type === 'buy' ? 'border-[#34507a] text-[#7fb3ff]' : entry.type === 'sell' ? 'border-[#6b5226] text-[#f5b955]' : 'border-[#1f5c55] text-[#2dd4bf]'}`}>{transactionLabels[entry.type]}</span></td><td className="px-2 pm-muted">{entry.symbol}</td><td className="max-w-40 truncate px-2" title={nameOf(entry)}>{nameOf(entry)}</td>
            {[entry.shares.toLocaleString('ja-JP', { maximumFractionDigits: 8 }), money(entry.price, localCurrency(entry)), money(entry.total_amount, localCurrency(entry)), money(entry.fees, localCurrency(entry))].map((value, index) => <td key={index} className="px-2 text-right tabular-nums">{value}</td>)}
            <td className={`px-2 text-right tabular-nums ${getProfitLossColor(entry.realized_pl ?? 0)}`}>{money(entry.realized_pl, localCurrency(entry))}</td><td className="max-w-40 truncate px-2 pm-muted" title={entry.memo ?? ''}>{entry.memo}</td>
            <td className="px-2"><div className="flex gap-2"><button className="text-[var(--pm-link)]" disabled={busy} onClick={() => { setEditing(entry); setDeleteId(''); }}>編集</button><button disabled={busy} className="pm-muted" onClick={() => {
              if (deleteId !== entry.id) { setDeleteId(entry.id); return; }
              setBusy(true); void mutate('DELETE', entry.id).catch((cause) => setError(cause.message)).finally(() => setBusy(false));
            }}>{deleteId === entry.id ? '再度押して削除' : '削除'}</button>{deleteId === entry.id && <button className="pm-muted" onClick={() => setDeleteId('')}>取消</button>}</div></td>
          </tr>)}</tbody></table>{rows.length === 0 && <p className="p-6 text-center pm-muted">この条件の記録はありません。</p>}</div>
      </section>
      <section className={`${panel} flex-[1_1_280px]`} aria-labelledby="record-form-title"><h2 id="record-form-title" className="border-b border-[var(--pm-border)] px-3 py-2 font-semibold">{editing ? '記録を編集' : '記録を追加'}</h2>
        {data.transactions.some((entry) => !entry.holding_id && entry.type !== 'dividend' && entry.symbol !== 'CASH') && <p className="px-3 pt-2 text-[var(--pm-accent)]">保有に未反映の旧売買があります。該当銘柄の記録を編集・削除すると、同じ口座の全取引から保有を再構築します。</p>}
        <RecordForm key={`${editing?.id ?? 'new'}-${revision}-${holding?.id ?? ''}`} portfolios={data.portfolios} holdings={data.holdings} candidates={presets}
          currentRate={data.stockPrices?.['USDJPY|FX']?.price} initial={editing ?? initial} editing={!!editing}
          onSubmit={(input) => mutate(editing ? 'PATCH' : 'POST', editing?.id, input)} onCancel={editing ? () => setEditing(undefined) : undefined} />
      </section>
    </div>
  </div>;
}

