// @/components/superadmin/CurriculumTab.tsx — the curriculum library: upload
// PDFs with their subject, the class levels they cover and their type, and
// manage what is stored. These are the documents the AI draws on.
//
// Subjects are the school's standard names (SCHOOL_SUBJECTS, the same list
// Results Entry uses). Levels are chips: tap one form for a single-form
// document, several for a range ("Form 1–4" selects all four at once).
//
// Each upload is indexed straight away on the AI server (text read, cut
// into passages, embedded, saved in ChromaDB); the status follows it.
// Scanned PDFs cannot be indexed yet.
import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { FileText, FileUp, Library, Loader2, Pencil, RefreshCw, Search, Trash2, UploadCloud, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardTitle, ChipGroup, EmptyState, Field, Pill, Select, TextInput } from '@/components/ai/ui';
import { superAdminApi } from '@/services/aiApi';
import { SCHOOL_SUBJECTS, normalizeSubjectName } from '@/services/resultsService';
import { DOC_TYPES, DOC_TYPE_LABELS, LEVELS, describeLevels, type CurriculumDocument, type DocType } from '@/types/ai';
import { cn } from '@/lib/utils';
import { useOverviewAction } from './useOverviewAction';

const STATUS: Record<CurriculumDocument['status'], { label: string; tone: 'gray' | 'blue' | 'green' | 'red' }> = {
  stored: { label: 'Not indexed', tone: 'gray' },
  indexing: { label: 'Indexing', tone: 'blue' },
  indexed: { label: 'Ready', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
};
const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
const OTHER = '__other__';
const FORMS = LEVELS.filter((l) => l.startsWith('Form'));
const GRADES = LEVELS.filter((l) => l.startsWith('Grade'));
const ordered = (levels: string[]) => LEVELS.filter((l) => levels.includes(l));

/** The subject drop-down: the school's subjects, plus "Other" for anything not on the list. */
export function SubjectField({ value, onChange, id }: { value: string; onChange: (subject: string) => void; id: string }) {
  const known = SCHOOL_SUBJECTS.includes(value);
  const [other, setOther] = useState(!known && value !== '');
  return (
    <Field label="Subject" htmlFor={id}>
      <Select id={id} required value={other ? OTHER : value}
        onChange={(e) => { if (e.target.value === OTHER) { setOther(true); onChange(''); } else { setOther(false); onChange(e.target.value); } }}>
        <option value="" disabled>Choose a subject</option>
        {SCHOOL_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
        <option value={OTHER}>Other (type it)…</option>
      </Select>
      {other && <TextInput aria-label="Other subject" required maxLength={80} className="mt-2" placeholder="Subject name" value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

/** Class level chips: Forms and Grades, with quick "all" buttons. */
export function LevelPicker({ value, onChange }: { value: string[]; onChange: (levels: string[]) => void }) {
  const toggle = (l: string) => onChange(ordered(value.includes(l) ? value.filter((x) => x !== l) : [...value, l]));
  const quick = (set: readonly string[], label: string) => (
    <button type="button" onClick={() => onChange(ordered([...set]))} className="text-xs font-semibold text-blue-700 hover:text-blue-800">{label}</button>
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-gray-800">Class levels</span>
        <span className="flex gap-3">{quick(FORMS, 'Form 1–4')}{quick(GRADES.slice(2), 'Grade 10–12')}{value.length > 0 && <button type="button" onClick={() => onChange([])} className="text-xs font-medium text-gray-500 hover:text-gray-700">Clear</button>}</span>
      </div>
      <ChipGroup label="Forms" value={value} onToggle={toggle} options={FORMS.map((l) => ({ value: l, label: l }))} />
      <ChipGroup label="Grades" value={value} onToggle={toggle} options={GRADES.map((l) => ({ value: l, label: l }))} />
      <p className="text-xs text-gray-500">{value.length ? <>Covers <strong className="font-semibold text-gray-700">{describeLevels(value)}</strong></> : 'Tap one level for a single-form document, or several for a range.'}</p>
    </div>
  );
}

/** Editing a document's subject, levels and type (saving indexes it again). */
function EditPanel({ d, onClose, run, busy }: { d: CurriculumDocument; onClose: () => void; run: ReturnType<typeof useOverviewAction>['run']; busy: boolean }) {
  const [subject, setSubject] = useState(d.subject);
  const [levels, setLevels] = useState<string[]>(d.levels);
  const [docType, setDocType] = useState<DocType>(d.docType);
  const save = async () => {
    const done = await run(() => superAdminApi.relabelCurriculum(d.id, { subject: normalizeSubjectName(subject), levels, docType }));
    if (done) onClose();
  };
  return (
    <div className="space-y-5 rounded-2xl bg-blue-50/50 p-4 ring-1 ring-inset ring-blue-100 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <SubjectField id={`edit-subject-${d.id}`} value={subject} onChange={setSubject} />
        <Field label="Type" htmlFor={`edit-type-${d.id}`}>
          <Select id={`edit-type-${d.id}`} value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
            {DOC_TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
          </Select>
        </Field>
      </div>
      <LevelPicker value={levels} onChange={setLevels} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-xs text-gray-500">Saving indexes the document again.</span>
        <Button variant="ghost" onClick={onClose} className="h-9 rounded-xl">Cancel</Button>
        <Button disabled={busy || !subject.trim() || levels.length === 0} onClick={save} className="h-9 rounded-xl bg-blue-600 hover:bg-blue-700">Save changes</Button>
      </div>
    </div>
  );
}

function RowActions({ d, busy, run, onEdit }: { d: CurriculumDocument; busy: boolean; run: ReturnType<typeof useOverviewAction>['run']; onEdit: () => void }) {
  const remove = () => {
    if (!window.confirm(`Remove "${d.name}" from the curriculum library?`)) return;
    void run(() => superAdminApi.deleteCurriculum(d.id));
  };
  const icon = 'flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 disabled:opacity-40';
  return (
    <div className="flex items-center justify-end gap-0.5">
      {(d.status === 'failed' || d.status === 'stored') && (
        <button type="button" aria-label={`Index ${d.name} again`} title="Index again" disabled={busy} onClick={() => void run(() => superAdminApi.reindexCurriculum(d.id))} className={cn(icon, 'hover:text-blue-700')}><RefreshCw size={16} /></button>
      )}
      <button type="button" aria-label={`Edit ${d.name}`} title="Edit subject, levels or type" disabled={busy || d.status === 'indexing'} onClick={onEdit} className={cn(icon, 'hover:text-blue-700')}><Pencil size={16} /></button>
      <button type="button" aria-label={`Remove ${d.name}`} title="Remove" disabled={busy} onClick={remove} className={cn(icon, 'hover:text-red-600')}><Trash2 size={16} /></button>
    </div>
  );
}

function StatusCell({ d }: { d: CurriculumDocument }) {
  const s = STATUS[d.status];
  return (
    <div>
      <Pill tone={s.tone}>{d.status === 'indexing' && <Loader2 size={12} className="animate-spin" />}{s.label}</Pill>
      {d.status === 'indexed' && <p className="mt-1 text-xs text-gray-500">{d.pages} pages · {d.chunks} passages</p>}
      {d.error && <p className="mt-1 max-w-xs text-xs text-red-600">{d.error}</p>}
    </div>
  );
}

export function CurriculumTab({ documents }: { documents: CurriculumDocument[] }) {
  const { run, busy, error } = useOverviewAction();
  const fileInput = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState('');
  const [levels, setLevels] = useState<string[]>([]);
  const [docType, setDocType] = useState<DocType>('syllabus');
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<{ name: string; reason: string }[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');

  const addFiles = (list: FileList | File[]) => {
    const pdfs = Array.from(list).filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    setFiles((current) => [...current, ...pdfs.filter((p) => !current.some((c) => c.name === p.name && c.size === p.size))]);
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); };

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    setRejected([]);
    // An "Other" subject is put in the school's standard spelling, like Results Entry does.
    const result = await run(() => superAdminApi.uploadCurriculum(files, { subject: normalizeSubjectName(subject), levels, docType }));
    if (!result) return;
    setRejected(result.rejected);
    setFiles([]);
    if (fileInput.current) fileInput.current.value = '';
  };
  const reindexAll = () => {
    if (!window.confirm('Index every document again? Do this after changing the embedding model. Each document is sent to NVIDIA again.')) return;
    void run(() => superAdminApi.reindexAll());
  };

  const subjects = [...new Set(documents.map((d) => d.subject))].sort();
  const shown = documents.filter((d) => (!subjectFilter || d.subject === subjectFilter) && (!search.trim() || d.name.toLowerCase().includes(search.trim().toLowerCase())));
  const canUpload = files.length > 0 && subject.trim() !== '' && levels.length > 0;

  return (
    <div className="space-y-6">
      <form onSubmit={upload}>
      <Card className="space-y-6">
        <CardTitle title="Add curriculum documents" hint="All files in one upload get the same subject, levels and type." />
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
          className={cn('relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition',
            dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50/60 hover:border-gray-400')}>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm ring-1 ring-gray-200"><UploadCloud size={24} /></span>
          <p className="mt-3 text-sm font-medium text-gray-900">Drop PDF files here, or <label htmlFor="sa-files" className="cursor-pointer text-blue-700 underline-offset-2 hover:underline">browse</label></p>
          <p className="mt-1 text-xs text-gray-500">Typed PDFs only (scanned pages can’t be read yet) · up to 25 MB each</p>
          <input id="sa-files" ref={fileInput} type="file" accept="application/pdf,.pdf" multiple aria-label="PDF files" className="sr-only"
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
        </div>
        {files.length > 0 && (
          <ul className="space-y-2">
            {files.map((f) => (
              <li key={`${f.name}-${f.size}`} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm">
                <FileText size={16} className="shrink-0 text-red-500" />
                <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{f.name}</span>
                <span className="shrink-0 text-xs text-gray-500">{formatSize(f.size)}</span>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((y) => y !== f))} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={16} /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-5 md:grid-cols-2">
          <SubjectField id="sa-subject" value={subject} onChange={setSubject} />
          <Field label="Type" htmlFor="sa-type">
            <Select id="sa-type" value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
              {DOC_TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
            </Select>
          </Field>
        </div>
        <LevelPicker value={levels} onChange={setLevels} />
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</p>}
        {rejected.length > 0 && (
          <ul role="alert" className="list-disc space-y-1 rounded-xl bg-red-50 py-3 pl-9 pr-4 text-sm text-red-700 ring-1 ring-inset ring-red-200">
            {rejected.map((r) => <li key={r.name}>{r.name}: {r.reason}</li>)}
          </ul>
        )}
        <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-600">
            {canUpload ? <>Teachers of <strong className="font-semibold text-gray-900">{subject}</strong> in <strong className="font-semibold text-gray-900">{describeLevels(levels)}</strong> will use {files.length === 1 ? 'this document' : `these ${files.length} documents`}.</> : 'Choose files, a subject and at least one class level.'}
          </p>
          <Button type="submit" disabled={busy || !canUpload} className="h-11 rounded-xl bg-blue-600 px-5 font-semibold hover:bg-blue-700">
            {busy ? <Loader2 size={18} className="mr-2 animate-spin" /> : <FileUp size={18} className="mr-2" />} Upload{files.length > 1 ? ` ${files.length} files` : ''}
          </Button>
        </div>
      </Card>
      </form>

      <Card padded={false}>
        <div className="flex flex-col gap-3 p-5 sm:p-6 md:flex-row md:items-center">
          <div className="mr-auto">
            <h2 className="text-base font-semibold text-gray-900">Library</h2>
            <p className="text-sm text-gray-500">{documents.length} document{documents.length === 1 ? '' : 's'}</p>
          </div>
          {documents.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <TextInput aria-label="Search the library" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 pl-10" />
              </div>
              <Select aria-label="Filter by subject" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className="h-10">
                <option value="">All subjects</option>
                {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
              <Button variant="outline" disabled={busy} onClick={reindexAll} className="h-10 rounded-xl"><RefreshCw size={16} className="mr-2" /> Re-index all</Button>
            </div>
          )}
        </div>

        {documents.length === 0 ? (
          <EmptyState icon={<Library size={22} />} title="The library is empty">Start with the syllabus for each subject.</EmptyState>
        ) : (
          <>
            {/* Table (tablets and up) */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="border-y border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-6 py-3">Document</th><th className="px-3 py-3">Subject</th><th className="px-3 py-3">Levels</th>
                    <th className="px-3 py-3">Type</th><th className="px-3 py-3">Status</th><th className="px-6 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shown.map((d) => editing === d.id ? (
                    <tr key={d.id}><td colSpan={6} className="px-6 py-4"><p className="mb-3 text-sm font-medium text-gray-900">{d.name}</p><EditPanel d={d} onClose={() => setEditing(null)} run={run} busy={busy} /></td></tr>
                  ) : (
                    <tr key={d.id} className="transition hover:bg-gray-50/70">
                      <td className="max-w-[18rem] px-6 py-3.5">
                        <button type="button" onClick={() => void run(() => superAdminApi.openCurriculum(d.id))} className="flex items-center gap-2.5 text-left font-medium text-gray-900 hover:text-blue-700">
                          <FileText size={16} className="shrink-0 text-red-500" /> <span className="truncate">{d.name}</span>
                        </button>
                        <span className="ml-[26px] text-xs text-gray-500">{formatSize(d.size)} · {new Date(d.uploadedAt).toLocaleDateString()}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-gray-900 [overflow-wrap:normal]">{d.subject}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-gray-700">{describeLevels(d.levels)}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-gray-700 [overflow-wrap:normal]">{DOC_TYPE_LABELS[d.docType]}</td>
                      <td className="px-3 py-3.5"><StatusCell d={d} /></td>
                      <td className="px-6 py-3.5"><RowActions d={d} busy={busy} run={run} onEdit={() => setEditing(d.id)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Cards (phones) */}
            <ul className="divide-y divide-gray-100 border-t border-gray-200 md:hidden">
              {shown.map((d) => (
                <li key={d.id} className="p-4">
                  {editing === d.id ? (
                    <><p className="mb-3 text-sm font-medium text-gray-900">{d.name}</p><EditPanel d={d} onClose={() => setEditing(null)} run={run} busy={busy} /></>
                  ) : (
                    <div className="flex gap-3">
                      <FileText size={18} className="mt-0.5 shrink-0 text-red-500" />
                      <div className="min-w-0 flex-1">
                        <button type="button" onClick={() => void run(() => superAdminApi.openCurriculum(d.id))} className="block max-w-full truncate text-left text-sm font-medium text-gray-900">{d.name}</button>
                        <p className="mt-0.5 text-xs text-gray-500">{d.subject} · {describeLevels(d.levels)} · {DOC_TYPE_LABELS[d.docType]}</p>
                        <div className="mt-2 flex items-start justify-between gap-2"><StatusCell d={d} /><RowActions d={d} busy={busy} run={run} onEdit={() => setEditing(d.id)} /></div>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {shown.length === 0 && <EmptyState title="No matching documents">Try another search or subject.</EmptyState>}
          </>
        )}
      </Card>
    </div>
  );
}
