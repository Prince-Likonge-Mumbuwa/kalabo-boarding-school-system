// @/components/ai/figures/FigureLibraryDialog.tsx — the teacher's diagram
// library, opened from the Assessment form.
//
//   List    the teacher's pictures and the ones other teachers share, for this
//           subject; tick the ones the next test should use.
//   Upload  choose a file or take a photo, drag a box around the diagram to
//           keep, optionally make it pure black and white; the AI server
//           straightens, crops and cleans it.
//   Edit    click on the picture to place letters (A, B, C…) and say what each
//           one marks (these become the answers); "Suggest with AI" fills in
//           the title, description, tags and any letters already printed on it.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, Camera, Check, ImagePlus, Loader2, Pencil, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, TextArea, TextInput } from '@/components/ai/ui';
import { teacherAi } from '@/services/aiApi';
import type { FigureDetails, FigureLabel, LibraryFigure } from '@/types/ai';
import { cn } from '@/lib/utils';

type View = { name: 'list' } | { name: 'upload' } | { name: 'edit'; figure: LibraryFigure; suggest?: boolean };
type Box = { x: number; y: number; w: number; h: number };

/** A library picture as an object URL (it needs the teacher's sign-in to load). */
function useFigureUrl(id: string | null, version = '') {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true, made: string | null = null;
    teacherAi.figureImage(id).then((blob) => { if (live) { made = URL.createObjectURL(blob); setUrl(made); } }).catch(() => live && setUrl(null));
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [id, version]);
  return url;
}

