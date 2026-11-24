// @/pages/teacher/ai/AiFeature.tsx — one page shared by the four generators
// (lesson plan, scheme of work, assessment, record of work). The address
// says which: /dashboard/teacher/ai/lesson-plan and so on.
//
// Left: the form. 1) one of the teacher's own classes and a subject they
// teach there (from Firebase, like Results Entry: useAiTeachingOptions);
// the class's boys / girls / total come live from Firestore
// (useClassLearnerCounts). 2) the tool's own details. Topics come from the
// approved syllabus for that class (useClassCurriculum): dropdowns for the
// lesson plan, a checklist for tests and schemes; typed only when no syllabus
// map has been approved yet. When a CDC teaching module covers the class, its
// topics stand in for a syllabus map, and the lesson plan also offers the
// module's learning activities for the chosen sub-topic. The assessment's
// sections (or, for a CBC task, its rubric size) are set here too
// (@/components/ai/CurriculumFields).
// Right (below on phones): the document on school letterhead, written live,
// then saved to the eFile automatically.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, BookOpenCheck, CheckCircle2, FolderOpen, Info, Loader2, RotateCcw, Sparkles, Square, Users } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { AiGate } from '@/components/ai/AiGate';
import { featureBySlug, isCbcKind, type AiFeatureInfo, type AiField } from '@/components/ai/aiFeatures';
import {
  ActivityChecklist, CriteriaField, LessonOfField, PRESETS, SectionsBuilder, TopicChecklist, TopicPicker, readSections, sectionsProblem, sectionsToValues,
} from '@/components/ai/CurriculumFields';
import { DocumentActions, DocumentPaper, headerFrom, type DocumentPaperHandle } from '@/components/ai/DocumentPaper';
import { GenerationStage, GenerationSteps, useSmoothText } from '@/components/ai/GenerationStage';
import { LessonImport } from '@/components/ai/LessonImport';
import { FigurePicker } from '@/components/ai/figures/FigureLibraryDialog';
import { Card, CardTitle, ChipGroup, EmptyState, Field, Pill, Select, Skeleton, TextArea, TextInput } from '@/components/ai/ui';
import { Button } from '@/components/ui/button';
import { useAiTeachingOptions } from '@/hooks/useAiTeachingOptions';
import { useAuth } from '@/hooks/useAuth';
import { useClassCurriculum } from '@/hooks/useClassCurriculum';
import { useClassLearnerCounts } from '@/hooks/useClassLearnerCounts';
import { teacherAi } from '@/services/aiApi';
import type { GeneratorKey, Source, TeacherAiSession } from '@/types/ai';
import { getAllTermsForYear, getCurrentAcademicTerm } from '@/utils/academicTerm';
import { cn } from '@/lib/utils';

type Phase = 'idle' | 'searching' | 'writing' | 'done';

/** This year's and next year's terms, for the Term box. */
function termOptions() {
  const now = getCurrentAcademicTerm();
  return [...getAllTermsForYear(now.year), ...getAllTermsForYear(now.year + 1)].map((t) => ({ value: t.label, label: t.label }));
}

const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** Starting values for the tool's boxes. */
function defaultsFor(feature: AiFeatureInfo): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of feature.fields) {
    if (f.kind === 'term') out[f.name] = getCurrentAcademicTerm().label;
    else if (f.kind === 'sections') Object.assign(out, sectionsToValues(PRESETS[0].sections));
    else if (f.defaultValue) out[f.name] = f.defaultValue;
  }
  return out;
}

