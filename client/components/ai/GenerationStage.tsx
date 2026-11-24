// @/components/ai/GenerationStage.tsx — how a document being generated looks
// (AI Tools → any tool → Generate), from the moment the teacher clicks until
// the document is saved:
//
//   GenerationStage  before the first words arrive: the curriculum being read
//                    (pages with a scanning light, what is being looked up),
//                    then the document being planned (its sections pencilled
//                    in one by one)
//   GenerationSteps  the steps along the top: Reading → Planning → Writing →
//                    (Checking …) → Saved, with the section being written now
//                    and how far through the document it is
//   useSmoothText    lets the text flow onto the page at an even pace instead
//                    of in the lumps the network delivers, never stopping in
//                    the middle of a piece of maths
//   STREAM_CSS, WritingCaret   each new paragraph, table or figure fades and
//                    rises into place; a glowing pen marks where writing is
//
// Pure presentation: nothing here talks to the AI server.
import { useEffect, useRef, useState } from 'react';
import { BookOpen, CheckCircle2, ClipboardCheck, Feather, ListTree, Loader2, Sparkles } from 'lucide-react';
import type { GeneratorKey } from '@/types/ai';
import { cn } from '@/lib/utils';

export type GenerationPhase = 'idle' | 'searching' | 'writing' | 'done';

/** The sections each tool writes, in order (the headings its prompt asks for). */
const OUTLINES: Record<GeneratorKey, string[]> = {
  lessonPlan: ['Lesson Details', 'General Competences', 'Specific Competence', 'Lesson Goal', 'Rationale', 'Prior Knowledge', 'References', 'Learning Environment', 'Teaching and Learning Materials', 'Expected Standard', 'Lesson Progression', 'Homework', 'Lesson Evaluation'],
  schemeOfWork: ['Weekly Plan'],
  assessment: ['Paper Details', 'Instructions to Candidates', 'Section', 'Marking Key', 'Specification Grid'],
  recordOfWork: ['Work Covered'],
  // '*': the notes' own sections, whose headings depend on the topic.
  learnerNotes: ['Learning Outcomes', '*', 'Key Terms', 'Summary', 'Practice Exercise', 'Answers'],
};
const OUTLINE_LABELS: Partial<Record<GeneratorKey, string[]>> = {
  assessment: ['Paper details', 'Instructions to candidates', 'Questions, section by section', 'Marking key', 'Specification grid'],
  learnerNotes: ['Learning outcomes', 'The notes, section by section', 'Key terms', 'Summary', 'Practice exercise', 'Answers (teacher’s copy)'],
};

