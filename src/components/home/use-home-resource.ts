'use client';

import { useCallback, useEffect, useState } from 'react';

export async function fetchHomeJson<T>(url: string, signal: AbortSignal, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store', signal,
    ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error('取得できませんでした');
  return response.json() as Promise<T>;
}

export function useHomeResource<T>(load: (signal: AbortSignal, retry: boolean) => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ loader: typeof load; attempt: number; data?: T; error: boolean }>();
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal, attempt > 0).then(
      (data) => { if (!controller.signal.aborted) setState({ loader: load, attempt, data, error: false }); },
      () => { if (!controller.signal.aborted) setState({ loader: load, attempt, error: true }); },
    );
    return () => controller.abort();
  }, [load, attempt]);
  const current = state?.loader === load && state.attempt === attempt ? state : undefined;
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { data: current?.data, error: current?.error ?? false, loading: !current, retry };
}
