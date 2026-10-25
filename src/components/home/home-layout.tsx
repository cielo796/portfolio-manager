'use client';

import { Fragment, useMemo, useRef, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { Group, Panel, Separator, useDefaultLayout, type GroupImperativeHandle, type LayoutStorage } from 'react-resizable-panels';
import { HOME_LAYOUTS, homeLayoutKey, parseHomeLayout, type HomeLayoutName } from './layout-model';

const DESKTOP_QUERY = '(min-width: 1100px)';
function subscribeDesktop(callback: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}
const readDesktop = () => window.matchMedia(DESKTOP_QUERY).matches;
const readServerDesktop = () => false;

export function useHomeDesktop() {
  return useSyncExternalStore(subscribeDesktop, readDesktop, readServerDesktop);
}

function layoutStorage(name: HomeLayoutName): LayoutStorage {
  const key = homeLayoutKey(name);
  return {
    getItem: () => {
      let raw = null;
      try { raw = window.localStorage.getItem(key); } catch { /* 保存領域がなくても既定で表示する。 */ }
      return JSON.stringify(parseHomeLayout(raw, name));
    },
    setItem: (_key, value) => {
      try { window.localStorage.setItem(key, value); } catch { /* リサイズ操作は引き続き有効。 */ }
    },
  };
}

function resetGroup(name: HomeLayoutName, ref: RefObject<GroupImperativeHandle | null>) {
  const defaults = HOME_LAYOUTS[name].defaults;
  layoutStorage(name).setItem(homeLayoutKey(name), JSON.stringify(defaults));
  ref.current?.setLayout({ ...defaults });
}

function HomeGroup({ name, vertical = false, groupRef, children }: {
  name: HomeLayoutName;
  vertical?: boolean;
  groupRef: RefObject<GroupImperativeHandle | null>;
  children: ReactNode[];
}) {
  const storage = useMemo(() => layoutStorage(name), [name]);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: homeLayoutKey(name), storage, onlySaveAfterUserInteractions: true });
  const { defaults, minimums } = HOME_LAYOUTS[name];
  const min: Record<string, number> = minimums;
  return <Group id={homeLayoutKey(name)} orientation={vertical ? 'vertical' : 'horizontal'} groupRef={groupRef}
    defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged} resizeTargetMinimumSize={{ fine: 6, coarse: 20 }}>
    {Object.entries(defaults).map(([id, size], index) => <Fragment key={id}>
      {index > 0 && <Separator disableDoubleClick onDoubleClick={() => resetGroup(name, groupRef)}
        aria-label={vertical ? 'パネルの高さを変更' : 'パネルの幅を変更'} title="ドラッグでサイズ変更・ダブルクリックでこのグループを初期化"
        className={`group flex touch-none select-none items-center justify-center outline-none ${vertical ? 'h-1.5 cursor-row-resize' : 'w-1.5 cursor-col-resize'}`}>
        <span aria-hidden="true" className={`pointer-events-none bg-[var(--pm-border)] group-hover:bg-[var(--pm-accent)] group-focus-visible:bg-[var(--pm-accent)] group-data-[separator=active]:bg-[var(--pm-accent)] ${vertical ? 'h-px w-full' : 'h-full w-px'}`} />
      </Separator>}
      <Panel id={id} defaultSize={`${size}%`} minSize={`${min[id]}%`} className="h-full min-h-0 min-w-0" style={{ overflow: 'hidden' }}>{children[index]}</Panel>
    </Fragment>)}
  </Group>;
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
  const rowsRef = useRef<GroupImperativeHandle>(null);
  const topRef = useRef<GroupImperativeHandle>(null);
  const bottomRef = useRef<GroupImperativeHandle>(null);
  const allocationRef = useRef<GroupImperativeHandle>(null);
  return <div className="flex min-h-0 min-w-0 flex-col gap-1 text-xs min-[1100px]:h-full min-[1100px]:overflow-hidden">
    <div className="flex shrink-0 items-start gap-1">
      <div className="min-w-0 flex-1">{summary}</div>
      <button type="button" className="hidden shrink-0 px-1 py-2 text-[10px] pm-muted hover:text-[var(--pm-link)] min-[1100px]:block"
        onClick={() => { resetGroup('rows', rowsRef); resetGroup('top', topRef); resetGroup('bottom', bottomRef); resetGroup('allocation', allocationRef); }}>レイアウトを初期化</button>
    </div>
    {notice && <div className="shrink-0">{notice}</div>}
    {desktop ? <div className="min-h-0 flex-1 overflow-hidden">
      <HomeGroup name="rows" vertical groupRef={rowsRef}>{[
        <HomeGroup key="top" name="top" groupRef={topRef}>{[holdings, market]}</HomeGroup>,
        <HomeGroup key="bottom" name="bottom" groupRef={bottomRef}>{[
          movers,
          <HomeGroup key="allocation" name="allocation" vertical groupRef={allocationRef}>{[allocation, history]}</HomeGroup>,
          earnings, news,
        ]}</HomeGroup>,
      ]}</HomeGroup>
    </div> : <div className="space-y-1 min-[1100px]:invisible">
      <div className="grid min-w-0 grid-cols-1 gap-1 min-[900px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">{holdings}{market}</div>
      <div className="grid min-w-0 grid-cols-1 gap-1 min-[600px]:grid-cols-2 min-[900px]:grid-cols-4">
        {movers}<div className="min-w-0 space-y-1">{allocation}{history}</div>{earnings}{news}
      </div>
    </div>}
  </div>;
}
