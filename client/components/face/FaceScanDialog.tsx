// Scan faces into the attendance register (Attendance Tracking → "Scan faces").
//
// Two ways: Live (names appear on faces as learners pass the camera) or
// Photo (one picture of the class). Either way the result only TICKS learners
// present in the teacher's draft register — the teacher still presses Save,
// so daily / lesson / double registers save exactly as before.
// The camera never marks anyone absent, late or excused.
//
// Roll call speed: zoom (camera zoom first, then a full-resolution crop) so
// the back rows can be read from the front; frames processed as the camera
// delivers them; several faces asked about in one request and up to three
// requests on the way; a progress bar and the list of learners not seen yet.
//
// Ported from Tick's LiveRegister / PhotoScanner.
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, CameraOff, Check, ChevronDown, ImageUp, Loader2, ScanFace, Volume2, VolumeX, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { faceApi } from '@/lib/face/faceApi';
import { FrameReader, Tracker, judge, resolveDuplicates, runLoop, type Track } from '@/lib/face/live';
import { MIN_QUALITY } from '@/lib/face/quality';
import { boxInView } from '@/lib/face/zoom';
import { CLASS_PHOTO_SIDE, readFaces, warmUp, FaceError } from '@/lib/face';
import { betterSighting, resolveMatches, toTick, type RosterLearner, type Seen } from '@/lib/face/register';
import { useFaceSettings } from '@/hooks/useFaceRecognition';
import { DEFAULT_FACE_SETTINGS } from '@/types/face';
import { Stage, ZoomBar, firstName, useCamera, useZoom, type StageBox } from './camera';

const AUTO_KEY = 'kbs.face.autoTick';
const SOUND_KEY = 'kbs.face.sound';

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

const readFlag = (k: string, dflt: boolean) => { try { const v = localStorage.getItem(k); return v === null ? dflt : v === '1'; } catch { return dflt; } };
const writeFlag = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* ignore */ } };

