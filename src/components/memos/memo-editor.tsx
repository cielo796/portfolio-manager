'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { DetailSymbol, MemoInput, MemoSymbol, StockMemo } from '@/types';
import { priceKey } from '@/lib/price-key';
import { fallbackSymbol, searchSymbols } from '@/components/detail/data';
import { TAGS, activeClass, dateText, inputClass, memoRequest, moneyText, panel } from './shared';

export type MemoEditorHandle = { flush: () => Promise<boolean> };
type Props = {
  initial: StockMemo | null;
  symbols: MemoSymbol[];
  catalog: DetailSymbol[];
  onSaved: (memo: StockMemo) => void;
  onSymbols: (symbols: MemoSymbol[]) => void;
  onDeleted: (id?: string) => void;
};

export const MemoEditor = forwardRef<MemoEditorHandle, Props>(function MemoEditor({ initial, symbols, catalog, onSaved, onSymbols, onDeleted }, ref) {
  const initialDraft: MemoInput = { title: initial?.title ?? '', body: initial?.body ?? '', tag: initial?.tag ?? null, symbols: initial?.symbols ?? symbols };
  const [draft, setDraft] = useState(initialDraft);
  const current = useRef(initialDraft);
  const [record, setRecord] = useState(initial);
  const recordRef = useRef(initial);
  const saved = useRef(initial ? JSON.stringify(initialDraft) : '');
  const inFlight = useRef<Promise<boolean> | null>(null);
  const [status, setStatus] = useState<'empty' | 'dirty' | 'saving' | 'saved' | 'failed'>(initial ? 'saved' : 'empty');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [picker, setPicker] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = (patch: Partial<MemoInput>) => {
    const next = { ...current.current, ...patch };
    current.current = next;
    setDraft(next);
    setStatus('dirty');
    setConfirmDelete(false);
    if (patch.symbols) onSymbols(patch.symbols);
  };
  const save = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return inFlight.current;
    const value = current.current;
    if (saved.current === JSON.stringify(value)) return true;
    if (!recordRef.current && !value.title.trim() && !value.body.trim() && !value.tag) return true;
    const signature = JSON.stringify(value);
    setStatus('saving');
    setError('');
    const pending = (async () => {
      try {
        const old = recordRef.current;
        const result = await memoRequest<{ memo: StockMemo }>(old ? `/api/memos/${encodeURIComponent(old.id)}` : '/api/memos', old ? 'PATCH' : 'POST', { ...value, title: value.title.trim() || '無題のメモ' });
        recordRef.current = result.memo;
        saved.current = signature;
        setRecord(result.memo);
        setStatus(JSON.stringify(current.current) === signature ? 'saved' : 'dirty');
        onSaved(result.memo);
        return true;
      } catch (reason) {
        setStatus('failed');
        setError(reason instanceof Error ? reason.message : 'メモの保存に失敗しました。');
        return false;
      }
    })();
    inFlight.current = pending;
    try { return await pending; } finally { inFlight.current = null; }
  }, [onSaved]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (inFlight.current && !await inFlight.current) return false;
    do {
      if (!await save()) return false;
    } while (saved.current !== JSON.stringify(current.current)
      && Boolean(recordRef.current || current.current.title.trim() || current.current.body.trim() || current.current.tag));
    return true;
  }, [save]);
  useImperativeHandle(ref, () => ({ flush }), [flush]);
  useEffect(() => {
    if (deleting || status !== 'dirty') return;
    timer.current = setTimeout(() => { void save(); }, 1000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [draft, save, deleting, status, record]);
  useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (inFlight.current || (saved.current !== JSON.stringify(current.current) && (current.current.title.trim() || current.current.body.trim()))) event.preventDefault();
    };
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, []);
  useEffect(() => {
    if (!confirmDelete) return;
    const timeout = setTimeout(() => setConfirmDelete(false), 5000);
    return () => clearTimeout(timeout);
  }, [confirmDelete]);

  const remove = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    if (timer.current) clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    try {
      const id = recordRef.current?.id;
      if (id) await memoRequest(`/api/memos/${encodeURIComponent(id)}`, 'DELETE');
      onDeleted(id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '削除に失敗しました。');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };
  const addSymbol = (item: MemoSymbol) => {
    if (!draft.symbols.some((old) => priceKey(old.symbol, old.market) === priceKey(item.symbol, item.market))) update({ symbols: [...draft.symbols, { symbol: item.symbol, market: item.market }] });
    setQuery('');
    setPicker(false);
  };
  const candidates = searchSymbols(catalog, query);
  const fallback = fallbackSymbol(query);
  if (fallback && !candidates.some((item) => priceKey(item.symbol, item.market) === priceKey(fallback.symbol, fallback.market))) candidates.push(fallback);
  return <section aria-label="メモの編集" className={`${panel} flex min-h-[560px] flex-col`}>
    <fieldset disabled={deleting} className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 border-b border-[var(--pm-border)] px-3 py-3">
        <input aria-label="タイトル" maxLength={500} value={draft.title} placeholder="タイトル" onChange={(event) => update({ title: event.target.value })} className="w-full rounded bg-transparent px-1 py-1 text-[17px] font-semibold outline-offset-2" />
        <div className="flex flex-wrap items-center gap-1.5"><span className="w-12 pm-muted">銘柄</span>{draft.symbols.map((item) => <button type="button" key={priceKey(item.symbol, item.market)} aria-label={`${item.symbol} (${item.market}) の紐づけを外す`} onClick={() => update({ symbols: draft.symbols.filter((old) => priceKey(old.symbol, old.market) !== priceKey(item.symbol, item.market)) })} className="rounded bg-[#17253a] px-2 py-0.5 text-[#9cc4ff]">{item.symbol} <span className="text-[10px]">{item.market}</span> ×</button>)}<button type="button" className="pm-button !h-6" aria-expanded={picker} onClick={() => setPicker(!picker)}>＋ 銘柄を紐づけ</button></div>
        {picker && <div className="rounded border border-[var(--pm-border)] p-2"><input aria-label="紐づける銘柄を検索" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="コード・名称（保有・登録・ティッカー候補）" className={`${inputClass} w-full`} /><ul className="mt-1 max-h-40 overflow-auto">{candidates.map((item) => <li key={priceKey(item.symbol, item.market)}><button type="button" className="w-full px-2 py-1 text-left hover:bg-[var(--pm-heading)]" onClick={() => addSymbol(item)}>{item.symbol} · {item.market} {item.name}</button></li>)}</ul>{!query && <p className="mt-1 text-[11px] pm-muted">コードまたは会社名を入力してください。</p>}{query && !candidates.length && <p className="pm-muted">候補がありません。</p>}</div>}
        <div className="flex flex-wrap items-center gap-1"><label htmlFor="memo-tag" className="w-12 pm-muted">タグ</label><select id="memo-tag" className={inputClass} value={draft.tag ?? ''} onChange={(event) => update({ tag: (event.target.value || null) as MemoInput['tag'] })}><option value="">タグなし</option>{TAGS.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</select></div>
        <div className="space-y-1 text-[11px] pm-muted"><p>記録時の株価（自動） <span className="text-[var(--pm-text)]">{record && Object.entries(record.price_snapshot).length ? Object.entries(record.price_snapshot).map(([key, quote]) => <span className="mr-3 inline-block" key={key} title={`価格更新 ${dateText(quote.at)}`}>{key} {moneyText(quote.price, quote.currency)}</span>) : '価格記録なし'}</span></p><p>作成 {dateText(record?.created_at)} ・更新 {dateText(record?.updated_at)} ・{record?.updated_pc ?? '保存後にPC名を表示'}</p></div>
      </div>
      <div aria-live="polite" className="border-b border-[var(--pm-border)] px-3 py-2 text-right text-[11px] pm-muted">{status === 'saving' ? '保存中…' : status === 'failed' ? <button type="button" onClick={() => void flush()} className="text-[var(--pm-accent)]">保存に失敗しました（再試行）</button> : status === 'saved' ? '● 自動保存済み' : status === 'dirty' ? '入力後1秒で自動保存' : 'タイトルや本文を入力すると自動保存します'}</div>
      <textarea aria-label="本文" maxLength={1000000} value={draft.body} placeholder="決算・ニュース・売買の理由などを自由に記録…" onChange={(event) => update({ body: event.target.value })} className="min-h-[320px] w-full flex-1 resize-y bg-transparent px-4 py-3 text-[13px] leading-[1.8] outline-offset-[-2px]" />
      {error && <p role="alert" className="px-3 py-2 text-[var(--pm-accent)]">{error}</p>}
      <div className="flex items-center justify-between border-t border-[var(--pm-border)] p-2"><span className="text-[11px] pm-muted">本文はテキストで保存されます</span><button type="button" className={`pm-button ${confirmDelete ? activeClass : ''}`} onClick={() => void remove()}>{deleting ? '削除中…' : confirmDelete ? 'もう一度押して削除' : '削除'}</button></div>
    </fieldset>
  </section>;
});