function Thumb({ figure, picked, mine, onPick, onEdit, onDelete }: {
  figure: LibraryFigure; picked: boolean; mine: boolean; onPick: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const url = useFigureUrl(figure.id, figure.updatedAt);
  return (
    <div className={cn('group relative overflow-hidden rounded-xl border bg-white transition', picked ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300')}>
      <button type="button" onClick={onPick} className="block w-full text-left" aria-pressed={picked}>
        <div className="flex h-32 items-center justify-center bg-gray-50">
          {url ? <img src={url} alt={figure.title} className="max-h-32 max-w-full object-contain" /> : <Loader2 size={18} className="animate-spin text-gray-400" />}
        </div>
        <div className="px-3 py-2">
          <p className="line-clamp-2 text-sm font-medium text-gray-900">{figure.title}</p>
          <p className="mt-0.5 text-xs text-gray-500">{figure.labels.length ? `Letters ${figure.labels.map((l) => l.letter).join(', ')}` : 'No letters'}{mine ? '' : ` · ${figure.ownerName}`}</p>
        </div>
      </button>
      {picked && <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white"><Check size={14} /></span>}
      {mine && (
        <div className="absolute right-2 top-2 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
          <button type="button" onClick={onEdit} aria-label="Edit" className="rounded-lg bg-white/90 p-1.5 text-gray-700 shadow ring-1 ring-gray-200 hover:text-blue-700"><Pencil size={14} /></button>
          <button type="button" onClick={onDelete} aria-label="Delete" className="rounded-lg bg-white/90 p-1.5 text-gray-700 shadow ring-1 ring-gray-200 hover:text-red-600"><Trash2 size={14} /></button>
        </div>
      )}
    </div>
  );
}

/** Upload: pick or photograph a picture, drag a box around the diagram, send it. */
function UploadView({ subject, level, onDone, onBack }: { subject: string; level: string; onDone: (f: LibraryFigure) => void; onBack: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [title, setTitle] = useState('');
  const [threshold, setThreshold] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const start = useRef<{ x: number; y: number } | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const choose = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Choose a picture (JPG, PNG or WEBP).'); return; }
    if (f.size > 12 * 1024 * 1024) { setError('The picture is larger than 12 MB.'); return; }
    setError(''); setFile(f); setBox(null);
    setPreview(URL.createObjectURL(f));
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 80));
  };
  const at = (e: ReactPointerEvent) => {
    const r = area.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const down = (e: ReactPointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); start.current = at(e); setBox(null); };
  const move = (e: ReactPointerEvent) => {
    if (!start.current) return;
    const p = at(e), s = start.current;
    setBox({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const up = () => { start.current = null; setBox((b) => (b && b.w > 0.03 && b.h > 0.03 ? b : null)); };

  const send = async () => {
    if (!file || !title.trim()) return;
    setBusy(true); setError('');
    try {
      const details: FigureDetails = { title: title.trim(), description: '', subject, level, topic: '', tags: [], labels: [], shared: false };
      onDone(await teacherAi.figureUpload(file, details, { crop: box ?? undefined, threshold }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 px-6 pb-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"><ArrowLeft size={15} /> Library</button>
      <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
      {!preview ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 px-6 py-10 text-center"
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); choose(e.dataTransfer.files?.[0]); }}>
          <ImagePlus size={28} className="text-gray-400" />
          <p className="text-sm text-gray-600">A photo or scan of a diagram: apparatus, a map from a book, a labelled drawing.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={() => fileInput.current?.click()} className="rounded-xl bg-blue-600 hover:bg-blue-700"><Upload size={16} className="mr-2" /> Choose a picture</Button>
            <Button type="button" variant="outline" onClick={() => cameraInput.current?.click()} className="rounded-xl"><Camera size={16} className="mr-2" /> Take a photo</Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-600">Drag a box around the diagram to keep only that part (optional).</p>
          <div ref={area} className="relative mx-auto w-fit cursor-crosshair touch-none select-none overflow-hidden rounded-xl ring-1 ring-gray-200"
            onPointerDown={down} onPointerMove={move} onPointerUp={up}>
            <img src={preview} alt="" draggable={false} className="block max-h-[50vh] max-w-full" />
            {box && (
              <div className="pointer-events-none absolute border-2 border-blue-600 bg-blue-500/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.45)]"
                style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }} />
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" htmlFor="fig-title"><TextInput id="fig-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Apparatus for preparing oxygen" /></Field>
            <label className="flex items-center gap-2.5 self-end rounded-xl bg-gray-50 px-3.5 py-2.5 text-sm text-gray-700">
              <input type="checkbox" checked={threshold} onChange={(e) => setThreshold(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
              Pure black and white (best for line drawings)
            </label>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="ghost" onClick={() => { setFile(null); setPreview(null); setBox(null); }} className="rounded-xl">Choose another</Button>
            <Button type="button" disabled={busy || !title.trim()} onClick={send} className="rounded-xl bg-blue-600 hover:bg-blue-700">
              {busy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Upload size={16} className="mr-2" />} {busy ? 'Cleaning up the picture…' : 'Upload'}
            </Button>
          </div>
        </>
      )}
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</p>}
    </div>
  );
}

const nextLetter = (labels: FigureLabel[]) => {
  for (let i = 0; i < 26; i++) {
    const l = String.fromCharCode(65 + i);
    if (!labels.some((x) => x.letter === l)) return l;
  }
  return '';
};

/** Edit: place letters by clicking, describe them, ask the AI for suggestions, save. */
function EditView({ figure, autoSuggest, onSaved, onBack }: { figure: LibraryFigure; autoSuggest?: boolean; onSaved: (f: LibraryFigure) => void; onBack: () => void }) {
  const url = useFigureUrl(figure.id, figure.updatedAt);
  const [d, setD] = useState<FigureDetails>({ title: figure.title, description: figure.description, subject: figure.subject, level: figure.level, topic: figure.topic, tags: figure.tags, labels: figure.labels, shared: figure.shared });
  const [tags, setTags] = useState(figure.tags.join(', '));
  const [busy, setBusy] = useState<'save' | 'suggest' | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const set = (patch: Partial<FigureDetails>) => setD((x) => ({ ...x, ...patch }));

  const place = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const letter = nextLetter(d.labels);
    if (!letter) return;
    set({ labels: [...d.labels, { letter, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, meaning: '' }] });
  };
  const suggest = async () => {
    setBusy('suggest'); setError(''); setNote('');
    try {
      const s = await teacherAi.figureSuggest(figure.id);
      setD((x) => {
        const labels = [...x.labels];
        for (const l of s.labels) {
          const letter = l.letter.toUpperCase();
          const have = labels.find((y) => y.letter === letter);
          if (have) { if (!have.meaning) have.meaning = l.meaning; }
          else if (l.x !== undefined && l.y !== undefined) labels.push({ letter, x: l.x, y: l.y, meaning: l.meaning });
        }
        return { ...x, title: x.title && x.title !== figure.title ? x.title : s.title || x.title, description: x.description || s.description, labels };
      });
      if (!tags.trim() && s.tags.length) setTags(s.tags.join(', '));
      setNote('Suggestions added. Check every letter and what it marks before saving.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };
  // A new upload: ask for suggestions straight away.
  const asked = useRef(false);
  useEffect(() => { if (autoSuggest && !asked.current) { asked.current = true; void suggest(); } }); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy('save'); setError('');
    try {
      onSaved(await teacherAi.figureUpdate(figure.id, { ...d, tags: tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12) }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4 px-6 pb-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"><ArrowLeft size={15} /> Library</button>
      <p className="text-sm text-gray-600">Click on the picture to place the next letter. The letters print on the test; what each one marks goes into the marking key.</p>
      <div className="relative mx-auto w-fit cursor-crosshair select-none overflow-hidden rounded-xl ring-1 ring-gray-200" onClick={place}>
        {url ? <img src={url} alt={d.title} draggable={false} className="block max-h-[50vh] max-w-full" /> : <div className="flex h-48 w-80 items-center justify-center"><Loader2 className="animate-spin text-gray-400" /></div>}
        {d.labels.map((l) => (
          <span key={l.letter} className="pointer-events-none absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-gray-900 bg-white font-serif text-sm font-bold text-gray-900"
            style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%` }}>{l.letter}</span>
        ))}
      </div>
      {d.labels.length > 0 && (
        <div className="space-y-2">
          {d.labels.map((l, i) => (
            <div key={l.letter} className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-gray-900 font-serif font-bold">{l.letter}</span>
              <TextInput aria-label={`What ${l.letter} marks`} value={l.meaning ?? ''} maxLength={160} placeholder="What it marks, e.g. delivery tube"
                onChange={(e) => set({ labels: d.labels.map((x, j) => (j === i ? { ...x, meaning: e.target.value } : x)) })} />
              <button type="button" aria-label={`Remove ${l.letter}`} onClick={() => set({ labels: d.labels.filter((_, j) => j !== i) })} className="rounded-lg p-2 text-gray-500 hover:text-red-600"><X size={16} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor="fe-title"><TextInput id="fe-title" value={d.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Topic" htmlFor="fe-topic"><TextInput id="fe-topic" value={d.topic} maxLength={160} onChange={(e) => set({ topic: e.target.value })} placeholder="e.g. Preparation of gases" /></Field>
        <Field label="Description (for the AI writing the questions)" htmlFor="fe-desc" className="sm:col-span-2">
          <TextArea id="fe-desc" rows={2} maxLength={400} value={d.description} onChange={(e) => set({ description: e.target.value })} placeholder="One sentence about what the diagram shows." />
        </Field>
        <Field label="Tags" htmlFor="fe-tags" hint="Separated by commas."><TextInput id="fe-tags" value={tags} maxLength={300} onChange={(e) => setTags(e.target.value)} /></Field>
        <label className="flex items-center gap-2.5 self-end rounded-xl bg-gray-50 px-3.5 py-2.5 text-sm text-gray-700">
          <input type="checkbox" checked={d.shared} onChange={(e) => set({ shared: e.target.checked })} className="h-4 w-4 rounded border-gray-300" />
          Share with other teachers
        </label>
      </div>
      {note && <p className="rounded-xl bg-blue-50 px-4 py-2.5 text-sm text-blue-800">{note}</p>}
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</p>}
      <div className="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="outline" disabled={busy !== null} onClick={suggest} className="rounded-xl">
          {busy === 'suggest' ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Sparkles size={16} className="mr-2" />} Suggest with AI
        </Button>
        <Button type="button" disabled={busy !== null || !d.title.trim() || d.labels.some((l) => !l.meaning?.trim())} onClick={save} className="rounded-xl bg-blue-600 hover:bg-blue-700">
          {busy === 'save' ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Check size={16} className="mr-2" />} Save
        </Button>
      </div>
      {d.labels.some((l) => !l.meaning?.trim()) && <p className="text-right text-xs text-gray-500">Say what every letter marks before saving.</p>}
    </div>
  );
}

export function FigureLibraryDialog({ open, onOpenChange, subject, level, selected, onSelect }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: string;
  level: string;
  selected: string[];
  onSelect: (ids: string[], figures: LibraryFigure[]) => void;
}) {
  const [view, setView] = useState<View>({ name: 'list' });
  const [figures, setFigures] = useState<LibraryFigure[] | null>(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<string[]>(selected);

  const load = async () => {
    setError('');
    try { setFigures(await teacherAi.figures({ subject })); } catch (err) { setError((err as Error).message); setFigures([]); }
  };
  useEffect(() => { if (open) { setView({ name: 'list' }); setPicked(selected); void load(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 6 ? p : [...p, id]));
  const remove = async (f: LibraryFigure) => {
    if (!window.confirm(`Delete “${f.title}” from your diagram library?`)) return;
    try { await teacherAi.figureDelete(f.id); setPicked((p) => p.filter((x) => x !== f.id)); await load(); } catch (err) { setError((err as Error).message); }
  };
  const saved = (f: LibraryFigure) => {
    setFigures((list) => [f, ...(list ?? []).filter((x) => x.id !== f.id)]);
    setPicked((p) => (p.includes(f.id) || p.length >= 6 ? p : [...p, f.id]));
    setView({ name: 'list' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto rounded-2xl p-0 sm:rounded-2xl">
        <DialogHeader className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 px-6 pb-4 pt-6 text-left backdrop-blur">
          <DialogTitle className="text-lg">Diagram library{subject ? ` · ${subject}` : ''}</DialogTitle>
          <DialogDescription className="text-sm text-gray-600">
            {view.name === 'list' ? 'Pictures of diagrams to use in your tests. Tick up to six for this assessment.' : view.name === 'upload' ? 'Add a picture of a diagram.' : 'Letters and details.'}
          </DialogDescription>
        </DialogHeader>
        {view.name === 'upload' && <UploadView subject={subject} level={level} onBack={() => setView({ name: 'list' })} onDone={(f) => setView({ name: 'edit', figure: f, suggest: true })} />}
        {view.name === 'edit' && <EditView key={view.figure.id} figure={view.figure} autoSuggest={view.suggest} onBack={() => setView({ name: 'list' })} onSaved={saved} />}
        {view.name === 'list' && (
          <div className="space-y-4 px-6 pb-6">
            {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</p>}
            {figures === null ? (
              <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-400" /></div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <button type="button" onClick={() => setView({ name: 'upload' })}
                  className="flex min-h-[11rem] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 text-sm font-medium text-gray-600 hover:border-blue-300 hover:text-blue-700">
                  <ImagePlus size={22} /> Upload a picture
                </button>
                {figures.map((f) => (
                  <Thumb key={f.id} figure={f} picked={picked.includes(f.id)} mine={!!f.mine}
                    onPick={() => toggle(f.id)} onEdit={() => setView({ name: 'edit', figure: f })} onDelete={() => remove(f)} />
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
              <p className="text-sm text-gray-600">{picked.length ? `${picked.length} picked` : 'None picked'}</p>
              <Button type="button" onClick={() => { onSelect(picked, (figures ?? []).filter((f) => picked.includes(f.id))); onOpenChange(false); }} className="rounded-xl bg-blue-600 hover:bg-blue-700">
                <Check size={16} className="mr-2" /> Use these
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The form box: the picked pictures and a button that opens the library. Value: comma-separated ids. */
export function FigurePicker({ value, onChange, subject, level, disabled, label }: {
  value: string; onChange: (ids: string) => void; subject: string; level: string; disabled?: boolean; label: string;
}) {
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const ids = value.split(',').map((s) => s.trim()).filter(Boolean);
  return (
    <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
      <p className="mb-1.5 text-sm font-medium text-gray-800">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        {ids.map((id) => (
          <span key={id} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 py-1 pl-3 pr-1.5 text-sm text-gray-800">
            {names[id] ?? 'Picture'}
            <button type="button" disabled={disabled} aria-label="Remove" onClick={() => onChange(ids.filter((x) => x !== id).join(','))} className="rounded-full p-0.5 text-gray-500 hover:bg-gray-200 hover:text-gray-800"><X size={13} /></button>
          </span>
        ))}
        <Button type="button" size="sm" variant="outline" disabled={disabled || !subject} onClick={() => setOpen(true)} className="h-8 rounded-full">
          <ImagePlus size={14} className="mr-1.5" /> {ids.length ? 'Change' : 'Choose or upload'}
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-gray-500">Optional. Photos or scans of diagrams (apparatus, labelled drawings) for the AI to set questions on.</p>
      <FigureLibraryDialog open={open} onOpenChange={setOpen} subject={subject} level={level} selected={ids}
        onSelect={(picked, figures) => { setNames((n) => ({ ...n, ...Object.fromEntries(figures.map((f) => [f.id, f.title])) })); onChange(picked.join(',')); }} />
    </div>
  );
}
