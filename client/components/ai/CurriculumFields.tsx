// @/components/ai/CurriculumFields.tsx — the form parts that come from the
// approved syllabus (curriculum map), used by the generator page:
//
//   TopicPicker      Topic and Sub-topic dropdowns (lesson plan), with the
//                    sub-topic's specific competence shown underneath
//   TopicChecklist   tick the topics a test or a term covers
//   SectionsBuilder  the assessment's sections: question type, number of
//                    questions and marks for each, adding up to the total
//   ActivityChecklist the CDC teaching module's learning activities for the
//                    chosen sub-topic: tick the ones this lesson covers
//   LessonOfField    "Lesson [n] of [N]" in the sub-topic
//   CriteriaField    how many rubric criteria a CBC assessment has
//
// Each one writes plain text values into the form (topic, subTopic,
// subTopicCode, topics, topicCodes, sections, marks), the same boxes the AI
// server reads (ai-server/src/services/generation/syllabusContext.ts).
import { Check, Minus, Plus, Trash2 } from 'lucide-react';
import { Field, Select } from '@/components/ai/ui';
import type { MapTopic, ModuleGuideSummary } from '@/types/ai';
import { cn } from '@/lib/utils';

type Values = Record<string, string>;
type SetValues = (patch: Values) => void;
/** Full width in the form's grid (topic names are long). */
const WIDE = 'sm:col-span-2 lg:col-span-1 xl:col-span-2';

// ── Topic + sub-topic ───────────────────────────────────────────────────────

