// @/components/superadmin/SyllabusTab.tsx — curriculum maps: each CDC syllabus
// read into its topics, sub-topics and specific competences (with their
// learning activities and expected standards).
//
// How it flows:
//   1. a PDF uploaded as type "Syllabus" is read automatically on the AI
//      server (ai-server/src/services/curriculum/SyllabusParser.ts);
//      "Read syllabus" here does it again by hand;
//   2. the map arrives as a draft: check it here and correct any wording;
//   3. Approve it. Only approved maps reach teachers: they fill the topic and
//      sub-topic dropdowns and the assessment topic checklist, and their exact
//      words are given to the AI with every document.
//
// Teaching modules (the CDC "Teaching Module" PDFs, uploaded as Teacher's
// guide or Textbook) are listed here too. They are read automatically when
// indexed (ai-server/src/services/curriculum/ModuleParser.ts) into their
// learning activities, methods, materials, how-to-conduct steps, hooks, key
// terms and CBC rubrics, which the lesson plan, scheme of work and
// assessment tools follow. A module can be switched off or read again.
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, BookOpenCheck, CheckCircle2, ChevronDown, FileText, ListTree, Loader2, RefreshCw, Save,
  Trash2, Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardTitle, ChipGroup, EmptyState, Pill, Skeleton, TextArea, TextInput } from '@/components/ai/ui';
import { superAdminApi } from '@/services/aiApi';
import type { CurriculumDocument, CurriculumMapSummary, MapTopic, TeachingModuleSummary } from '@/types/ai';
import { cn } from '@/lib/utils';
import { useOverviewAction } from './useOverviewAction';

const formsLabel = (forms: number[]) =>
  forms.length === 0 ? '—' : forms.length > 1 && forms.every((f, i) => i === 0 || f === forms[i - 1] + 1)
    ? `Form ${forms[0]}–${forms[forms.length - 1]}` : forms.map((f) => `Form ${f}`).join(', ');

const errorBox = (message: string) =>
  message ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">{message}</p> : null;

