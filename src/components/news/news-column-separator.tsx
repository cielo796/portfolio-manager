'use client';

import { useRef, type PointerEvent } from 'react';
import { NEWS_LIST_COLUMNS, type NewsListColumn } from './list-columns';
import type { NewsListColumnControls } from './use-news-list-columns';

export function NewsColumnSeparator({ column, controls }: { column: NewsListColumn; controls: NewsListColumnControls }) {
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const { label, min, max, defaultWidth } = NEWS_LIST_COLUMNS[column];
  const finish = (event: PointerEvent<HTMLSpanElement>, cancelled = false) => {
    const start = drag.current;
    if (!start || event.pointerId !== start.pointerId) return;
    drag.current = null;
    controls.setWidth(column, cancelled ? controls.widths[column] : start.width + event.clientX - start.x, true);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <span role="separator" aria-label={`${label}の列幅`} aria-orientation="vertical" tabIndex={0}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={controls.widths[column]}
    title="ドラッグまたは矢印キーで列幅を変更・ダブルクリックで初期化"
    className="group absolute -right-[7px] top-0 flex h-full w-1.5 touch-none cursor-col-resize select-none items-center justify-center outline-none"
    onPointerDown={(event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointerId: event.pointerId, x: event.clientX, width: controls.widths[column] };
    }}
    onPointerMove={(event) => {
      const start = drag.current;
      if (start && event.pointerId === start.pointerId) controls.setWidth(column, start.width + event.clientX - start.x);
    }}
    onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={(event) => finish(event, true)}
    onDoubleClick={() => controls.setWidth(column, defaultWidth, true)}
    onKeyDown={(event) => {
      const step = event.shiftKey ? 20 : 8;
      const width = event.key === 'ArrowLeft' ? controls.widths[column] - step
        : event.key === 'ArrowRight' ? controls.widths[column] + step
          : event.key === 'Home' ? min : event.key === 'End' ? max : null;
      if (width === null) return;
      event.preventDefault();
      controls.setWidth(column, width, true);
    }}>
    <span aria-hidden="true" className="pointer-events-none h-full w-px bg-[var(--pm-border)] group-hover:bg-[var(--pm-accent)] group-focus-visible:bg-[var(--pm-accent)] group-active:bg-[var(--pm-accent)]" />
  </span>;
}
