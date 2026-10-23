import type { MemoSymbol, MemoTag } from '@/types';

export const TAGS: { key: MemoTag; label: string }[] = [
  { key: 'earnings', label: '決算' }, { key: 'idea', label: 'アイデア' },
  { key: 'trade', label: '売買理由' }, { key: 'news', label: 'ニュース' }, { key: 'review', label: '振り返り' },
];
export const panel = 'min-w-0 rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]';
export const inputClass = 'min-w-0 rounded border border-[var(--pm-input-border)] bg-[var(--pm-bg)] px-2 py-1';
export const activeClass = '!border-[#6b5226] !bg-[var(--pm-active-bg)] !text-[var(--pm-active-text)]';
export const memoHref = (item: MemoSymbol, create = false) => `/memos?${create ? 'new=1&' : ''}symbol=${encodeURIComponent(item.symbol)}&market=${item.market}`;
export const dateText = (date?: string) => date ? new Date(date).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
export const moneyText = (price: number, currency: string) => `${currency === 'USD' ? '$' : currency === 'JPY' ? '¥' : `${currency} `}${price.toLocaleString('ja-JP', { maximumFractionDigits: 4 })}`;

export async function memoRequest<T>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { method, cache: 'no-store', signal: AbortSignal.timeout(30000),
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'メモの保存に失敗しました。');
  return result as T;
}
