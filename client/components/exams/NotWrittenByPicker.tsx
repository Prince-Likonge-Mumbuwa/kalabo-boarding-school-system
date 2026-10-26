// Exam Management → a test → "Classes that do not write this test".
// E.g. in Term 3 the Grade 12 classes sit the ECZ final examinations and
// do not write the school's End of Term exam: pick them here (one tap for a
// whole level) and give the reason. For those classes the test is not
// offered in Results Entry, never counts as missing, and report cards use
// the other tests.
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { compareLevels, levelKeyOf, levelLabel } from '@/services/timetableGenerator/problem';

export interface PickerClass {
  id: string;
  name: string;
  type?: string | null;
  level?: number | null;
  isActive?: boolean;
  archived?: boolean;
}

export function NotWrittenByPicker({
  testLabel,
  classes,
  value,
  reason,
  onChange,
  onReasonChange,
}: {
  /** e.g. "End of Term Exam" */
  testLabel: string;
  classes: PickerClass[];
  value: string[];
  reason: string;
  onChange: (ids: string[]) => void;
  onReasonChange: (reason: string) => void;
}) {
  const [open, setOpen] = useState(value.length > 0);
  const levels = useMemo(() => {
    const m = new Map<string, PickerClass[]>();
    for (const c of classes) {
      if (c.isActive === false || c.archived) continue;
      const k = levelKeyOf(c);
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return [...m.entries()]
      .sort((a, b) => compareLevels(a[0], b[0]))
      .map(([key, list]) => ({ key, label: levelLabel(key), classes: list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) }));
  }, [classes]);

  const selected = new Set(value);
  const toggle = (id: string) => onChange(selected.has(id) ? value.filter(x => x !== id) : [...value, id]);
  const toggleLevel = (ids: string[], all: boolean) =>
    onChange(all ? value.filter(x => !ids.includes(x)) : [...new Set([...value, ...ids])]);
  const names = classes.filter(c => selected.has(c.id)).map(c => c.name);

  return (
    <div className="col-span-full rounded-lg border border-dashed border-gray-300 bg-gray-50/60 p-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 text-left text-xs font-medium text-gray-700"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Classes that do not write this test
        </span>
        <span className={value.length ? 'font-semibold text-amber-700' : 'text-gray-400'}>
          {value.length ? `${value.length} class${value.length === 1 ? '' : 'es'}` : 'All classes write it'}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-gray-500">
            For these classes the {testLabel} is not offered in Results Entry, never counts as missing, and their report cards use the other tests.
          </p>
          {levels.length === 0 && <p className="text-xs text-gray-400">No classes found.</p>}
          {levels.map(l => {
            const ids = l.classes.map(c => c.id);
            const all = ids.every(id => selected.has(id));
            return (
              <div key={l.key} className="flex flex-wrap items-center gap-1.5" role="group" aria-label={l.label}>
                <button
                  type="button"
                  aria-pressed={all}
                  onClick={() => toggleLevel(ids, all)}
                  className={`min-h-[30px] rounded-full border px-2.5 text-xs font-semibold ${all ? 'border-amber-600 bg-amber-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`}
                >
                  All {l.label}
                </button>
                {l.classes.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={selected.has(c.id)}
                    onClick={() => toggle(c.id)}
                    className={`min-h-[30px] rounded-full border px-2.5 text-xs ${selected.has(c.id) ? 'border-amber-500 bg-amber-100 text-amber-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            );
          })}
          {value.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Reason (shown to teachers)</span>
              <input
                type="text"
                value={reason}
                maxLength={80}
                onChange={e => onReasonChange(e.target.value)}
                placeholder="e.g. ECZ final examinations"
                aria-label={`Why ${names.join(', ')} do not write the ${testLabel}`}
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
