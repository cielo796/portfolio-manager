'use client';

import type { ResizeHandleProps } from '@/hooks/use-resizable-width';

export function ResizeHandle({ value, min, max, handleProps, label = '銘柄リストの幅', className = '' }: {
  value: number;
  min: number;
  max: number;
  handleProps: ResizeHandleProps;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      {...handleProps}
      className={`group relative flex w-1.5 shrink-0 cursor-col-resize touch-none select-none items-center justify-center self-stretch outline-none ${className}`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none h-full w-px bg-[var(--pm-border)] group-hover:bg-[var(--pm-accent)] group-focus-visible:bg-[var(--pm-accent)] group-active:bg-[var(--pm-accent)]"
      />
    </div>
  );
}