/** How far the document has got: the outline item being written now (by the ## headings so far). */
export function writingPosition(feature: GeneratorKey, content: string): { index: number; total: number; section: string } {
  const outline = OUTLINES[feature];
  const headings = [...content.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
  let index = -1;
  const any = outline.indexOf('*');
  for (const h of headings) {
    let k = outline.findIndex((o) => o !== '*' && h.toLowerCase().startsWith(o.toLowerCase()));
    // A heading the outline does not name, after the step before '*': the free-form part.
    if (k === -1 && any > 0 && index >= any - 1) k = any;
    if (k > index) index = k;
  }
  const last = headings[headings.length - 1] ?? '';
  return { index, total: outline.length, section: last.replace(/\s*\[.*$/, '') };
}

// ───────────── Smooth streaming ─────────────

/** Unescaped dollar signs in a line (an odd count means a piece of maths is still open). */
const dollars = (line: string) => (line.match(/(^|[^\\])\$/g) ?? []).length;

/**
 * The part of `target` to show now. While `active`, the text is revealed at
 * an even pace (about 110 characters a second, faster when far behind, so it
 * never lags more than a second or so), updated about 30 times a second.
 * When writing stops, the whole text is shown at once.
 */
export function useSmoothText(target: string, active: boolean): string {
  const [length, setLength] = useState(target.length);
  const targetRef = useRef(target);
  const lengthRef = useRef(target.length);
  targetRef.current = target;

  useEffect(() => {
    if (!active) { lengthRef.current = target.length; setLength(target.length); }
  }, [active, target]);

  useEffect(() => {
    if (!active) return;
    lengthRef.current = Math.min(lengthRef.current, targetRef.current.length);
    let frame = 0;
    let last = performance.now();
    let painted = 0;
    const tick = (now: number) => {
      const text = targetRef.current;
      const dt = Math.min(80, now - last);
      last = now;
      if (lengthRef.current > text.length) lengthRef.current = text.length; // the text was cleaned or restarted
      const behind = text.length - lengthRef.current;
      if (behind > 0) {
        const perSecond = Math.max(110, behind / 1.1);
        let next = Math.min(text.length, lengthRef.current + Math.max(1, Math.round((perSecond * dt) / 1000)));
        // Never stop inside $…$: run on to the closing dollar if it has arrived.
        const lineStart = text.lastIndexOf('\n', next - 1) + 1;
        if (dollars(text.slice(lineStart, next)) % 2 === 1) {
          const close = text.indexOf('$', next);
          if (close >= 0 && close - next < 400 && !text.slice(next, close).includes('\n')) next = close + 1;
        }
        lengthRef.current = next;
        if (now - painted > 33 || next === text.length) { painted = now; setLength(next); }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return active ? target.slice(0, length) : target;
}

// ───────────── On the paper while it is written ─────────────

export const STREAM_CSS = `
.doc-writing .doc-body > *{animation:doc-in .6s cubic-bezier(.2,.7,.2,1) both}
@keyframes doc-in{from{opacity:0;transform:translateY(10px);filter:blur(3px)}60%{filter:blur(0)}to{opacity:1;transform:none;filter:none}}
.doc-writing .doc-body > :last-child{animation-duration:.35s}
.doc-caret-line{display:flex;align-items:center;gap:10px;margin-top:10px;color:#2563eb;font-size:12.5px;font-weight:600}
.doc-caret{position:relative;display:inline-block;width:10px;height:20px;border-radius:3px;background:linear-gradient(180deg,#1d4ed8,#60a5fa);box-shadow:0 0 0 4px rgba(37,99,235,.12),0 0 16px rgba(37,99,235,.6);animation:doc-caret 1.1s ease-in-out infinite}
@keyframes doc-caret{0%,100%{opacity:1;transform:scaleY(1)}50%{opacity:.45;transform:scaleY(.85)}}
.doc-caret-text{background:linear-gradient(90deg,#93c5fd 0%,#1d4ed8 40%,#93c5fd 80%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:doc-shine 2.2s linear infinite}
@keyframes doc-shine{from{background-position:200% 0}to{background-position:-200% 0}}
@media (prefers-reduced-motion: reduce){.doc-writing .doc-body > *,.doc-caret,.doc-caret-text{animation:none}}
`;

export function WritingCaret({ label = 'Writing…' }: { label?: string }) {
  return (
    <div className="doc-caret-line" aria-hidden data-screen-only>
      <span className="doc-caret" /><span className="doc-caret-text">{label}</span>
    </div>
  );
}

// ───────────── Before the first words: reading, then planning ─────────────

const STAGE_CSS = `
@keyframes gs-scan{0%{top:6%}50%{top:78%}100%{top:6%}}
@keyframes gs-fan1{0%,100%{transform:rotate(-7deg) translateX(-6px)}50%{transform:rotate(-10deg) translateX(-10px)}}
@keyframes gs-fan2{0%,100%{transform:rotate(5deg) translateX(6px)}50%{transform:rotate(8deg) translateX(10px)}}
@keyframes gs-line{0%{transform:scaleX(.15);opacity:.35}60%,100%{transform:scaleX(1);opacity:1}}
@keyframes gs-fade{0%{opacity:0;transform:translateY(6px)}12%,88%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-6px)}}
@keyframes gs-item{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
@keyframes gs-pen{0%,100%{transform:translate(0,0) rotate(-8deg)}50%{transform:translate(6px,-2px) rotate(4deg)}}
@keyframes gs-dot{0%,80%,100%{opacity:.25}40%{opacity:1}}
.gs-scan{position:absolute;left:8%;right:8%;height:26%;border-radius:6px;background:linear-gradient(180deg,rgba(59,130,246,0),rgba(59,130,246,.22) 45%,rgba(59,130,246,.45) 50%,rgba(59,130,246,.22) 55%,rgba(59,130,246,0));animation:gs-scan 2.6s ease-in-out infinite}
.gs-phrase{animation:gs-fade 2.6s ease-in-out both}
.gs-item{animation:gs-item .5s cubic-bezier(.2,.7,.2,1) both}
.gs-bar{transform-origin:left;animation:gs-line 1.4s ease-out both}
.gs-pen{animation:gs-pen 1s ease-in-out infinite}
.gs-dots span{animation:gs-dot 1.2s infinite}
.gs-dots span:nth-child(2){animation-delay:.15s}.gs-dots span:nth-child(3){animation-delay:.3s}
@media (prefers-reduced-motion: reduce){.gs-scan,.gs-phrase,.gs-item,.gs-bar,.gs-pen,.gs-dots span,.gs-sheet{animation:none!important}}
`;

function readingPhrases(feature: GeneratorKey, subject: string, level: string): string[] {
  const what = [subject, level].filter(Boolean).join(', ');
  return [
    `Opening the ${what || 'class'} syllabus`,
    'Finding the topics, specific competences and expected standards',
    feature === 'lessonPlan' ? 'Reading the teaching module’s activities for this sub-topic' : 'Reading the teaching module',
    feature === 'assessment' ? 'Studying how ECZ words and marks its questions' : 'Gathering the best passages to write from',
  ];
}

function planningPhrases(feature: GeneratorKey, inputs: Record<string, string>): string[] {
  switch (feature) {
    case 'assessment': return ['Balancing the marks across the sections', 'Choosing questions from recall up to application', inputs.diagrams && inputs.diagrams !== 'none' ? 'Designing the figures' : 'Wording each question the ECZ way', 'Working out every answer for the marking key'];
    case 'lessonPlan': return [`Fitting the lesson into ${inputs.duration || 'the'} minutes`, 'Ordering the introduction, activities and exercise', 'Setting the homework'];
    case 'schemeOfWork': return [`Spreading the topics over ${inputs.weeks || 'the'} weeks`, 'Placing the Week 4 and Week 8 tests', 'Matching activities and materials to each week'];
    default: return ['Matching each lesson to the syllabus', 'Setting out the work covered'];
  }
}

/** Shows one phrase after another, each fading in and out. */
function Phrases({ items }: { items: string[] }) {
  const [k, setK] = useState(0);
  useEffect(() => {
    setK(0);
    const t = setInterval(() => setK((x) => (x + 1) % items.length), 2600);
    return () => clearInterval(t);
  }, [items.join('|')]);
  return <p key={k} className="gs-phrase text-sm font-medium text-gray-800">{items[k]}<span className="gs-dots ml-0.5 text-blue-600"><span>.</span><span>.</span><span>.</span></span></p>;
}

export function GenerationStage({ feature, phase, inputs, queueAhead = 0 }: { feature: GeneratorKey; phase: GenerationPhase; inputs: Record<string, string>; queueAhead?: number }) {
  const reading = phase === 'searching';
  const outline = OUTLINE_LABELS[feature] ?? OUTLINES[feature];
  // While planning, the outline is pencilled in one item at a time.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (reading) { setShown(0); return; }
    const t = setInterval(() => setShown((n) => Math.min(outline.length, n + 1)), 700);
    return () => clearInterval(t);
  }, [reading, outline.length]);

  return (
    <div className="mx-auto w-full max-w-[860px] overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200 shadow-[0_12px_32px_-12px_rgba(16,24,40,0.18)]">
      <style>{STAGE_CSS}</style>
      <div className="grid gap-8 px-6 py-8 sm:grid-cols-[180px_minmax(0,1fr)] sm:px-10 sm:py-10">
        {/* Pages being read (reading) or a page being outlined (planning) */}
        <div className="relative mx-auto h-48 w-40" aria-hidden>
          {reading ? (
            <>
              <div className="gs-sheet absolute inset-x-3 inset-y-2 rounded-lg border border-blue-100 bg-blue-50/60" style={{ animation: 'gs-fan1 3s ease-in-out infinite' }} />
              <div className="gs-sheet absolute inset-x-3 inset-y-2 rounded-lg border border-indigo-100 bg-indigo-50/60" style={{ animation: 'gs-fan2 3s ease-in-out infinite' }} />
              <div className="absolute inset-x-3 inset-y-2 overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <BookOpen size={18} className="mb-3 text-blue-600" />
                {[92, 70, 84, 58, 76, 66, 88].map((w, i) => <div key={i} className="mb-2 h-1.5 rounded-full bg-gray-200" style={{ width: `${w}%` }} />)}
                <div className="gs-scan" />
              </div>
            </>
          ) : (
            <div className="absolute inset-x-3 inset-y-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <ListTree size={18} className="mb-3 text-violet-600" />
              {[80, 64, 90, 56, 72, 60, 84].map((w, i) => (
                <div key={i} className={cn('mb-2 h-1.5 rounded-full', i < shown + 2 ? 'gs-bar bg-violet-300' : 'bg-gray-100')} style={{ width: `${w}%`, animationDelay: `${i * 0.08}s` }} />
              ))}
              <Feather size={18} className="gs-pen absolute bottom-5 right-5 text-violet-600" />
            </div>
          )}
        </div>

        <div className="min-w-0">
          <p className={cn('text-xs font-semibold uppercase tracking-wider', reading ? 'text-blue-600' : 'text-violet-600')}>
            {reading ? 'Step 1 · Reading the curriculum' : 'Step 2 · Planning the document'}
          </p>
          <div className="mt-2 min-h-[1.5rem]">
            <Phrases items={reading ? readingPhrases(feature, inputs.subject ?? '', inputs.level ?? '') : planningPhrases(feature, inputs)} />
          </div>
          {!reading && queueAhead > 0 && (
            <p className="gs-item mt-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
              <Loader2 size={13} className="animate-spin" />
              Many teachers are generating now: {queueAhead === 1 ? 'you are next' : `${queueAhead - 1} ahead of you`}. Your document starts automatically.
            </p>
          )}
          <ol className="mt-5 space-y-2">
            {outline.map((item, i) => {
              const ready = !reading && i < shown;
              return (
                <li key={item} className={cn('flex items-center gap-3 text-sm', ready ? 'gs-item text-gray-800' : 'text-gray-400')} style={ready ? { animationDelay: '0s' } : undefined}>
                  <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold', ready ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-gray-200')}>{i + 1}</span>
                  <span className="truncate">{item}</span>
                </li>
              );
            })}
          </ol>
          <p className="mt-6 text-xs text-gray-500">{reading ? 'Matching your class to the official curriculum.' : 'The AI plans the whole document before it writes. This can take a minute.'}</p>
        </div>
      </div>
    </div>
  );
}

// ───────────── The steps along the top ─────────────

export function GenerationSteps({ feature, phase, content, status }: { feature: GeneratorKey; phase: GenerationPhase; content: string; status?: string }) {
  const position = writingPosition(feature, content);
  const writing = phase === 'writing' && !!content;
  const checking = phase === 'writing' && !!status;
  const steps = [
    { key: 'read', label: 'Reading', icon: BookOpen, done: phase !== 'searching', active: phase === 'searching' },
    { key: 'plan', label: 'Planning', icon: ListTree, done: !!content || phase === 'done', active: phase === 'writing' && !content },
    { key: 'write', label: 'Writing', icon: Feather, done: checking || phase === 'done', active: writing && !checking },
    ...(status || feature === 'assessment' ? [{ key: 'check', label: status ? 'Checking' : 'Checking', icon: ClipboardCheck, done: phase === 'done', active: checking }] : []),
    { key: 'save', label: 'Saved', icon: CheckCircle2, done: phase === 'done', active: false },
  ];
  const pct = writing && position.total > 0 ? Math.round(((Math.max(0, position.index) + 0.5) / position.total) * 100) : 0;
  return (
    <div className="w-full space-y-2" aria-live="polite">
      <ol className="flex items-center gap-1.5 text-xs sm:text-sm">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={s.key} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <span className={cn('h-0.5 w-3 rounded-full transition-colors duration-500 sm:w-6', s.done || s.active ? 'bg-blue-500' : 'bg-gray-200')} />}
              <span className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-all duration-500',
                s.done ? 'bg-emerald-50 text-emerald-700' : s.active ? 'bg-blue-600 text-white shadow-[0_0_0_4px_rgba(37,99,235,0.15)]' : 'bg-gray-100 text-gray-400')}>
                {s.done ? <CheckCircle2 size={14} /> : s.active ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
                <span className="hidden sm:inline">{s.label}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {(writing || checking) && (
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <Sparkles size={14} className="shrink-0 text-blue-600" />
          <span className="min-w-0 flex-1 truncate">
            {checking ? status : position.section ? <>Writing <strong className="font-semibold text-gray-900">{position.section}</strong></> : 'Writing…'}
          </span>
          {!checking && position.total > 1 && (
            <span className="relative h-1.5 w-28 overflow-hidden rounded-full bg-gray-100 sm:w-40">
              <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
