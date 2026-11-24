// @/components/ai/LessonImport.tsx — the Record of Work form's "Lessons from
// your eFile" box. A record of work lists what was actually taught, and every
// lesson taught has a lesson plan in the eFile, so the plans for the chosen
// class and subject are offered here: those dated in the chosen week are
// ticked already. "Fill in from these lessons" writes one line per lesson
// into the "What you taught this week" box (date, topic and sub-topic, lesson
// n of N, the activities, the homework, and the evaluation if the lesson has
// been evaluated). The teacher can still edit the box, then clicks Generate.
//
// Nothing here calls the AI: it only reads the teacher's own eFile.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, FolderOpen, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { lessonStages } from '@/components/ai/LessonEvaluationDialog';
import { teacherAi } from '@/services/aiApi';
import type { EFileDocument, EFileSummary } from '@/types/ai';
import { cn } from '@/lib/utils';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "24 March 2026", "24/03/2026" or "2026-03-24" -> a Date at noon (null if it can't be read). */
export function parseLessonDate(text: string | undefined): Date | null {
  if (!text) return null;
  const t = text.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12);
  m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(t);
  if (m) {
    const month = MONTHS.findIndex((x) => x.startsWith(m![2].toLowerCase().slice(0, 3)));
    if (month >= 0) return new Date(Number(m[3]), month, Number(m[1]), 12);
  }
  return null;
}

const dayLabel = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** The text of one "## Heading" section of a plan. */
const section = (content: string, heading: string) =>
  new RegExp(`##\\s+${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i').exec(content)?.[1].trim() ?? '';
const oneLine = (text: string, max = 220) => {
  const flat = text.replace(/[*_#>|]/g, '').replace(/^\s*[-\d.)]+\s*/gm, '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max).replace(/\s+\S*$/, '')} …` : flat;
};

/** One line of the "What you taught" box for a lesson plan. */
export function lessonLine(plan: EFileDocument): string {
  const i = plan.inputs;
  const date = parseLessonDate(i.date);
  const sub = [i.subTopicCode, i.subTopic].filter(Boolean).join(' ');
  const lesson = i.lessonNumber ? `Lesson ${i.lessonNumber}${i.lessonsTotal ? ` of ${i.lessonsTotal}` : ''}` : '';
  const activities = lessonStages(plan.content).filter((s) => /^activity\b/i.test(s));
  const homework = oneLine(section(plan.content, 'Homework'), 160);
  const evaluation = plan.evaluation ? oneLine(plan.evaluation.statement, 260) : '';
  return [
    `${date ? dayLabel(date) : 'Date ________'}: ${i.topic ? `${i.topic} – ` : ''}${sub || plan.title}`,
    lesson,
    i.duration && `${i.duration} min`,
    activities.length && `activities: ${activities.join('; ')}`,
    homework && `homework: ${homework}`,
    evaluation ? `evaluation: ${evaluation}` : 'not yet evaluated',
  ].filter(Boolean).join(' | ');
}

