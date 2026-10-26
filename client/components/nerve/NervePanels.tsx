// @/components/nerve/NervePanels.tsx — the building blocks of the admin
// nerve centre (pages/AdminDashboard.tsx). Every number links to the page
// behind it. Colours: red / amber / blue are kept for status (always with an
// icon and words); charts use the reference palette (blue, orange) and gray.

import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Info,
  Loader2,
  Minus,
} from 'lucide-react';
import { CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '@/lib/utils';
import type { AttentionItem, Severity, TermTimeline, TrendPoint } from '@/services/nerveCentre';

// Reference palette (light): series 1 blue, series 2 orange; gray for "last term".
export const VIZ = { s1: '#2a78d6', s2: '#eb6834', muted: '#9ca3af', grid: '#eef0f3', text2: '#52514e' };

// ==================== SHELL ====================

export function Panel({
  title,
  icon,
  to,
  toLabel = 'Open',
  children,
  className,
  loading,
  error,
  id,
  right,
}: {
  title: string;
  icon?: ReactNode;
  to?: string;
  toLabel?: string;
  children: ReactNode;
  className?: string;
  loading?: boolean;
  error?: unknown;
  id?: string;
  right?: ReactNode;
}) {
  return (
    <section id={id} aria-label={title} className={cn('rounded-2xl border border-slate-200 bg-white shadow-sm', className)}>
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
          {icon}
          {title}
        </h2>
        <div className="flex items-center gap-2">
          {right}
          {to && (
            <Link to={to} className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
              {toLabel} <ArrowRight size={12} />
            </Link>
          )}
        </div>
      </header>
      <div className="p-4">
        {loading ? (
          <div className="space-y-2" aria-busy="true">
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
            <div className="h-16 animate-pulse rounded bg-slate-50" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-700">Could not load this panel. It will try again; you can also press Refresh.</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/** ▲ 2 / ▼ 3 / — compared with a reference. */
export function Change({ value, suffix = '', label, invert = false }: { value: number | null; suffix?: string; label: string; invert?: boolean }) {
  if (value === null) return <span className="text-xs text-slate-400">no {label} to compare</span>;
  const good = invert ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', value === 0 ? 'text-slate-500' : good ? 'text-emerald-600' : 'text-rose-600')}>
      <Icon size={13} />
      {value > 0 ? '+' : ''}
      {value}
      {suffix} <span className="font-normal text-slate-500">vs {label}</span>
    </span>
  );
}

// ==================== VITALS (header band) ====================

export function Vital({ label, value, sub, to, tone = 'default', loading }: { label: string; value: ReactNode; sub?: ReactNode; to: string; tone?: 'default' | 'good' | 'warn' | 'bad'; loading?: boolean }) {
  const ring = { default: 'ring-white/10', good: 'ring-emerald-400/40', warn: 'ring-amber-400/50', bad: 'ring-rose-400/60' }[tone];
  return (
    <Link
      to={to}
      className={cn('group flex min-w-0 flex-col rounded-xl bg-white/5 px-4 py-3 ring-1 transition hover:bg-white/10', ring)}
    >
      <span className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-slate-300">
        {label}
        <ChevronRight size={13} className="opacity-0 transition group-hover:opacity-100" />
      </span>
      {loading ? (
        <span className="mt-1 h-8 w-20 animate-pulse rounded bg-white/10" />
      ) : (
        <span className="mt-0.5 truncate text-3xl font-bold tabular-nums text-white">{value}</span>
      )}
      <span className="mt-0.5 min-h-[18px] truncate text-xs text-slate-300">{sub}</span>
    </Link>
  );
}

/** A live clock that ticks every second without re-rendering the page. */
export function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="text-right">
      <div className="font-mono text-3xl font-bold tabular-nums text-white sm:text-4xl" aria-label="Time now">
        {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div className="text-xs text-slate-300">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
    </div>
  );
}

// ==================== ATTENTION ====================

const SEV: Record<Severity, { icon: typeof AlertOctagon; label: string; chip: string; bar: string }> = {
  critical: { icon: AlertOctagon, label: 'Urgent', chip: 'bg-rose-600 text-white', bar: 'border-l-rose-600' },
  warning: { icon: AlertTriangle, label: 'Soon', chip: 'bg-amber-500 text-white', bar: 'border-l-amber-500' },
  info: { icon: Info, label: 'Note', chip: 'bg-blue-600 text-white', bar: 'border-l-blue-500' },
};

export function AttentionStrip({ items, loading }: { items: AttentionItem[]; loading?: boolean }) {
  const counts = { critical: items.filter(i => i.severity === 'critical').length, warning: items.filter(i => i.severity === 'warning').length, info: items.filter(i => i.severity === 'info').length };
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? items : items.slice(0, 8);
  return (
    <section aria-label="Needs attention" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
          <AlertTriangle size={16} className="text-amber-500" /> Needs attention
        </h2>
        {!loading && items.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            {(['critical', 'warning', 'info'] as Severity[]).filter(s => counts[s]).map(s => (
              <span key={s} className={cn('rounded-full px-2 py-0.5 font-semibold', SEV[s].chip)}>{counts[s]} {SEV[s].label.toLowerCase()}</span>
            ))}
          </div>
        )}
        {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
      </header>
      {items.length === 0 && !loading ? (
        <div className="flex items-center gap-3 px-4 py-5">
          <CheckCircle2 className="text-emerald-500" size={28} />
          <div>
            <p className="font-semibold text-slate-900">All clear</p>
            <p className="text-sm text-slate-600">Nothing needs you right now. Registers, lessons, results deadlines and set-up are on track.</p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {shown.map(i => {
            const s = SEV[i.severity];
            const Icon = s.icon;
            const inner = (
              <>
                <span className={cn('mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase', s.chip)}>
                  <Icon size={11} /> {s.label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900">{i.title}</span>
                  {i.detail && <span className="block truncate text-xs text-slate-500">{i.area} · {i.detail}</span>}
                  {!i.detail && <span className="block text-xs text-slate-500">{i.area}</span>}
                </span>
                <span className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-blue-700">
                  {i.to.startsWith('#') ? 'See below' : 'Fix'} <ChevronRight size={13} />
                </span>
              </>
            );
            const cls = cn('flex items-start gap-3 border-l-4 px-4 py-2.5 hover:bg-slate-50', s.bar);
            return (
              <li key={i.id}>
                {i.to.startsWith('#') ? <a href={i.to} className={cls}>{inner}</a> : <Link to={i.to} className={cls}>{inner}</Link>}
              </li>
            );
          })}
        </ul>
      )}
      {items.length > 8 && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="w-full border-t border-slate-100 py-2 text-xs font-medium text-blue-700 hover:bg-slate-50">
          {showAll ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}

// ==================== SMALL CHARTS ====================

/** Single-series sparkline (attendance % per day), with the last value labelled. */
export function Sparkline({ points, height = 56 }: { points: Array<{ date: string; pct: number }>; height?: number }) {
  if (points.length < 2) return <p className="text-xs text-slate-400">Trend shows after two days of registers.</p>;
  const w = 220;
  // Scale to the data (at least a 10-point band) so day-to-day changes show.
  const lo = Math.min(...points.map(p => p.pct));
  const hi = Math.max(...points.map(p => p.pct));
  const pad = Math.max(2, (10 - (hi - lo)) / 2);
  const min = Math.max(0, lo - pad);
  const max = Math.min(100, hi + pad);
  const x = (i: number) => (i / (points.length - 1)) * (w - 8) + 4;
  const y = (v: number) => height - 6 - ((v - min) / (max - min || 1)) * (height - 12);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label={`Attendance over the last ${points.length} school days, latest ${last.pct}%`}>
      <path d={d} fill="none" stroke={VIZ.s1} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <text x={x(points.length - 1)} y={Math.max(10, y(last.pct) - 8)} textAnchor="end" fontSize="11" fontWeight="600" fill="#0b0b0b">{last.pct}%</text>
      {points.map((p, i) => (
        <circle key={p.date} cx={x(i)} cy={y(p.pct)} r={i === points.length - 1 ? 4 : 2.5} fill={VIZ.s1} stroke="#fff" strokeWidth={2}>
          <title>{`${new Date(`${p.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}: ${p.pct}%`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** A labelled horizontal bar (0–100), one series colour. */
export function MeterRow({ label, value, right, to, color = VIZ.s1, max = 100 }: { label: string; value: number | null; right?: ReactNode; to?: string; color?: string; max?: number }) {
  const body = (
    <div className="flex items-center gap-3 py-1">
      <span className="w-24 shrink-0 truncate text-xs text-slate-700">{label}</span>
      <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        {value !== null && <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(2, (value / max) * 100)}%`, background: color }} />}
      </span>
      <span className="w-20 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-800">{right ?? (value === null ? '—' : `${value}%`)}</span>
    </div>
  );
  return to ? <Link to={to} className="block rounded hover:bg-slate-50">{body}</Link> : body;
}

/** Pass rate test by test, this term vs last term (one axis, %). */
export function TrendChart({ trend }: { trend: TrendPoint[] }) {
  const data = trend.map(p => ({ test: p.label, 'This term': p.thisTerm.passRate, 'Last term': p.lastTerm.passRate, n: p.thisTerm.n }));
  if (!trend.some(p => p.thisTerm.n > 0 || p.lastTerm.n > 0)) return <p className="py-6 text-center text-sm text-slate-500">No marks yet this term or last term.</p>;
  return (
    <div className="h-52" role="img" aria-label={`Pass rate by test: ${data.map(d => `${d.test} ${d['This term'] ?? '—'}% this term, ${d['Last term'] ?? '—'}% last term`).join('; ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 18, right: 16, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={VIZ.grid} vertical={false} />
          <XAxis dataKey="test" tick={{ fontSize: 11, fill: VIZ.text2 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} ticks={[0, 40, 70, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: VIZ.text2 }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v: any) => (v === null || v === undefined ? '—' : `${v}%`)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="Last term" stroke={VIZ.muted} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4, fill: VIZ.muted, stroke: '#fff', strokeWidth: 2 }} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="This term" stroke={VIZ.s1} strokeWidth={2} dot={{ r: 5, fill: VIZ.s1, stroke: '#fff', strokeWidth: 2 }} connectNulls isAnimationActive={false}>
            <LabelList dataKey="This term" position="top" formatter={(v: any) => (v === null || v === undefined ? '' : `${v}%`)} style={{ fontSize: 11, fill: '#0b0b0b', fontWeight: 600 }} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Boys / girls per form, two series with a 2px gap, legend + totals. */
export function EnrolmentBars({ rows }: { rows: Array<{ form: string; boys: number; girls: number; other: number; total: number }> }) {
  const max = Math.max(1, ...rows.map(r => r.total));
  if (!rows.length) return <p className="text-sm text-slate-500">No learners yet.</p>;
  return (
    <div>
      <div className="mb-2 flex items-center gap-3 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: VIZ.s1 }} /> Boys</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: VIZ.s2 }} /> Girls</span>
      </div>
      <ul className="space-y-1.5">
        {rows.map(r => (
          <li key={r.form} className="flex items-center gap-3" title={`${r.form}: ${r.boys} boys, ${r.girls} girls${r.other ? `, ${r.other} not recorded` : ''}`}>
            <span className="w-16 shrink-0 text-xs text-slate-700">{r.form}</span>
            <span className="flex h-3 flex-1 gap-[2px]">
              <span className="rounded-l-[4px]" style={{ width: `${(r.boys / max) * 100}%`, background: VIZ.s1 }} />
              <span className={cn(r.other ? '' : 'rounded-r-[4px]')} style={{ width: `${(r.girls / max) * 100}%`, background: VIZ.s2 }} />
              {r.other > 0 && <span className="rounded-r-[4px] bg-slate-300" style={{ width: `${(r.other / max) * 100}%` }} />}
            </span>
            <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-800">{r.total}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ==================== TERM TIMELINE ====================

export function Timeline({ t, termLabel }: { t: TermTimeline; termLabel: string }) {
  const color = { test: 'bg-blue-600', deadline: 'bg-rose-500', holiday: 'bg-emerald-500' } as const;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-2xl font-bold text-slate-900">
          Week {t.week} <span className="text-sm font-normal text-slate-500">of about {t.totalWeeks} · {termLabel}</span>
        </p>
        <p className="text-xs text-slate-600">{t.daysLeft} days to the end of term</p>
      </div>
      <div className="relative h-8" role="img" aria-label={`Term ${t.elapsed}% through. ${t.markers.map(m => `${m.label} ${m.date}`).join('; ')}`}>
        <div className="absolute inset-x-0 top-3.5 h-1.5 rounded-full bg-slate-100" />
        <div className="absolute left-0 top-3.5 h-1.5 rounded-full bg-slate-400" style={{ width: `${t.elapsed}%` }} />
        {t.markers.map(m => (
          <span
            key={`${m.date}-${m.label}`}
            title={`${m.label} — ${new Date(`${m.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`}
            className={cn('absolute top-2 h-4 w-1.5 -translate-x-1/2 rounded-full ring-2 ring-white', color[m.kind], m.past && 'opacity-40')}
            style={{ left: `${m.pos}%` }}
          />
        ))}
        <span className="absolute top-0 h-8 w-0.5 -translate-x-1/2 bg-slate-900" style={{ left: `${t.elapsed}%` }} aria-hidden="true" />
        <span className="absolute -top-4 -translate-x-1/2 text-[10px] font-semibold text-slate-900" style={{ left: `${Math.min(94, Math.max(4, t.elapsed))}%` }}>Today</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" /> Test</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> Results due</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Holiday</span>
      </div>
      {t.next ? (
        <p className="mt-2 text-sm text-slate-700">
          Next: <strong>{t.next.label}</strong> on {new Date(`${t.next.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No more test dates, deadlines or holidays set for this term.</p>
      )}
    </div>
  );
}