function ToolField({ field, value, onChange, disabled }: { field: AiField; value: string; onChange: (v: string) => void; disabled: boolean }) {
  const id = `ai-${field.name}`;
  const common = { id, required: !field.optional, disabled, value, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  let control;
  if (field.kind === 'textarea') control = <TextArea {...common} rows={6} maxLength={4000} placeholder={field.placeholder} />;
  else if (field.kind === 'select') control = <Select {...common}>{field.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>;
  else if (field.kind === 'term') control = <Select {...common}>{termOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>;
  else if (field.kind === 'date') control = <TextInput {...common} type="date" />;
  else control = <TextInput {...common} type={field.kind === 'number' ? 'number' : 'text'} min={field.kind === 'number' ? 1 : undefined} max={field.kind === 'number' ? 300 : undefined} maxLength={200} placeholder={field.placeholder} />;
  return <Field label={field.label} htmlFor={id} hint={field.hint} className={field.wide ? 'sm:col-span-2 lg:col-span-1 xl:col-span-2' : ''}>{control}</Field>;
}

function Generator({ feature, session }: { feature: AiFeatureInfo; session: TeacherAiSession }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { classes, isLoading: loadingClasses, error: classesError } = useAiTeachingOptions(session.catalog);
  const [classId, setClassId] = useState('');
  const [subject, setSubject] = useState('');
  const [values, setValues] = useState<Record<string, string>>(() => defaultsFor(feature));
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [sentInputs, setSentInputs] = useState<Record<string, string>>({});
  const [savedId, setSavedId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  // Documents ahead of this one in the AI server's queue (busy times).
  const [queueAhead, setQueueAhead] = useState(0);
  // Kept on screen with the document (e.g. "written without the curriculum search").
  const [notice, setNotice] = useState('');
  const stop = useRef<AbortController | null>(null);
  const paper = useRef<DocumentPaperHandle>(null);
  const output = useRef<HTMLDivElement>(null);

  const chosenClass = classes.find((c) => c.classId === classId);
  const counts = useClassLearnerCounts(chosenClass?.classId);
  const busy = phase === 'searching' || phase === 'writing';
  const limitReached = session.remainingToday === 0;
  const subjectOk = !!chosenClass?.subjects.find((s) => s.subject === subject)?.hasMaterial;
  const curriculum = useClassCurriculum(subjectOk ? subject : '', chosenClass?.level);
  const map = curriculum.data ?? null; // the approved syllabus topics for this class, if any
  const setMany = (patch: Record<string, string>) => setValues((x) => ({ ...x, ...patch }));
  // Topics belong to one class and subject: choosing another clears them.
  const clearTopics = () => setValues((x) => { const { topic, subTopic, subTopicCode, topics, topicCodes, activities, ...rest } = x; return rest; });
  // A CBC task (scenario + rubric) has no sections: it is scored on its rubric.
  const cbc = feature.key === 'assessment' && isCbcKind(values.kind);

  // Let the superAdmin's usage view know this tool was opened; never block the teacher.
  useEffect(() => { teacherAi.opened(feature.key).catch(() => {}); }, [feature.key]);
  // Leaving the page cancels a document that is still being written.
  useEffect(() => () => stop.current?.abort(), []);
  // With one class, choose it straight away.
  useEffect(() => { if (!classId && classes.length === 1 && classes[0].level) setClassId(classes[0].classId); }, [classes, classId]);
  // With one subject that has material, choose it straight away.
  useEffect(() => {
    const usable = chosenClass?.subjects.filter((s) => s.hasMaterial) ?? [];
    if (!subject && usable.length === 1) setSubject(usable[0].subject);
  }, [chosenClass, subject]);

  const header = useMemo(() => headerFrom(feature.key as GeneratorKey, title || feature.label, sentInputs), [feature, title, sentInputs]);
  // The text flows onto the page at an even pace while it is written (GenerationStage.tsx).
  const shown = useSmoothText(content, busy && !status);
  // Follow the writing down the page, until the teacher scrolls up to read.
  const follow = useRef(true);
  useEffect(() => {
    if (!busy) return;
    follow.current = true;
    const stopFollowing = (e: Event) => { if (e.type !== 'keydown' || ['ArrowUp', 'PageUp', 'Home'].includes((e as KeyboardEvent).key)) follow.current = false; };
    const wheel = (e: WheelEvent) => { if (e.deltaY < 0) follow.current = false; };
    window.addEventListener('wheel', wheel, { passive: true });
    window.addEventListener('touchmove', stopFollowing, { passive: true });
    window.addEventListener('keydown', stopFollowing);
    return () => { window.removeEventListener('wheel', wheel); window.removeEventListener('touchmove', stopFollowing); window.removeEventListener('keydown', stopFollowing); };
  }, [busy]);
  const lastFollow = useRef(0);
  useEffect(() => {
    if (!busy || !follow.current || !shown) return;
    const now = Date.now();
    if (now - lastFollow.current < 400) return;
    lastFollow.current = now;
    const caret = output.current?.querySelector('.doc-caret-line');
    if (!caret) return;
    const box = caret.getBoundingClientRect();
    if (box.bottom > window.innerHeight - 60) window.scrollBy({ top: box.bottom - window.innerHeight * 0.7, behavior: 'smooth' });
  }, [shown, busy]);

  const generate = async (event: FormEvent) => {
    event.preventDefault();
    if (!chosenClass?.level) return;
    if (feature.fields.some((f) => f.kind === 'topics' && !f.optional) && map && !values.topicCodes) {
      setError('Tick at least one topic.');
      return;
    }
    if (feature.fields.some((f) => f.kind === 'sections') && !cbc) {
      const problem = sectionsProblem(readSections(values));
      if (problem) { setError(problem); return; }
    }
    const inputs: Record<string, string> = {
      // Every document shows the term; tools without a Term box use the current one.
      term: getCurrentAcademicTerm().label,
      ...values,
      subject,
      level: chosenClass.level,
      className: chosenClass.className,
      ...(user?.fullName ? { teacherName: user.fullName } : {}),
      ...(counts.data ? { learners: String(counts.data.total), boys: String(counts.data.boys), girls: String(counts.data.girls) } : {}),
    };
    if (inputs.weekEnding && /^\d{4}-\d{2}-\d{2}$/.test(inputs.weekEnding)) inputs.weekEnding = longDate(inputs.weekEnding);
    if (inputs.date && /^\d{4}-\d{2}-\d{2}$/.test(inputs.date)) inputs.date = longDate(inputs.date);
    if (cbc) {
      delete inputs.sections;
      inputs.criteria = String(Number(inputs.criteria) || 5);
      inputs.marks = String(Number(inputs.criteria) * 4);
    } else delete inputs.criteria;
    if (inputs.diagrams === 'none') delete inputs.figureIds;
    // Boxes left empty are not sent.
    for (const [k, v] of Object.entries(inputs)) if (v === '') delete inputs[k];

    const controller = new AbortController();
    stop.current = controller;
    let written = ''; // state does not update inside this function, so keep our own copy
    setPhase('searching'); setStatus(''); setQueueAhead(0); setNotice(''); setError(''); setContent(''); setSources([]); setTitle(''); setSavedId(null); setSentInputs(inputs);
    // On phones the document is below the form: bring it into view.
    requestAnimationFrame(() => { if (window.innerWidth < 1024) output.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    try {
      const document = await teacherAi.generate(feature.key as GeneratorKey, inputs, {
        onMeta: (meta) => { setTitle(meta.title); setSources(meta.sources); setPhase('writing'); },
        onText: (text) => { written += text; setContent(written); },
        onStatus: setStatus,
        onNotice: setNotice,
        onQueue: setQueueAhead,
      }, controller.signal);
      setContent(document.content);
      setSavedId(document.id);
      setStatus('');
      setPhase('done');
    } catch (err) {
      setPhase(written ? 'done' : 'idle');
      setError((err as Error)?.name === 'AbortError' ? 'Stopped. Nothing was saved.' : (err as Error).message);
    } finally {
      stop.current = null;
      void queryClient.invalidateQueries({ queryKey: ['ai-session'] });
      void queryClient.invalidateQueries({ queryKey: ['efile'] });
    }
  };

  const reset = () => { setPhase('idle'); setContent(''); setTitle(''); setSources([]); setSavedId(null); setError(''); setNotice(''); };

  if (session.catalog.length === 0)
    return <Card padded={false} className="mt-6"><EmptyState icon={<Info size={22} />} title="No curriculum yet">No curriculum documents have been added, so there is nothing to generate from. The system administrator adds them.</EmptyState></Card>;
  if (classesError)
    return <Card padded={false} className="mt-6"><EmptyState icon={<Info size={22} />} title="Could not load your classes">Check your connection and refresh the page.</EmptyState></Card>;
  if (!loadingClasses && classes.length === 0)
    return <Card padded={false} className="mt-6"><EmptyState icon={<Users size={22} />} title="No classes assigned">Your administrator assigns classes and subjects in Teacher Management, the same as for Results Entry.</EmptyState></Card>;

  const classOptions = classes.map((c) => ({ value: c.classId, label: c.className, disabled: !c.level, hint: c.level ?? 'The class name does not say which form or grade it is' }));
  const subjectOptions = (chosenClass?.subjects ?? []).map((s) => ({ value: s.subject, label: s.hasMaterial ? s.subject : `${s.subject} · no curriculum`, disabled: !s.hasMaterial, hint: s.hasMaterial ? undefined : 'No curriculum material for this subject and level yet' }));

  return (
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
      {/* Form */}
      <form onSubmit={generate} className="space-y-5 lg:sticky lg:top-6">
        <Card>
          <CardTitle step={1} title="Class and subject" hint="Your classes and subjects from the school timetable." />
          {loadingClasses ? (
            <div className="flex gap-2"><Skeleton className="h-9 w-24 rounded-full" /><Skeleton className="h-9 w-24 rounded-full" /><Skeleton className="h-9 w-24 rounded-full" /></div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="mb-2 text-sm font-medium text-gray-800">Class</p>
                <ChipGroup label="Class" disabled={busy} value={classId ? [classId] : []}
                  options={classOptions}
                  onToggle={(id) => { setClassId(id); setSubject(''); clearTopics(); }} />
                {classes.some((c) => !c.level) && <p className="mt-2 text-xs text-gray-500">Classes whose name has no form or grade (e.g. “Blue”) can’t be used.</p>}
              </div>
              {chosenClass && (
                <div>
                  <p className="mb-2 text-sm font-medium text-gray-800">Subject</p>
                  <ChipGroup label="Subject" disabled={busy} value={subject ? [subject] : []} options={subjectOptions}
                    onToggle={(s) => { setSubject(s); clearTopics(); }} />
                  {chosenClass.subjects.every((s) => !s.hasMaterial) && (
                    <p className="mt-2 text-sm text-amber-700">No curriculum for your subjects in {chosenClass.level} yet. The system administrator adds it.</p>
                  )}
                </div>
              )}
              {chosenClass && (
                <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-3.5 py-2.5 text-sm text-gray-700">
                  <Users size={16} className="shrink-0 text-gray-500" />
                  {counts.isLoading ? <Skeleton className="h-4 w-40" /> : counts.data ? (
                    <span><strong className="font-semibold text-gray-900">{counts.data.total}</strong> learners · {counts.data.boys} boys · {counts.data.girls} girls</span>
                  ) : <span className="text-gray-500">Learner numbers unavailable; the document will leave them blank.</span>}
                </div>
              )}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle step={2} title="Details" hint={
            !feature.fields.some((f) => f.kind === 'topic' || f.kind === 'topics') || !subjectOk ? undefined
              : map ? <span className="inline-flex items-center gap-1.5 text-emerald-700"><BookOpenCheck size={14} /> {map.source === 'module' ? `Topics from the ${map.subject} teaching module` : `Topics from the approved ${map.subject} syllabus`}</span>
              : curriculum.isLoading ? 'Loading the syllabus topics…'
              : 'No approved syllabus map for this class yet, so type the topics.'
          } />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {feature.fields.map((field) => {
              const value = values[field.name] ?? '';
              const onChange = (v: string) => setValues((x) => ({ ...x, [field.name]: v }));
              const typed = <ToolField key={field.name} field={{ ...field, kind: 'text' }} disabled={busy || !subjectOk} value={value} onChange={onChange} />;
              switch (field.kind) {
                case 'topic':
                  if (subjectOk && curriculum.isLoading) return <Skeleton key={field.name} className="h-[4.5rem] sm:col-span-2 lg:col-span-1 xl:col-span-2" />;
                  // A new sub-topic has other activities: the ticks are cleared.
                  return map ? <TopicPicker key={field.name} topics={map.topics} values={values} set={(p) => setMany({ ...p, activities: '' })} disabled={busy} /> : typed;
                case 'subTopic':
                  return map || (subjectOk && curriculum.isLoading) ? null : typed;
                case 'topics':
                  if (subjectOk && curriculum.isLoading) return <Skeleton key={field.name} className="h-32 sm:col-span-2 lg:col-span-1 xl:col-span-2" />;
                  if (map) return <TopicChecklist key={field.name} topics={map.topics} terms={map.terms} values={values} set={setMany} disabled={busy} label={field.label} hint={field.hint} />;
                  return field.optional ? null : typed;
                case 'sections':
                  return cbc ? null : <SectionsBuilder key={field.name} values={values} set={setMany} disabled={busy} />;
                case 'criteria':
                  return cbc ? <CriteriaField key={field.name} values={values} set={setMany} disabled={busy} hint={field.hint} /> : null;
                case 'activities':
                  return map && values.subTopicCode ? <ActivityChecklist key={field.name} guide={map.guides?.[values.subTopicCode]} values={values} set={setMany} disabled={busy} /> : null;
                case 'lessonImport':
                  return chosenClass && subjectOk ? (
                    <LessonImport key={field.name} className={chosenClass.className} subject={subject} weekEnding={values.weekEnding ?? ''}
                      value={values.taught ?? ''} onFill={(text) => setMany({ taught: text })} disabled={busy} />
                  ) : null;
                case 'figures':
                  return chosenClass && subjectOk && values.diagrams !== 'none' ? (
                    <FigurePicker key={field.name} label={field.label} value={value} onChange={onChange} subject={subject} level={chosenClass.level ?? ''} disabled={busy} />
                  ) : null;
                case 'lessonOf':
                  return <LessonOfField key={field.name} values={values} set={setMany} disabled={busy} hint={field.hint} />;
                default:
                  return <ToolField key={field.name} field={field} disabled={busy} value={value} onChange={onChange} />;
              }
            })}
          </div>
        </Card>

        <div className="space-y-3">
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</p>}
          {busy ? (
            <Button type="button" variant="outline" onClick={() => stop.current?.abort()} className="h-12 w-full rounded-xl text-base"><Square size={16} className="mr-2" /> Stop</Button>
          ) : (
            <Button type="submit" disabled={limitReached || !subjectOk} className="h-12 w-full rounded-xl bg-blue-600 text-base font-semibold shadow-sm hover:bg-blue-700">
              <Sparkles size={18} className="mr-2" /> Generate {feature.label.toLowerCase()}
            </Button>
          )}
          <p className="text-center text-xs text-gray-500">
            {limitReached ? 'You have used today’s allowance. It resets at midnight.'
              : !subjectOk ? 'Choose a class and a subject to continue.'
              : session.remainingToday !== null ? `${session.remainingToday} of ${session.dailyLimit} documents left today` : 'Saved to your eFile automatically'}
          </p>
        </div>
      </form>

      {/* Document */}
      <div ref={output} className="min-w-0 scroll-mt-6">
        {phase === 'idle' && !content ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white/60 px-6 py-12 text-center">
            <span className={cn('mb-4 flex h-14 w-14 items-center justify-center rounded-2xl', feature.tone.icon)}><feature.icon size={26} /></span>
            <h2 className="text-base font-semibold text-gray-900">Your {feature.label.toLowerCase()} will appear here</h2>
            <p className="mt-1.5 max-w-sm text-sm text-gray-600">On school letterhead, with your class, learners and term filled in, ready to print or download for Word.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">{feature.outputs.map((o) => <Pill key={o}>{o}</Pill>)}</div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-gray-200 bg-white px-4 py-3">
              <div className="mr-auto min-w-0">
                {busy ? <GenerationSteps feature={feature.key as GeneratorKey} phase={phase} content={shown} status={status} /> : savedId ? (
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="flex items-center gap-2 font-medium text-emerald-700"><CheckCircle2 size={16} /> Saved to your eFile</span>
                    <Link to={`/dashboard/teacher/ai/efile/${savedId}`} className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-800"><FolderOpen size={15} /> Open</Link>
                  </p>
                ) : <p className="text-sm text-gray-600">Not saved</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DocumentActions paper={paper} content={content} disabled={busy || !content} />
                {!busy && <Button size="sm" variant="ghost" onClick={reset} aria-label="Start a new document" className="h-9 rounded-xl px-2.5 text-gray-700 sm:px-3"><RotateCcw size={16} className="sm:mr-2" /><span className="hidden sm:inline">New</span></Button>}
              </div>
            </div>
            {notice && (
              <p role="status" className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>{notice}</span>
              </p>
            )}
            {phase === 'searching' || (phase === 'writing' && !content) ? (
              <GenerationStage feature={feature.key as GeneratorKey} phase={phase} inputs={sentInputs} queueAhead={queueAhead} />
            ) : (
              <DocumentPaper ref={paper} header={header} content={busy ? shown : content} sources={sources} writing={busy} caret={status || undefined} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AiFeature() {
  const { feature: slug } = useParams();
  const feature = featureBySlug(slug);
  // An unknown address, or the eFile's (it has its own page), goes back to AI Tools.
  if (!feature || feature.key === 'eFile') return <Navigate to="/dashboard/teacher/ai" replace />;
  const Icon = feature.icon;

  return (
    <DashboardLayout activeTab="ai-tools">
      <div className="mx-auto max-w-7xl">
        <Link to="/dashboard/teacher/ai" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
          <ArrowLeft size={16} /> AI Tools
        </Link>
        <div className="flex items-start gap-4">
          <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', feature.tone.icon)}><Icon size={24} /></span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{feature.label}</h1>
            <p className="mt-1 text-sm text-gray-600 sm:text-base">{feature.description}</p>
          </div>
        </div>
        <AiGate feature={feature.key}>{(session) => <Generator key={feature.key} feature={feature} session={session} />}</AiGate>
      </div>
    </DashboardLayout>
  );
}
