// Pick the department(s) a teacher belongs to. Used by admins in Teacher
// Management and by teachers themselves in Settings, so both work alike.
import React, { useState } from 'react';
import { Check, Lock, Loader2, Plus } from 'lucide-react';
import { hasDepartment } from '@/services/departmentService';

export interface DepartmentPickerProps {
  /** Every department that can be chosen. */
  options: string[];
  /** The chosen departments. */
  value: string[];
  onChange: (next: string[]) => void;
  /** Chosen departments that cannot be removed here (e.g. the one a teacher heads). */
  locked?: string[];
  lockedReason?: string;
  disabled?: boolean;
  /** Admins only: add a department to the school list. Resolves to the saved name. */
  onAdd?: (name: string) => Promise<string>;
  /** Department headed by this teacher, shown with a HoD tag. */
  hodOf?: string | null;
}

export function DepartmentPicker({ options, value, onChange, locked = [], lockedReason, disabled, onAdd, hodOf }: DepartmentPickerProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = (d: string) => {
    if (disabled) return;
    if (hasDepartment(value, d)) {
      if (hasDepartment(locked, d)) return;
      onChange(value.filter(v => v.toLowerCase() !== d.toLowerCase()));
    } else {
      onChange([...value, d]);
    }
  };

  const add = async () => {
    if (!onAdd || !name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const saved = await onAdd(name);
      if (!hasDepartment(value, saved)) onChange([...value, saved]);
      setName('');
      setAdding(false);
    } catch (e: any) {
      setError(e?.message || 'Could not add the department.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Departments">
        {options.map(d => {
          const on = hasDepartment(value, d);
          const isLocked = on && hasDepartment(locked, d);
          const isHod = !!hodOf && hodOf.toLowerCase() === d.toLowerCase();
          return (
            <button
              key={d}
              type="button"
              onClick={() => toggle(d)}
              disabled={disabled}
              aria-pressed={on}
              title={isLocked ? lockedReason : on ? `Remove ${d}` : `Add ${d}`}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-60 ${
                on
                  ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:bg-blue-50'
              } ${isLocked ? 'cursor-default' : ''}`}
            >
              {isLocked ? <Lock size={13} /> : on ? <Check size={14} /> : <Plus size={14} className="text-gray-400" />}
              <span>{d}</span>
              {isHod && <span className={`rounded px-1 text-[10px] font-bold ${on ? 'bg-white/25' : 'bg-amber-100 text-amber-800'}`}>HoD</span>}
            </button>
          );
        })}
        {onAdd && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={disabled}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-dashed border-gray-400 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            <Plus size={14} /> New department
          </button>
        )}
      </div>
      {onAdd && adding && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setAdding(false); }}
            placeholder="Department name"
            maxLength={60}
            aria-label="New department name"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={add}
              disabled={busy || !name.trim()}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50 sm:flex-none"
            >
              {busy && <Loader2 size={14} className="animate-spin" />} Add
            </button>
            <button type="button" onClick={() => { setAdding(false); setError(''); }} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 sm:flex-none">
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
