// @/components/ai/ScanCapture.tsx — scan paper pages with the phone camera
// (or choose photos) and save them to the eFile:
//
//   ScanDialog   one marked script (highest, average or lowest mark of an
//                assessment), or one of the teacher's own question papers
//   cleanPage    makes a photo of a page ready to keep: turned the right way,
//                at most 1600 px, the paper whitened and the ink darkened,
//                then a JPEG of about 150–300 KB (the red marks keep their colour)
//
// The pages go to the AI server (POST /teacher/efile-file/scans).
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, ImagePlus, Loader2, Save, Sparkles, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Select, TextInput } from '@/components/ai/ui';
import { teacherAi } from '@/services/aiApi';
import { SCRIPT_SLOTS, type EFileMeta, type EFileScan, type ScriptSlot } from '@/types/ai';

const MAX_SIDE = 1600;

/**
 * A photo of a page, cleaned for the file. The paper is found from the
 * brightest pixels and the ink from the darkest, and the levels stretched
 * between them, so a grey phone photo prints like a photocopy.
 */
export async function cleanPage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser cannot prepare the picture.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  // Brightness histogram -> the 2nd and 92nd percentiles: ink and paper.
  const hist = new Uint32Array(256);
  for (let k = 0; k < d.length; k += 4) hist[(d[k] * 299 + d[k + 1] * 587 + d[k + 2] * 114) / 1000 | 0]++;
  const total = d.length / 4;
  const at = (p: number) => { let n = 0; for (let v = 0; v < 256; v++) { n += hist[v]; if (n >= total * p) return v; } return 255; };
  const ink = at(0.02), paper = Math.max(ink + 40, at(0.92));
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = ((v - ink) / (paper - ink)) * 255;
  for (let k = 0; k < d.length; k += 4) { d[k] = lut[d[k]]; d[k + 1] = lut[d[k + 1]]; d[k + 2] = lut[d[k + 2]]; }
  ctx.putImageData(img, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
  if (!blob) throw new Error('The picture could not be prepared.');
  return blob;
}

/** A learner suggested for a slot, from the marks entered in Results. */
export interface ScriptSuggestion { learner: string; mark: number; outOf: number }

export interface AssessmentChoice {
  /** The AI assessment's id (scripts of the teacher's own papers have none). */
  id?: string;
  title: string;
  /** Learners suggested for each slot, when the marks are in Results. */
  suggest?: Partial<Record<ScriptSlot, ScriptSuggestion>>;
  outOf?: number;
}

interface Page { blob: Blob; url: string }

