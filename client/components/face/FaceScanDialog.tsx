// Scan faces into the attendance register (Attendance Tracking → "Scan faces").
//
// Two ways: Live (names appear on faces as learners pass the camera) or
// Photo (one picture of the class). Either way the result only TICKS learners
// present in the teacher's draft register — the teacher still presses Save,
// so daily / lesson / double registers save exactly as before.
// The camera never marks anyone absent, late or excused.
//
// Ported from Tick's LiveRegister / PhotoScanner.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, CameraOff, Check, ImageUp, Loader2, ScanFace, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { faceApi } from '@/lib/face/faceApi';
import { FrameReader, Tracker, runLoop, type Track } from '@/lib/face/live';
import { readFaces, warmUp, FaceError } from '@/lib/face';
import { betterSighting, resolveMatches, toTick, type RosterLearner, type Seen } from '@/lib/face/register';
import { Stage, firstName, useCamera, type StageBox } from './camera';

const AUTO_KEY = 'kbs.face.autoTick';

type Tick = (matches: Array<{ learnerId: string; similarity: number | null }>) => void;

export interface FaceScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  className: string;
  /** The register's learners, with their current draft status. */
  learners: RosterLearner[];
  /** Tick these learners present in the draft (not saved yet). */
  onTick: Tick;
}

