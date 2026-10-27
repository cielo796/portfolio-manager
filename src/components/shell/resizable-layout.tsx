'use client';

import { Fragment, useCallback, useMemo, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { Group, Panel, Separator, useDefaultLayout, type GroupImperativeHandle } from 'react-resizable-panels';
import { createLayoutStorage, type ResizableLayoutDefinition } from '@/lib/resizable-layout';

export type ResizableLayoutHandle = GroupImperativeHandle;

const readServerBreakpoint = () => false;

export function useLayoutBreakpoint(query: string) {
  const subscribe = useCallback((callback: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener('change', callback);
    return () => media.removeEventListener('change', callback);
  }, [query]);
  const read = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, read, readServerBreakpoint);
}

export function resetResizableLayout(definition: ResizableLayoutDefinition, ref: RefObject<ResizableLayoutHandle | null>) {
  createLayoutStorage(definition).setItem(definition.storageKey, JSON.stringify(definition.defaults));
  ref.current?.setLayout({ ...definition.defaults });
}

export function LayoutResetButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return <button type="button" className={`shrink-0 px-1 py-2 text-[10px] pm-muted hover:text-[var(--pm-link)] ${className}`}
    onClick={onClick}>レイアウトを初期化</button>;
}

export function ResizableLayout({ definition, vertical = false, groupRef, children }: {
  definition: ResizableLayoutDefinition;
  vertical?: boolean;
  groupRef: RefObject<ResizableLayoutHandle | null>;
  children: ReactNode[];
}) {
  const storage = useMemo(() => createLayoutStorage(definition), [definition]);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: definition.storageKey, storage, onlySaveAfterUserInteractions: true });
  const { defaults, minimums } = definition;
  return <Group id={definition.storageKey} orientation={vertical ? 'vertical' : 'horizontal'} groupRef={groupRef}
    defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged} resizeTargetMinimumSize={{ fine: 6, coarse: 20 }}>
    {Object.entries(defaults).map(([id, size], index) => <Fragment key={id}>
      {index > 0 && <Separator disableDoubleClick onDoubleClick={() => resetResizableLayout(definition, groupRef)}
        aria-label={vertical ? 'パネルの高さを変更' : 'パネルの幅を変更'} title="ドラッグでサイズ変更・ダブルクリックでこのグループを初期化"
        className={`group flex touch-none select-none items-center justify-center outline-none ${vertical ? 'h-1.5 cursor-row-resize' : 'w-1.5 cursor-col-resize'}`}>
        <span aria-hidden="true" className={`pointer-events-none bg-[var(--pm-border)] group-hover:bg-[var(--pm-accent)] group-focus-visible:bg-[var(--pm-accent)] group-data-[separator=active]:bg-[var(--pm-accent)] ${vertical ? 'h-px w-full' : 'h-full w-px'}`} />
      </Separator>}
      <Panel id={id} defaultSize={`${size}%`} minSize={`${minimums[id]}%`} className="h-full min-h-0 min-w-0" style={{ overflow: 'hidden' }}>{children[index]}</Panel>
    </Fragment>)}
  </Group>;
}