/** `wholeTopic`: the sub-topic may be left as "Whole topic" (learner notes for a chapter). */
export function TopicPicker({ topics, values, set, disabled, wholeTopic = false }: { topics: MapTopic[]; values: Values; set: SetValues; disabled: boolean; wholeTopic?: boolean }) {
  const topic = topics.find((t) => t.name === values.topic) ?? topics.find((t) => !t.name && t.code === values.topic);
  const sub = topic?.subTopics.find((s) => s.code === values.subTopicCode);
  return (
    <>
      <Field label="Topic" htmlFor="ai-topic" className={WIDE}>
        <Select id="ai-topic" required disabled={disabled} value={topic?.code ?? ''}
          onChange={(e) => {
            const t = topics.find((x) => x.code === e.target.value);
            const only = t?.subTopics.length === 1 && !wholeTopic ? t.subTopics[0] : undefined;
            set({ topic: t?.name || t?.code || '', subTopic: only ? only.name || only.code : '', subTopicCode: only?.code ?? '' });
          }}>
          <option value="" disabled>Choose a topic</option>
          {topics.map((t) => <option key={t.code} value={t.code}>{t.code} {t.name}</option>)}
        </Select>
      </Field>
      <Field label="Sub-topic" htmlFor="ai-subtopic" className={WIDE}>
        <Select id="ai-subtopic" required={!wholeTopic} disabled={disabled || !topic} value={sub?.code ?? ''}
          onChange={(e) => {
            const s = topic?.subTopics.find((x) => x.code === e.target.value);
            set({ subTopic: s ? s.name || s.code : '', subTopicCode: s?.code ?? '' }); // a sub-topic the syllabus left unnamed is sent by its code
          }}>
          {wholeTopic
            ? <option value="">{topic ? `Whole topic (all ${topic.subTopics.length} sub-topics)` : 'Choose a topic first'}</option>
            : <option value="" disabled>{topic ? 'Choose a sub-topic' : 'Choose a topic first'}</option>}
          {topic?.subTopics.map((s) => <option key={s.code} value={s.code}>{s.code} {s.name}</option>)}
        </Select>
      </Field>
      {sub && sub.competences.length > 0 && (
        <div className={cn('space-y-2 rounded-xl bg-blue-50/60 px-3.5 py-3 text-sm ring-1 ring-inset ring-blue-100', WIDE)}>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">From the syllabus</p>
          {sub.competences.map((c) => (
            <div key={c.code}>
              <p className="text-gray-900"><span className="mr-1.5 text-xs font-semibold tabular-nums text-gray-500">{c.code}</span>{c.text}</p>
              {c.standards[0] && <p className="mt-0.5 text-xs text-gray-600">Expected standard: {c.standards.join('; ')}</p>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Topic checklist ─────────────────────────────────────────────────────────

/** Codes kept in topicCodes ("1.1,1.3"); names in topics ("Hardware; Software") for the title and the eFile. */
export function TopicChecklist({ topics, values, set, disabled, label, hint, terms }: {
  topics: MapTopic[]; values: Values; set: SetValues; disabled: boolean; label: string; hint?: string;
  /** Topic code -> term, from the teaching module: shows each topic's term and a "Term n topics" shortcut. */
  terms?: Record<string, number>;
}) {
  const chosen = (values.topicCodes ?? '').split(',').filter(Boolean);
  const write = (codes: string[]) => {
    const picked = topics.filter((t) => codes.includes(t.code)); // keeps syllabus order
    set({ topicCodes: picked.map((t) => t.code).join(','), topics: picked.map((t) => t.name).join('; ') });
  };
  const toggle = (code: string) => write(chosen.includes(code) ? chosen.filter((c) => c !== code) : [...chosen, code]);
  const all = chosen.length === topics.length;
  const termNumbers = [...new Set(Object.values(terms ?? {}))].sort();
  return (
    <fieldset className="min-w-0 sm:col-span-2 lg:col-span-1 xl:col-span-2" disabled={disabled}>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <legend className="text-sm font-medium text-gray-800">{label}</legend>
        <span className="flex flex-wrap gap-3">
          {termNumbers.map((n) => (
            <button key={n} type="button" onClick={() => write(topics.filter((t) => terms![t.code] === n).map((t) => t.code))} className="text-xs font-semibold text-blue-700 hover:text-blue-800">
              Term {n} topics
            </button>
          ))}
          <button type="button" onClick={() => write(all ? [] : topics.map((t) => t.code))} className="text-xs font-semibold text-blue-700 hover:text-blue-800">
            {all ? 'Clear' : 'Select all'}
          </button>
        </span>
      </div>
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {topics.map((t) => {
          const on = chosen.includes(t.code);
          return (
            <li key={t.code}>
              <label className={cn('flex cursor-pointer items-start gap-3 px-3.5 py-2.5 transition', on ? 'bg-blue-50/60' : 'hover:bg-gray-50')}>
                <input type="checkbox" checked={on} onChange={() => toggle(t.code)} className="sr-only" />
                <span aria-hidden className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
                  on ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white')}>{on && <Check size={14} strokeWidth={3} />}</span>
                <span className="min-w-0 text-sm">
                  <span className="font-medium text-gray-900"><span className="mr-1.5 tabular-nums text-gray-500">{t.code}</span>{t.name}</span>
                  {terms?.[t.code] && <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">Term {terms[t.code]}</span>}
                  <span className="mt-0.5 block text-xs text-gray-500">{t.subTopics.map((s) => s.name).join(' · ')}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-xs text-gray-500">{hint ?? `${chosen.length} of ${topics.length} topics chosen`}</p>
    </fieldset>
  );
}

// ── Assessment sections ─────────────────────────────────────────────────────

export const QUESTION_TYPES = [
  { value: 'mcq', label: 'Multiple choice' },
  { value: 'short', label: 'Short answer' },
  { value: 'structured', label: 'Structured' },
  { value: 'essay', label: 'Essay / extended' },
  { value: 'working', label: 'Show your working' },
  { value: 'practical', label: 'Practical task' },
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number]['value'];
export interface Section { type: QuestionType; questions: number; marks: number }

export const PRESETS: { label: string; sections: Section[] }[] = [
  { label: 'Standard paper', sections: [{ type: 'mcq', questions: 10, marks: 10 }, { type: 'short', questions: 5, marks: 20 }, { type: 'structured', questions: 2, marks: 20 }] },
  { label: 'Multiple choice only', sections: [{ type: 'mcq', questions: 20, marks: 20 }] },
  { label: 'Calculations', sections: [{ type: 'short', questions: 5, marks: 15 }, { type: 'working', questions: 4, marks: 35 }] },
  { label: 'Theory and essay', sections: [{ type: 'short', questions: 6, marks: 20 }, { type: 'essay', questions: 2, marks: 30 }] },
  // Like ECZ Paper 1: many short scenario-based structured questions, then a few longer ones.
  { label: 'ECZ style', sections: [{ type: 'structured', questions: 10, marks: 60 }, { type: 'structured', questions: 2, marks: 40 }] },
];

export const sectionsToValues = (sections: Section[]): Values => ({
  sections: JSON.stringify(sections),
  marks: String(sections.reduce((n, s) => n + s.marks, 0)),
});

export function readSections(values: Values): Section[] {
  try {
    const parsed = JSON.parse(values.sections ?? '');
    if (Array.isArray(parsed) && parsed.length) return parsed as Section[];
  } catch { /* not set yet */ }
  return PRESETS[0].sections;
}

/** The problem with the plan, if any (checked again on the AI server). */
export function sectionsProblem(sections: Section[]): string {
  if (sections.length === 0) return 'Add at least one section.';
  for (const [i, s] of sections.entries()) {
    const name = `Section ${String.fromCharCode(65 + i)}`;
    if (!(s.questions >= 1 && s.questions <= 60)) return `${name}: between 1 and 60 questions.`;
    if (!(s.marks >= 1 && s.marks <= 200)) return `${name}: between 1 and 200 marks.`;
    if (s.type === 'mcq' && s.marks < s.questions) return `${name}: multiple choice needs at least one mark per question.`;
  }
  return '';
}

function Stepper({ value, onChange, min, max, label, disabled }: { value: number; onChange: (n: number) => void; min: number; max: number; label: string; disabled: boolean }) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n) || min));
  const button = 'flex h-10 w-9 items-center justify-center text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40';
  return (
    <div className="flex h-10 items-stretch overflow-hidden rounded-xl border border-gray-300 bg-white">
      <button type="button" aria-label={`Fewer ${label}`} disabled={disabled || value <= min} onClick={() => onChange(clamp(value - 1))} className={button}><Minus size={14} /></button>
      <input aria-label={label} inputMode="numeric" disabled={disabled} value={value} onChange={(e) => onChange(clamp(Number(e.target.value.replace(/\D/g, ''))))}
        className="w-12 min-w-0 border-x border-gray-200 text-center text-sm font-semibold tabular-nums text-gray-900 focus:outline-none" />
      <button type="button" aria-label={`More ${label}`} disabled={disabled || value >= max} onClick={() => onChange(clamp(value + 1))} className={button}><Plus size={14} /></button>
    </div>
  );
}

export function SectionsBuilder({ values, set, disabled }: { values: Values; set: SetValues; disabled: boolean }) {
  const sections = readSections(values);
  const write = (next: Section[]) => set(sectionsToValues(next));
  const change = (i: number, patch: Partial<Section>) => write(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const total = sections.reduce((n, s) => n + s.marks, 0);
  const problem = sectionsProblem(sections);
  return (
    <fieldset className="min-w-0 sm:col-span-2 lg:col-span-1 xl:col-span-2" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium text-gray-800">Sections</legend>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" onClick={() => write(p.sections)}
            className="h-8 rounded-full border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 transition hover:border-blue-400 hover:text-blue-700">{p.label}</button>
        ))}
      </div>
      <ol className="space-y-2.5">
        {sections.map((s, i) => (
          <li key={i} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-200">{String.fromCharCode(65 + i)}</span>
              <div className="min-w-0 flex-1">
                <Select aria-label={`Section ${String.fromCharCode(65 + i)} question type`} value={s.type} onChange={(e) => change(i, { type: e.target.value as QuestionType })} className="h-10">
                  {QUESTION_TYPES.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
                </Select>
              </div>
              <button type="button" aria-label={`Remove section ${String.fromCharCode(65 + i)}`} disabled={sections.length === 1} onClick={() => write(sections.filter((_, j) => j !== i))}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><Trash2 size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-xs text-gray-500">Questions</p>
                <Stepper label="questions" value={s.questions} min={1} max={60} disabled={disabled} onChange={(n) => change(i, { questions: n })} />
              </div>
              <div>
                <p className="mb-1 text-xs text-gray-500">Marks{s.type === 'mcq' && s.marks % s.questions === 0 ? ` · ${s.marks / s.questions} each` : ''}</p>
                <Stepper label="marks" value={s.marks} min={1} max={200} disabled={disabled} onChange={(n) => change(i, { marks: n })} />
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex items-center justify-between gap-3">
        <button type="button" disabled={sections.length >= 6} onClick={() => write([...sections, { type: 'short', questions: 5, marks: 10 }])}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800 disabled:opacity-40"><Plus size={16} /> Add section</button>
        <p className="text-sm text-gray-700">Total <strong className="tabular-nums text-gray-900">{total}</strong> marks</p>
      </div>
      {problem && <p role="alert" className="mt-2 text-sm text-red-600">{problem}</p>}
    </fieldset>
  );
}

// ── Teaching-module activities for one lesson ───────────────────────────────

/** Ticks kept in `activities` as their numbers ("1,2"). Nothing ticked: the AI takes the activity numbered like the lesson. */
export function ActivityChecklist({ guide, values, set, disabled }: { guide?: ModuleGuideSummary; values: Values; set: SetValues; disabled: boolean }) {
  if (!guide || guide.activities.length === 0) return null;
  const chosen = (values.activities ?? '').split(',').filter(Boolean).map(Number);
  const toggle = (n: number) => {
    const next = chosen.includes(n) ? chosen.filter((x) => x !== n) : [...chosen, n].sort((a, b) => a - b);
    set({ activities: next.join(',') });
  };
  return (
    <fieldset className={cn('min-w-0', WIDE)} disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium text-gray-800">Module activities for this lesson</legend>
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {guide.activities.map((a) => {
          const on = chosen.includes(a.number);
          return (
            <li key={a.number}>
              <label className={cn('flex cursor-pointer items-start gap-3 px-3.5 py-2.5 transition', on ? 'bg-blue-50/60' : 'hover:bg-gray-50')}>
                <input type="checkbox" checked={on} onChange={() => toggle(a.number)} className="sr-only" />
                <span aria-hidden className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
                  on ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white')}>{on && <Check size={14} strokeWidth={3} />}</span>
                <span className="min-w-0 text-sm text-gray-900">
                  <span className="mr-1.5 font-semibold tabular-nums text-gray-500">{a.number}.</span>{a.title}
                  <span className="ml-1.5 text-xs text-gray-400">p. {a.page}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-xs text-gray-500">
        From the teaching module ({guide.subTopic}). {chosen.length ? `${chosen.length} chosen.` : 'None ticked: the activity numbered like this lesson is used.'} One or two fit a double period.
      </p>
    </fieldset>
  );
}

// ── Lesson n of N ───────────────────────────────────────────────────────────

export function LessonOfField({ values, set, disabled, hint }: { values: Values; set: SetValues; disabled: boolean; hint?: string }) {
  const box = 'h-10 w-16 rounded-xl border border-gray-300 bg-white px-2 text-center text-sm font-semibold tabular-nums text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/15';
  const clean = (v: string) => v.replace(/\D/g, '').slice(0, 2);
  return (
    <Field label="Lesson in this sub-topic" htmlFor="ai-lesson-number" hint={hint}>
      <div className="flex items-center gap-2 text-sm text-gray-700">
        Lesson
        <input id="ai-lesson-number" inputMode="numeric" disabled={disabled} value={values.lessonNumber ?? ''} onChange={(e) => set({ lessonNumber: clean(e.target.value) })} className={box} aria-label="Lesson number" />
        of
        <input inputMode="numeric" disabled={disabled} value={values.lessonsTotal ?? ''} placeholder="–" onChange={(e) => set({ lessonsTotal: clean(e.target.value) })} className={box} aria-label="Lessons in this sub-topic" />
      </div>
    </Field>
  );
}

// ── CBC rubric size ─────────────────────────────────────────────────────────

/** A CBC task is scored on a rubric: criteria × 4 points, sent as `marks`. */
export function CriteriaField({ values, set, disabled, hint }: { values: Values; set: SetValues; disabled: boolean; hint?: string }) {
  const n = Number(values.criteria) || 5;
  return (
    <Field label="Rubric criteria" htmlFor="ai-criteria" hint={hint}>
      <Select id="ai-criteria" disabled={disabled} value={String(n)} onChange={(e) => set({ criteria: e.target.value, marks: String(Number(e.target.value) * 4) })}>
        {[3, 4, 5, 6].map((c) => <option key={c} value={c}>{c} criteria · {c * 4} points</option>)}
      </Select>
    </Field>
  );
}
