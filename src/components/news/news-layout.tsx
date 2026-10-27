'use client';

import { useRef, type ReactNode } from 'react';
import { LayoutResetButton, ResizableLayout, resetResizableLayout, useLayoutBreakpoint, type ResizableLayoutHandle } from '@/components/shell/resizable-layout';
import { NEWS_LAYOUT } from './layout-model';

export function NewsLayout({ filter, list, preview, onReset }: { filter: ReactNode; list: ReactNode; preview: ReactNode; onReset: () => void }) {
  const desktop = useLayoutBreakpoint('(min-width: 900px)');
  const panesRef = useRef<ResizableLayoutHandle>(null);
  return <div className="flex min-h-full min-w-0 flex-col min-[900px]:h-full min-[900px]:min-h-0 min-[900px]:overflow-hidden">
    <div className="hidden shrink-0 justify-end min-[900px]:flex">
      <LayoutResetButton onClick={() => { resetResizableLayout(NEWS_LAYOUT, panesRef); onReset(); }} />
    </div>
    {desktop ? <div className="min-h-0 flex-1 overflow-hidden">
      <ResizableLayout definition={NEWS_LAYOUT} groupRef={panesRef}>{[filter, list, preview]}</ResizableLayout>
    </div> : <div className="grid min-h-0 flex-1 grid-cols-1 gap-1 min-[900px]:invisible">{filter}{list}{preview}</div>}
  </div>;
}
