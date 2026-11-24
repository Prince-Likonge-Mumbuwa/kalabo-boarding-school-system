// @/pages/teacher/ai/EFile.tsx — the teacher's eFile: the Ministry of
// Education Teacher's File as the school keeps it (EFILE_SECTIONS in @/types/ai).
//
//   Teacher's Details                     a form (name, TS and TCZ numbers, department, phone, term, year)
//   1–6  Vision, Mission, Work Plan,      the teacher's own entries (a title, a date
//        Time Table, Class List, Syllabus and a ready page to fill in)
//   7–9  Schemes, Lesson Plan, Records    the AI documents, filed by kind
//   10   Assessment Records (i)–(viii)    AI tests as Question Samples and again as
//                                         Marking Keys; the other parts are entries
//
// From the school system, live (services/efileSystem.ts): 1–2 the vision and
// mission (written by the admin in Settings), 4 the timetable, 5 class lists
// and subject registers (attendance), 6 the official syllabus (superAdmin),
// 10 records of work (evaluated lesson plans), 11 (i) homework (lesson plans),
// 11 (ii) progress chart, 11 (vi) analysis and 11 (vii) remedial work
// (results, the plans' remedial work, lesson evaluations). The year and term
// picked at the top choose which term sections 6, 9 and 10 show.
// 3 Individual Work Plan: the AI writes it from the term's schemes of work
// (WorkPlanWriter, POST /efile-file/work-plan) and it is saved as an entry.
// Scanned papers (components/ai/ScanCapture.tsx): 11 (v) marked scripts
// (highest, average, lowest of each assessment), 11 (iii) own question papers.
//
// The whole file, one section or one item downloads as a PDF made with
// pdf-lib (services/pdf/efileExport.ts), like the report cards. Opening an AI
// document goes to EFileDocument.tsx.
// Address: /dashboard/teacher/ai/efile?section=<id>
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { SCHOOL_NAME } from '@/components/ai/brand';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, CalendarRange, Camera, Check, Database, Download, Eye, FileSearch, FileText, FolderOpen, Loader2, Pencil, Plus, Save, Search, Sparkles, Trash2, UserRound,
} from 'lucide-react';
import { ScanDialog, ScanThumb, type AssessmentChoice } from '@/components/ai/ScanCapture';
import {
  currentPeriod, examTypeOf, inPeriod, periodKey, periodLabel, scriptSuggestions, useProfileDefaults, useSystemRecords, useTeachingLoad, weeksInTerm,
  type ClassResults, type FilePeriod, type SystemRecord, type TeachingLoad,
} from '@/services/efileSystem';
import type { TermName } from '@/utils/academicTerm';
import { DashboardLayout } from '@/components/DashboardLayout';
import { AiGate } from '@/components/ai/AiGate';
import { featureByKey } from '@/components/ai/aiFeatures';
import { DOC_CSS } from '@/components/ai/DocumentPaper';
import { Markdown } from '@/components/ai/Markdown';
import { Card, EmptyState, Field, PageHeader, Select, Skeleton, TextArea, TextInput } from '@/components/ai/ui';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { teacherAi } from '@/services/aiApi';
import {
  EFILE_SECTIONS, PROFILE_FIELDS, SCRIPT_SLOTS, efileSection,
  type EFileEntry, type EFileMeta, type EFileScan, type EFileSectionId, type EFileSectionInfo, type EFileSummary, type ScriptSlot,
} from '@/types/ai';
import { cn } from '@/lib/utils';
import { timeAgo } from './AiTools';

type View = EFileSectionId | 'details';
const isView = (v: string | null): v is View => v === 'details' || EFILE_SECTIONS.some((s) => s.id === v);

/** Runs a PDF download, showing what it is doing and any error. */
function usePdf() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const run = async (key: string, work: (progress: (m: string) => void) => Promise<void>) => {
    if (busy) return;
    setError('');
    setBusy(key);
    try { await work(() => undefined); } catch (err) { setError((err as Error).message || 'The PDF could not be made.'); } finally { setBusy(null); }
  };
  return { busy, error, run };
}
const pdfModule = () => import('@/services/pdf/efileExport');

function PdfButton({ label, busy, onClick, variant = 'outline', className }: { label: string; busy: boolean; onClick: () => void; variant?: 'outline' | 'default'; className?: string }) {
  return (
    <Button type="button" size="sm" variant={variant} onClick={onClick} disabled={busy}
      className={cn('h-9 rounded-xl', variant === 'default' && 'bg-blue-600 font-semibold hover:bg-blue-700', className)}>
      {busy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Download size={16} className="mr-2" />}{label}
    </Button>
  );
}

// ───────────────────────────── The page ─────────────────────────────