export default function FaceScanDialog(props: FaceScanDialogProps) {
  const { open, onOpenChange, className } = props;
  const [mode, setMode] = useState<'live' | 'photo'>('live');
  useEffect(() => { if (open) warmUp(); }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanFace size={20} /> Scan faces — {className}</DialogTitle>
          <DialogDescription>
            Recognised learners are ticked <b>present</b> on the register. Check the list, then press <b>Save</b> as usual.
          </DialogDescription>
        </DialogHeader>
        <div className="inline-flex rounded-lg border border-gray-200 p-1 text-sm">
          {(['live', 'photo'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 font-medium ${mode === m ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {m === 'live' ? <Camera size={14} /> : <ImageUp size={14} />}
              {m === 'live' ? 'Live camera' : 'Photo'}
            </button>
          ))}
        </div>
        {open && (mode === 'live' ? <LiveScan {...props} /> : <PhotoScan {...props} />)}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- the list of recognised learners ---------- */

function SeenList({ seen, picked, setPicked, roster }: {
  seen: Seen[];
  picked: Set<string>;
  setPicked: React.Dispatch<React.SetStateAction<Set<string>>>;
  roster: Map<string, RosterLearner>;
}) {
  if (!seen.length) return null;
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
      {seen.map(s => {
        const l = roster.get(s.learnerId);
        if (!l) return null;
        const already = l.status === 'present';
        return (
          <label key={s.learnerId} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
              disabled={already}
              checked={already || picked.has(s.learnerId)}
              onChange={() => toggle(s.learnerId)}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-gray-900">{l.name}</span>
              <span className="block text-xs text-gray-500">
                <span className="font-mono">{l.studentId}</span>
                {' · '}
                {already ? 'Present on the register' : s.verdict === 'match' ? 'Clear match' : 'Not certain — check before ticking'}
              </span>
            </span>
            {already
              ? <Check size={18} className="text-green-600" />
              : s.verdict === 'review' && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Check</span>}
          </label>
        );
      })}
    </div>
  );
}

function TickButton({ count, onClick }: { count: number; onClick: () => void }) {
  if (!count) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700"
    >
      <Check size={16} /> Tick {count} present
    </button>
  );
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/* ---------- live ---------- */

function LiveScan({ classId, learners, onTick }: FaceScanDialogProps) {
  const [on, setOn] = useState(false);
  const cam = useCamera(on);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [frame, setFrame] = useState<{ w: number; h: number; tracks: Track[] }>({ w: 0, h: 0, tracks: [] });
  const [seen, setSeen] = useState<Map<string, Seen>>(new Map());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [enrolled, setEnrolled] = useState<number | null>(null);
  const [auto, setAutoState] = useState(() => { try { return localStorage.getItem(AUTO_KEY) === '1'; } catch { return false; } });
  const setAuto = (v: boolean) => { setAutoState(v); try { localStorage.setItem(AUTO_KEY, v ? '1' : '0'); } catch { /* ignore */ } };

  const roster = useMemo(() => new Map(learners.map(l => [l.id, l])), [learners]);
  // Values the camera loop reads without restarting.
  const live = useRef({ roster, auto, seen, onTick, ticked: new Set<string>() });
  live.current.roster = roster;
  live.current.auto = auto;
  live.current.seen = seen;
  live.current.onTick = onTick;

  useEffect(() => {
    if (!on || !cam.ready) return;
    const reader = new FrameReader();
    const tracker = new Tracker();
    let alive = true;
    let inflight = 0;
    let fails = 0;
    let stop = () => {};
    setNote('Getting face recognition ready…');

    const noteSeen = (s: Seen) => {
      const ref = live.current;
      if (!betterSighting(ref.seen.get(s.learnerId), s)) return;
      ref.seen = new Map(ref.seen).set(s.learnerId, s);
      setSeen(ref.seen);
      const l = ref.roster.get(s.learnerId);
      if (s.verdict !== 'match' || !l || l.status === 'present') return;
      if (ref.auto) {
        if (ref.ticked.has(s.learnerId)) return;
        ref.ticked.add(s.learnerId);
        ref.onTick([{ learnerId: s.learnerId, similarity: s.similarity }]);
        toast.success(`${l.name} ticked present`);
      } else {
        setPicked(p => new Set(p).add(s.learnerId));
      }
    };

    const identify = async (tracks: Track[], embeddings: number[][], width: number, height: number) => {
      inflight++;
      const now = performance.now();
      tracks.forEach(t => { t.pending = true; t.tries++; t.triedAt = now; });
      try {
        const r = await faceApi.match({
          classId, live: true, width, height,
          faces: tracks.map((t, i) => ({ box: t.box, embedding: embeddings[i] })),
        });
        fails = 0;
        setEnrolled(r.enrolledInClass);
        r.faces.forEach((f, i) => {
          const t = tracks[i];
          if (!f.learnerId || !live.current.roster.has(f.learnerId)) { if (!t.learner_id) t.verdict = 'unknown'; return; }
          if (t.verdict === 'match' && t.learner_id !== f.learnerId && (t.similarity ?? 0) >= (f.similarity ?? 0)) return;
          t.learner_id = f.learnerId; // learner document id
          t.similarity = f.similarity;
          t.verdict = f.verdict;
          if (f.verdict !== 'unknown') noteSeen({ learnerId: f.learnerId, similarity: f.similarity, verdict: f.verdict, at: Date.now() });
        });
      } catch (e) {
        if (++fails >= 3) setError((e as Error).message);
      } finally {
        tracks.forEach(t => { t.pending = false; });
        inflight--;
      }
    };

    reader.start(setNote).then(() => {
      if (!alive) return;
      setNote('');
      stop = runLoop(async () => {
        const v = cam.video.current;
        if (!v) return;
        const f = await reader.read(v);
        if (!f) return;
        const now = performance.now();
        tracker.update(f.faces, now);
        // New or uncertain faces only; at most two requests on the way at once.
        const ask = inflight < 2 ? tracker.needingId(now) : [];
        if (ask.length) {
          const emb = await reader.embed(ask.map(t => t.face));
          identify(ask, emb, f.width, f.height);
        }
        setFrame({ w: f.width, h: f.height, tracks: tracker.tracks.filter(t => t.seenAt === now).map(t => ({ ...t })) });
      }, () => alive);
    }).catch((e: Error) => setError(e.message));

    return () => { alive = false; stop(); };
  }, [on, cam.ready, cam.video, classId]);

  const list = [...seen.values()].sort((a, b) => b.at - a.at);
  const ready = toTick(list, picked, roster);
  const tickPicked = () => {
    onTick(ready.map(s => ({ learnerId: s.learnerId, similarity: s.similarity })));
    toast.success(`${plural(ready.length, 'learner')} ticked present — remember to Save`);
    setPicked(new Set());
  };

  const boxes: StageBox[] = frame.tracks.map(t => {
    const l = t.learner_id ? roster.get(t.learner_id) : undefined;
    const tone = t.verdict === 'match' ? 'match' : t.verdict === 'review' ? 'review' : t.verdict === 'unknown' ? 'unknown' : 'looking';
    const label = l ? `${firstName(l.name)}${l.status === 'present' ? ' ✓' : t.verdict === 'review' ? '?' : ''}` : t.verdict === 'unknown' ? 'Not known' : '';
    return { key: t.id, box: t.box, tone, label };
  });

  const autoSwitch = (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300" checked={auto} onChange={e => setAuto(e.target.checked)} />
      <span>
        <b>Tick clear matches automatically</b>
        <span className="block text-xs text-gray-500">Off: you confirm the list. Uncertain faces always wait for you.</span>
      </span>
    </label>
  );

  if (!on) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 p-6 text-center">
          <ScanFace size={36} className="text-blue-600" />
          <div>
            <p className="font-medium text-gray-900">Recognise learners as they walk past</p>
            <p className="text-sm text-gray-500">Point the camera at the door or the class. Names appear on faces — no photo to take.</p>
          </div>
          <button type="button" onClick={() => { setError(''); setOn(true); }} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Start camera
          </button>
        </div>
        {autoSwitch}
        <SeenList seen={list} picked={picked} setPicked={setPicked} roster={roster} />
        <TickButton count={ready.length} onClick={tickPicked} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {cam.error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{cam.error}</p> : (
        <Stage cam={cam} boxes={boxes} width={frame.w} height={frame.h}>
          <div className="absolute left-2 top-2 flex items-center gap-2 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Live · {plural(frame.tracks.length, 'face')}
            {auto && <><Zap size={12} /> Auto</>}
          </div>
          {note && (
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-black/60 px-3 py-2 text-sm text-white">
              <Loader2 size={16} className="animate-spin" /> {note}
            </div>
          )}
        </Stage>
      )}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {enrolled === 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No learner in this class has a face saved yet. Enrol faces in My Class first.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setOn(false)} className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
          <CameraOff size={14} /> Stop camera
        </button>
        {autoSwitch}
      </div>
      {list.length > 0 && <p className="text-xs text-gray-500">Seen so far: {plural(list.length, 'learner')}</p>}
      <SeenList seen={list} picked={picked} setPicked={setPicked} roster={roster} />
      <TickButton count={ready.length} onClick={tickPicked} />
      <p className="text-xs text-gray-500">
        {auto ? 'Clear matches are ticked as they are seen; uncertain ones wait for you.' : 'Nothing is ticked until you confirm.'}{' '}
        The video stays on this device. Nobody is marked absent by the camera.
      </p>
    </div>
  );
}

/* ---------- photo ---------- */

function PhotoScan({ classId, learners, onTick }: FaceScanDialogProps) {
  const roster = useMemo(() => new Map(learners.map(l => [l.id, l])), [learners]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ seen: Seen[]; unknown: number; faces: number } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const run = async (file: File) => {
    setError(''); setResult(null);
    try {
      setBusy('Looking for faces…');
      const a = await readFaces(file, { onProgress: setBusy });
      if (!a.faces.length) { setResult({ seen: [], unknown: 0, faces: 0 }); return; }
      setBusy('Matching faces…');
      const r = await faceApi.match({ classId, width: a.width, height: a.height, faces: a.faces.map(f => ({ box: f.box, embedding: f.embedding })) });
      const { proposals, unknown } = resolveMatches(r.faces, roster);
      setResult({ seen: proposals, unknown, faces: a.faces.length });
      setPicked(new Set(proposals.filter(p => p.verdict === 'match').map(p => p.learnerId)));
    } catch (e) {
      setError(e instanceof FaceError ? e.message : (e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const ready = result ? toTick(result.seen, picked, roster) : [];
  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-gray-300 p-6 text-center hover:bg-gray-50">
        <ImageUp size={32} className="text-blue-600" />
        <span className="font-medium text-gray-900">Take or choose a photo of the class</span>
        <span className="text-sm text-gray-500">Faces should be clear and facing the camera. The photo stays on this device.</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={!!busy}
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run(f); }}
        />
      </label>
      {busy && <p className="flex items-center gap-2 text-sm text-gray-600"><Loader2 size={16} className="animate-spin" /> {busy}</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {result && (
        <p className="text-sm text-gray-600">
          {result.faces === 0
            ? 'No clear faces found. Try again closer, in better light.'
            : `${plural(result.faces, 'face')} found: ${result.seen.length} recognised${result.unknown ? `, ${result.unknown} not known` : ''}.`}
        </p>
      )}
      {result && <SeenList seen={result.seen} picked={picked} setPicked={setPicked} roster={roster} />}
      <TickButton
        count={ready.length}
        onClick={() => {
          onTick(ready.map(s => ({ learnerId: s.learnerId, similarity: s.similarity })));
          toast.success(`${plural(ready.length, 'learner')} ticked present — remember to Save`);
          setPicked(new Set());
          setResult(r => r && { ...r, seen: r.seen.filter(s => !ready.includes(s)) });
        }}
      />
    </div>
  );
}
