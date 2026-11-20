// @/components/ai/ui.tsx — small building blocks shared by the AI Tools,
// eFile and superAdmin pages, so every screen has the same spacing, type
// sizes, cards and form controls (the app's look: white cards, gray-200
// borders, blue-600 actions, Poppins headings).
import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Page title block: optional eyebrow, title, one-line description and actions on the right. */
export function PageHeader({ eyebrow, title, description, actions, icon }: {
  eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-600">{eyebrow}</div>}
        <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          {icon}{title}
        </h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-gray-600 sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A white card. `padded` adds the standard inner spacing. */
export function Card({ className, children, padded = true, as: Tag = 'div' }: {
  className?: string; children: ReactNode; padded?: boolean; as?: 'div' | 'section' | 'form' | 'article';
}) {
  return <Tag className={cn('rounded-2xl border border-gray-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]', padded && 'p-5 sm:p-6', className)}>{children}</Tag>;
}

/** Heading inside a card, with an optional step number and a right-hand slot. */
export function CardTitle({ step, title, hint, right }: { step?: number; title: ReactNode; hint?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      {step !== undefined && (
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">{step}</span>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-gray-500">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

/** A labelled form control. Put the input as children. */
export function Field({ label, htmlFor, hint, children, className }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-gray-800">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

const control = 'w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500';

export const Select = ({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <div className="relative">
    <select {...props} className={cn(control, 'h-11 cursor-pointer appearance-none pr-10', className)} />
    <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
  </div>
);
export const TextInput = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={cn(control, 'h-11', className)} />
);
export const TextArea = ({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} className={cn(control, 'min-h-[8rem] py-3 leading-relaxed', className)} />
);

/** Small coloured label. */
export function Pill({ tone = 'gray', children, className }: { tone?: 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'indigo'; children: ReactNode; className?: string }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700 ring-gray-200',
    blue: 'bg-blue-50 text-blue-700 ring-blue-200',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  };
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone], className)}>{children}</span>;
}

/** A number with a label, for dashboards. */
export function Stat({ label, value, hint, icon }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <Card padded={false} className="flex items-start gap-4 p-4 sm:p-6">
      {icon && <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 sm:flex">{icon}</span>}
      <div className="min-w-0">
        <p className="text-xs text-gray-500 sm:text-sm">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-gray-900 sm:text-2xl">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      </div>
    </Card>
  );
}

/** Centered message for empty lists and blocked states. */
export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-500">{icon}</span>}
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {children && <div className="mt-1.5 max-w-md text-sm text-gray-600">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Selectable chips (single or multiple choice). */
export function ChipGroup<T extends string>({ options, value, onToggle, label, disabled }: {
  options: { value: T; label: ReactNode; hint?: string; disabled?: boolean }[];
  value: T[];
  onToggle: (v: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button key={o.value} type="button" aria-pressed={on} disabled={disabled || o.disabled} title={o.hint} onClick={() => onToggle(o.value)}
            className={cn('h-9 rounded-full border px-3.5 text-sm font-medium transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50',
              on ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50')}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A loading placeholder bar. */
export const Skeleton = ({ className }: { className?: string }) => <div className={cn('animate-pulse rounded-lg bg-gray-200/70', className)} />;