function TeacherFile() {
  useEffect(() => { teacherAi.opened('eFile').catch(() => {}); }, []);
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const view: View = isView(params.get('section')) ? (params.get('section') as View) : 'details';
  const go = (id: View) => setParams((old) => {
    const next = new URLSearchParams(old);
    if (id === 'details') next.delete('section'); else next.set('section', id);
    return next;
  }, { replace: true });

  const docs = useQuery({ queryKey: ['efile'], queryFn: teacherAi.efileList, retry: false });
  const meta = useQuery({ queryKey: ['efile-file'], queryFn: teacherAi.efileMeta, retry: false });
  const documents = docs.data ?? [];
  const file: EFileMeta = { profile: {}, entries: [], ...meta.data, scans: meta.data?.scans ?? [] };
  const teacher = file.profile.fullName || user?.fullName || '';
  // Timetable, class lists, registers, marks: read live from the school system,
  // for the year and term chosen at the top (?year=2026&term=Term+2).
  const period: FilePeriod = (() => {
    const year = Number(params.get('year')), term = params.get('term') as TermName | null;
    return year && term && /^Term [123]$/.test(term) ? { term, year } : currentPeriod();
  })();
  const setPeriod = (p: FilePeriod) => setParams((old) => {
    const next = new URLSearchParams(old);
    const now = currentPeriod();
    if (p.term === now.term && p.year === now.year) { next.delete('year'); next.delete('term'); }
    else { next.set('year', String(p.year)); next.set('term', p.term); }
    return next;
  }, { replace: true });
  const system = useSystemRecords(documents, period);
  const recordsOf = (id: EFileSectionId) => system.records.filter((r) => r.section === id);

  const count = (s: EFileSectionInfo): number =>
    s.source === 'group' ? EFILE_SECTIONS.filter((x) => x.sub).reduce((n, x) => n + count(x), 0)
      : (s.source === 'ai' ? documents.filter((d) => d.feature === s.feature).length : 0)
        + (s.source === 'entries' || s.alsoEntries ? file.entries.filter((e) => e.section === s.id).length : 0)
        + (s.scans ? file.scans.filter((x) => x.section === s.id).length : 0)
        + recordsOf(s.id).length;
  const detailsDone = PROFILE_FIELDS.filter((f) => file.profile[f.name]).length;

  const pdf = usePdf();
  const [progress, setProgress] = useState('');
  const downloadFile = (only?: EFileSectionId[]) => pdf.run(only ? `section:${only[0]}` : 'file', async () => {
    const { downloadTeacherFilePdf } = await pdfModule();
    await downloadTeacherFilePdf({ meta: file, summaries: documents, load: teacherAi.efileGet, teacher, only, system: system.records, scanPage: teacherAi.efileScanPage, onProgress: setProgress });
    setProgress('');
  });

  if (docs.error || meta.error)
    return <Card padded={false} className="mt-6"><EmptyState icon={<FolderOpen size={22} />} title="Could not load your eFile">{((docs.error ?? meta.error) as Error).message}</EmptyState></Card>;

  const info = view === 'details' ? null : efileSection(view);
  return (
    <div className="mt-6 space-y-5">
      {/* The whole file as one PDF */}
      <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 px-4 py-3.5 ring-1 ring-inset ring-slate-200 sm:flex-row sm:items-center">
        <FileText size={20} className="hidden shrink-0 text-slate-600 sm:block" />
        <p className="flex-1 text-sm text-gray-700">
          {progress || <>Your <strong className="font-semibold">Teacher&rsquo;s File</strong> as the school keeps it: a cover, your details, the contents, then sections 1–11 with every document, ready to print or submit.</>}
        </p>
        <PdfButton label="Download Teacher's File (PDF)" variant="default" busy={pdf.busy === 'file'} onClick={() => downloadFile()} />
      </div>
      {pdf.error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">{pdf.error}</p>}
      <PeriodBar period={period} periods={system.periods} onChange={setPeriod} />

      <div className="grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
        {/* Sections: a list on wide screens, a menu on phones */}
        <nav aria-label="Sections of the Teacher's File">
          <Select aria-label="Section" className="lg:hidden" value={view} onChange={(e) => go(e.target.value as View)}>
            <option value="details">Teacher&rsquo;s Details</option>
            {EFILE_SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.sub ? `\u00a0\u00a0\u00a0${s.ref}. ` : `${s.ref}. `}{s.title} ({count(s)})</option>)}
          </Select>
          <ol className="hidden space-y-0.5 lg:block">
            <li>
              <button type="button" onClick={() => go('details')} aria-current={view === 'details' ? 'page' : undefined}
                className={cn('mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition',
                  view === 'details' ? 'bg-white font-semibold text-gray-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:bg-white/70 hover:text-gray-900')}>
                <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-lg', detailsDone ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600')}><UserRound size={13} /></span>
                <span className="min-w-0 flex-1">Teacher&rsquo;s Details</span>
                {detailsDone === PROFILE_FIELDS.length && <Check size={14} className="text-emerald-600" />}
              </button>
            </li>
            {EFILE_SECTIONS.map((s) => {
              const n = count(s);
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => go(s.id)} aria-current={s.id === view ? 'page' : undefined}
                    className={cn('flex w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition', s.sub ? 'py-1.5 pl-9' : 'py-2.5',
                      s.id === view ? 'bg-white font-semibold text-gray-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:bg-white/70 hover:text-gray-900')}>
                    <span className={cn('flex shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums', s.sub ? 'h-5 min-w-[1.6rem] px-1' : 'h-6 w-6',
                      n ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600')}>{s.ref}</span>
                    <span className="min-w-0 flex-1 leading-snug">{s.title}</span>
                    {n > 0 && <span className="rounded-full bg-gray-100 px-1.5 text-xs tabular-nums text-gray-700">{n}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <section aria-labelledby="section-title" className="min-w-0 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">{info ? info.label : 'Ministry of Education'}</p>
              <h2 id="section-title" className="mt-0.5 text-xl font-bold tracking-tight text-gray-900">{info ? info.title : 'Teacher\u2019s Details'}</h2>
              <p className="mt-1 text-sm text-gray-600">{info ? info.description : 'Printed on the cover and on the Teacher\u2019s Details page of your file.'}</p>
            </div>
            {info && <PdfButton label={info.source === 'group' ? `${info.label} PDF` : 'Section PDF'} busy={pdf.busy === `section:${info.id}`} onClick={() => downloadFile([info.id])} className="shrink-0" />}
          </div>
          {docs.isLoading || meta.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Card key={i}><Skeleton className="h-10 w-10" /><Skeleton className="mt-4 h-4 w-4/5" /><Skeleton className="mt-2 h-3 w-1/2" /></Card>)}</div>
          ) : !info ? (
            <ProfileForm profile={file.profile} />
          ) : info.source === 'group' ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {EFILE_SECTIONS.filter((x) => x.sub).map((x) => (
                <li key={x.id}>
                  <button type="button" onClick={() => go(x.id)} className="flex h-full w-full flex-col rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-gray-300 hover:shadow-md">
                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">{x.label}</span>
                    <span className="mt-1 font-semibold text-gray-900">{x.title} <span className="font-normal text-gray-500">({count(x)})</span></span>
                    <span className="mt-1 text-sm text-gray-600">{x.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <>
              {info.system && <SystemRecords note={info.system} records={recordsOf(info.id)} loading={system.loading} />}
              {info.id === 'scriptSamples' && <Scripts documents={documents} file={file} marks={system.marks} />}
              {info.source === 'ai' && <AiDocuments info={info} documents={documents.filter((d) => d.feature === info.feature)} />}
              {info.id === 'questionSamples' && <OwnPapers scans={file.scans.filter((x) => x.section === 'questionSamples')} />}
              {info.id === 'workPlan' && <WorkPlanWriter documents={documents} period={period} profile={file.profile} />}
              {info.id === 'lessonGrid' && <LessonGridWriter period={period} />}
              {(info.source === 'entries' || info.alsoEntries) && <Entries info={info} entries={file.entries.filter((e) => e.section === info.id)} teacher={teacher} heading={info.id === 'remedialPlan' ? 'Remedial work (written after lesson evaluations) and your own entries' : info.id === 'lessonGrid' ? 'Your lesson grids' : info.system || info.scans ? 'Your own entries' : info.id === 'workPlan' ? 'Your work plans' : undefined} />}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// ───────────── Which year and term sections 6, 9 and 10 show ─────────────

function PeriodBar({ period, periods, onChange }: { period: FilePeriod; periods: FilePeriod[]; onChange: (p: FilePeriod) => void }) {
  const years = [...new Set([...periods.map((p) => p.year), period.year])].sort((a, b) => b - a);
  const terms = (['Term 1', 'Term 2', 'Term 3'] as TermName[]);
  const has = new Set(periods.map(periodKey));
  const now = currentPeriod();
  const isNow = period.term === now.term && period.year === now.year;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center">
      <CalendarRange size={20} className="hidden shrink-0 text-blue-600 sm:block" />
      <p className="flex-1 text-sm text-gray-700">
        Records for <strong className="font-semibold">{periodLabel(period)}</strong>{isNow ? ' (this term)' : ''}: syllabus, records of work, homework, progress charts, analysis and remedial work. The PDF uses the same term.
      </p>
      <div className="flex gap-2">
        <Select aria-label="Year" className="w-28" value={period.year} onChange={(e) => {
          const year = Number(e.target.value);
          const term = terms.find((t) => has.has(periodKey({ term: t, year })) && t === period.term) ?? [...terms].reverse().find((t) => has.has(periodKey({ term: t, year }))) ?? period.term;
          onChange({ year, term });
        }}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
        <Select aria-label="Term" className="w-32" value={period.term} onChange={(e) => onChange({ year: period.year, term: e.target.value as TermName })}>
          {terms.map((t) => <option key={t} value={t}>{t}{has.has(periodKey({ term: t, year: period.year })) ? '' : ' (no records)'}</option>)}
        </Select>
        {!isNow && <Button type="button" variant="ghost" className="h-10 rounded-xl" onClick={() => onChange(now)}>This term</Button>}
      </div>
    </div>
  );
}

// ───────────── 3 Individual Work Plan and 7 Lesson Grid, written by the AI ─────────────

const addEntryToCache = (queryClient: ReturnType<typeof useQueryClient>, entry: EFileEntry) => {
  queryClient.setQueryData<EFileMeta>(['efile-file'], (m) => (m ? { ...m, entries: [...m.entries, entry] } : m));
  void queryClient.invalidateQueries({ queryKey: ['ai-session'] });
};

function WriterCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Sparkles size={18} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {children}
        </div>
      </div>
    </Card>
  );
}

function WriterFeedback({ error, done }: { error: string; done: string }) {
  return (
    <>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</p>}
      {done && <p role="status" className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200"><Check size={16} /> {done}</p>}
    </>
  );
}

/**
 * Section 3. The Individual Work Plan in the Ministry format: the classes and
 * lessons a week come from the timetable (the teacher can correct them), the
 * weeks from the school calendar, the co-curricular work from the teacher.
 */
function WorkPlanWriter({ documents, period, profile }: { documents: EFileSummary[]; period: FilePeriod; profile: Record<string, string> }) {
  const queryClient = useQueryClient();
  const { load, loading } = useTeachingLoad();
  const [span, setSpan] = useState<'term' | 'year'>('term');
  const [lessons, setLessons] = useState<Record<string, number>>({});
  const [coCurricular, setCoCurricular] = useState(profile.coCurricular ?? '');
  const schemes = documents.filter((d) => d.feature === 'schemeOfWork').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const ofTerm = schemes.filter((d) => inPeriod(d, period));
  const firstPicks = () => [...new Map(ofTerm.map((d) => [`${d.inputs.className || d.inputs.level}|${d.inputs.subject}`, d.id])).values()];
  const [picked, setPicked] = useState<string[]>(firstPicks);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  useEffect(() => { setPicked(firstPicks()); setDone(''); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [periodKey(period), documents.length]);
  useEffect(() => { setCoCurricular(profile.coCurricular ?? ''); }, [profile.coCurricular]);
  const keyOf = (l: TeachingLoad) => `${l.classId}|${l.subject}`;
  const lessonsOf = (l: TeachingLoad) => lessons[keyOf(l)] ?? l.lessonsPerWeek;
  const weeks = weeksInTerm(period);
  const periodLabelText = span === 'term' ? periodLabel(period) : `January to December ${period.year}`;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const write = async () => {
    setBusy(true); setError(''); setDone('');
    try {
      // The co-curricular duties are remembered for next time (Teacher's Details).
      if ((profile.coCurricular ?? '') !== coCurricular.trim()) {
        const saved = await teacherAi.efileSaveProfile({ ...profile, coCurricular: coCurricular.trim() });
        queryClient.setQueryData<EFileMeta>(['efile-file'], (m) => (m ? { ...m, profile: saved } : m));
      }
      const entry = await teacherAi.efileWriteWorkPlan({
        periodLabel: periodLabelText, terms: span === 'term' ? 1 : 3, weeksPerTerm: weeks,
        classes: load.map((l) => ({ className: l.className, subject: l.subject, level: l.level, lessonsPerWeek: lessonsOf(l), periodsPerWeek: l.periodsPerWeek })),
        schemeIds: picked, coCurricular: coCurricular.trim(), department: profile.department ?? '', teacherName: profile.fullName ?? '', school: SCHOOL_NAME,
      });
      addEntryToCache(queryClient, entry);
      setDone(`"${entry.title}" is saved below. Open it to check and edit it.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <WriterCard title="Write my Individual Work Plan">
      <p className="mt-0.5 text-sm text-gray-600">In the Ministry format: job purpose, then each key result area (planning, teaching, continuous assessment, class management, co-curricular activities, professional development) with its principal accountability, schedule of activities and targets, the assumptions and the signatures. The targets are counted from your timetable and the school calendar.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Work plan period">
          <Select value={span} onChange={(e) => setSpan(e.target.value as 'term' | 'year')} disabled={busy}>
            <option value="term">{periodLabel(period)} ({weeks} weeks)</option>
            <option value="year">The whole year {period.year} (3 terms)</option>
          </Select>
        </Field>
        <Field label="Co-curricular duties (optional)" hint="Clubs, sports, PMS, duties: in your own words. Remembered for next time.">
          <TextArea rows={2} maxLength={600} value={coCurricular} onChange={(e) => setCoCurricular(e.target.value)} disabled={busy} placeholder="e.g. Patron of the ICT club (Wednesdays), football coach, PMS supervisor for Block B" />
        </Field>
      </div>
      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-gray-700">Classes and lessons a week (from your timetable)</legend>
        {loading ? <p className="mt-2 flex items-center gap-2 text-sm text-gray-500"><Loader2 size={14} className="animate-spin" /> Reading your timetable…</p>
          : load.length === 0 ? <p className="mt-2 text-sm text-gray-600">No classes are assigned to you yet.</p> : (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {load.map((l) => (
                <li key={keyOf(l)} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2 text-sm">
                  <span className="min-w-0"><span className="block font-medium text-gray-900">{l.subject}, {l.className}</span><span className="block text-xs text-gray-500">{l.periodsPerWeek ? `${l.periodsPerWeek} periods on the timetable` : 'Not on the timetable yet: enter the lessons'}</span></span>
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <TextInput type="number" min={0} max={20} className="h-9 w-16 rounded-lg text-center" value={lessonsOf(l)} onChange={(e) => setLessons((x) => ({ ...x, [keyOf(l)]: Math.max(0, Math.min(20, Number(e.target.value) || 0)) }))} disabled={busy} aria-label={`Lessons a week, ${l.subject} ${l.className}`} />
                    lessons / week
                  </label>
                </li>
              ))}
            </ul>
          )}
      </fieldset>
      {schemes.length > 0 && (
        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-gray-700">Schemes of work to take the topics from (optional)</legend>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {(ofTerm.length ? ofTerm : schemes.slice(0, 6)).map((d) => (
              <li key={d.id}>
                <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 text-sm transition', picked.includes(d.id) ? 'border-blue-300 bg-blue-50/60' : 'border-gray-200 hover:border-gray-300')}>
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={picked.includes(d.id)} onChange={() => toggle(d.id)} disabled={busy} />
                  <span className="min-w-0"><span className="block font-medium text-gray-900">{d.inputs.subject}, {d.inputs.className || d.inputs.level}</span><span className="block text-xs text-gray-500">{d.inputs.term || ''} · made {timeAgo(d.createdAt)}</span></span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <WriterFeedback error={error} done={done} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={write} disabled={busy || loading || load.length === 0 || picked.length > 8} className="h-10 rounded-xl bg-blue-600 font-semibold hover:bg-blue-700">
          {busy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Sparkles size={16} className="mr-2" />}
          {busy ? 'Writing your work plan…' : 'Write work plan with AI'}
        </Button>
        <span className="text-xs text-gray-500">{busy ? 'This takes under a minute.' : `Counts as one of today’s documents.`}</span>
      </div>
    </WriterCard>
  );
}

/** Section 7. The Lesson Grid (Syllabus Analysis Grid) for one class and the chosen term. */
function LessonGridWriter({ period }: { period: FilePeriod }) {
  const queryClient = useQueryClient();
  const { load, loading } = useTeachingLoad();
  const choices = [...new Map(load.filter((l) => l.level).map((l) => [`${l.subject}|${l.className}`, l])).values()];
  const [pick, setPick] = useState('');
  const chosen = choices.find((l) => `${l.subject}|${l.className}` === pick) ?? choices[0];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const weeks = weeksInTerm(period);
  const write = async () => {
    if (!chosen) return;
    setBusy(true); setError(''); setDone('');
    try {
      const entry = await teacherAi.efileWriteSyllabusGrid({ subject: chosen.subject, className: chosen.className, level: chosen.level, termLabel: periodLabel(period), weeks });
      addEntryToCache(queryClient, entry);
      setDone(`"${entry.title}" is saved below. It prints across the page.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <WriterCard title={`Write a Lesson Grid for ${periodLabel(period)}`}>
      <p className="mt-0.5 text-sm text-gray-600">Week by week: topic, sub-topic, curriculum philosophy and goals, prescribed competence, key concepts and content, learning strategies, assessment, learning environment, material development, teacher status and references. Taken from the official syllabus, and from your scheme of work for the class if you have one, so the weeks agree.</p>
      {loading ? <p className="mt-3 flex items-center gap-2 text-sm text-gray-500"><Loader2 size={14} className="animate-spin" /> Loading your classes…</p>
        : choices.length === 0 ? <p className="mt-3 text-sm text-gray-600">No classes are assigned to you yet.</p> : (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <Field label="Class and subject">
              <Select className="min-w-[16rem]" value={chosen ? `${chosen.subject}|${chosen.className}` : ''} onChange={(e) => setPick(e.target.value)} disabled={busy}>
                {choices.map((l) => <option key={`${l.subject}|${l.className}`} value={`${l.subject}|${l.className}`}>{l.subject}, {l.className}</option>)}
              </Select>
            </Field>
            <Button type="button" onClick={write} disabled={busy || !chosen} className="h-10 rounded-xl bg-blue-600 font-semibold hover:bg-blue-700">
              {busy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Sparkles size={16} className="mr-2" />}
              {busy ? 'Writing the lesson grid…' : `Write the lesson grid (${weeks} weeks)`}
            </Button>
          </div>
        )}
      <WriterFeedback error={error} done={done} />
    </WriterCard>
  );
}

// ───────────────────────────── Teacher's Details ─────────────────────────────

function ProfileForm({ profile }: { profile: Record<string, string> }) {
  const queryClient = useQueryClient();
  // What the system already knows (name, TS number, this term) fills the empty boxes.
  const known = useProfileDefaults();
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...known, ...profile }));
  const filledIn = Object.keys(known).filter((k) => !profile[k]);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');
  const save = async () => {
    setState('saving'); setError('');
    try {
      const saved = await teacherAi.efileSaveProfile(values);
      queryClient.setQueryData<EFileMeta>(['efile-file'], (m) => (m ? { ...m, profile: saved } : m));
      setState('saved');
      setTimeout(() => setState('idle'), 2500);
    } catch (err) {
      setError((err as Error).message); setState('idle');
    }
  };
  return (
    <Card>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        {PROFILE_FIELDS.map((f) => (
          <Field key={f.name} label={f.label} htmlFor={`pf-${f.name}`} className={f.wide ? 'sm:col-span-2' : undefined}>
            <TextInput id={`pf-${f.name}`} value={values[f.name] ?? ''} placeholder={f.placeholder} maxLength={400}
              onChange={(e) => { setValues((v) => ({ ...v, [f.name]: e.target.value })); setState('idle'); }} />
          </Field>
        ))}
        {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={state === 'saving'} className="h-10 rounded-xl bg-blue-600 font-semibold hover:bg-blue-700">
            {state === 'saving' ? <Loader2 size={16} className="mr-2 animate-spin" /> : state === 'saved' ? <Check size={16} className="mr-2" /> : <Save size={16} className="mr-2" />}
            {state === 'saved' ? 'Saved' : 'Save details'}
          </Button>
          <span className="flex items-center gap-1.5 text-xs text-gray-500"><UserRound size={14} /> Printed on the cover and the Teacher&rsquo;s Details page.{filledIn.length > 0 && ' Boxes already filled in come from your school account; check them and save.'}</span>
        </div>
      </form>
    </Card>
  );
}

// ───────────────────────────── 8–10 and 11 (iii)–(iv): AI documents ─────────────────────────────

function AiDocuments({ info, documents }: { info: EFileSectionInfo; documents: EFileSummary[] }) {
  const [search, setSearch] = useState('');
  const [klass, setKlass] = useState('');
  const [subject, setSubject] = useState('');
  const tool = featureByKey(info.feature!);
  const classes = useMemo(() => [...new Set(documents.map((d) => d.inputs.className || d.inputs.level).filter(Boolean))].sort(), [documents]);
  const subjects = useMemo(() => [...new Set(documents.map((d) => d.inputs.subject).filter(Boolean))].sort(), [documents]);
  const shown = documents.filter((d) =>
    (!klass || (d.inputs.className || d.inputs.level) === klass)
    && (!subject || d.inputs.subject === subject)
    && (!search.trim() || d.title.toLowerCase().includes(search.trim().toLowerCase())));
  const create = (
    <Link to={`/dashboard/teacher/ai/${tool.slug}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
      <Plus size={16} /> New {tool.label.toLowerCase()}
    </Link>
  );
  if (!documents.length)
    return <Card padded={false}><EmptyState icon={<Sparkles size={22} />} title={`No ${tool.shelf.toLowerCase()} yet`} action={create}>Every {tool.label.toLowerCase()} you generate is filed here automatically.</EmptyState></Card>;
  return (
    <>
      {info.part && (
        <p className="rounded-xl bg-blue-50/70 px-4 py-3 text-sm text-gray-700 ring-1 ring-inset ring-blue-200">
          {info.part === 'questions'
            ? <>Your tests print here as <strong className="font-semibold">question papers only</strong>; their marking keys print under 11 (iv) Marking Keys.</>
            : <>The <strong className="font-semibold">marking key, rubric and specification grid</strong> of each test print here; the questions print under 11 (iii) Question Samples.</>}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_160px_auto]">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <TextInput aria-label={`Search ${tool.shelf.toLowerCase()}`} placeholder="Search by title…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select aria-label="Class" value={klass} onChange={(e) => setKlass(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="">All subjects</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        {create}
      </div>
      {shown.length === 0 ? (
        <Card padded={false}><EmptyState icon={<FileSearch size={22} />} title="No matching documents">Try another search or filter.</EmptyState></Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {shown.map((d) => {
            const Icon = tool.icon;
            return (
              <li key={d.id}>
                <Link to={`/dashboard/teacher/ai/efile/${d.id}`}
                  className="group flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20">
                  <div className="flex items-center justify-between gap-3">
                    <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', tool.tone.icon)}><Icon size={18} /></span>
                    <span className="text-xs text-gray-500">{timeAgo(d.createdAt)}</span>
                  </div>
                  <h3 className="mt-4 line-clamp-2 font-semibold leading-snug text-gray-900 group-hover:text-blue-700">{d.title}</h3>
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-4 text-xs">
                    {(d.inputs.className || d.inputs.level) && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">{d.inputs.className || d.inputs.level}</span>}
                    {d.inputs.subject && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">{d.inputs.subject}</span>}
                    {d.inputs.term && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">{d.inputs.term}</span>}
                    {d.feature === 'lessonPlan' && (d.evaluation
                      ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">Evaluated</span>
                      : <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">To evaluate after teaching</span>)}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// ───────────────────────────── The teacher's own entries ─────────────────────────────

const fmtDate = (iso?: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
/** The first words of an entry that are not table syntax or headings. */
const preview = (md: string) => md.split('\n').map((l) => l.replace(/^#+\s*/, '').replace(/\|/g, ' ').replace(/-{3,}/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · ').slice(0, 140);

function Entries({ info, entries, teacher, heading }: { info: EFileSectionInfo; entries: EFileEntry[]; teacher: string; heading?: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<EFileEntry | 'new' | null>(null);
  const [viewing, setViewing] = useState<EFileEntry | null>(null);
  const pdf = usePdf();
  const name = info.entryName ?? 'entry';
  const remove = async (e: EFileEntry) => {
    if (!window.confirm(`Delete "${e.title}" from your eFile? This cannot be undone.`)) return;
    await teacherAi.efileDeleteEntry(e.id);
    queryClient.setQueryData<EFileMeta>(['efile-file'], (m) => (m ? { ...m, entries: m.entries.filter((x) => x.id !== e.id) } : m));
  };
  const add = (
    <Button type="button" onClick={() => setEditing('new')} className="h-10 rounded-xl bg-blue-600 font-semibold hover:bg-blue-700"><Plus size={16} className="mr-2" /> Add {name}</Button>
  );
  return (
    <>
      {heading && <h3 className="pt-2 text-sm font-semibold uppercase tracking-wider text-gray-500">{heading}</h3>}
      {pdf.error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">{pdf.error}</p>}
      {entries.length === 0 && heading ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-600"><span>Anything else for this section, typed in.</span>{add}</div>
      ) : entries.length === 0 ? (
        <Card padded={false}><EmptyState icon={<FolderOpen size={22} />} title={`No ${name}s yet`} action={add}>Add one to file it in this section. It starts from a ready table that you fill in.</EmptyState></Card>
      ) : (
        <>
          <div className="flex justify-end">{add}</div>
          <ul className="space-y-3">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900">{e.title}</h3>
                  <p className="mt-0.5 text-xs text-gray-500">{e.date ? fmtDate(e.date) : 'No date'} · updated {timeAgo(e.updatedAt)}</p>
                  <p className="mt-1 line-clamp-1 text-sm text-gray-600">{preview(e.content)}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <Button size="sm" variant="ghost" className="h-9 rounded-xl" onClick={() => setViewing(e)}><Eye size={16} className="mr-1.5" /> View</Button>
                  <Button size="sm" variant="ghost" className="h-9 rounded-xl" onClick={() => setEditing(e)}><Pencil size={16} className="mr-1.5" /> Edit</Button>
                  <PdfButton label="PDF" busy={pdf.busy === e.id} onClick={() => pdf.run(e.id, async () => (await pdfModule()).downloadEntryPdf(e, teacher))} />
                  <Button size="sm" variant="ghost" onClick={() => remove(e).catch((err) => window.alert((err as Error).message))} className="h-9 rounded-xl text-red-700 hover:bg-red-50 hover:text-red-800" aria-label={`Delete ${e.title}`}><Trash2 size={16} /></Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {editing && <EntryDialog info={info} entry={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {viewing && (
        <Dialog open onOpenChange={(o) => { if (!o) setViewing(null); }}>
          <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto rounded-2xl">
            <DialogHeader><DialogTitle>{viewing.title}</DialogTitle><DialogDescription>{viewing.date ? fmtDate(viewing.date) : info.title}</DialogDescription></DialogHeader>
            <Paper source={viewing.content} />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** Markdown shown the way it prints (the document paper's styles). */
function Paper({ source }: { source: string }) {
  return <div className="doc-paper rounded-xl border border-gray-200 bg-white p-4"><style>{DOC_CSS}</style><Markdown source={source} /></div>;
}

function EntryDialog({ info, entry, onClose }: { info: EFileSectionInfo; entry: EFileEntry | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const name = info.entryName ?? 'entry';
  const [title, setTitle] = useState(entry?.title ?? '');
  const [date, setDate] = useState(entry?.date ?? new Date().toISOString().slice(0, 10));
  const [content, setContent] = useState(entry?.content ?? info.template ?? '');
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (!title.trim()) { setError('Give it a title.'); return; }
    setBusy(true); setError('');
    try {
      const saved = entry
        ? await teacherAi.efileUpdateEntry(entry.id, { title: title.trim(), date, content })
        : await teacherAi.efileAddEntry({ section: info.id, title: title.trim(), date, content });
      queryClient.setQueryData<EFileMeta>(['efile-file'], (m) => (m ? { ...m, entries: [...m.entries.filter((x) => x.id !== saved.id), saved] } : m));
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>{entry ? `Edit ${name}` : `Add ${name}`}</DialogTitle>
          <DialogDescription>{info.label}: {info.title}. Fill in the table: keep the | between columns; add rows by copying a line.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
            <Field label="Title" htmlFor="entry-title"><TextInput id="entry-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={`e.g. ${info.id === 'miscellaneous' ? 'TGM: Assessment for learning' : info.id === 'timetable' ? 'Personal timetable, Term 3' : info.title}`} /></Field>
            <Field label="Date" htmlFor="entry-date"><TextInput id="entry-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
          <div className="inline-flex gap-1 rounded-xl bg-gray-100 p-1" role="tablist">
            {(['write', 'preview'] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={cn('h-8 rounded-lg px-3 text-sm font-medium', tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600')}>
                {t === 'write' ? 'Write' : 'Preview'}
              </button>
            ))}
          </div>
          {tab === 'write'
            ? <TextArea aria-label="Content" value={content} onChange={(e) => setContent(e.target.value)} rows={14} className="font-mono text-[13px]" maxLength={60000} />
            : <Paper source={content} />}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy} className="h-10 rounded-xl">Cancel</Button>
            <Button type="submit" disabled={busy} className="h-10 rounded-xl bg-blue-600 font-semibold hover:bg-blue-700">
              {busy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────── From the school system: timetable, registers, marks ─────────────

function SystemRecords({ note, records, loading }: { note: string; records: SystemRecord[]; loading: boolean }) {
  const [open, setOpen] = useState<string | null>(records.length === 1 ? records[0].key : null);
  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-xl bg-emerald-50/70 px-4 py-3 text-sm text-gray-700 ring-1 ring-inset ring-emerald-200">
        <Database size={16} className="mt-0.5 shrink-0 text-emerald-700" /><span>{note} It is always up to date and prints in the PDF.</span>
      </p>
      {loading && !records.length ? <Card><Skeleton className="h-4 w-1/2" /><Skeleton className="mt-3 h-24 w-full" /></Card> : (
        <ul className="space-y-2">
          {records.map((r) => (
            <li key={r.key} className="rounded-2xl border border-gray-200 bg-white">
              <button type="button" onClick={() => setOpen(open === r.key ? null : r.key)} aria-expanded={open === r.key}
                className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Database size={15} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-gray-900">{r.title}</span>
                  <span className="block text-xs text-gray-500">{r.details.filter(([k]) => k !== 'Teacher').map(([, v]) => v).filter(Boolean).join(' · ')}</span>
                </span>
                <Eye size={16} className="text-gray-400" />
              </button>
              {open === r.key && <div className="overflow-x-auto border-t border-gray-100 p-3"><Paper source={r.markdown} /></div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ───────────── 11 (v) Scripts Samples: highest, average, lowest of each assessment ─────────────

const slotLabel = (s?: ScriptSlot) => SCRIPT_SLOTS.find((x) => x.slot === s)?.label ?? '';

function Scripts({ documents, file, marks }: { documents: EFileSummary[]; file: EFileMeta; marks: ClassResults[] }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState<{ assessment?: string; slot?: ScriptSlot } | null>(null);
  const scripts = file.scans.filter((x) => x.section === 'scriptSamples');
  // Scripts come from assessments only: the AI ones and the teacher's own papers in 11 (iii).
  const choices: AssessmentChoice[] = [
    ...documents.filter((d) => d.feature === 'assessment').map((d) => {
      const exam = examTypeOf(d.inputs.kind ?? '');
      const klass = marks.find((m) => m.className === (d.inputs.className || d.inputs.level) && m.subject.toLowerCase() === (d.inputs.subject ?? '').toLowerCase());
      return { id: d.id, title: d.title, outOf: Number(d.inputs.marks) || undefined, suggest: exam && klass ? scriptSuggestions(klass.results, exam) : undefined };
    }),
    ...file.scans.filter((x) => x.section === 'questionSamples').map((x) => ({ title: x.title, outOf: x.outOf })),
    ...file.entries.filter((e) => e.section === 'questionSamples').map((e) => ({ title: e.title })),
  ];
  const scriptKey = (s: EFileScan) => s.assessmentId ?? s.title;
  const withScripts = choices.filter((c) => scripts.some((s) => scriptKey(s) === (c.id ?? c.title)));
  const shown = [...withScripts, ...choices.filter((c) => !withScripts.includes(c)).slice(0, Math.max(0, 3 - withScripts.length))];
  const remove = async (s: EFileScan) => {
    if (!window.confirm(`Remove the ${slotLabel(s.slot).toLowerCase()} script of ${s.learner}?`)) return;
    await teacherAi.efileDeleteScan(s.id);
    queryClient.setQueryData<EFileMeta>(['efile-file'], (m) => (m ? { ...m, scans: m.scans.filter((x) => x.id !== s.id) } : m));
  };
  if (!choices.length)
    return <Card padded={false}><EmptyState icon={<Camera size={22} />} title="No assessments yet">Marked scripts are kept for an assessment. Generate a test, or add your own question paper under 11 (iii), then scan its scripts here.</EmptyState></Card>;
  return (
    <>
      <div className="flex justify-end">
        <Button type="button" onClick={() => setAdding({})} className="h-10 rounded-xl bg-blue-600 font-semibold hover:bg-blue-700"><Camera size={16} className="mr-2" /> Scan a marked script</Button>
      </div>
      <ul className="space-y-3">
        {shown.map((c) => {
          const key = c.id ?? c.title;
          return (
            <li key={key} className="rounded-2xl border border-gray-200 bg-white p-4">
              <h3 className="font-semibold text-gray-900">{c.title}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {SCRIPT_SLOTS.map(({ slot, label }) => {
                  const s = scripts.find((x) => scriptKey(x) === key && x.slot === slot);
                  const hint = c.suggest?.[slot];
                  return s ? (
                    <div key={slot} className="flex gap-3 rounded-xl bg-gray-50 p-2.5 ring-1 ring-inset ring-gray-200">
                      <ScanThumb id={s.id} page={1} alt={`${label}: ${s.learner}`} className="h-24 w-[4.5rem] shrink-0 rounded-md border border-gray-200 object-cover" />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">{label}</p>
                        <p className="mt-0.5 font-medium text-gray-900">{s.learner}</p>
                        <p className="text-gray-600">{s.mark !== undefined ? `${s.mark}${s.outOf ? ` / ${s.outOf}` : ''}` : ''} · {s.pages} page{s.pages === 1 ? '' : 's'}</p>
                        <div className="mt-1 flex gap-1">
                          <button type="button" className="text-xs font-medium text-blue-700 hover:underline" onClick={() => setAdding({ assessment: key, slot })}>Replace</button>
                          <span className="text-gray-300">·</span>
                          <button type="button" className="text-xs font-medium text-red-700 hover:underline" onClick={() => remove(s).catch((err) => window.alert((err as Error).message))}>Remove</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button key={slot} type="button" onClick={() => setAdding({ assessment: key, slot })}
                      className="flex flex-col items-start rounded-xl border border-dashed border-gray-300 p-2.5 text-left text-sm hover:border-blue-400 hover:bg-blue-50/40">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</span>
                      <span className="mt-1 flex items-center gap-1.5 font-medium text-blue-700"><Camera size={14} /> Scan script</span>
                      {hint && <span className="mt-1 text-xs text-gray-600">From Results: {hint.learner} ({hint.mark}/{hint.outOf})</span>}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
      {adding && <ScanDialog kind="script" assessments={choices} initial={adding} onClose={() => setAdding(null)} />}
    </>
  );
}

// ───────────── 11 (iii): the teacher's own question papers, scanned ─────────────

function OwnPapers({ scans }: { scans: EFileScan[] }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const remove = async (s: EFileScan) => {
    if (!window.confirm(`Remove "${s.title}"?`)) return;
    await teacherAi.efileDeleteScan(s.id);
    queryClient.setQueryData<EFileMeta>(['efile-file'], (m) => (m ? { ...m, scans: m.scans.filter((x) => x.id !== s.id) } : m));
  };
  return (
    <>
      <div className="flex items-center justify-between gap-3 pt-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Your own question papers</h3>
        <Button type="button" variant="outline" onClick={() => setAdding(true)} className="h-9 rounded-xl"><Camera size={16} className="mr-2" /> Scan a paper</Button>
      </div>
      {scans.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {scans.map((s) => (
            <li key={s.id} className="flex gap-3 rounded-2xl border border-gray-200 bg-white p-3">
              <ScanThumb id={s.id} page={1} alt={s.title} className="h-24 w-[4.5rem] shrink-0 rounded-md border border-gray-200 object-cover" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-gray-900">{s.title}</p>
                <p className="text-gray-600">{s.date ? fmtDate(s.date) : ''}{s.outOf ? ` · ${s.outOf} marks` : ''} · {s.pages} page{s.pages === 1 ? '' : 's'}</p>
                <button type="button" className="mt-1 text-xs font-medium text-red-700 hover:underline" onClick={() => remove(s).catch((err) => window.alert((err as Error).message))}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {adding && <ScanDialog kind="paper" assessments={[]} onClose={() => setAdding(false)} />}
    </>
  );
}

export default function EFile() {
  return (
    <DashboardLayout activeTab="ai-tools">
      <div className="mx-auto max-w-7xl">
        <Link to="/dashboard/teacher/ai" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
          <ArrowLeft size={16} /> AI Tools
        </Link>
        <PageHeader
          icon={<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200"><FolderOpen size={24} /></span>}
          title="eFile" description="Your Teacher’s File: every section the Ministry expects, with your AI documents filed in their places."
          actions={<Link to="/dashboard/teacher/ai" className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"><Plus size={16} /> New document</Link>} />
        <AiGate feature="eFile">{() => <TeacherFile />}</AiGate>
      </div>
    </DashboardLayout>
  );
}
