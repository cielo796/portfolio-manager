export const panel = 'min-w-0 rounded border border-[var(--pm-border)] bg-[var(--pm-panel)]';
export const inputClass = 'min-w-0 rounded border border-[var(--pm-input-border)] bg-[var(--pm-bg)] px-2 py-1';
export const percent = (value: number | null) => value === null ? '—' : `${value > 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
export const priceText = (value: number | null) => value === null ? '価格未取得' : value.toLocaleString('ja-JP', { maximumFractionDigits: 4 });
export const horizonText = { short: '短期', medium: '中期', long: '長期' };
export const convictionText = { high: '高', medium: '中', low: '低' };

export async function pickRequest<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(url, { method, cache: 'no-store', signal: AbortSignal.timeout(30000),
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'トップピックを保存できませんでした。');
  return data as T;
}
