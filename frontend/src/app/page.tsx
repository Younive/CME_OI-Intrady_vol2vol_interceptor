'use client';

import React, { useMemo } from 'react';
import styles from './page.module.css';
import rawData from '../data/data.json';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface DataPoint {
  x: number;
  y: number;
}

interface RawData {
  ValueName: string;
  Call: { data: DataPoint[] };
  Put: { data: DataPoint[] };
  FuturePrice: number;
  Title: string;
  Subtitle: string;
}

export default function Home() {
  const data = rawData as unknown as RawData;

  const chartData = useMemo(() => {
    const strikesMap = new Map<number, { strike: number; call: number; put: number; total: number }>();

    data.Call.data.forEach((p) => {
      strikesMap.set(p.x, { strike: p.x, call: p.y, put: 0, total: p.y });
    });

    data.Put.data.forEach((p) => {
      const existing = strikesMap.get(p.x);
      if (existing) {
        existing.put = p.y;
        existing.total += p.y;
      } else {
        strikesMap.set(p.x, { strike: p.x, call: 0, put: p.y, total: p.y });
      }
    });

    return Array.from(strikesMap.values())
      .filter(d => d.total > 0)
      .sort((a, b) => a.strike - b.strike);
  }, [data]);

  const themeColors = {
    total: "#818cf8",
    call: "#38bdf8",
    put: "#fb923c",
    grid: "#334155",
    text: "#94a3b8"
  };

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>{data.Title || 'CME Vol2Vol Dashboard'}</h1>
        <div className={styles.metaGrid}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Future Price</span>
            <span className={styles.metaValue}>${data.FuturePrice}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>View Type</span>
            <span className={styles.metaValue}>{data.ValueName}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Total Strikes</span>
            <span className={styles.metaValue}>{chartData.length}</span>
          </div>
        </div>
      </header>

      <section className={styles.chartSection}>
        <div className={styles.chartHeader}>
          <h2 className={styles.chartTitle}>Total Contracts Distribution</h2>
        </div>
        <div className={styles.chartWrapper}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={themeColors.grid} />
              <XAxis 
                dataKey="strike" 
                stroke={themeColors.text} 
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                stroke={themeColors.text} 
                fontSize={12}
                tickLine={false}
                axisLine={false}
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
              <Bar dataKey="total" fill={themeColors.total} radius={[4, 4, 0, 0]} name="Total Contracts" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className={styles.chartSection}>
        <div className={styles.chartHeader}>
          <h2 className={styles.chartTitle}>Separate Call vs Put Distribution</h2>
        </div>
        <div className={styles.chartWrapper}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={themeColors.grid} />
              <XAxis 
                dataKey="strike" 
                stroke={themeColors.text} 
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                stroke={themeColors.text} 
                fontSize={12}
                tickLine={false}
                axisLine={false}
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
              <Bar dataKey="call" fill={themeColors.call} radius={[4, 4, 0, 0]} name="Calls" />
              <Bar dataKey="put" fill={themeColors.put} radius={[4, 4, 0, 0]} name="Puts" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <footer className={styles.footer}>
        <p>CME QuikStrike Data Interceptor Prototype</p>
      </footer>
    </main>
  );
}
