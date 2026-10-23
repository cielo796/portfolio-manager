'use client';

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

type ResizableWidthOptions = {
  storageKey: string;
  defaultWidth: number;
  min: number;
  max: number;
};

export type ResizeHandleProps = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onDoubleClick: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
};

const memory = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();

export function clampWidth(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

// 保存値が数値でない、または範囲外なら既定値に戻す。
export function parseStoredWidth(raw: string | null, defaultWidth: number, min: number, max: number) {
  const fallback = clampWidth(defaultWidth, min, max);
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) return fallback;
  return Math.round(value);
}

function readRaw(storageKey: string) {
  const cached = memory.get(storageKey);
  if (cached !== undefined) return cached;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function writeRaw(storageKey: string, width: number) {
  const raw = String(width);
  memory.set(storageKey, raw);
  try {
    window.localStorage.setItem(storageKey, raw);
  } catch {
    // 保存できない環境でも現在のタブには反映する。
  }
  listeners.get(storageKey)?.forEach((listener) => listener());
}

function subscribe(storageKey: string, listener: () => void) {
  let group = listeners.get(storageKey);
  if (!group) {
    group = new Set();
    listeners.set(storageKey, group);
  }
  group.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey && event.key !== null) return;
    memory.delete(storageKey);
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    group.delete(listener);
    if (group.size === 0) listeners.delete(storageKey);
    window.removeEventListener('storage', onStorage);
  };
}

type DragState = { pointerId: number; startX: number; startWidth: number; cursor: string; userSelect: string };

function restoreBody(state: DragState) {
  document.body.style.cursor = state.cursor;
  if (state.userSelect) document.body.style.setProperty('user-select', state.userSelect);
  else document.body.style.removeProperty('user-select');
}

export function useResizableWidth({ storageKey, defaultWidth, min, max }: ResizableWidthOptions) {
  const store = useMemo(() => ({
    subscribe: (listener: () => void) => subscribe(storageKey, listener),
    read: () => readRaw(storageKey),
  }), [storageKey]);
  const raw = useSyncExternalStore(store.subscribe, store.read, () => null);
  const width = useMemo(() => parseStoredWidth(raw, defaultWidth, min, max), [raw, defaultWidth, min, max]);
  const drag = useRef<DragState | null>(null);

  const setWidth = useCallback((next: number) => {
    writeRaw(storageKey, clampWidth(next, min, max));
  }, [storageKey, min, max]);

  const reset = useCallback(() => setWidth(defaultWidth), [setWidth, defaultWidth]);

  const endDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    restoreBody(state);
  }, []);

  // ドラッグ中にアンマウントされた場合も body のスタイルを戻す。
  useEffect(() => () => {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    restoreBody(state);
  }, []);

  const handleProps: ResizeHandleProps = {
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const style = document.body.style;
      drag.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: width,
        cursor: style.cursor,
        userSelect: style.getPropertyValue('user-select'),
      };
      style.cursor = 'col-resize';
      style.setProperty('user-select', 'none');
    },
    onPointerMove: (event) => {
      const state = drag.current;
      if (!state || state.pointerId !== event.pointerId) return;
      setWidth(state.startWidth + event.clientX - state.startX);
    },
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onDoubleClick: reset,
    onKeyDown: (event) => {
      const step = event.shiftKey ? 48 : 16;
      if (event.key === 'ArrowLeft') setWidth(width - step);
      else if (event.key === 'ArrowRight') setWidth(width + step);
      else if (event.key === 'Home') setWidth(min);
      else if (event.key === 'End') setWidth(max);
      else return;
      event.preventDefault();
    },
  };

  return { width, setWidth, reset, handleProps };
}
