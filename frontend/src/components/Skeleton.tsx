import React from 'react';

// One pulsing placeholder block. Reduced-motion users get a static block.
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-800/60 motion-reduce:animate-none ${className}`} />;
}

// First-paint skeleton of the whole backtest layout: hero candle (left 60%) +
// stacked rail (right 40%) + the replay/meta strip. Mirrors the real flex shape
// so nothing jumps when data lands.
export function BacktestSkeleton() {
  return (
    <>
      <div className="flex min-h-0 flex-1 gap-3 max-[900px]:flex-col">
        <Skeleton className="min-h-0 flex-[3]" />
        <div className="flex min-h-0 flex-[2] flex-col gap-3">
          <Skeleton className="min-h-0 flex-1" />
          <Skeleton className="min-h-0 flex-1" />
        </div>
      </div>
      <div className="mt-1 flex shrink-0 items-center gap-2">
        <Skeleton className="h-9 w-9" />
        <Skeleton className="h-9 w-9" />
        <Skeleton className="h-9 w-9" />
        <Skeleton className="ml-2 h-[72px] flex-1" />
      </div>
    </>
  );
}
