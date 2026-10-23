'use client';

import { useState } from 'react';
import type { DetailSymbol, Holding, Market, Transaction, TransactionType } from '@/types';
import { transactionLabels } from '@/lib/trade-ledger';

export type RecordInput = Pick<Transaction, 'portfolio_id' | 'symbol' | 'market' | 'type' | 'shares' | 'price' | 'fees' | 'transaction_date'> &
  Partial<Pick<Transaction, 'memo' | 'fx_rate'>>;

const inputClass = 'h-[26px] w-full rounded border border-[var(--pm-input-border)] bg-[var(--pm-bg)] px-2 text-xs disabled:opacity-60';

export function RecordForm({ portfolios, holdings = [], candidates = [], currentRate, initial, editing = false, onSubmit, onCancel }: {
  portfolios: { id: string; name: string }[];
  holdings?: Holding[];
  candidates?: DetailSymbol[];
  currentRate?: number;
  initial?: Partial<RecordInput>;
  editing?: boolean;
  onSubmit: (input: RecordInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<RecordInput>({ portfolio_id: portfolios[0]?.id ?? '', symbol: '', market: 'US',
    type: 'buy', shares: 0, price: 0, fees: 0, transaction_date: new Date().toLocaleDateString('sv-SE'),
    fx_rate: currentRate ?? null, memo: '', ...initial });
  const [query, setQuery] = useState(initial?.symbol ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const patch = (values: Partial<RecordInput>) => setForm((previous) => ({ ...previous, ...values }));
  const choices = Array.from(new Map([...holdings, ...candidates].filter((item) => item.symbol !== 'CASH')
    .map((item) => [`${item.symbol}|${item.market}`, item])).values());
  const matches = choices.filter((item) => `${item.symbol} ${item.name ?? ''}`.toLowerCase().includes(query.toLowerCase())).slice(0, 12);
  const usd = form.market === 'US' || (form.market === 'FX' && form.symbol.endsWith('USD'));
  const numberField = (key: 'shares' | 'price' | 'fees' | 'fx_rate', label: string) => <label className="flex min-w-0 flex-col gap-1 pm-muted">
    {label}<input className={`${inputClass} text-right tabular-nums text-[var(--pm-text)]`} type="number" step="any" min={key === 'shares' || key === 'fx_rate' ? '0.00000001' : '0'}
      required={key !== 'fx_rate'} value={form[key] ?? ''} onChange={(event) => patch({ [key]: event.target.value === '' && key === 'fx_rate' ? null : Number(event.target.value) })} />
  </label>;
  return <form className="flex flex-col gap-3 p-3" onSubmit={async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    try { await onSubmit({ ...form, symbol: form.symbol.trim().toUpperCase(), fx_rate: usd ? form.fx_rate : null }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '記録を保存できませんでした。'); }
    finally { setBusy(false); }
  }}>
    <fieldset disabled={busy} className="flex min-w-0 flex-col gap-3">
      <div className="flex" role="group" aria-label="記録する種別">{(Object.keys(transactionLabels) as TransactionType[]).map((type) =>
        <button key={type} type="button" aria-pressed={form.type === type} className={`pm-button flex-1 ${form.type === type ? '!border-[#6b5226] !bg-[#2a2214] !text-[#f5b955]' : ''}`} onClick={() => patch({ type })}>{transactionLabels[type]}</button>)}</div>
      <label className="flex flex-col gap-1 pm-muted">日付<input required type="date" className={inputClass} value={form.transaction_date} onChange={(event) => patch({ transaction_date: event.target.value })} /></label>
      <label className="flex flex-col gap-1 pm-muted">銘柄（コード・銘柄名で検索）<input required disabled={editing} className={inputClass} placeholder="コードまたは銘柄名" value={query} onChange={(event) => {
        setQuery(event.target.value); patch({ symbol: event.target.value.toUpperCase() });
      }} /></label>
      {!editing && query && matches.length > 0 && <div aria-label="銘柄候補" className="max-h-32 overflow-auto rounded border border-[var(--pm-border)]">{matches.map((item) =>
        <button key={`${item.symbol}|${item.market}`} type="button" className="block w-full truncate px-2 py-1 text-left hover:bg-[#1a2638]" onClick={() => {
          setQuery(item.symbol); patch({ symbol: item.symbol, market: item.market });
        }}>{item.symbol} · {item.name ?? item.market}（{item.market}）</button>)}</div>}
      <label className="flex flex-col gap-1 pm-muted">市場<select disabled={editing} className={inputClass} value={form.market} onChange={(event) => patch({ market: event.target.value as Market })}>
        <option value="US">米国株（USD）</option><option value="JP">日本株（JPY）</option><option value="FX">FX（JPY / USDクォート）</option>
      </select></label>
      <div className="grid grid-cols-2 gap-2">{numberField('shares', '数量')}{numberField('price', form.type === 'dividend' ? '1株あたり配当（税引前）' : '単価')}{numberField('fees', '手数料（現地通貨）')}
        <label className="flex min-w-0 flex-col gap-1 pm-muted">口座<select required disabled={editing} className={inputClass} value={form.portfolio_id} onChange={(event) => patch({ portfolio_id: event.target.value })}>
          {portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}
        </select></label></div>
      {usd && <>{numberField('fx_rate', 'USD/JPY（円換算用）')}<p className="pm-muted text-[11px]">空欄の場合は円集計から除外します。{currentRate ? `現在値：${currentRate}` : '現在値は未取得です。'}</p></>}
      <label className="flex flex-col gap-1 pm-muted">メモ<textarea rows={2} className={`${inputClass} !h-auto py-1`} value={form.memo ?? ''} onChange={(event) => patch({ memo: event.target.value })} /></label>
      <p className="rounded border border-[var(--pm-input-border)] p-2 leading-relaxed pm-muted">購入・売却を記録すると、保有数量と平均取得単価が自動で更新されます。発注機能ではありません。</p>
      {error && <p role="alert" className="text-[var(--pm-accent)]">{error}</p>}
      <button type="submit" disabled={!portfolios.length} className="pm-button !h-[30px] !border-[#f0a33a] !bg-[#f0a33a] font-semibold !text-[#1a1205]">{busy ? '保存中…' : editing ? '変更を保存' : '記録する'}</button>
      {onCancel && <button type="button" className="pm-button" onClick={onCancel}>キャンセル</button>}
    </fieldset>
  </form>;
}
