'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useDisplaySettings } from '@/hooks/use-display-settings';
import { RefreshProvider } from './refresh-context';
import { TopBar } from './top-bar';
import { SideNav } from './side-nav';
import { Ticker } from './ticker';
import { StatusBar } from './status-bar';
import { useMarketData, useShellSync } from './use-shell-data';

export function AppShell({ children }: { children: ReactNode }) {
  const { settings } = useDisplaySettings();
  const sync = useShellSync();
  const { market, marketError, refreshMarket } = useMarketData();
  const style = {
    '--pm-up': settings.updown === 'jp' ? '#ff5c5c' : '#2fc677',
    '--pm-down': settings.updown === 'jp' ? '#4ea2ff' : '#ff5c5c',
    '--pm-row-h': settings.density === 'compact' ? '24px' : '32px',
  } as CSSProperties;
  return <RefreshProvider><div className="pm-shell" style={style} data-density={settings.density}>
    <TopBar sync={sync} refreshMarket={refreshMarket} />
    <div className="pm-workspace">
      <SideNav sync={sync} />
      <main id="pm-main" className="pm-main">{children}</main>
    </div>
    <Ticker market={market} error={marketError} />
    <StatusBar sync={sync} market={market} marketError={marketError} />
  </div></RefreshProvider>;
}
