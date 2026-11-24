// @/components/superadmin/fx.tsx — the superAdmin console's look: the
// school's navy and sky blue, cards with depth that tilt towards the pointer,
// numbers that count up, and a progress ring. Everything here is plain CSS
// and React (no 3D library); the 3D chart is in UsageChart3D.
//
// Motion is switched off for anyone who asks their device to reduce motion,
// and tilting only happens with a mouse (never on touch screens).
import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const BRAND = { navy: '#16325c', deep: '#0b1b33', sky: '#5bb4dd' } as const;

const query = (q: string) => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(q).matches;

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => query('(prefers-reduced-motion: reduce)'));
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/** A card that leans a few degrees towards the mouse, with a soft shine where the pointer is. */
export function TiltCard({ children, className, max = 6, style }: { children: ReactNode; className?: string; max?: number; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [t, setT] = useState({ rx: 0, ry: 0, x: 50, y: 50, on: false });
  const canTilt = !reduced && query('(hover: hover) and (pointer: fine)');

  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!canTilt || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setT({ rx: (0.5 - py) * max * 2, ry: (px - 0.5) * max * 2, x: px * 100, y: py * 100, on: true });
  };
  return (
    <div style={{ perspective: '900px', ...style }} className={cn('h-full', className)}>
      <div
        ref={ref}
        onPointerMove={move}
        onPointerLeave={() => setT((s) => ({ ...s, rx: 0, ry: 0, on: false }))}
        style={{ transform: `rotateX(${t.rx}deg) rotateY(${t.ry}deg)`, transformStyle: 'preserve-3d' }}
        className="relative h-full rounded-2xl transition-transform duration-200 ease-out will-change-transform"
      >
        {children}
        {canTilt && (
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
            style={{ opacity: t.on ? 1 : 0, background: `radial-gradient(420px circle at ${t.x}% ${t.y}%, rgba(255,255,255,0.35), transparent 45%)` }} />
        )}
      </div>
    </div>
  );
}

/** A number that counts up when it first appears or changes. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString(), duration = 900 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced) { setShown(value); return; }
    const start = performance.now();
    const a = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - p) ** 3;
      setShown(a + (value - a) * eased);
      if (p < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduced]);
  return <span className="tabular-nums">{format(shown)}</span>;
}

export type Tone = 'sky' | 'emerald' | 'amber' | 'violet' | 'rose' | 'navy';
const TONES: Record<Tone, { tile: string; glow: string }> = {
  sky: { tile: 'from-sky-400 to-blue-600', glow: 'bg-sky-400/20' },
  emerald: { tile: 'from-emerald-400 to-teal-600', glow: 'bg-emerald-400/20' },
  amber: { tile: 'from-amber-300 to-orange-500', glow: 'bg-amber-400/25' },
  violet: { tile: 'from-violet-400 to-indigo-600', glow: 'bg-violet-400/20' },
  rose: { tile: 'from-rose-400 to-pink-600', glow: 'bg-rose-400/20' },
  navy: { tile: 'from-[#2b5a9e] to-[#16325c]', glow: 'bg-[#5bb4dd]/20' },
};

/** A headline number: coloured icon tile, counting value, depth on hover. */
export function KpiCard({ icon, label, value, format, hint, tone = 'sky', delay = 0, extra }: {
  icon: ReactNode; label: ReactNode; value: number | ReactNode; format?: (n: number) => string; hint?: ReactNode; tone?: Tone; delay?: number; extra?: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <TiltCard className="motion-safe:animate-rise" style={{ animationDelay: `${delay}ms` }}>
      <div className="relative h-full overflow-hidden rounded-2xl border border-white/70 bg-white/90 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05),0_12px_32px_-12px_rgba(22,50,92,0.25)] backdrop-blur sm:p-5">
        <span aria-hidden className={cn('pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full blur-2xl', t.glow)} />
        <div className="relative flex items-start gap-3.5" style={{ transform: 'translateZ(30px)' }}>
          <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg shadow-black/10', t.tile)}>{icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase leading-snug tracking-wide text-gray-500">{label}</p>
            <p className="mt-1 whitespace-nowrap text-2xl font-bold tracking-tight text-[#16325c] sm:text-[1.6rem]">
              {typeof value === 'number' ? <CountUp value={value} format={format} /> : value}
            </p>
            {hint && <p className="mt-0.5 text-xs leading-snug text-gray-500">{hint}</p>}
          </div>
          {extra}
        </div>
      </div>
    </TiltCard>
  );
}

/** A ring that fills to `value` (0–1), with the percentage in the middle. */
export function ProgressRing({ value, size = 52, stroke = 6, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const reduced = useReducedMotion();
  const gradient = `sa-ring-${useId().replace(/:/g, '')}`;
  const [p, setP] = useState(reduced ? value : 0);
  useEffect(() => { const id = requestAnimationFrame(() => setP(value)); return () => cancelAnimationFrame(id); }, [value]);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0" role="img" aria-label={label ?? `${Math.round(value * 100)}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradient} x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stopColor={BRAND.sky} /><stop offset="100%" stopColor={BRAND.navy} /></linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e8eef6" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${gradient})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, p)))} style={{ transition: reduced ? undefined : 'stroke-dashoffset 1.1s cubic-bezier(0.2,0.8,0.2,1)' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-[#16325c]">{Math.round(value * 100)}%</span>
    </span>
  );
}

/**
 * Can this device draw the 3D chart smoothly? It needs real graphics
 * hardware: a browser that could only draw 3D slowly in software says so
 * ("major performance caveat") and gets the flat chart instead, as does a
 * very small device. A two-core PC with a graphics chip is fine for five bars.
 */
export function canDraw3D(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  if ((nav.hardwareConcurrency ?? 4) < 2 || (nav.deviceMemory ?? 4) < 2) return false;
  try {
    const canvas = document.createElement('canvas');
    const opts = { failIfMajorPerformanceCaveat: true };
    return Boolean(canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts));
  } catch {
    return false;
  }
}

const PREF_3D = 'kalabo.superadmin.3d';
/** The superAdmin's own 3D on/off choice (this browser only). */
export function use3DPreference(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => { try { return localStorage.getItem(PREF_3D) !== 'off'; } catch { return true; } });
  const set = (v: boolean) => { setOn(v); try { localStorage.setItem(PREF_3D, v ? 'on' : 'off'); } catch { /* not saved: fine */ } };
  return [on, set];
}
