// @/components/ai/FollowUpPanel.tsx — under an evaluated lesson plan: what the
// evaluation calls for (followUpFor in @/types/ai) and, for a remedial or
// continuation lesson, a button that writes that lesson plan from the
// original plan and its evaluation (POST /teacher/generate with followUpOf).
//
//   remedial      the goal was not reached by enough learners: re-teach it another way
//   continuation  part of the plan was not covered: finish it
//   revision      most learners got it: a short recap next lesson (nothing to write)
//
// The new plan is filed in 8 Lesson Plan, linked to the original, and both
// appear in 10 (vii) Remedial Work Plan. The date offered is the class's
// next lesson on the teacher's timetable.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, LifeBuoy, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ai/ui';
import { useAuth } from '@/hooks/useAuth';
import { teacherAi } from '@/services/aiApi';
import { getTimetableForTeacher } from '@/services/timetableService';
import { getCurrentAcademicTerm } from '@/utils/academicTerm';
import { followUpFor, type EFileDocument, type FollowUpKind } from '@/types/ai';
import { cn } from '@/lib/utils';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const longDate = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

/** The class's next lesson in this subject on the teacher's timetable, after `after` (YYYY-MM-DD). */
function useNextLesson(className: string, subject: string, after: string) {
  const { user } = useAuth();
  const term = getCurrentAcademicTerm();
  const timetable = useQuery({
    queryKey: ['efile-system', 'timetable', user?.uid, term.term, term.year],
    queryFn: () => getTimetableForTeacher(user!.uid, term.term, term.year),
    enabled: !!user?.uid,
    staleTime: 60_000,
  });
  return useMemo(() => {
    const slots = (timetable.data ?? []).filter((e) => e.period && e.entry.className === className && e.entry.subject.toLowerCase() === subject.toLowerCase());
    if (!slots.length) return null;
    const start = new Date(`${after > iso(new Date()) ? after : iso(new Date())}T12:00:00`);
    for (let k = 1; k <= 14; k++) {
      const day = new Date(start);
      day.setDate(day.getDate() + k);
      const dow = day.getDay(); // 1 = Monday … 5 = Friday
      const today = slots.filter((e) => e.entry.dayOfWeek === dow).sort((a, b) => a.entry.periodIndex - b.entry.periodIndex);
      if (today.length) {
        const first = today[0].period!, last = today[today.length - 1].period!;
        return { date: iso(day), time: `${first.startTime}–${last.endTime}`, periods: today.map((e) => e.period!.name).join(', ') };
      }
    }
    return null;
  }, [timetable.data, className, subject, after]);
}

const ADVICE = {
  remedial: { tone: 'bg-amber-50/80 ring-amber-200', icon: 'text-amber-600', title: 'Remedial lesson recommended' },
  continuation: { tone: 'bg-sky-50/80 ring-sky-200', icon: 'text-sky-600', title: 'Continuation lesson recommended' },
  revision: { tone: 'bg-emerald-50/70 ring-emerald-200', icon: 'text-emerald-600', title: 'A short recap next lesson' },
};

export function FollowUpPanel({ document }: { document: EFileDocument }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const i = document.inputs;
  const advice = document.evaluation ? followUpFor(document.evaluation.answers) : null;
  const next = useNextLesson(i.className || i.level, i.subject, i.date || iso(new Date()));
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  // A plan that is itself a follow-up says which lesson it follows.
  const original = i.followUpOf
    ? <p className="flex items-center gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700 ring-1 ring-inset ring-gray-200">
        <RotateCcw size={16} className="shrink-0 text-gray-500" />
        This is a {i.followUpKind === 'continuation' ? 'continuation' : 'remedial'} lesson. <Link to={`/dashboard/teacher/ai/efile/${i.followUpOf}`} className="font-medium text-blue-700 hover:underline">Open the earlier lesson</Link>
      </p>
    : null;
  if (!advice) return original;

  const a = document.evaluation!.answers;
  const why = advice === 'remedial'
    ? `The evaluation says the competences were ${a.achieved === 'not' ? 'not achieved' : a.achieved === 'partly' ? 'only partly achieved' : 'achieved'} and ${a.reached === 'few' ? 'only a few learners' : a.reached === 'half' ? 'about half of the learners' : 'most learners'} met the expected standard.`
    : advice === 'continuation'
      ? `The evaluation says ${a.coverage === 'part' ? 'only part' : 'most'} of the plan was covered${a.notCovered.trim() ? `: not covered was "${a.notCovered.trim()}"` : ''}.`
      : 'Most learners reached the goal. Start the next lesson with two or three quick questions on it, and support the few who struggled.';
  const style = ADVICE[advice];
  const kind = advice === 'revision' ? null : (advice as FollowUpKind);
  const chosenDate = date || next?.date || '';
  const chosenTime = time || next?.time || '';

  const write = async () => {
    if (!kind) return;
    setBusy(true); setError(''); setStatus('Looking up the curriculum…');
    try {
      const { lessonNumber: _n, activities: _a, ...rest } = i;
      let chars = 0;
      const created = await teacherAi.generate('lessonPlan', { ...rest, date: chosenDate, time: chosenTime, followUpOf: document.id, followUpKind: kind }, {
        onMeta: () => setStatus('Writing the lesson plan…'),
        onText: (t) => { chars += t.length; setStatus(`Writing the lesson plan… (${Math.round(chars / 100) / 10}k characters)`); },
        onStatus: setStatus,
      });
      await queryClient.invalidateQueries({ queryKey: ['efile'] });
      navigate(`/dashboard/teacher/ai/efile/${created.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false); setStatus('');
    }
  };

  return (
    <>
      {original}
      <div className={cn('space-y-3 rounded-2xl px-4 py-3.5 ring-1 ring-inset', style.tone)}>
        <div className="flex items-start gap-3">
          <LifeBuoy size={20} className={cn('mt-0.5 hidden shrink-0 sm:block', style.icon)} />
          <div className="min-w-0 flex-1 text-sm text-gray-800">
            <p className="font-semibold text-gray-900">{style.title}</p>
            <p className="mt-0.5">{why}{kind && !document.followUp && ' The AI can write the follow-up lesson from this plan and its evaluation. It is filed in 8 Lesson Plan and listed in 10 (vii) Remedial Work Plan.'}</p>
          </div>
        </div>
        {kind && document.followUp && (
          <Link to={`/dashboard/teacher/ai/efile/${document.followUp.id}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-blue-700 ring-1 ring-inset ring-blue-200 hover:bg-blue-50">
            Open the {document.followUp.kind} lesson plan <ArrowRight size={16} />
          </Link>
        )}
        {kind && !document.followUp && (
          <div className="grid gap-3 sm:grid-cols-[170px_170px_auto] sm:items-end">
            <Field label="Date" htmlFor="fu-date"><TextInput id="fu-date" type="date" value={chosenDate} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Time" htmlFor="fu-time"><TextInput id="fu-time" value={chosenTime} placeholder="e.g. 08:00–08:40" onChange={(e) => setTime(e.target.value)} /></Field>
            <Button type="button" onClick={write} disabled={busy} className="h-10 rounded-xl bg-blue-600 font-semibold hover:bg-blue-700">
              {busy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Sparkles size={16} className="mr-2" />}
              Write the {kind} lesson plan
            </Button>
            {next && !date && <p className="text-xs text-gray-600 sm:col-span-3">Next {i.className || i.level} {i.subject} lesson on your timetable: {longDate(next.date)}, {next.periods}.</p>}
          </div>
        )}
        {status && <p className="text-sm text-gray-700" aria-live="polite">{status}</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
    </>
  );
}
