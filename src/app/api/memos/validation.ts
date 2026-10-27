import type { MemoInput, MemoTag } from '@/types';

export const memoTags: MemoTag[] = ['earnings', 'idea', 'trade', 'news', 'review'];

export function validateMemoInput(value: unknown, partial = false): Partial<MemoInput> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('入力内容が不正です。');
  const data = value as Record<string, unknown>;
  const allowed = partial ? ['title', 'body', 'tag', 'symbols'] : ['title', 'body', 'tag', 'symbols', 'transactionId'];
  if (Object.keys(data).some((key) => !allowed.includes(key)) || (partial && !Object.keys(data).length)) throw new Error('更新項目が不正です。');
  if ((!partial || data.title !== undefined) && (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 500)) throw new Error('タイトルは1〜500文字で入力してください。');
  if ((!partial || data.body !== undefined) && (typeof data.body !== 'string' || data.body.length > 1000000)) throw new Error('本文が不正です。');
  if (data.tag !== undefined && data.tag !== null && !memoTags.includes(data.tag as MemoTag)) throw new Error('タグが不正です。');
  if ((!partial || data.symbols !== undefined) && (!Array.isArray(data.symbols) || data.symbols.length > 100 || data.symbols.some((item) =>
    !item || typeof item.symbol !== 'string' || !/^[A-Z0-9][A-Z0-9.=_^-]{0,31}$/i.test(item.symbol.trim()) || !['US', 'JP', 'FX'].includes(item.market)))) throw new Error('銘柄と市場を確認してください。');
  if (data.transactionId !== undefined && data.transactionId !== null && (typeof data.transactionId !== 'string' || !data.transactionId.trim())) throw new Error('売買記録IDが不正です。');
  return data as Partial<MemoInput>;
}