export default function FaceScanDialog(props: FaceScanDialogProps) {
  const { open, onOpenChange, className, classId } = props;
  const [mode, setMode] = useState<'live' | 'photo'>('live');
  useEffect(() => {
    if (!open) return;
    warmUp();
    faceApi.warm(classId); // wake the server and load this class's faces now
  }, [open, classId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-3 overflow-y-auto rounded-none p-3 sm:h-auto sm:max-h-[95vh] sm:max-w-3xl sm:rounded-lg sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg"><ScanFace size={20} /> Scan faces — {className}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Recognised learners are ticked <b>present</b> on the register. Check the list, then press <b>Save</b> as usual.
          </DialogDescription>
        </DialogHeader>
        <RollCall learners={props.learners} />
        <div className="inline-flex self-start rounded-lg border border-gray-200 p-1 text-sm">
          {(['live', 'photo'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
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

/* ---------- roll call progress ---------- */

function RollCall({ learners }: { learners: RosterLearner[] }) {
  const [showMissing, setShowMissing] = useState(false);
  const present = learners.filter(l => l.status === 'present').length;
  const missing = learners.filter(l => l.status !== 'present').sort((a, b) => a.name.localeCompare(b.name));
  const pct = learners.length ? Math.round((present / learners.length) * 100) : 0;
  return (
    <div className="rounded-lg border border-gray-200 p-2.5">
      <div className="flex items-center gap-3 text-sm">
        <span className="whitespace-nowrap font-semibold text-gray-900" aria-live="polite">
          {present} of {learners.length} present
        </span>
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuemin={0} aria-valuemax={learners.length} aria-valuenow={present}>
          <span className="block h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
        </span>
        {missing.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowMissing(v => !v)}
            aria-expanded={showMissing}
            className="flex items-center gap-1 whitespace-nowrap text-xs font-medium text-blue-700 hover:text-blue-900"
          >
            Not yet ({missing.length}) <ChevronDown size={14} className={showMissing ? 'rotate-180' : ''} />
          </button>
        ) : learners.length > 0 && (
          <span className="flex items-center gap-1 whitespace-nowrap text-xs font-medium text-green-700"><Check size={14} /> Everyone</span>
        )}
      </div>
      {showMissing && missing.length > 0 && (
        <div className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
          {missing.map(l => (
            <span key={l.id} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700" title={l.studentId}>{l.name}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- the list of recognised learners ---------- */

const SeenList = memo(function SeenList({ seen, picked, setPicked, roster }: {
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
              className="h-5 w-5 rounded border-gray-300 text-blue-600"
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
});

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

/** A short beep and buzz when someone is ticked, so the teacher needn't watch the screen. */
function useChime() {
  const ctx = useRef<AudioContext | null>(null);
  const prime = () => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC && !ctx.current) ctx.current = new AC();
      ctx.current?.resume?.();
    } catch { /* no audio */ }
  };
  const chime = () => {
    try { navigator.vibrate?.(35); } catch { /* ignore */ }
    const c = ctx.current;
    if (!c) return;
    try {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.15, c.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.12);
      o.connect(g).connect(c.destination);
      o.start();
      o.stop(c.currentTime + 0.13);
    } catch { /* ignore */ }
  };
  useEffect(() => () => { ctx.current?.close?.().catch(() => {}); }, []);
  return { prime, chime };
}

/* ---------- live ---------- */

type FrameView = { aspect: number; tracks: Track[]; faces: number };

function LiveScan({ classId, learners, onTick }: FaceScanDialogProps) {
  const [on, setOn] = useState(false);
  const cam = useCamera(on, { hd: true });
  const zoom = useZoom(cam);
  const settings = useFaceSettings().data ?? DEFAULT_FACE_SETTINGS;
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [frame, setFrame] = useState<FrameView>({ aspect: 0, tracks: [], faces: 0 });
  const [seen, setSeen] = useState<Map<string, Seen>>(new Map());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [enrolled, setEnrolled] = useState<number | null>(null);
  const [lastTicked, setLastTicked] = useState<{ name: string; at: number } | null>(null);
  const [auto, setAutoState] = useState(() => readFlag(AUTO_KEY, false));
  const [sound, setSoundState] = useState(() => readFlag(SOUND_KEY, true));
  const setAuto = (v: boolean) => { setAutoState(v); writeFlag(AUTO_KEY, v); };
  const setSound = (v: boolean) => { setSoundState(v); writeFlag(SOUND_KEY, v); };
  const { prime, chime } = useChime();

  const roster = useMemo(() => new Map(learners.map(l => [l.id, l])), [learners]);
  const allPresent = learners.length > 0 && learners.every(l => l.status === 'present');
  // Values the camera loop reads without restarting.
  const live = useRef({
    roster, auto, sound, seen, onTick, chime, allPresent, view: zoom.view, hardware: zoom.hardware,
    matchThreshold: settings.matchThreshold, ticked: new Set<string>(),
  });
  Object.assign(live.current, {
    roster, auto, sound, seen, onTick, chime, allPresent, view: zoom.view, hardware: zoom.hardware,
    matchThreshold: settings.matchThreshold,
  });

  useEffect(() => {
    if (!on || !cam.ready) return;
    const reader = new FrameReader();
    const tracker = new Tracker();
    let alive = true;
    let inflight = 0;
    let fails = 0;
    let hwSeen = live.current.hardware;
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
        if (ref.sound) ref.chime();
        setLastTicked({ name: l.name, at: Date.now() });
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
          faces: tracks.map((t, i) => ({ box: t.face.box, embedding: embeddings[i] })),
        });
        fails = 0;
        setEnrolled(r.enrolledInClass);
        r.faces.forEach((f, i) => {
          const t = tracks[i];
          if (!t) return;
          const onRoster = !!f.learnerId && live.current.roster.has(f.learnerId);
          const confirmed = judge(t, onRoster ? f : { learnerId: null, similarity: null, verdict: 'unknown' }, { matchThreshold: live.current.matchThreshold });
          if (confirmed) {
            // One learner, one face: a stronger face already holding this learner wins.
            const rival = tracker.tracks.find(o => o !== t && o.verdict === 'match' && o.learner_id === t.learner_id);
            if (rival && (rival.similarity ?? 0) >= (t.similarity ?? 0)) {
              t.verdict = 'unknown'; t.last = 'unknown'; t.candidate = null; t.confirms = 0; t.learner_id = null;
              return;
            }
            resolveDuplicates(tracker.tracks, t);
            noteSeen({ learnerId: t.learner_id!, similarity: t.similarity, verdict: 'match', at: Date.now() });
          } else if (t.learner_id && t.verdict === 'review') {
            noteSeen({ learnerId: t.learner_id, similarity: t.similarity, verdict: 'review', at: Date.now() });
          }
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
        const ref = live.current;
        const f = await reader.read(v, ref.view);
        if (!f) return;
        const now = performance.now();
        // Camera zoom changes the picture itself: start following faces afresh.
        if (ref.hardware !== hwSeen) { hwSeen = ref.hardware; tracker.reset(); }
        tracker.update(f.faces, now);

        if (!ref.allPresent) {
          const unsettled = tracker.unsettled(now);
          for (const t of unsettled) t.q = reader.quality(t.face).score;
          // New or unconfirmed faces; several per request, up to three requests on the way.
          const ask = inflight < 3 ? tracker.needingId(now, 6) : [];
          if (ask.length) {
            const emb = await reader.embed(ask.map(t => t.face));
            const fused = ask.map((t, i) => tracker.addSample(t, emb[i], t.q ?? 0));
            identify(ask, fused, f.width, f.height);
          } else {
            // Nothing to ask: keep a better sighting of a face that is still unsettled.
            const t = unsettled.find(x => !x.pending && x.tries > 0 && (x.q ?? 0) >= MIN_QUALITY
              && (x.samples.length < 3 || (x.q ?? 0) > Math.min(...x.samples.map(s => s.q))));
            if (t) {
              const [e] = await reader.embed([t.face]);
              tracker.addSample(t, e, t.q ?? 0);
            }
          }
        }
        setFrame({ aspect: f.width / f.height, faces: f.faces.length, tracks: tracker.tracks.filter(t => t.seenAt === now).map(t => ({ ...t })) });
      }, () => alive, 33, () => cam.video.current);
    }).catch((e: Error) => setError(e.message));

    return () => { alive = false; stop(); };
  }, [on, cam.ready, cam.video, classId]);

  useEffect(() => {
    if (!lastTicked) return;
    const t = setTimeout(() => setLastTicked(null), 1800);
    return () => clearTimeout(t);
  }, [lastTicked]);

  const list = useMemo(() => [...seen.values()].sort((a, b) => b.at - a.at), [seen]);
  const ready = toTick(list, picked, roster);
  const tickPicked = () => {
    onTick(ready.map(s => ({ learnerId: s.learnerId, similarity: s.similarity })));
    toast.success(`${plural(ready.length, 'learner')} ticked present — remember to Save`);
    setPicked(new Set());
  };

  // A display aspect that matches what is analysed (the view keeps the camera's shape).
  const aspect = frame.aspect || undefined;
  const boxes: StageBox[] = frame.tracks.map(t => {
    const l = t.learner_id ? roster.get(t.learner_id) : undefined;
    const confirming = t.verdict === 'review' && t.last === 'match';
    const tone = t.verdict === 'match' ? 'match' : t.verdict === 'review' ? 'review' : t.verdict === 'unknown' ? 'unknown' : 'looking';
    const label = l
      ? `${firstName(l.name)}${l.status === 'present' ? ' ✓' : confirming ? '…' : t.verdict === 'review' ? '?' : ''}`
      : t.verdict === 'unknown' ? 'Not known' : '';
    return { key: t.id, box: boxInView(t.box, zoom.view, cam.mirror), tone, label };
  });

  const options = (
    <div className="flex flex-wrap items-start gap-x-5 gap-y-2 text-sm">
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-gray-300" checked={auto} onChange={e => setAuto(e.target.checked)} />
        <span>
          <b>Tick clear matches automatically</b>
          <span className="block text-xs text-gray-500">Off: you confirm the list. Uncertain faces always wait for you.</span>
        </span>
      </label>
      <button
        type="button"
        onClick={() => { prime(); setSound(!sound); }}
        aria-pressed={sound}
        className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs hover:bg-gray-50"
      >
        {sound ? <Volume2 size={14} /> : <VolumeX size={14} />} {sound ? 'Sound on' : 'Sound off'}
      </button>
    </div>
  );

  if (!on) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 p-5 text-center sm:p-6">
          <ScanFace size={36} className="text-blue-600" />
          <div>
            <p className="font-medium text-gray-900">Recognise learners as they walk past</p>
            <p className="text-sm text-gray-500">Point the camera at the door or the class — zoom in on the back rows. Names appear on faces; no photo to take.</p>
          </div>
          <button
            type="button"
            onClick={() => { prime(); setError(''); setOn(true); }}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Start camera
          </button>
        </div>
        {options}
        <SeenList seen={list} picked={picked} setPicked={setPicked} roster={roster} />
        <TickButton count={ready.length} onClick={tickPicked} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {cam.error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{cam.error}</p> : (
        <div className="mx-auto w-full" style={{ maxWidth: aspect ? `min(100%, calc(58dvh * ${aspect}))` : undefined }}>
          <Stage cam={cam} boxes={boxes} aspect={aspect} zoom={zoom}>
            <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-2 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Live · {plural(frame.faces, 'face')}
              {zoom.z > 1.05 && <span>· {zoom.z.toFixed(1)}×</span>}
              {auto && <><Zap size={12} /> Auto</>}
            </div>
            {lastTicked && (
              <div className="pointer-events-none absolute bottom-2 left-2 flex max-w-[70%] items-center gap-1.5 truncate rounded-full bg-green-600/90 px-3 py-1 text-sm font-medium text-white" role="status">
                <Check size={14} /> {lastTicked.name}
              </div>
            )}
            {allPresent && (
              <div className="pointer-events-none absolute inset-x-0 top-10 mx-auto w-fit rounded-full bg-green-600/90 px-3 py-1 text-sm font-medium text-white">
                Everyone is present
              </div>
            )}
            {note && (
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-black/60 px-3 py-2 text-sm text-white">
                <Loader2 size={16} className="animate-spin" /> {note}
              </div>
            )}
          </Stage>
        </div>
      )}
      {!cam.error && <ZoomBar zoom={zoom} />}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {enrolled === 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No learner in this class has a face saved yet. Enrol faces first.</p>}
      <div className="flex flex-wrap items-start gap-3">
        <button type="button" onClick={() => setOn(false)} className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
          <CameraOff size={14} /> Stop camera
        </button>
        {options}
      </div>
      {list.length > 0 && <p className="text-xs text-gray-500">Seen so far: {plural(list.length, 'learner')}</p>}
      <SeenList seen={list} picked={picked} setPicked={setPicked} roster={roster} />
      <TickButton count={ready.length} onClick={tickPicked} />
      <p className="text-xs text-gray-500">
        {auto ? 'Clear matches are ticked as they are seen; uncertain ones wait for you.' : 'Nothing is ticked until you confirm.'}{' '}
        Pinch or scroll to zoom, drag to look around. The video stays on this device. Nobody is marked absent by the camera.
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
      // A larger size than live frames: faces at the back of a class photo stay readable.
      const a = await readFaces(file, { onProgress: setBusy, maxSide: CLASS_PHOTO_SIDE });
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
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-gray-300 p-5 text-center hover:bg-gray-50 sm:p-6">
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
