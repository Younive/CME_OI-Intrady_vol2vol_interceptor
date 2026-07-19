'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  LineStyle,
  UTCTimestamp,
} from 'lightweight-charts';
import { Candle } from '@/lib/candles';

// Chart timestamps are shifted +7h so the (UTC-rendering) time axis reads ICT,
// matching the rest of the page. ICT has no DST, so a fixed offset is exact.
const ICT_OFFSET = 7 * 3600;
const toChartTime = (t: number) => (t + ICT_OFFSET) as UTCTimestamp;

interface Props {
  candles: Candle[];
  source: 'futures' | 'spot';
  interval: '5m' | '1h';
  replayUntil: number | null; // bar replay: hide candles after this epoch sec (null = show all)
  levels: Record<string, number>; // sd1dn/sd1up/… from sdLevels()
  open: number | null; // scrub day's session open, gold line
  priceRange: { min: number; max: number } | null; // day-pinned vertical scale
  oiRange: { min: number; max: number } | null; // day's OI strike min/max → OI grid span
  gridStep?: number; // OI price grid step (25 default; 100 for MNQ)
  focus: number; // bump → reposition the window (fresh load / date jump only)
}

export default function PriceChart({ candles, source, interval, replayUntil, levels, open, priceRange, oiRange, gridStep = 25, focus }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const replayUntilRef = useRef(replayUntil);
  replayUntilRef.current = replayUntil; // latest head, read without re-triggering the window effect

  // "OI price" $25 grid: every multiple of 25 across the day's OI strike range
  // (from the OI chart); falls back to the candle low/high when there's no OI
  // (e.g. weekend). Step widens if the range would need > 40 lines.
  const grid25 = useMemo(() => {
    let lo = oiRange?.min ?? Infinity;
    let hi = oiRange?.max ?? -Infinity;
    if (!oiRange) {
      for (const c of candles) {
        if (c.l < lo) lo = c.l;
        if (c.h > hi) hi = c.h;
      }
    }
    if (lo > hi) return [];
    let step = gridStep;
    while ((hi - lo) / step > 40) step += gridStep;
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
    return out;
  }, [oiRange, candles, gridStep]);

  // Colors from context/ui-context.md tokens (slate/indigo/emerald/rose).
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: '#94a3b8',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(51, 65, 85, 0.5)' },
        horzLines: { color: 'rgba(51, 65, 85, 0.5)' },
      },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#334155' },
      rightPriceScale: { borderColor: '#334155', autoScale: true },
      // Full zoom/pan: wheel + pinch zoom, drag pan, price/time axis drag scaling.
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
      // Normal = crosshair follows the cursor freely (no magnet snap to OHLC).
      crosshair: { mode: CrosshairMode.Normal, horzLine: { labelBackgroundColor: '#6366f1' }, vertLine: { labelBackgroundColor: '#6366f1' } },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
      borderVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      seriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, []);

  // Bar replay: only candles at or before the scrub position are drawn, so
  // playing the scrubber reveals bars left→right (setData per step is cheap at
  // a few thousand candles).
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const shown = replayUntil == null ? candles : candles.filter((c) => c.t <= replayUntil);
    series.setData(shown.map((c) => ({ time: toChartTime(c.t), open: c.o, high: c.h, low: c.l, close: c.c })));
  }, [candles, replayUntil]);

  // Position a 1-day window ending at the replay head — but ONLY on a fresh
  // load or a date jump (focus bump), never per replay step. Between focuses
  // the user pans/zooms freely and playing walks bars past the right edge
  // without the view snapping. Logical bar indices extend past the data edge
  // for the right pad.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !candles.length) return;
    const ru = replayUntilRef.current;
    let shown = candles.length;
    if (ru != null) {
      shown = 0;
      while (shown < candles.length && candles[shown].t <= ru) shown++;
    }
    const windowBars = interval === '5m' ? 288 : 24; // one day of bars
    const rightPad = Math.round(windowBars * 0.12);
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, shown - windowBars), to: shown + rightPad });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, focus, interval]);

  // Day-pinned vertical scale (manual): per-bar autoscale jitters on tiny
  // ranges, so the scale is fixed to the scrub day's range from the page.
  // Axis-drag rescaling by the user still works between day changes.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    series.applyOptions({
      autoscaleInfoProvider: priceRange == null
        ? undefined
        : () => ({ priceRange: { minValue: priceRange.min, maxValue: priceRange.max } }),
    });
    chartRef.current?.priceScale('right').applyOptions({ autoScale: true }); // re-arm after user axis-drag
  }, [priceRange]);

  // SD levels (dashed indigo) + scrub-day open (dotted gold) + $25 OI grid
  // (solid cyan, labeled "OI {price}").
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    priceLinesRef.current.forEach((l) => series.removePriceLine(l));
    const lines: IPriceLine[] = [
      ...Object.entries(levels).map(([key, price]) =>
        series.createPriceLine({
          price,
          color: '#6366f1',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          title: key.replace('dn', '↓').replace('up', '↑').toUpperCase(),
        }),
      ),
      ...grid25.map((price) =>
        series.createPriceLine({
          price,
          color: 'rgba(34, 211, 238, 0.55)',
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true, // title only renders inside the axis label box
          axisLabelColor: '#0f172a',
          axisLabelTextColor: '#67e8f9',
          title: `OI ${price}`,
        }),
      ),
    ];
    if (open != null) {
      lines.push(series.createPriceLine({
        price: open,
        color: '#fbbf24',
        lineWidth: 2,
        lineStyle: LineStyle.Dotted,
        title: 'OPEN',
      }));
    }
    priceLinesRef.current = lines;
  }, [levels, grid25, open]);

  return (
    <div className="relative h-full min-h-[180px] w-full overflow-hidden px-2 py-1 max-[600px]:p-2">
      <div ref={containerRef} className="h-full w-full" />
      {(source === 'spot' || interval === '1h') && (
        <span className="absolute right-3 top-3 z-10 rounded bg-slate-800 px-2 py-1 text-[0.7rem] font-semibold uppercase tracking-wider text-amber-400">
          {source === 'spot' ? 'spot' : ''}{source === 'spot' && interval === '1h' ? ' · ' : ''}{interval === '1h' ? '1h' : ''}
        </span>
      )}
    </div>
  );
}
