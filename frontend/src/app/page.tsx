'use client';

import React, { useMemo } from 'react';
import styles from './page.module.css';
import rawData from '../data/data.json';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ComposedChart,
  Bar
} from 'recharts';

interface DataPoint {
  x: number;
  y: number;
}

interface RawData {
  ValueName: string;
  Call: { data: DataPoint[] };
  Put: { data: DataPoint[] };
  VolSettle: { data: DataPoint[] };
  FuturePrice: number;
  FutureChg: number;
  Vol: number;
  VolChg: number;
  ATMVol: number;
  ExtractedAt: string;
  Title: string;
  Subtitle: string;
}

export default function Home() {
  const data = rawData as unknown as RawData;

  const chartData = useMemo(() => {
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

    data.VolSettle.data.forEach((p) => {
      const existing = strikesMap.get(p.x);
      if (existing) {
        existing.volSettle = p.y * 100;
      } else {
        strikesMap.set(p.x, { strike: p.x, call: 0, put: 0, total: 0, volSettle: p.y * 100 });
      }
    });

    return Array.from(strikesMap.values())
      .filter(d => d.total > 0 || d.volSettle !== null)
      .sort((a, b) => a.strike - b.strike);
  }, [data]);

  const themeColors = {
    total: "#818cf8",
    call: "#38bdf8",
    put: "#fb923c",
    vol: "#f43f5e",
    future: "#facc15",
    grid: "#334155",
    text: "#94a3b8"
  };

  const formatPriceChange = (val: number) => {
    if (val === null || val === undefined) return '-';
    const sign = val >= 0 ? '+' : '';
    return `${sign}${val}`;
  };

  // Calculate domain to ensure future price is included and visible
  const xDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 0];
    const strikes = chartData.map(d => d.strike);
    const min = Math.min(...strikes, data.FuturePrice);
    const max = Math.max(...strikes, data.FuturePrice);
    const padding = (max - min) * 0.05;
    return [min - padding, max + padding];
  }, [chartData, data.FuturePrice]);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <h1 className={styles.title}>{data.Title || 'CME Vol2Vol Dashboard'}</h1>
          <span style={{ color: '#64748b', fontSize: '0.9rem' }}>Last Updated: {data.ExtractedAt}</span>
        </div>
        
        <div className={styles.metaGrid}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Future Price</span>
            <span className={styles.metaValue}>${data.FuturePrice}</span>
            <span style={{ color: data.FutureChg >= 0 ? '#22c55e' : '#ef4444', fontSize: '0.8rem', fontWeight: 'bold' }}>
              ({formatPriceChange(data.FutureChg)})
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Implied Vol (Vol)</span>
            <span className={styles.metaValue}>{data.Vol}%</span>
            <span style={{ color: data.VolChg >= 0 ? '#22c55e' : '#ef4444', fontSize: '0.8rem', fontWeight: 'bold' }}>
              ({formatPriceChange(data.VolChg)})
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>ATM Vol</span>
            <span className={styles.metaValue}>{(data.ATMVol * 100).toFixed(2)}%</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>View Type</span>
            <span className={styles.metaValue}>{data.ValueName}</span>
          </div>
        </div>
      </header>

      <section className={styles.chartSection}>
        <div className={styles.chartHeader}>
          <h2 className={styles.chartTitle}>Total Contracts & Vol Settle</h2>
        </div>
        <div className={styles.chartWrapper}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={themeColors.grid} />
              <XAxis 
                dataKey="strike" 
                type="number"
                domain={xDomain}
                stroke={themeColors.text} 
                fontSize={12}
                tickLine={true}
                axisLine={true}
              />
              <YAxis 
                yAxisId="left"
                stroke={themeColors.text} 
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                stroke={themeColors.vol} 
                fontSize={12}
                tickLine={false}
                axisLine={false}
                domain={['auto', 'auto']}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1e293b', 
                  border: '1px solid #334155', 
                  borderRadius: '8px',
                  color: '#fff' 
                }}
                itemStyle={{ color: '#fff' }}
                cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
              />
              <Legend verticalAlign="top" height={36}/>
              
              <ReferenceLine 
                x={data.FuturePrice} 
                yAxisId="left" 
                stroke={themeColors.future} 
                strokeWidth={3}
                strokeDasharray="8 4" 
                label={{ 
                  value: `${data.FuturePrice}`, 
                  position: 'insideTopLeft',
                  fill: themeColors.future, 
                  fontSize: 16,
                  fontWeight: 'bold'
                }} 
              />


              <Bar yAxisId="left" dataKey="total" fill={themeColors.total} radius={[4, 4, 0, 0]} name="Total Contracts" barSize={15} />
              <Line yAxisId="right" type="monotone" dataKey="volSettle" stroke={themeColors.vol} dot={false} strokeWidth={2} name="Vol Settle %" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className={styles.chartSection}>
        <div className={styles.chartHeader}>
          <h2 className={styles.chartTitle}>Call/Put & Vol Settle</h2>
        </div>
        <div className={styles.chartWrapper}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={themeColors.grid} />
              <XAxis 
                dataKey="strike" 
                type="number"
                domain={xDomain}
                stroke={themeColors.text} 
                fontSize={12}
                tickLine={true}
                axisLine={true}
              />
              <YAxis 
                yAxisId="left"
                stroke={themeColors.text} 
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                stroke={themeColors.vol} 
                fontSize={12}
                tickLine={false}
                axisLine={false}
                domain={['auto', 'auto']}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1e293b', 
                  border: '1px solid #334155', 
                  borderRadius: '8px',
                  color: '#fff' 
                }}
                itemStyle={{ color: '#fff' }}
                cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
              />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ paddingBottom: '20px' }} />
              <ReferenceLine 
                x={data.FuturePrice} 
                yAxisId="left" 
                stroke={themeColors.future} 
                strokeWidth={3}
                strokeDasharray="8 4" 
                label={{ 
                  value: `${data.FuturePrice}`, 
                  position: 'insideTopLeft',
                  fill: themeColors.future, 
                  fontSize: 16,
                  fontWeight: 'bold'
                }} 
              />


              <Bar yAxisId="left" dataKey="call" fill={themeColors.call} radius={[4, 4, 0, 0]} name="Calls" barSize={10} />
              <Bar yAxisId="left" dataKey="put" fill={themeColors.put} radius={[4, 4, 0, 0]} name="Puts" barSize={10} />
              <Line yAxisId="right" type="monotone" dataKey="volSettle" stroke={themeColors.vol} dot={false} strokeWidth={2} name="Vol Settle %" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <footer className={styles.footer}>
        <p>CME QuikStrike Data Interceptor Prototype</p>
      </footer>
    </main>
  );
}
