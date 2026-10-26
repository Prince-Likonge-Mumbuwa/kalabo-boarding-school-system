// Timetable builder → Curriculum: for each level (Form 1, Grade 10…) the
// subjects with their periods a week (fewest–most), doubles, triples, time
// of day and room; class exceptions; special rooms; fixed school events;
// a teacher's daily limit.
import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Plus, Save, Trash2, Undo2 } from 'lucide-react';
import { CurriculumImportCard } from './CurriculumImportCard';
import { useInvalidateBuilder } from '@/hooks/useTimetableBuilder';
import {
  activeClasses,
  compareLevels,
  levelKeyOf,
  levelLabel,
  requirementProblems,
  requirementsForClass,
} from '@/services/timetableGenerator/problem';
import { saveTimetableConfig } from '@/services/timetableGenerator/service';
import {
  CELLS,
  TIME_LABEL,
  type ClassException,
  type FixedEvent,
  type SubjectRequirement,
  type TimePreference,
  type TimetableConfig,
  type Weekday,
} from '@/services/timetableGenerator/types';
import { Btn, Card, Notice, errText, useBuilder } from './shared';

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const newId = () => Math.random().toString(36).slice(2, 9);
const num = (v: string) => Math.max(0, Math.min(12, Math.round(Number(v) || 0)));

