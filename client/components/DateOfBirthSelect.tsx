// @/components/DateOfBirthSelect.tsx
//
// Date of birth as three dropdowns — Day, Month, Year — instead of a calendar
// picker (scrolling a calendar back 15 years on a phone is slow). Used when
// adding / editing learners (Class Management, My Class) and in Admissions.
//
// The value is the same ISO "YYYY-MM-DD" the rest of the system stores.
// Until all three are chosen the parts are kept here and onChange receives
// the parts with iso = '' (so the form can say what is missing).
import { useEffect, useMemo, useState } from 'react';

export interface DobParts { day: string; month: string; year: string }
export interface DobChange extends DobParts {
  /** "YYYY-MM-DD" once day, month and year are all chosen, else ''. */
  iso: string;
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number | string) => String(n).padStart(2, '0');
export const daysInMonth = (year: number, month: number) => new Date(year || 2000, month, 0).getDate();

/** Pure: "2010-03-07" → { day: '7', month: '3', year: '2010' }; a bare year (legacy birthYear) fills the year only. */
export function splitDob(iso?: string | null, fallbackYear?: number | string | null): DobParts {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (m) return { year: String(Number(m[1])), month: String(Number(m[2])), day: String(Number(m[3])) };
  const y = Number(fallbackYear);
  return { day: '', month: '', year: y > 0 ? String(y) : '' };
}

/** Pure: the ISO date for complete parts, '' otherwise (a 31st in a 30-day month is clamped). */
export function joinDob(p: DobParts): string {
  if (!p.day || !p.month || !p.year) return '';
  const y = Number(p.year), mo = Number(p.month);
  const d = Math.min(Number(p.day), daysInMonth(y, mo));
  return `${y}-${pad(mo)}-${pad(d)}`;
}

interface Props {
  value: string;
  onChange: (v: DobChange) => void;
  /** Used when there is no full date yet, e.g. an older learner with only a birth year. */
  fallbackYear?: number | string | null;
  minYear?: number;
  maxYear?: number;
  invalid?: boolean;
  disabled?: boolean;
  /** Prefix for the dropdown ids / labels. */
  idPrefix?: string;
}

export function DateOfBirthSelect({
  value, onChange, fallbackYear, minYear = 1990, maxYear = new Date().getFullYear(), invalid, disabled, idPrefix = 'dob',
}: Props) {
  const [parts, setParts] = useState<DobParts>(() => splitDob(value, fallbackYear));

  // Follow the form when it loads another learner or is reset.
  useEffect(() => {
    setParts(prev => {
      if (value) return value === joinDob(prev) ? prev : splitDob(value);
      // Value cleared while a full date was shown: the form was reset.
      if (joinDob(prev)) return splitDob('', fallbackYear);
      if (fallbackYear && !prev.year) return { ...prev, year: String(fallbackYear) };
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, fallbackYear]);

  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = maxYear; y >= minYear; y--) out.push(y);
    return out;
  }, [minYear, maxYear]);

  const maxDay = parts.month ? daysInMonth(Number(parts.year) || 2000, Number(parts.month)) : 31;

  const update = (k: keyof DobParts, v: string) => {
    const next = { ...parts, [k]: v };
    if (next.day && Number(next.day) > (next.month ? daysInMonth(Number(next.year) || 2000, Number(next.month)) : 31)) {
      next.day = String(daysInMonth(Number(next.year) || 2000, Number(next.month)));
    }
    setParts(next);
    onChange({ ...next, iso: joinDob(next) });
  };

  const cls = `w-full min-w-0 rounded-lg border bg-white px-2 py-2.5 text-base sm:text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500 ${invalid ? 'border-red-300' : 'border-gray-300'} ${disabled ? 'opacity-60' : ''}`;

  return (
    <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2" role="group" aria-label="Date of birth">
      <select id={`${idPrefix}-day`} aria-label="Day of birth" value={parts.day} disabled={disabled} onChange={e => update('day', e.target.value)} className={cls}>
        <option value="">Day</option>
        {Array.from({ length: maxDay }, (_, i) => i + 1).map(d => <option key={d} value={String(d)}>{d}</option>)}
      </select>
      <select id={`${idPrefix}-month`} aria-label="Month of birth" value={parts.month} disabled={disabled} onChange={e => update('month', e.target.value)} className={cls}>
        <option value="">Month</option>
        {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
      </select>
      <select id={`${idPrefix}-year`} aria-label="Year of birth" value={parts.year} disabled={disabled} onChange={e => update('year', e.target.value)} className={cls}>
        <option value="">Year</option>
        {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
      </select>
    </div>
  );
}

export default DateOfBirthSelect;
