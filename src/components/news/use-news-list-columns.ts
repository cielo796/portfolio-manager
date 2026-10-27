'use client';

import { useState, useSyncExternalStore } from 'react';
import { readStorageValue, writeStorageValue } from '@/lib/resizable-layout';
import { clampNewsListColumn, DEFAULT_NEWS_LIST_COLUMNS, NEWS_LIST_COLUMNS_KEY, parseNewsListColumns, type NewsListColumn, type NewsListColumnWidths } from './list-columns';

const subscribe = () => () => {};
const readColumns = () => readStorageValue(NEWS_LIST_COLUMNS_KEY);
const readServerColumns = () => null;

export function useNewsListColumns() {
  const stored = useSyncExternalStore(subscribe, readColumns, readServerColumns);
  const [resized, setResized] = useState<NewsListColumnWidths | null>(null);
  const widths = resized ?? parseNewsListColumns(stored);
  return {
    widths,
    setWidth(column: NewsListColumn, width: number, save = false) {
      const next = { ...widths, [column]: clampNewsListColumn(column, width) };
      setResized(next);
      if (save) writeStorageValue(NEWS_LIST_COLUMNS_KEY, JSON.stringify(next));
    },
    reset() {
      setResized({ ...DEFAULT_NEWS_LIST_COLUMNS });
      writeStorageValue(NEWS_LIST_COLUMNS_KEY, JSON.stringify(DEFAULT_NEWS_LIST_COLUMNS));
    },
  };
}

export type NewsListColumnControls = ReturnType<typeof useNewsListColumns>;