export function SyllabusTab({ maps, documents, modules = [] }: { maps: CurriculumMapSummary[]; documents: CurriculumDocument[]; modules?: TeachingModuleSummary[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const { run, busy, error } = useOverviewAction();
  const current = maps.find((m) => m.id === open);
  if (current) return <MapReview summary={current} onBack={() => setOpen(null)} />;

  const unread = documents.filter((d) => d.docType === 'syllabus' && !maps.some((m) => m.documentId === d.id));

  return (
    <div className="space-y-6">
      <Card className="flex gap-4 bg-gradient-to-br from-white to-blue-50/60">
        <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white sm:flex"><ListTree size={22} /></span>
        <div className="text-sm text-gray-700">
          <p className="font-semibold text-gray-900">Every syllabus becomes a curriculum map.</p>
          <p className="mt-1">The AI server reads the topics, sub-topics and specific competences straight from the CDC syllabus tables. Check each map, correct anything that was misread, then approve it. Teachers then pick topics from dropdowns instead of typing them, and the AI copies the syllabus wording exactly.</p>
        </div>
      </Card>

      {errorBox(error)}

      <Card padded={false}>
        <div className="p-5 sm:p-6"><CardTitle title="Curriculum maps" hint={`${maps.length} map${maps.length === 1 ? '' : 's'} · only approved maps reach teachers`} /></div>
        {maps.length === 0 ? (
          <EmptyState icon={<ListTree size={22} />} title="No curriculum maps yet">Upload a syllabus in Curriculum with the type “Syllabus”. It is read into a map automatically.</EmptyState>
        ) : (
          <ul className="divide-y divide-gray-100 border-t border-gray-200">
            {maps.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => setOpen(m.id)} className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-gray-50 sm:px-6">
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', m.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
                    {m.status === 'approved' ? <BookOpenCheck size={20} /> : <ListTree size={20} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">{m.subject}</span>
                      <Pill tone={m.status === 'approved' ? 'green' : 'amber'}>{m.status === 'approved' ? 'Approved' : 'Draft · not visible to teachers'}</Pill>
                      {m.warnings > 0 && <Pill tone="red"><AlertTriangle size={12} /> {m.warnings} to check</Pill>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-gray-500">{m.documentName}</span>
                    <span className="mt-1 block text-xs text-gray-600">{formsLabel(m.forms)} · {m.topics} topics · {m.subTopics} sub-topics · {m.competences} competences</span>
                  </span>
                  <span className="hidden text-sm font-semibold text-blue-700 sm:block">Review</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <TeachingModules modules={modules} documents={documents} />

      {unread.length > 0 && (
        <Card padded={false}>
          <div className="p-5 sm:p-6"><CardTitle title="Syllabi without a map" hint="Being read now, or no syllabus table was found. Try reading again." /></div>
          <ul className="divide-y divide-gray-100 border-t border-gray-200">
            {unread.map((d) => (
              <li key={d.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                <FileText size={18} className="hidden shrink-0 text-red-500 sm:block" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{d.name}</p>
                  <p className="text-xs text-gray-500">{d.subject}</p>
                </div>
                <Button variant="outline" disabled={busy} onClick={() => void run(() => superAdminApi.readSyllabusMap(d.id))} className="h-10 rounded-xl">
                  {busy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />} Read syllabus
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** Lines of a text box ↔ a list (empty lines dropped). */
const toLines = (list: string[]) => list.join('\n');
const fromLines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);

function MapReview({ summary, onBack }: { summary: CurriculumMapSummary; onBack: () => void }) {
  const queryClient = useQueryClient();
  const key = ['superadmin-map', summary.id];
  const { data: map, isLoading, error: loadError } = useQuery({ queryKey: key, queryFn: () => superAdminApi.getMap(summary.id) });
  const { run, busy, error } = useOverviewAction();
  const [topics, setTopics] = useState<MapTopic[] | null>(null);
  const [form, setForm] = useState<number | null>(null);

  useEffect(() => { if (map) setTopics(structuredClone(map.topics)); }, [map]);
  const forms = useMemo(() => [...new Set((topics ?? []).map((t) => t.form))].sort((a, b) => a - b), [topics]);
  useEffect(() => { if (form === null && forms.length) setForm(forms[0]); }, [forms, form]);

  const dirty = map && topics ? JSON.stringify(map.topics) !== JSON.stringify(topics) : false;
  const edit = (change: (draft: MapTopic[]) => void) =>
    setTopics((current) => { if (!current) return current; const next = structuredClone(current); change(next); return next; });

  // Every change goes to the server and the fresh map replaces the one shown.
  const apply = async (action: () => Promise<unknown>) => {
    const result = await run(action);
    if (result !== undefined) await queryClient.invalidateQueries({ queryKey: key });
    return result;
  };
  // Blank lines left in the text boxes are dropped before saving.
  const tidy = (list: MapTopic[]) => list.map((t) => ({
    ...t,
    subTopics: t.subTopics.map((s) => ({
      ...s,
      competences: s.competences.map((c) => ({ ...c, activities: fromLines(c.activities.join('\n')), standards: fromLines(c.standards.join('\n')) })),
    })),
  }));
  const save = () => apply(() => superAdminApi.saveMap(summary.id, tidy(topics!)));
  const approve = async (approved: boolean) => {
    if (approved && dirty && (await save()) === undefined) return;
    await apply(() => superAdminApi.approveMap(summary.id, approved));
  };
  const reread = () => {
    if (!window.confirm('Read the syllabus PDF again? Your corrections are replaced and the map goes back to draft.')) return;
    void apply(() => superAdminApi.readSyllabusMap(summary.documentId));
  };
  const remove = async () => {
    if (!window.confirm(`Delete the ${summary.subject} curriculum map? The syllabus document stays in the library.`)) return;
    const deleted = await run(async () => { await superAdminApi.deleteMap(summary.id); return true; });
    if (deleted) onBack();
  };

  const approved = map?.status === 'approved';
  const shown = (topics ?? []).map((t, i) => ({ t, i })).filter(({ t }) => t.form === form);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"><ArrowLeft size={16} /> All maps</button>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900">{summary.subject}</h2>
            <Pill tone={approved ? 'green' : 'amber'}>{approved ? 'Approved' : 'Draft'}</Pill>
            {dirty && <Pill tone="blue">Unsaved changes</Pill>}
          </div>
          <p className="mt-1 truncate text-sm text-gray-500">{summary.documentName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy || !dirty} onClick={() => void save()} className="h-10 rounded-xl"><Save size={16} className="mr-2" /> Save</Button>
          {approved ? (
            <Button variant="outline" disabled={busy} onClick={() => void approve(false)} className="h-10 rounded-xl"><Undo2 size={16} className="mr-2" /> Back to draft</Button>
          ) : (
            <Button disabled={busy || !topics} onClick={() => void approve(true)} className="h-10 rounded-xl bg-emerald-600 font-semibold hover:bg-emerald-700"><CheckCircle2 size={16} className="mr-2" /> {dirty ? 'Save and approve' : 'Approve'}</Button>
          )}
          <Button variant="ghost" disabled={busy} onClick={reread} className="h-10 rounded-xl" title="Read the PDF again"><RefreshCw size={16} /><span className="sr-only">Read the PDF again</span></Button>
          <Button variant="ghost" disabled={busy} onClick={() => void remove()} className="h-10 rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700" title="Delete map"><Trash2 size={16} /><span className="sr-only">Delete map</span></Button>
        </div>
      </div>

      {errorBox(error || (loadError as Error | null)?.message || '')}

      {map && map.warnings.length > 0 && (
        <div className="rounded-2xl bg-amber-50 px-4 py-3.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} /> Check these before approving</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-6">{map.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}

      {isLoading || !topics ? (
        <Card><Skeleton className="h-6 w-1/3" /><Skeleton className="mt-4 h-24 w-full" /></Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <ChipGroup label="Form" value={form === null ? [] : [String(form)]} onToggle={(v) => setForm(Number(v))}
              options={forms.map((f) => ({ value: String(f), label: `Form ${f}` }))} />
            <span className="text-sm text-gray-500">{shown.length} topics</span>
          </div>

          {shown.map(({ t, i }) => (
            <Card key={t.code} padded={false} className="overflow-hidden">
              <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/70 px-4 py-3 sm:px-5">
                <span className="shrink-0 rounded-lg bg-blue-600 px-2 py-1 text-xs font-bold tabular-nums text-white">{t.code}</span>
                <TextInput aria-label={`Topic ${t.code} name`} value={t.name} onChange={(e) => edit((d) => { d[i].name = e.target.value; })} className="h-10 font-semibold" />
              </div>
              <div className="divide-y divide-gray-100">
                {t.subTopics.map((s, j) => (
                  <div key={s.code} className="space-y-3 px-4 py-4 sm:px-5">
                    <div className="flex items-center gap-3">
                      <span className="shrink-0 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-blue-700 ring-1 ring-inset ring-blue-200">{s.code}</span>
                      <TextInput aria-label={`Sub-topic ${s.code} name`} value={s.name} onChange={(e) => edit((d) => { d[i].subTopics[j].name = e.target.value; })} className="h-10" />
                    </div>
                    {s.competences.map((c, k) => (
                      <details key={c.code} className="group rounded-xl border border-gray-200 bg-white open:shadow-sm sm:ml-12">
                        <summary className="flex cursor-pointer list-none items-start gap-3 px-3.5 py-3 text-sm [&::-webkit-details-marker]:hidden">
                          <span className="mt-0.5 shrink-0 text-xs font-semibold tabular-nums text-gray-500">{c.code}</span>
                          <span className="min-w-0 flex-1 text-gray-900">{c.text || <em className="text-red-600">no text</em>}
                            <span className="mt-0.5 block text-xs text-gray-500">{c.activities.length} activities · {c.standards.length} standard{c.standards.length === 1 ? '' : 's'}{c.page ? ` · page ${c.page}` : ''}</span>
                          </span>
                          <ChevronDown size={16} className="mt-0.5 shrink-0 text-gray-400 transition group-open:rotate-180" />
                        </summary>
                        <div className="space-y-3 border-t border-gray-100 px-3.5 py-3.5">
                          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Specific competence
                            <TextArea value={c.text} onChange={(e) => edit((d) => { d[i].subTopics[j].competences[k].text = e.target.value; })} className="mt-1.5 min-h-[4rem] text-sm font-normal normal-case tracking-normal" />
                          </label>
                          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Learning activities <span className="font-normal normal-case text-gray-400">(one per line)</span>
                            <TextArea value={toLines(c.activities)} onChange={(e) => edit((d) => { d[i].subTopics[j].competences[k].activities = e.target.value.split('\n'); })}
                              onBlur={(e) => edit((d) => { d[i].subTopics[j].competences[k].activities = fromLines(e.target.value); })} className="mt-1.5 text-sm font-normal normal-case tracking-normal" />
                          </label>
                          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Expected standards <span className="font-normal normal-case text-gray-400">(one per line)</span>
                            <TextArea value={toLines(c.standards)} onChange={(e) => edit((d) => { d[i].subTopics[j].competences[k].standards = e.target.value.split('\n'); })}
                              onBlur={(e) => edit((d) => { d[i].subTopics[j].competences[k].standards = fromLines(e.target.value); })} className="mt-1.5 min-h-[4rem] text-sm font-normal normal-case tracking-normal" />
                          </label>
                        </div>
                      </details>
                    ))}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

// ── Teaching modules ────────────────────────────────────────────────────────

function TeachingModules({ modules, documents }: { modules: TeachingModuleSummary[]; documents: CurriculumDocument[] }) {
  const { run, busy, error } = useOverviewAction();
  const [open, setOpen] = useState<string | null>(null);
  // Indexed documents that could be modules but were not read as one.
  const candidates = documents.filter((d) => d.status === 'indexed' && ['teachers_guide', 'textbook', 'other'].includes(d.docType) && !modules.some((m) => m.documentId === d.id));
  return (
    <Card padded={false}>
      <div className="p-5 sm:p-6">
        <CardTitle title="Teaching modules" hint={`${modules.length} module${modules.length === 1 ? '' : 's'} · the Ministry’s activities, methods and rubrics the AI follows`} />
        {errorBox(error)}
      </div>
      {modules.length === 0 ? (
        <EmptyState icon={<BookOpenCheck size={22} />} title="No teaching modules yet">Upload a CDC teaching module in Curriculum with the type “Teacher’s guide”. It is read automatically after indexing.</EmptyState>
      ) : (
        <ul className="divide-y divide-gray-100 border-t border-gray-200">
          {modules.map((m) => (
            <li key={m.id} className="px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">{m.title}</span>
                    <Pill tone={m.active ? 'green' : 'gray'}>{m.active ? 'In use' : 'Switched off'}</Pill>
                    {m.warnings.length > 0 && <Pill tone="amber"><AlertTriangle size={12} /> {m.warnings.length} to check</Pill>}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-gray-500">{m.documentName} · {m.subject}{m.form ? ` · Form ${m.form}` : ''}</p>
                  <p className="mt-1 text-xs text-gray-600">{m.topics.length} topics · {m.activities} learning activities · {m.rubrics} rubrics</p>
                  <button type="button" onClick={() => setOpen(open === m.id ? null : m.id)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800">
                    <ChevronDown size={14} className={cn('transition', open === m.id && 'rotate-180')} /> {open === m.id ? 'Hide' : 'Show'} what was read
                  </button>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" disabled={busy} onClick={() => void run(() => superAdminApi.readTeachingModule(m.documentId))} className="h-9 rounded-xl text-sm">
                    <RefreshCw size={14} className="mr-1.5" /> Read again
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => void run(() => superAdminApi.setModuleActive(m.id, !m.active))} className="h-9 rounded-xl text-sm">
                    {m.active ? 'Switch off' : 'Switch on'}
                  </Button>
                </div>
              </div>
              {open === m.id && (
                <div className="mt-3 space-y-2 rounded-xl bg-gray-50 p-3.5 text-sm">
                  {m.topics.map((t) => (
                    <div key={t.code}>
                      <p className="font-medium text-gray-900"><span className="mr-1.5 tabular-nums text-gray-500">{t.code}</span>{t.name}{t.term && <span className="ml-2 text-xs font-semibold text-indigo-700">Term {t.term}</span>}</p>
                      {t.subTopics.map((s) => <p key={s.code} className="ml-6 text-xs text-gray-600">{s.code} {s.name} · {s.activities} activities</p>)}
                    </div>
                  ))}
                  {m.warnings.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-amber-800">{m.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {candidates.length > 0 && (
        <div className="border-t border-gray-200 px-5 py-4 sm:px-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Other guides and textbooks (not read as a module)</p>
          <ul className="space-y-2">
            {candidates.map((d) => (
              <li key={d.id} className="flex items-center gap-3 text-sm">
                <FileText size={16} className="shrink-0 text-gray-400" />
                <span className="min-w-0 flex-1 truncate text-gray-800">{d.name}</span>
                <Button variant="ghost" disabled={busy} onClick={() => void run(() => superAdminApi.readTeachingModule(d.id))} className="h-8 rounded-lg text-xs text-blue-700">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : 'Read as module'}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
