'use client';

import React from 'react';
import DistributionCharts from '@/components/DistributionCharts';
import { Skeleton } from '@/components/Skeleton';
import { Snapshot } from '@/lib/backtest';
import { ui } from '@/lib/ui';

// Merged "Intraday & Open Interest" panel: both Call/Put distribution charts
// in one bordered box, side-by-side (stack ≤900px). Shared by live + backtest.
export default function IntradayOiPanel({
  intraday,
  oi,
  mounted,
  fill = false,
  vertical = false,
  loading = false,
}: {
  intraday: Snapshot | null;
  oi: Snapshot | null;
  mounted: boolean;
  fill?: boolean; // backtest: fill the flex parent (no-scroll page) instead of fixed height
  vertical?: boolean; // backtest rail: stack the two charts in one column (implies fill)
  loading?: boolean; // a day's snapshots are still loading → skeleton empty columns
}) {
  const skelCls = fill || vertical ? 'min-h-0 w-full flex-1' : 'h-[300px] w-full';
  return (
    <section className={fill || vertical ? 'flex h-full min-h-0 flex-col' : undefined}>
      {/* Rail (vertical) is a flat secondary column — drop the big panel title. */}
      {!vertical && (
        <h2 className={`${ui.sectionTitle} ${fill ? 'shrink-0' : ''}`}>Intraday &amp; Open Interest</h2>
      )}
      <div className={`px-4 py-2 max-[600px]:p-2 ${fill || vertical ? 'min-h-0 flex-1' : ''}`}>
        <div
          className={
            vertical
              ? 'flex h-full min-h-0 flex-col gap-3'
              : `grid grid-cols-2 gap-6 max-[900px]:grid-cols-1 ${fill ? 'h-full min-h-0' : ''}`
          }
        >
          <div className={fill || vertical ? 'flex min-h-0 flex-col flex-1' : undefined}>
            <h3 className="mb-2 px-2 text-[0.95rem] font-semibold text-slate-400 shrink-0">Intraday Volume</h3>
            {intraday
              ? <DistributionCharts data={intraday} mounted={mounted} fill={fill || vertical} />
              : loading
                ? <Skeleton className={skelCls} />
                : <p className="px-2 text-slate-400">No intraday snapshot.</p>}
          </div>
          <div className={fill || vertical ? 'flex min-h-0 flex-col flex-1' : undefined}>
            <h3 className="mb-2 px-2 text-[0.95rem] font-semibold text-slate-400 shrink-0">Open Interest</h3>
            {oi
              ? <DistributionCharts data={oi} mounted={mounted} fill={fill || vertical} />
              : loading
                ? <Skeleton className={skelCls} />
                : <p className="px-2 text-slate-400">No OI snapshot.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
