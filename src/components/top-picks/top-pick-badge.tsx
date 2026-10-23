'use client';

import Link from 'next/link';
import type { MemoSymbol, TopPickView } from '@/types';
import { useDetailResource } from '@/components/detail/data';

export function useTopPickRanks() {
  const resource = useDetailResource<{ topPicks: TopPickView[] }>('/api/top-picks');
  return resource.data?.topPicks ?? [];
}

export function TopPickBadge({ symbol, market, picks }: MemoSymbol & { picks: TopPickView[] }) {
  const pick = picks.find((item) => item.symbol === symbol && item.market === market);
  return pick ? <Link href={`/top-picks?id=${encodeURIComponent(pick.id)}`} className="inline-block whitespace-nowrap rounded border border-[#6b5226] bg-[var(--pm-active-bg)] px-1 text-[10px] leading-4 text-[var(--pm-active-text)]">トップピック #{pick.rank}</Link> : null;
}
