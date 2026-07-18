// Shared Tailwind class strings for visual units used on both the live and
// backtest pages. Colors follow the token table in context/ui-context.md
// (bg-slate-900 = --bg-surface, border-slate-700 = --border-default,
// indigo-500 = --accent-primary, …).
export const ui = {
  main: 'w-full p-4 font-sans text-white md:p-8',
  title: 'text-[1.75rem] font-bold text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.3)] md:text-4xl',
  toggleGroup: 'inline-flex rounded-lg border border-slate-700 bg-slate-900 p-1',
  toggleBtn: 'cursor-pointer rounded-md px-4 py-2 text-sm font-semibold text-slate-400 transition-all hover:text-white',
  toggleActive: 'bg-indigo-500 text-white shadow-md',
  metaGrid: 'mt-6 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4 max-[600px]:grid-cols-2',
  metaItem: 'rounded-lg border-l-4 border-indigo-500 bg-slate-900 p-4 shadow-md',
  metaLabel: 'mb-1 block text-xs uppercase tracking-wider text-slate-400',
  metaValue: 'font-mono text-[1.1rem] font-bold text-slate-100 md:text-2xl',
  sectionTitle: 'mt-8 mb-2 border-b border-slate-700 pb-2 text-[1.35rem] font-bold text-slate-100',
  chartRow: 'grid grid-cols-2 items-start gap-6 max-[900px]:grid-cols-1',
  chartWrapper:
    'h-[360px] w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-[0_10px_25px_rgba(0,0,0,0.2)] max-[600px]:h-[350px] max-[600px]:p-2',
  footer: 'mt-12 border-t border-slate-700 py-8 text-center text-[0.8rem] text-slate-500',
} as const;