export function LessonImport({ className, subject, weekEnding, value, onFill, disabled }: {
  /** The class's name as lesson plans save it ("Form 2A"). */
  className: string;
  subject: string;
  /** The week-ending date as the date box holds it (yyyy-mm-dd), or empty. */
  weekEnding: string;
  /** What the "What you taught" box holds now (filled only when empty, or when the teacher asks). */
  value: string;
  onFill: (text: string) => void;
  disabled?: boolean;
}) {
  const { data, isLoading } = useQuery({ queryKey: ['efile'], queryFn: teacherAi.efileList, retry: false });
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const end = parseLessonDate(weekEnding);
  const start = end ? new Date(end.getTime() - 6 * 86_400_000) : null;
  const inWeek = (d: EFileSummary) => {
    const when = parseLessonDate(d.inputs.date);
    return !!(when && start && end && when >= start && when <= end);
  };

  // This class and subject's lesson plans: the week's first (by date), then the rest, newest first.
  const plans = useMemo(() => {
    const mine = (data ?? []).filter((d) => d.feature === 'lessonPlan' && (d.inputs.className || d.inputs.level) === className && d.inputs.subject === subject);
    const time = (d: EFileSummary) => parseLessonDate(d.inputs.date)?.getTime() ?? 0;
    const week = mine.filter(inWeek).sort((a, b) => time(a) - time(b));
    const rest = mine.filter((d) => !inWeek(d)).sort((a, b) => time(b) - time(a) || b.createdAt.localeCompare(a.createdAt));
    return { week, rest };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, className, subject, weekEnding]);

  // A new class, subject or week: tick that week's lessons, and fill the empty box with them.
  const filledFor = useRef('');
  useEffect(() => {
    const ids = plans.week.map((d) => d.id);
    setPicked(ids);
    const key = `${className}|${subject}|${weekEnding}`;
    if (ids.length && !value.trim() && filledFor.current !== key) {
      filledFor.current = key;
      void fill(ids);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans]);

  const fill = async (ids = picked) => {
    setBusy(true); setError('');
    try {
      const chosen = [...plans.week, ...plans.rest].filter((d) => ids.includes(d.id));
      const full = await Promise.all(chosen.map((d) => teacherAi.efileGet(d.id)));
      const ordered = full.sort((a, b) => (parseLessonDate(a.inputs.date)?.getTime() ?? 0) - (parseLessonDate(b.inputs.date)?.getTime() ?? 0));
      onFill(ordered.map(lessonLine).join('\n'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const row = (d: EFileSummary) => {
    const on = picked.includes(d.id);
    const date = parseLessonDate(d.inputs.date);
    return (
      <li key={d.id}>
        <label className={cn('flex cursor-pointer items-start gap-3 px-3.5 py-2.5 transition', on ? 'bg-emerald-50/60' : 'hover:bg-gray-50')}>
          <input type="checkbox" checked={on} disabled={disabled} onChange={() => setPicked((p) => (on ? p.filter((x) => x !== d.id) : [...p, d.id]))} className="sr-only" />
          <span aria-hidden className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
            on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-300 bg-white')}>{on && <Check size={14} strokeWidth={3} />}</span>
          <span className="min-w-0 text-sm">
            <span className="font-medium text-gray-900">{[d.inputs.subTopicCode, d.inputs.subTopic || d.title].filter(Boolean).join(' ')}</span>
            <span className="mt-0.5 block text-xs text-gray-500">
              {date ? dayLabel(date) : 'No lesson date'}{d.inputs.lessonNumber ? ` · Lesson ${d.inputs.lessonNumber}${d.inputs.lessonsTotal ? ` of ${d.inputs.lessonsTotal}` : ''}` : ''}
              {d.evaluation ? ' · evaluated' : ' · not evaluated'}
            </span>
          </span>
        </label>
      </li>
    );
  };

  if (!className || !subject) return null;
  return (
    <fieldset className="min-w-0 sm:col-span-2 lg:col-span-1 xl:col-span-2" disabled={disabled}>
      <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-800"><FolderOpen size={15} className="text-emerald-600" /> Lessons from your eFile</legend>
      {isLoading ? (
        <p className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-500"><Loader2 size={15} className="animate-spin" /> Looking for your lesson plans…</p>
      ) : plans.week.length + plans.rest.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-3.5 py-3 text-sm text-gray-600">No lesson plans for {className} {subject} in your eFile yet. Type the lessons below instead.</p>
      ) : (
        <>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white">
            {plans.week.length > 0 && <p className="bg-gray-50 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">This week</p>}
            <ul className="divide-y divide-gray-100">{plans.week.map(row)}</ul>
            {plans.rest.length > 0 && <p className="border-t border-gray-100 bg-gray-50 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{plans.week.length ? 'Other lesson plans' : end ? 'No plans dated in this week · other lesson plans' : 'Choose the week ending to tick that week’s lessons'}</p>}
            <ul className="divide-y divide-gray-100">{plans.rest.map(row)}</ul>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-500">{picked.length} lesson{picked.length === 1 ? '' : 's'} ticked{value.trim() ? ' · replaces what is in the box below' : ''}</p>
            <Button type="button" size="sm" variant="outline" disabled={disabled || busy || picked.length === 0} onClick={() => void fill()} className="h-9 rounded-xl">
              {busy ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Sparkles size={15} className="mr-2" />} Fill in from these lessons
            </Button>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        </>
      )}
    </fieldset>
  );
}
