// Shared bits of the timetable builder.
import { createContext, useContext, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import type { TermName } from '@/utils/academicTerm';
import type { GeneratorInputs } from '@/services/timetableGenerator/service';
import type { Actor } from '@/services/departmentService';
import { cn } from '@/lib/utils';

export interface BuilderCtx {
  term: TermName;
  year: number;
  isAdmin: boolean;
  actor: Actor;
  inputs: GeneratorInputs;
  refresh: () => void;
}

export const BuilderContext = createContext<BuilderCtx | null>(null);
export const useBuilder = () => {
  const c = useContext(BuilderContext);
  if (!c) throw new Error('useBuilder outside the timetable builder');
  return c;
};

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-gray-200 bg-white', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2.5 sm:px-4">
          {title && <h3 className="text-sm font-semibold text-gray-900">{title}</h3>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'ok' | 'warn' | 'error'; children: ReactNode }) {
  const styles = {
    info: 'bg-blue-50 border-blue-200 text-blue-900',
    ok: 'bg-green-50 border-green-200 text-green-900',
    warn: 'bg-amber-50 border-amber-200 text-amber-900',
    error: 'bg-red-50 border-red-200 text-red-900',
  }[tone];
  const Icon = { info: Info, ok: CheckCircle2, warn: AlertTriangle, error: AlertCircle }[tone];
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', styles)}>
      <Icon size={16} className="mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Btn({
  children,
  onClick,
  disabled,
  busy,
  variant = 'secondary',
  type = 'button',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  type?: 'button' | 'submit';
  title?: string;
}) {
  const v = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600',
    secondary: 'bg-white text-gray-800 hover:bg-gray-50 border-gray-300',
    danger: 'bg-white text-red-700 hover:bg-red-50 border-red-300',
    ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 border-transparent',
  }[variant];
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled || busy}
      className={cn('inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 text-sm font-medium disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500', v)}
    >
      {busy && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

export const errText = (e: unknown) =>
  (e as any)?.code === 'permission-denied' ? 'Not allowed for your account.' : (e as Error)?.message || 'Something went wrong.';

export const fmtDate = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export const fmtYMD = (ymd: string | null | undefined) => (ymd ? fmtDate(new Date(`${ymd}T12:00:00`)) : '');
