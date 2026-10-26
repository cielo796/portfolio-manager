'use client';

import { useRef, type ReactNode } from 'react';
import { LayoutResetButton, ResizableLayout, resetResizableLayout, useLayoutBreakpoint, type ResizableLayoutHandle } from '@/components/shell/resizable-layout';
import { HOME_LAYOUTS } from './layout-model';

export function useHomeDesktop() {
  return useLayoutBreakpoint('(min-width: 1100px)');
}

export function HomeLayout({ summary, notice, holdings, market, movers, allocation, history, earnings, news }: {
  summary: ReactNode;
  notice?: ReactNode;
  holdings: ReactNode;
  market: ReactNode;
  movers: ReactNode;
  allocation: ReactNode;
  history: ReactNode;
  earnings: ReactNode;
  news: ReactNode;
}) {
  const desktop = useHomeDesktop();
  const rowsRef = useRef<ResizableLayoutHandle>(null);
  const topRef = useRef<ResizableLayoutHandle>(null);
  const bottomRef = useRef<ResizableLayoutHandle>(null);
  const allocationRef = useRef<ResizableLayoutHandle>(null);
  return <div className="flex min-h-0 min-w-0 flex-col gap-1 text-xs min-[1100px]:h-full min-[1100px]:overflow-hidden">
    <div className="flex shrink-0 items-start gap-1">
      <div className="min-w-0 flex-1">{summary}</div>
      <LayoutResetButton className="hidden min-[1100px]:block"
        onClick={() => { resetResizableLayout(HOME_LAYOUTS.rows, rowsRef); resetResizableLayout(HOME_LAYOUTS.top, topRef); resetResizableLayout(HOME_LAYOUTS.bottom, bottomRef); resetResizableLayout(HOME_LAYOUTS.allocation, allocationRef); }} />
    </div>
    {notice && <div className="shrink-0">{notice}</div>}
    {desktop ? <div className="min-h-0 flex-1 overflow-hidden">
      <ResizableLayout definition={HOME_LAYOUTS.rows} vertical groupRef={rowsRef}>{[
        <ResizableLayout key="top" definition={HOME_LAYOUTS.top} groupRef={topRef}>{[holdings, market]}</ResizableLayout>,
        <ResizableLayout key="bottom" definition={HOME_LAYOUTS.bottom} groupRef={bottomRef}>{[
          movers,
          <ResizableLayout key="allocation" definition={HOME_LAYOUTS.allocation} vertical groupRef={allocationRef}>{[allocation, history]}</ResizableLayout>,
          earnings, news,
        ]}</ResizableLayout>,
      ]}</ResizableLayout>
    </div> : <div className="space-y-1 min-[1100px]:invisible">
      <div className="grid min-w-0 grid-cols-1 gap-1 min-[900px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">{holdings}{market}</div>
      <div className="grid min-w-0 grid-cols-1 gap-1 min-[600px]:grid-cols-2 min-[900px]:grid-cols-4">
        {movers}<div className="min-w-0 space-y-1">{allocation}{history}</div>{earnings}{news}
      </div>
    </div>}
  </div>;
}
