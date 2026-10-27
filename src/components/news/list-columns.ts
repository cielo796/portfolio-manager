export const NEWS_LIST_COLUMNS_KEY = 'pm.news.listColumns';
export const NEWS_LIST_COLUMNS = {
  date: { label: '日時', defaultWidth: 78, min: 64, max: 180 },
  symbol: { label: '銘柄', defaultWidth: 60, min: 44, max: 140 },
  source: { label: '配信元', defaultWidth: 96, min: 64, max: 240 },
} as const;

export type NewsListColumn = keyof typeof NEWS_LIST_COLUMNS;
export type NewsListColumnWidths = Record<NewsListColumn, number>;

export const DEFAULT_NEWS_LIST_COLUMNS: NewsListColumnWidths = { date: 78, symbol: 60, source: 96 };

export function clampNewsListColumn(column: NewsListColumn, width: number): number {
  const { min, max, defaultWidth } = NEWS_LIST_COLUMNS[column];
  return Number.isFinite(width) ? Math.max(min, Math.min(max, Math.round(width))) : defaultWidth;
}

export function parseNewsListColumns(raw: string | null): NewsListColumnWidths {
  try {
    const value: unknown = raw === null ? null : JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_NEWS_LIST_COLUMNS };
    const entries = Object.entries(value);
    if (entries.length !== 3 || entries.some(([id, width]) => {
      if (!Object.hasOwn(NEWS_LIST_COLUMNS, id) || typeof width !== 'number' || !Number.isFinite(width)) return true;
      const { min, max } = NEWS_LIST_COLUMNS[id as NewsListColumn];
      return width < min || width > max;
    })) return { ...DEFAULT_NEWS_LIST_COLUMNS };
    return value as NewsListColumnWidths;
  } catch {
    return { ...DEFAULT_NEWS_LIST_COLUMNS };
  }
}

export function newsListGridStyle(widths: NewsListColumnWidths) {
  return {
    gridTemplateColumns: `${widths.date}px ${widths.symbol}px ${widths.source}px minmax(120px, 1fr)`,
    minWidth: `${widths.date + widths.symbol + widths.source + 164}px`,
  };
}
