'use client';

import React, { useMemo } from 'react';
import { Snapshot } from '@/lib/backtest';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  ComposedChart,
  Bar,
} from 'recharts';

// Token references from globals.css / context/ui-context.md — SVG fill/stroke
// and inline styles resolve var() at paint time.
const themeColors = {
  call: 'var(--call-color)',
  put: 'var(--put-color)',
  vol: 'var(--vol-color)',
  future: 'var(--price-level)',
  delta: 'var(--text-muted)',
  grid: 'var(--chart-grid)',
  text: 'var(--text-muted)',
};

export default function DistributionCharts({
  data,
  mounted,
  fill = false,
}: {
  data: Snapshot;
  mounted: boolean;
  fill?: boolean; // fill the flex parent (backtest no-scroll page) instead of fixed height
}) {
  const chartData = useMemo(() => {
    if (!data || !data.Call || !data.Put) return [];

    const strikesMap = new Map<number, { strike: number; call: number; put: number; total: number; volSettle: number | null }>();

    data.Call.data.forEach((p) => {
      strikesMap.set(p.x, { strike: p.x, call: p.y, put: 0, total: p.y, volSettle: null });
    });

    data.Put.data.forEach((p) => {
      const existing = strikesMap.get(p.x);
      if (existing) {
        existing.put = p.y;
        existing.total += p.y;
      } else {
        strikesMap.set(p.x, { strike: p.x, call: 0, put: p.y, total: p.y, volSettle: null });
      }
    });

    if (data.VolSettle && data.VolSettle.data) {
      data.VolSettle.data.forEach((p) => {
        const existing = strikesMap.get(p.x);
        if (existing) {
          existing.volSettle = p.y * 100;
        } else {
          strikesMap.set(p.x, { strike: p.x, call: 0, put: 0, total: 0, volSettle: p.y * 100 });
        }
      });
    }

    return Array.from(strikesMap.values())
      .filter((d) => d.total > 0 || d.volSettle !== null)
      .sort((a, b) => a.strike - b.strike);
  }, [data]);

  // Δ vertical lines from the scraped chart (5/15/25/35/45 ΔP/ΔC). The other
  // PlotLines (e.g. "Future:") are dropped — the gold ReferenceLine covers it.
  const deltaLines = useMemo(
    () => (data.PlotLines ?? []).filter((l) => l.label?.text?.includes('Δ')),
    [data.PlotLines],
  );

  const bands = data.PlotBands ?? [];

  const xDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 0];
    const strikes = chartData.map((d) => d.strike);
    // Widen to the outer band edges so ±3 SD shading isn't clipped.
    const bandVals = bands.flatMap((b) => [b.from, b.to]);
    const min = Math.min(...strikes, data.FuturePrice, ...bandVals);
    const max = Math.max(...strikes, data.FuturePrice, ...bandVals);
    const padding = (max - min) * 0.05;
    return [min - padding, max + padding];
  }, [chartData, data.FuturePrice, bands]);

  // Axis ticks at multiples of 25 across the domain (e.g. 4000, 4025, 4050).
  const xTicks = useMemo(() => {
    const [lo, hi] = xDomain;
    const out: number[] = [];
    for (let v = Math.ceil(lo / 25) * 25; v <= hi; v += 25) out.push(v);
    return out;
  }, [xDomain]);

  return (
    <div className={fill ? 'min-h-0 w-full flex-1' : 'h-[300px] w-full max-[600px]:h-[260px]'}>
      {mounted && (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 32, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={themeColors.grid} />
              {/* ±1/2/3 SD shaded bands (widest first so nesting reads right). */}
              {bands.map((b, i) => (
                <ReferenceArea key={`band-${i}`} yAxisId="left" x1={b.from} x2={b.to} fill={b.color || 'rgba(169,169,169,.15)'} fillOpacity={1} stroke="none" ifOverflow="hidden" />
              ))}
              <XAxis dataKey="strike" type="number" domain={xDomain} ticks={xTicks.length ? xTicks : undefined} tickFormatter={(v: number) => String(Math.round(v))} stroke={themeColors.text} fontSize={12} tickLine={true} axisLine={true} allowDataOverflow={false} />
              <YAxis yAxisId="left" stroke={themeColors.text} fontSize={12} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" stroke={themeColors.vol} fontSize={12} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px', color: 'var(--text-primary)' }} itemStyle={{ color: 'var(--text-primary)' }} cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} />
              <Legend verticalAlign="top" align="center" height={28} wrapperStyle={{ top: -6, paddingBottom: '16px' }} />
              {/* Scraped ΔP/ΔC strikes. */}
              {deltaLines.map((l, i) => (
                <ReferenceLine key={`delta-${i}`} x={l.value} yAxisId="left" stroke={themeColors.delta} strokeDasharray="4 4" label={{ value: l.label?.text, position: 'top', fill: themeColors.delta, fontSize: 11 }} />
              ))}
              <ReferenceLine x={data.FuturePrice} yAxisId="left" stroke={themeColors.future} strokeWidth={3} strokeDasharray="8 4" label={{ value: `${Math.round(data.FuturePrice)}`, position: 'insideTopLeft', fill: themeColors.future, fontSize: 16, fontWeight: 'bold' }} />
              <Bar yAxisId="left" dataKey="call" fill={themeColors.call} radius={[4, 4, 0, 0]} name="Calls" barSize={10} />
              <Bar yAxisId="left" dataKey="put" fill={themeColors.put} radius={[4, 4, 0, 0]} name="Puts" barSize={10} />
              <Line yAxisId="right" type="monotone" dataKey="volSettle" stroke={themeColors.vol} dot={false} strokeWidth={2} name="Vol Settle %" />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