export function ScanDialog({ kind, assessments, initial, onClose }: {
  kind: 'script' | 'paper';
  /** For scripts: the assessments to choose from. */
  assessments: AssessmentChoice[];
  initial?: { assessment?: string; slot?: ScriptSlot };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [assessment, setAssessment] = useState(initial?.assessment ?? (assessments[0] ? assessments[0].id ?? assessments[0].title : ''));
  const [slot, setSlot] = useState<ScriptSlot>(initial?.slot ?? 'highest');
  const choice = assessments.find((a) => (a.id ?? a.title) === assessment);
  const [title, setTitle] = useState('');
  const [learner, setLearner] = useState('');
  const [mark, setMark] = useState('');
  const [outOf, setOutOf] = useState(choice?.outOf ? String(choice.outOf) : '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [pages, setPages] = useState<Page[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  useEffect(() => () => pages.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (choice?.outOf) setOutOf(String(choice.outOf)); }, [choice?.outOf]);

  const suggestion = kind === 'script' ? choice?.suggest?.[slot] : undefined;
  const useSuggestion = () => { if (!suggestion) return; setLearner(suggestion.learner); setMark(String(suggestion.mark)); setOutOf(String(suggestion.outOf)); };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setPreparing(true); setError('');
    try {
      const ready: Page[] = [];
      for (const f of Array.from(files).slice(0, 12 - pages.length)) {
        const blob = await cleanPage(f);
        ready.push({ blob, url: URL.createObjectURL(blob) });
      }
      setPages((p) => [...p, ...ready]);
    } catch (err) {
      setError((err as Error).message || 'A picture could not be read.');
    } finally {
      setPreparing(false);
    }
  };

  const save = async () => {
    if (!pages.length) { setError('Scan or choose at least one page.'); return; }
    if (kind === 'script' && !choice) { setError('Choose the assessment.'); return; }
    if (kind === 'script' && !learner.trim()) { setError("Write the learner's name."); return; }
    if (kind === 'paper' && !title.trim()) { setError('Give the question paper a name.'); return; }
    setBusy(true); setError('');
    try {
      const details: Omit<EFileScan, 'id' | 'pages' | 'createdAt'> = kind === 'script'
        ? { section: 'scriptSamples', assessmentId: choice!.id, title: choice!.title, slot, learner: learner.trim(), date,
          ...(mark ? { mark: Number(mark) } : {}), ...(outOf ? { outOf: Number(outOf) } : {}) }
        : { section: 'questionSamples', title: title.trim(), date, ...(outOf ? { outOf: Number(outOf) } : {}) };
      const saved = await teacherAi.efileAddScan(details, pages.map((p) => p.blob));
      queryClient.setQueryData<EFileMeta>(['efile-file'], (m) => {
        if (!m) return m;
        // The server replaces an earlier script in the same slot.
        const others = (m.scans ?? []).filter((x) => !(saved.section === 'scriptSamples' && x.section === 'scriptSamples' && x.slot === saved.slot && x.title === saved.title && x.assessmentId === saved.assessmentId));
        return { ...m, scans: [...others, saved] };
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>{kind === 'script' ? 'Add a marked script' : 'Add your own question paper'}</DialogTitle>
          <DialogDescription>
            {kind === 'script'
              ? 'Scan the marked script of the learner with the highest, an average or the lowest mark. It is kept in 10 (v) Scripts Samples as evidence of the assessment.'
              : 'Scan a question paper you set yourself. It is filed in 10 (iii) Question Samples beside the papers written with the AI.'}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {kind === 'script' ? (
            <>
              <Field label="Assessment" htmlFor="scan-assessment">
                <Select id="scan-assessment" value={assessment} onChange={(e) => setAssessment(e.target.value)}>
                  {assessments.map((a) => <option key={a.id ?? a.title} value={a.id ?? a.title}>{a.title}</option>)}
                </Select>
              </Field>
              <div className="inline-flex gap-1 rounded-xl bg-gray-100 p-1" role="radiogroup" aria-label="Which script">
                {SCRIPT_SLOTS.map((s) => (
                  <button key={s.slot} type="button" role="radio" aria-checked={slot === s.slot} onClick={() => setSlot(s.slot)}
                    className={`h-8 rounded-lg px-3 text-sm font-medium ${slot === s.slot ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}>{s.label}</button>
                ))}
              </div>
              {suggestion && (
                <button type="button" onClick={useSuggestion} className="flex w-full items-center gap-2 rounded-xl bg-blue-50/70 px-3 py-2.5 text-left text-sm text-gray-700 ring-1 ring-inset ring-blue-200 hover:bg-blue-50">
                  <Sparkles size={16} className="shrink-0 text-blue-600" />
                  <span>From Results: <strong className="font-semibold">{suggestion.learner}</strong>, {suggestion.mark} / {suggestion.outOf}. Use this learner</span>
                </button>
              )}
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_100px_100px_150px]">
                <Field label="Learner" htmlFor="scan-learner"><TextInput id="scan-learner" value={learner} maxLength={120} onChange={(e) => setLearner(e.target.value)} placeholder="Full name" /></Field>
                <Field label="Mark" htmlFor="scan-mark"><TextInput id="scan-mark" type="number" min={0} value={mark} onChange={(e) => setMark(e.target.value)} /></Field>
                <Field label="Out of" htmlFor="scan-outof"><TextInput id="scan-outof" type="number" min={1} value={outOf} onChange={(e) => setOutOf(e.target.value)} /></Field>
                <Field label="Date" htmlFor="scan-date"><TextInput id="scan-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              </div>
            </>
          ) : (
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_100px_150px]">
              <Field label="Name of the paper" htmlFor="scan-title"><TextInput id="scan-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Form 3A Week 8 test" /></Field>
              <Field label="Marks" htmlFor="scan-outof"><TextInput id="scan-outof" type="number" min={1} value={outOf} onChange={(e) => setOutOf(e.target.value)} /></Field>
              <Field label="Date" htmlFor="scan-date"><TextInput id="scan-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-gray-800">Pages ({pages.length})</p>
            <p className="text-xs text-gray-500">Lay the page flat in good light and fill the screen with it. Each page is cleaned and made small before it is saved.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {pages.map((p, n) => (
                <figure key={p.url} className="relative w-24 overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <img src={p.url} alt={`Page ${n + 1}`} className="h-32 w-full object-cover" />
                  <figcaption className="px-1.5 py-0.5 text-center text-[11px] text-gray-600">Page {n + 1}</figcaption>
                  <button type="button" aria-label={`Remove page ${n + 1}`} onClick={() => setPages((ps) => { URL.revokeObjectURL(p.url); return ps.filter((x) => x !== p); })}
                    className="absolute right-1 top-1 rounded-md bg-white/90 p-1 text-red-700 shadow hover:bg-white"><Trash2 size={13} /></button>
                </figure>
              ))}
              {pages.length < 12 && (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" disabled={preparing} onClick={() => camera.current?.click()} className="h-[9.5rem] w-24 flex-col gap-1.5 rounded-lg">
                    {preparing ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}<span className="text-xs">Scan page</span>
                  </Button>
                  <Button type="button" variant="outline" disabled={preparing} onClick={() => gallery.current?.click()} className="h-[9.5rem] w-24 flex-col gap-1.5 rounded-lg">
                    <ImagePlus size={20} /><span className="text-xs">Choose photos</span>
                  </Button>
                </div>
              )}
            </div>
            <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
            <input ref={gallery} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
          </div>

          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy} className="h-10 rounded-xl">Cancel</Button>
            <Button type="submit" disabled={busy || preparing} className="h-10 rounded-xl bg-blue-600 font-semibold hover:bg-blue-700">
              {busy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}Save to eFile
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One scanned page, fetched with the teacher's sign-in. */
export function ScanThumb({ id, page, alt, className }: { id: string; page: number; alt: string; className?: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let gone = false, made = '';
    teacherAi.efileScanPage(id, page).then((b) => { if (!gone) { made = URL.createObjectURL(b); setUrl(made); } }).catch(() => {});
    return () => { gone = true; if (made) URL.revokeObjectURL(made); };
  }, [id, page]);
  return url ? <img src={url} alt={alt} className={className} /> : <div className={`animate-pulse bg-gray-100 ${className ?? ''}`} aria-label={alt} />;
}
