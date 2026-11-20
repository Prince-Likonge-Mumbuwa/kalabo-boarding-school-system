// @/components/ai/LessonEvaluationDialog.tsx — the step after a lesson has
// been taught. The teacher answers a few quick questions (the Ministry's
// four evaluation criteria: were the competences achieved, which activities
// worked, who needs support, what changes next time), the AI turns the
// answers into the written Lesson Evaluation, the teacher reads and edits
// it, and it is saved into the lesson plan's "Lesson Evaluation" section.
//
//   step 1  questions (taps, plus optional notes)
//   step 2  the statement, editable, then Save
//
// The AI only rewords what the teacher said (see EVALUATION_SYSTEM in
// ai-server/src/services/generation/prompts.ts); nothing is saved until Save.
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, CheckCircle2, ClipboardCheck, Loader2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChipGroup, TextArea } from '@/components/ai/ui';
import { teacherAi } from '@/services/aiApi';
import type { EFileDocument, LessonEvaluationAnswers } from '@/types/ai';
import { cn } from '@/lib/utils';

const CHALLENGES = ['Time ran out', 'Too few computers', 'Power outage', 'Materials not available', 'Learners lacked prior knowledge', 'Large class size', 'Learners were absent'];
const NEXT_STEPS = ['Move on to the next lesson', 'Re-teach part of the lesson', 'More practice / scenario work', 'Extra support for some learners', 'Give the missed activity next lesson'];

/** The lesson's stages and activities, read from its Lesson Progression table (first column, in bold). */
export function lessonStages(content: string): string[] {
  const table = /## Lesson Progression\s*\n([\s\S]*?)(\n## |$)/.exec(content)?.[1] ?? '';
  const names = [...table.matchAll(/^\|\s*\*\*([^*]+)\*\*/gm)].map((m) => m[1].trim());
  return [...new Set(names.filter((n) => !/^stage$/i.test(n)))];
}

const blank: LessonEvaluationAnswers = {
  achieved: 'mostly', reached: 'most', evidence: '', engaging: [], engagingNote: '', coverage: 'all', notCovered: '',
  challenges: [], challengesNote: '', support: '', nextSteps: [], nextNote: '',
};

function Question({ n, title, children, hint }: { n: number; title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-start gap-2.5 text-sm font-semibold text-gray-900">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700 ring-1 ring-inset ring-blue-100">{n}</span>
        <span className="pt-0.5">{title}{hint && <span className="mt-0.5 block text-xs font-normal text-gray-500">{hint}</span>}</span>
      </h3>
      <div className="pl-8">{children}</div>
    </section>
  );
}