export function CurriculumPanel() {
  const { inputs, actor } = useBuilder();
  const invalidate = useInvalidateBuilder();
  const [cfg, setCfg] = useState<TimetableConfig>(inputs.config);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    if (!dirty) setCfg(inputs.config);
  }, [inputs.config, dirty]);

  const update = (fn: (c: TimetableConfig) => TimetableConfig) => {
    setCfg(c => fn(structuredClone(c)));
    setDirty(true);
    setMsg(null);
  };

  const classes = useMemo(() => activeClasses(inputs.classes), [inputs.classes]);
  const levels = useMemo(() => {
    const keys = new Set([...classes.map(levelKeyOf), ...Object.keys(cfg.levels)]);
    return [...keys].sort(compareLevels);
  }, [classes, cfg.levels]);
  const [level, setLevel] = useState<string>('');
  const current = levels.includes(level) ? level : levels[0] ?? '';
  const lv = cfg.levels[current] ?? { key: current, label: levelLabel(current), subjects: [] };
  const levelClasses = classes.filter(c => levelKeyOf(c) === current);

  // Subjects that classes of this level already have teachers for.
  const taughtHere = useMemo(() => {
    const ids = new Set(levelClasses.map(c => c.id));
    const m = new Map<string, string>();
    for (const s of inputs.slots) if (ids.has(s.classId)) m.set(s.normalizedSubject, s.subject);
    return m;
  }, [levelClasses, inputs.slots]);
  const allSubjects = useMemo(() => {
    const m = new Map(Object.entries(inputs.subjectNames));
    for (const l of Object.values(cfg.levels)) for (const s of l.subjects) if (!m.has(s.normalizedSubject)) m.set(s.normalizedSubject, s.subject);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [inputs.subjectNames, cfg.levels]);

  const setLevelSubjects = (subjects: SubjectRequirement[]) =>
    update(c => {
      c.levels[current] = { key: current, label: lv.label || levelLabel(current), subjects };
      return c;
    });
  const patch = (i: number, p: Partial<SubjectRequirement>) => {
    const next = lv.subjects.map((s, k) => (k === i ? { ...s, ...p } : s));
    if (p.min !== undefined && next[i].max < next[i].min) next[i].max = next[i].min;
    setLevelSubjects(next);
  };
  const add = (normalizedSubject: string) => {
    if (!normalizedSubject || lv.subjects.some(s => s.normalizedSubject === normalizedSubject)) return;
    const name = taughtHere.get(normalizedSubject) ?? inputs.subjectNames[normalizedSubject] ?? normalizedSubject;
    setLevelSubjects([...lv.subjects, { normalizedSubject, subject: name, min: 4, max: 4, doubles: 0, triples: 0, time: 'any', notLast: false, roomId: null }]);
  };
  const addTaught = () => {
    const have = new Set(lv.subjects.map(s => s.normalizedSubject));
    const extra = [...taughtHere].filter(([k]) => !have.has(k)).map(([normalizedSubject, subject]) => ({
      normalizedSubject, subject, min: 4, max: 4, doubles: 0, triples: 0, time: 'any' as TimePreference, notLast: false, roomId: null,
    }));
    setLevelSubjects([...lv.subjects, ...extra].sort((a, b) => a.subject.localeCompare(b.subject)));
  };
  const copyFrom = (key: string) => {
    const from = cfg.levels[key];
    if (from) setLevelSubjects(structuredClone(from.subjects));
  };

  const totalMin = lv.subjects.reduce((n, s) => n + s.min, 0);
  const totalMax = lv.subjects.reduce((n, s) => n + s.max, 0);
  const eventCells = new Set(cfg.events.filter(e => !e.levels.length || e.levels.includes(current)).flatMap(e => e.days.flatMap(d => e.periods.map(p => `${d}:${p}`)))).size;
  const free = CELLS - eventCells;
  const invalid = Object.values(cfg.levels).some(l => l.subjects.some(s => requirementProblems(s).length));

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await saveTimetableConfig(cfg, actor);
      setDirty(false);
      invalidate();
      setMsg({ ok: true, text: 'Curriculum saved.' });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {importing ? (
        <CurriculumImportCard
          cfg={cfg}
          onClose={() => setImporting(false)}
          onApply={(next, r) => {
            update(() => next);
            if (r.levels[0]) setLevel(r.levels[0].key);
            setImporting(false);
            setMsg({
              ok: true,
              text: `Imported ${r.rowsUsed} row${r.rowsUsed === 1 ? '' : 's'} for ${r.levels.map(l => l.label).join(', ')}. Review, then Save curriculum.`,
            });
          }}
        />
      ) : (
        <div className="flex justify-end">
          <Btn onClick={() => setImporting(true)}><FileSpreadsheet size={14} /> Bulk import class allocation</Btn>
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Level">
        {levels.map(k => (
          <button
            key={k}
            role="tab"
            aria-selected={k === current}
            onClick={() => setLevel(k)}
            className={`min-h-[36px] rounded-full border px-3 text-sm ${k === current ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            {cfg.levels[k]?.label || levelLabel(k)}
            {!(cfg.levels[k]?.subjects.length) && <span className="ml-1 text-amber-300" aria-label="not set">•</span>}
          </button>
        ))}
      </div>

      {current && (
        <Card
          title={`${lv.label || levelLabel(current)} — ${levelClasses.length} class${levelClasses.length === 1 ? '' : 'es'}`}
          actions={
            <>
              {taughtHere.size > 0 && <Btn onClick={addTaught}><Plus size={14} /> Subjects taught in these classes</Btn>}
              <select
                aria-label="Copy subjects from another level"
                className="min-h-[38px] rounded-lg border border-gray-300 px-2 text-sm"
                value=""
                onChange={e => copyFrom(e.target.value)}
              >
                <option value="">Copy from…</option>
                {Object.keys(cfg.levels).filter(k => k !== current && cfg.levels[k].subjects.length).sort(compareLevels).map(k => (
                  <option key={k} value={k}>{cfg.levels[k].label}</option>
                ))}
              </select>
            </>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase text-gray-500">
                  <th className="py-1.5 pr-2">Subject</th>
                  <th className="px-1" title="Periods a week that must be timetabled">Fewest</th>
                  <th className="px-1" title="Periods a week wanted when there is room">Most</th>
                  <th className="px-1">Doubles</th>
                  <th className="px-1">Triples</th>
                  <th className="px-1">Time of day</th>
                  <th className="px-1">Not P8</th>
                  <th className="px-1">Room</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lv.subjects.map((s, i) => {
                  const probs = requirementProblems(s);
                  return (
                    <tr key={s.normalizedSubject} className="border-t border-gray-100 align-top">
                      <td className="py-1.5 pr-2">
                        <span className="font-medium text-gray-900">{s.subject}</span>
                        {probs.length > 0 && <span className="block text-xs text-red-700">{probs.join('; ')}</span>}
                      </td>
                      {(['min', 'max', 'doubles', 'triples'] as const).map(f => (
                        <td key={f} className="px-1 py-1">
                          <input
                            type="number"
                            min={0}
                            max={12}
                            inputMode="numeric"
                            aria-label={`${s.subject} ${f}`}
                            value={s[f]}
                            onChange={e => patch(i, { [f]: num(e.target.value) } as Partial<SubjectRequirement>)}
                            className="w-14 rounded-md border border-gray-300 px-1.5 py-1"
                          />
                        </td>
                      ))}
                      <td className="px-1 py-1">
                        <select aria-label={`${s.subject} time of day`} value={s.time} onChange={e => patch(i, { time: e.target.value as TimePreference })} className="rounded-md border border-gray-300 px-1.5 py-1">
                          {(Object.keys(TIME_LABEL) as TimePreference[]).map(t => <option key={t} value={t}>{TIME_LABEL[t]}</option>)}
                        </select>
                      </td>
                      <td className="px-1 py-1 text-center">
                        <input type="checkbox" aria-label={`${s.subject} not in the last period`} checked={!!s.notLast} onChange={e => patch(i, { notLast: e.target.checked })} className="h-4 w-4" />
                      </td>
                      <td className="px-1 py-1">
                        <select aria-label={`${s.subject} room`} value={s.roomId ?? ''} onChange={e => patch(i, { roomId: e.target.value || null })} className="max-w-[9rem] rounded-md border border-gray-300 px-1.5 py-1">
                          <option value="">Own classroom</option>
                          {cfg.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </td>
                      <td className="px-1 py-1">
                        <button type="button" aria-label={`Remove ${s.subject}`} onClick={() => setLevelSubjects(lv.subjects.filter((_, k) => k !== i))} className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-700">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <select aria-label="Add a subject" value="" onChange={e => add(e.target.value)} className="min-h-[38px] rounded-lg border border-gray-300 px-2 text-sm">
              <option value="">+ Add a subject…</option>
              {allSubjects.filter(([k]) => !lv.subjects.some(s => s.normalizedSubject === k)).map(([k, name]) => <option key={k} value={k}>{name}</option>)}
            </select>
            <p className={`text-sm ${totalMin > free ? 'font-semibold text-red-700' : 'text-gray-700'}`}>
              {totalMin}{totalMax > totalMin ? `–${totalMax}` : ''} of {free} periods a week
              {totalMin > free && ' — too many'}
            </p>
          </div>
        </Card>
      )}

      {current && <ExceptionsCard cfg={cfg} update={update} levelKey={current} />}
      <RoomsCard cfg={cfg} update={update} />
      <EventsCard cfg={cfg} update={update} levels={levels} />

      <Card title="Teachers">
        <label className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
          Try not to give a teacher more than
          <input
            type="number"
            min={3}
            max={8}
            value={cfg.maxTeacherPeriodsPerDay}
            onChange={e => update(c => ({ ...c, maxTeacherPeriodsPerDay: Math.min(8, Math.max(3, Number(e.target.value) || 6)) }))}
            className="w-16 rounded-md border border-gray-300 px-2 py-1"
            aria-label="Most periods a teacher should teach in a day"
          />
          periods in a day.
        </label>
      </Card>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <div className="min-w-0 flex-1">{msg ? <Notice tone={msg.ok ? 'ok' : 'error'}>{msg.text}</Notice> : <span className="text-sm text-gray-600">{dirty ? 'Unsaved changes.' : 'All changes saved.'}</span>}</div>
        <div className="flex gap-2">
          {dirty && <Btn variant="ghost" onClick={() => { setCfg(inputs.config); setDirty(false); }}><Undo2 size={14} /> Undo</Btn>}
          <Btn variant="primary" busy={saving} disabled={!dirty || invalid} onClick={save} title={invalid ? 'Fix the rows marked in red first' : undefined}><Save size={14} /> Save curriculum</Btn>
        </div>
      </div>
    </div>
  );
}

type Updater = (fn: (c: TimetableConfig) => TimetableConfig) => void;

function ExceptionsCard({ cfg, update, levelKey }: { cfg: TimetableConfig; update: Updater; levelKey: string }) {
  const { inputs } = useBuilder();
  const classes = activeClasses(inputs.classes).filter(c => levelKeyOf(c) === levelKey);
  const subjects = cfg.levels[levelKey]?.subjects ?? [];
  const mine = cfg.exceptions.map((e, i) => ({ e, i })).filter(({ e }) => classes.some(c => c.id === e.classId));
  const [cls, setCls] = useState('');
  const [subj, setSubj] = useState('');

  const add = () => {
    if (!cls || !subj || cfg.exceptions.some(e => e.classId === cls && e.normalizedSubject === subj)) return;
    const base = subjects.find(s => s.normalizedSubject === subj);
    update(c => ({ ...c, exceptions: [...c.exceptions, { classId: cls, normalizedSubject: subj, min: base?.min, max: base?.max, doubles: base?.doubles, triples: base?.triples }] }));
    setSubj('');
  };
  const patch = (i: number, p: Partial<ClassException>) =>
    update(c => ({ ...c, exceptions: c.exceptions.map((e, k) => (k === i ? { ...e, ...p } : e)) }));

  if (!subjects.length) return null;
  return (
    <Card title="Class exceptions">
      <p className="mb-3 text-xs text-gray-600">A class that does not take a subject, or takes it for a different number of periods.</p>
      {mine.length > 0 && (
        <ul className="mb-3 space-y-2">
          {mine.map(({ e, i }) => {
            const c = classes.find(x => x.id === e.classId);
            const s = subjects.find(x => x.normalizedSubject === e.normalizedSubject);
            const eff = requirementsForClass(cfg, e.classId, levelKey).find(r => r.normalizedSubject === e.normalizedSubject);
            return (
              <li key={`${e.classId}|${e.normalizedSubject}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 px-2 py-1.5 text-sm">
                <span className="font-medium text-gray-900">{c?.name} · {s?.subject ?? e.normalizedSubject}</span>
                <label className="flex items-center gap-1 text-xs text-gray-700">
                  <input type="checkbox" checked={!!e.excluded} onChange={ev => patch(i, { excluded: ev.target.checked || undefined })} /> Not taken
                </label>
                {!e.excluded && (['min', 'max', 'doubles', 'triples'] as const).map(f => (
                  <label key={f} className="flex items-center gap-1 text-xs text-gray-600">
                    {f === 'min' ? 'Fewest' : f === 'max' ? 'Most' : f === 'doubles' ? 'Doubles' : 'Triples'}
                    <input type="number" min={0} max={12} value={e[f] ?? s?.[f] ?? 0} onChange={ev => patch(i, { [f]: num(ev.target.value) } as Partial<ClassException>)} className="w-12 rounded border border-gray-300 px-1 py-0.5" />
                  </label>
                ))}
                {eff && requirementProblems(eff).length > 0 && <span className="text-xs text-red-700">{requirementProblems(eff).join('; ')}</span>}
                <button type="button" aria-label="Remove exception" onClick={() => update(c => ({ ...c, exceptions: c.exceptions.filter((_, k) => k !== i) }))} className="ml-auto rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-700"><Trash2 size={14} /></button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <select aria-label="Class" value={cls} onChange={e => setCls(e.target.value)} className="min-h-[38px] rounded-lg border border-gray-300 px-2 text-sm">
          <option value="">Class…</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Subject" value={subj} onChange={e => setSubj(e.target.value)} className="min-h-[38px] rounded-lg border border-gray-300 px-2 text-sm">
          <option value="">Subject…</option>
          {subjects.map(s => <option key={s.normalizedSubject} value={s.normalizedSubject}>{s.subject}</option>)}
        </select>
        <Btn onClick={add} disabled={!cls || !subj}><Plus size={14} /> Add exception</Btn>
      </div>
    </Card>
  );
}

function RoomsCard({ cfg, update }: { cfg: TimetableConfig; update: Updater }) {
  const [name, setName] = useState('');
  const used = (id: string) => Object.values(cfg.levels).some(l => l.subjects.some(s => s.roomId === id));
  return (
    <Card title="Special rooms">
      <p className="mb-3 text-xs text-gray-600">Rooms that one class at a time can use (labs, computer room, home economics room). Classes otherwise stay in their own classroom.</p>
      <ul className="mb-3 flex flex-wrap gap-2">
        {cfg.rooms.map(r => (
          <li key={r.id} className="flex items-center gap-1 rounded-lg border border-gray-200 py-1 pl-2 pr-1 text-sm">
            <input
              aria-label="Room name"
              value={r.name}
              onChange={e => update(c => ({ ...c, rooms: c.rooms.map(x => (x.id === r.id ? { ...x, name: e.target.value } : x)) }))}
              className="w-36 rounded border border-transparent px-1 hover:border-gray-300"
            />
            <button
              type="button"
              aria-label={`Remove ${r.name}`}
              title={used(r.id) ? 'Subjects use this room; they go back to their own classroom' : undefined}
              onClick={() =>
                update(c => {
                  for (const l of Object.values(c.levels)) for (const s of l.subjects) if (s.roomId === r.id) s.roomId = null;
                  return { ...c, rooms: c.rooms.filter(x => x.id !== r.id) };
                })
              }
              className="rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={e => {
          e.preventDefault();
          if (!name.trim()) return;
          update(c => ({ ...c, rooms: [...c.rooms, { id: newId(), name: name.trim() }] }));
          setName('');
        }}
      >
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Computer Lab" aria-label="New room" className="min-h-[38px] rounded-lg border border-gray-300 px-2 text-sm" />
        <Btn type="submit" disabled={!name.trim()}><Plus size={14} /> Add room</Btn>
      </form>
    </Card>
  );
}

function EventsCard({ cfg, update, levels }: { cfg: TimetableConfig; update: Updater; levels: string[] }) {
  const patch = (id: string, p: Partial<FixedEvent>) => update(c => ({ ...c, events: c.events.map(e => (e.id === id ? { ...e, ...p } : e)) }));
  const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter(y => y !== x) : [...list, x]);
  return (
    <Card
      title="Fixed school events"
      actions={<Btn onClick={() => update(c => ({ ...c, events: [...c.events, { id: newId(), name: 'Assembly', days: [1], periods: [1], levels: [] }] }))}><Plus size={14} /> Add event</Btn>}
    >
      <p className="mb-3 text-xs text-gray-600">Periods kept free of lessons every week — assembly, clubs, sports.</p>
      {cfg.events.length === 0 && <p className="text-sm text-gray-500">None.</p>}
      <ul className="space-y-3">
        {cfg.events.map(ev => (
          <li key={ev.id} className="space-y-2 rounded-lg border border-gray-200 p-2.5">
            <div className="flex items-center gap-2">
              <input aria-label="Event name" value={ev.name} onChange={e => patch(ev.id, { name: e.target.value })} className="min-h-[34px] flex-1 rounded-md border border-gray-300 px-2 text-sm" />
              <button type="button" aria-label={`Remove ${ev.name}`} onClick={() => update(c => ({ ...c, events: c.events.filter(e => e.id !== ev.id) }))} className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-700"><Trash2 size={15} /></button>
            </div>
            <Chips label="Days" options={[1, 2, 3, 4, 5].map(d => ({ v: d, t: DAY_SHORT[d - 1] }))} value={ev.days} onToggle={d => patch(ev.id, { days: toggle(ev.days, d as Weekday) })} />
            <Chips label="Periods" options={[1, 2, 3, 4, 5, 6, 7, 8].map(p => ({ v: p, t: `P${p}` }))} value={ev.periods} onToggle={p => patch(ev.id, { periods: toggle(ev.periods, p) })} />
            <Chips label="Levels (none = whole school)" options={levels.map(k => ({ v: k, t: cfg.levels[k]?.label || levelLabel(k) }))} value={ev.levels} onToggle={k => patch(ev.id, { levels: toggle(ev.levels, k) })} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Chips<T extends string | number>({ label, options, value, onToggle }: { label: string; options: Array<{ v: T; t: string }>; value: T[]; onToggle: (v: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      <span className="mr-1 text-xs text-gray-500">{label}</span>
      {options.map(o => (
        <button
          key={String(o.v)}
          type="button"
          aria-pressed={value.includes(o.v)}
          onClick={() => onToggle(o.v)}
          className={`min-h-[30px] rounded-full border px-2.5 text-xs ${value.includes(o.v) ? 'border-purple-600 bg-purple-600 text-white' : 'border-gray-300 bg-white text-gray-700'}`}
        >
          {o.t}
        </button>
      ))}
    </div>
  );
}
