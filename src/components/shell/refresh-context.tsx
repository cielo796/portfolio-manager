'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

type Registration = {
  pathname: string;
  refresh: () => Promise<void>;
  busy: boolean;
  updatedAt: string | null;
};
const RefreshContext = createContext<{
  current: Registration | null;
  register: (value: Registration) => () => void;
} | null>(null);

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Registration | null>(null);
  const register = useCallback((value: Registration) => {
    setCurrent(value);
    return () => setCurrent((previous) => previous === value ? null : previous);
  }, []);
  return <RefreshContext.Provider value={{ current, register }}>{children}</RefreshContext.Provider>;
}

export function usePageRefresh(refresh: () => Promise<void>, busy: boolean, updatedAt: string | null, enabled = true) {
  const context = useContext(RefreshContext);
  const register = context?.register;
  const pathname = usePathname();
  const handler = useRef(refresh);
  useEffect(() => { handler.current = refresh; }, [refresh]);
  const run = useCallback(() => handler.current(), []);
  useEffect(() => {
    if (enabled) return register?.({ pathname, refresh: run, busy, updatedAt });
  }, [register, pathname, run, busy, updatedAt, enabled]);
}

export function useShellRefresh() {
  const context = useContext(RefreshContext);
  const pathname = usePathname();
  return context?.current?.pathname === pathname ? context.current : null;
}