export function LessonEvaluationDialog({ document, open, onOpenChange, onSaved }: {
  document: EFileDocument;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (document: EFileDocument) => void;
}) {
  const stages = useMemo(() => lessonStages(document.content), [document.content]);
  const [answers, setAnswers] = useState<LessonEvaluationAnswers>(() => ({ ...blank, ...(document.evaluation?.answers ?? {}) }));
  const [statement, setStatement] = useState(document.evaluation?.statement ?? '');
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState<'' | 'writing' | 'saving'>('');
  const [error, setError] = useState('');
  const set = (patch: Partial<LessonEvaluationAnswers>) => setAnswers((a) => ({ ...a, ...patch }));
  const toggle = (key: 'engaging' | 'challenges' | 'nextSteps', value: string) =>
    setAnswers((a) => ({ ...a, [key]: a[key].includes(value) ? a[key].filter((v) => v !== value) : [...a[key], value] }));

  const write = async () => {
    setBusy('writing'); setError('');
    try {
      setStatement(await teacherAi.evaluationDraft(document.id, answers));
      setStep(2);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    setBusy('saving'); setError('');
    try {
      onSaved(await teacherAi.evaluationSave(document.id, answers, statement));
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  };

  const one = <T extends string>(label: string, options: { value: T; label: string }[], value: T, onPick: (v: T) => void) => (
    <ChipGroup label={label} options={options} value={[value]} onToggle={onPick} disabled={!!busy} />
  );
  const note = (value: string, onChange: (v: string) => void, placeholder: string, rows = 2) => (
    <TextArea rows={rows} maxLength={1500} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={!!busy} className="mt-2.5" />
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto rounded-2xl p-0 sm:rounded-2xl">
        <DialogHeader className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 px-6 pb-4 pt-6 text-left backdrop-blur">
          <DialogTitle className="flex items-center gap-2.5 text-lg">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100"><ClipboardCheck size={18} /></span>
            {step === 1 ? 'How did the lesson go?' : 'Your lesson evaluation'}
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-600">
            {step === 1
              ? 'A few quick answers. The AI turns them into the written evaluation; you check it before it is saved.'
              : 'Written only from your answers. Edit anything, then save it into the lesson plan.'}
          </DialogDescription>
          <ol className="mt-3 flex gap-2" aria-label="Steps">
            {[1, 2].map((n) => <li key={n} className={cn('h-1.5 flex-1 rounded-full', step >= n ? 'bg-blue-600' : 'bg-gray-200')} />)}
          </ol>
        </DialogHeader>

        <div className="space-y-6 px-6 py-5">
          {step === 1 ? (
            <>
              <Question n={1} title="Were the specific competences achieved?">
                {one('Competences achieved', [
                  { value: 'fully', label: 'Fully' }, { value: 'mostly', label: 'Mostly' }, { value: 'partly', label: 'Partly' }, { value: 'not', label: 'Not yet' },
                ], answers.achieved, (v) => set({ achieved: v }))}
              </Question>

              <Question n={2} title="How many learners met the expected standard in the exercise?">
                {one('Learners meeting the standard', [
                  { value: 'all', label: 'All or nearly all' }, { value: 'most', label: 'Most (¾)' }, { value: 'half', label: 'About half' }, { value: 'few', label: 'Only a few' },
                ], answers.reached, (v) => set({ reached: v }))}
                {note(answers.evidence, (v) => set({ evidence: v }), 'Evidence from learners’ responses, e.g. “Most identified the star topology in Q1; few could justify their choice in Q2.”', 3)}
              </Question>

              <Question n={3} title="Which activities engaged learners most?" hint={stages.length ? 'Tap any that worked well.' : undefined}>
                {stages.length > 0 && (
                  <ChipGroup label="Engaging activities" options={stages.map((s) => ({ value: s, label: s }))} value={answers.engaging} onToggle={(v) => toggle('engaging', v)} disabled={!!busy} />
                )}
                {note(answers.engagingNote, (v) => set({ engagingNote: v }), 'Anything else that worked (optional)')}
              </Question>

              <Question n={4} title="Was the whole plan covered?">
                {one('Coverage', [
                  { value: 'all', label: 'Yes, all of it' }, { value: 'most', label: 'Most of it' }, { value: 'part', label: 'Only part' },
                ], answers.coverage, (v) => set({ coverage: v }))}
                {answers.coverage !== 'all' && note(answers.notCovered, (v) => set({ notCovered: v }), 'What was not covered?')}
              </Question>

              <Question n={5} title="Did anything get in the way?" hint="Optional.">
                <ChipGroup label="Challenges" options={CHALLENGES.map((c) => ({ value: c, label: c }))} value={answers.challenges} onToggle={(v) => toggle('challenges', v)} disabled={!!busy} />
                {note(answers.challengesNote, (v) => set({ challengesNote: v }), 'Other challenges (optional)')}
              </Question>

              <Question n={6} title="Which learners need additional support, and in which areas?">
                {note(answers.support, (v) => set({ support: v }), 'e.g. “The lower ability group struggled to justify topology selection.” Leave empty if none.', 3)}
              </Question>

              <Question n={7} title="What will you do in the next lesson?">
                <ChipGroup label="Next steps" options={NEXT_STEPS.map((c) => ({ value: c, label: c }))} value={answers.nextSteps} onToggle={(v) => toggle('nextSteps', v)} disabled={!!busy} />
                {note(answers.nextNote, (v) => set({ nextNote: v }), 'Details (optional), e.g. “additional scenario practice for that group”.')}
              </Question>
            </>
          ) : (
            <div className="space-y-2">
              <TextArea rows={12} maxLength={4000} value={statement} onChange={(e) => setStatement(e.target.value)} disabled={!!busy} className="text-[15px] leading-relaxed" aria-label="Lesson evaluation" />
              <p className="text-xs text-gray-500">Saved under “Lesson Evaluation” in the plan, so it prints and downloads with it. You can evaluate again later; the new evaluation replaces this one.</p>
            </div>
          )}
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</p>}
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 bg-white/95 px-6 py-4 backdrop-blur">
          {step === 2 && (
            <Button variant="ghost" onClick={() => setStep(1)} disabled={!!busy} className="mr-auto h-11 rounded-xl"><ArrowLeft size={16} className="mr-2" /> Change answers</Button>
          )}
          {step === 1 ? (
            <Button onClick={write} disabled={!!busy} className="h-11 rounded-xl bg-blue-600 px-5 font-semibold hover:bg-blue-700">
              {busy === 'writing' ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Sparkles size={16} className="mr-2" />}
              {busy === 'writing' ? 'Writing…' : 'Write my evaluation'}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={write} disabled={!!busy} className="h-11 rounded-xl">
                {busy === 'writing' ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Sparkles size={16} className="mr-2" />} Write again
              </Button>
              <Button onClick={save} disabled={!!busy || statement.trim().length < 20} className="h-11 rounded-xl bg-emerald-600 px-5 font-semibold hover:bg-emerald-700">
                {busy === 'saving' ? <Loader2 size={16} className="mr-2 animate-spin" /> : <CheckCircle2 size={16} className="mr-2" />} Save to lesson plan
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
