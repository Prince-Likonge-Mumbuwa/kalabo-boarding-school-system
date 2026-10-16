// Enrol one learner's face (My Class → Enrol faces → a learner).
//
// The learner is identified by their EXISTING record: document id, student
// number and name come from the learners collection — this screen never
// creates or renames a learner. The teacher confirms they have the right
// learner in front of the camera before anything is saved.
//
// Order: guardian consent → capture 3 angles (live, automatic) or a photo.
// Withdrawing consent deletes every saved face for the learner.
import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, Check, ImageUp, Loader2, RefreshCw, ScanFace, ShieldCheck, ShieldOff, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { faceApi } from '@/lib/face/faceApi';
import { MODEL_VERSION } from '@/lib/face/core';
import { FrameReader, Tracker, runLoop, type Box } from '@/lib/face/live';
import { readFaces, warmUp, FaceError } from '@/lib/face';
import { FACE_MAX_ANGLES, FACE_TARGET_ANGLES, type FaceStatus } from '@/types/face';
import { Stage, useCamera } from './camera';

export interface EnrolLearner {
  /** learners/{id} — the identity everything is stored under. */
  id: string;
  studentId: string;
  name: string;
  className: string;
}

export function FaceEnrolDialog({ open, onOpenChange, learner, status, onChanged, onNext }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  learner: EnrolLearner | null;
  status: FaceStatus | undefined;
  /** Called after any change so the caller can refresh face_status. */
  onChanged: () => void;
  /** Optional: go straight to the next learner who still needs a face. */
  onNext?: () => void;
}) {
  useEffect(() => { if (open) warmUp(); }, [open]);
  if (!learner) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[95vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanFace size={20} /> Face for {learner.name}</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{learner.studentId || 'no student number'}</span> · {learner.className}
          </DialogDescription>
        </DialogHeader>
        {open && <EnrolBody key={learner.id} learner={learner} status={status} onChanged={onChanged} onNext={onNext} />}
      </DialogContent>
    </Dialog>
  );
}

function EnrolBody({ learner, status, onChanged, onNext }: {
  learner: EnrolLearner; status: FaceStatus | undefined; onChanged: () => void; onNext?: () => void;
}) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [camera, setCamera] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  // Optimistic count so the UI moves on before face_status refreshes.
  const [count, setCount] = useState(status?.templateCount ?? 0);
  const [consent, setConsent] = useState(!!status?.consent);
  useEffect(() => { setCount(status?.templateCount ?? 0); setConsent(!!status?.consent); }, [status?.templateCount, status?.consent]);

  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setError('');
    try { await fn(); onChanged(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };

  if (!consent) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">No guardian consent recorded</p>
          <p className="mt-1">Face recognition may only be used after the learner's guardian has signed the consent form. Without it this learner is simply marked by hand.</p>
        </div>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button
          type="button"
          disabled={!!busy}
          onClick={() => act('Recording consent…', async () => { await faceApi.setConsent(learner.id, true); setConsent(true); toast.success('Consent recorded'); })}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          The guardian's signed consent form is on file
        </button>
        {onNext && <button type="button" onClick={onNext} className="w-full text-sm text-gray-600 hover:underline">Skip to the next learner</button>}
      </div>
    );
  }

  const full = count >= FACE_MAX_ANGLES;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-green-800"><ShieldCheck size={14} /> Consent on file</span>
        <span className={`rounded-full px-2.5 py-1 ${count >= FACE_TARGET_ANGLES ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
          {count} of {FACE_TARGET_ANGLES} angles saved
        </span>
      </div>

      {camera ? (
        <LiveEnrol
          learner={learner}
          existing={count}
          onAdded={n => { setCount(n); onChanged(); }}
          onClose={() => setCamera(false)}
        />
      ) : (
        <>
          <p className="text-sm text-gray-600">
            Check that <b>{learner.name}</b> is the learner in front of you. Capture {FACE_TARGET_ANGLES} angles (straight, slightly left, slightly right) for reliable recognition.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={full || !!busy}
              onClick={() => { setError(''); setCamera(true); }}
              className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Camera size={16} /> {count ? 'Add angles with camera' : 'Start camera'}
            </button>
            <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium hover:bg-gray-50 ${full || busy ? 'pointer-events-none opacity-50' : ''}`}>
              <ImageUp size={16} /> Use a photo
              <input
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  act('Checking the photo…', async () => {
                    try {
                      const a = await readFaces(f, { single: true, onProgress: setBusy });
                      setBusy('Saving…');
                      const r = await faceApi.enrol(learner.id, a.faces[0].embedding, MODEL_VERSION);
                      setCount(r.templateCount);
                      toast.success('Face saved');
                    } catch (err) {
                      if (err instanceof FaceError) throw new Error(err.message);
                      throw err;
                    }
                  });
                }}
              />
            </label>
          </div>
          {full && <p className="text-xs text-gray-500">{FACE_MAX_ANGLES} angles is the most a learner can have. Remove one to add another.</p>}
        </>
      )}

      {busy && <p className="flex items-center gap-2 text-sm text-gray-600"><Loader2 size={16} className="animate-spin" /> {busy}</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {status && status.templates.length > 0 && !camera && (
        <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
          {status.templates.map((t, i) => (
            <div key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>Angle {i + 1}{t.createdAt ? ` · saved ${new Date(t.createdAt).toLocaleDateString()}` : ''}</span>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => act('Removing…', async () => { const r = await faceApi.revoke(learner.id, t.id); setCount(r.templateCount); })}
                className="text-red-600 hover:text-red-800 disabled:opacity-50"
                title="Remove this angle"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {!camera && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
          {confirmWithdraw ? (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              Withdraw consent and delete all faces?
              <button
                type="button"
                disabled={!!busy}
                onClick={() => act('Withdrawing…', async () => { await faceApi.setConsent(learner.id, false); setConsent(false); setCount(0); setConfirmWithdraw(false); toast.success('Consent withdrawn, faces deleted'); })}
                className="rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700"
              >Yes, withdraw</button>
              <button type="button" onClick={() => setConfirmWithdraw(false)} className="rounded border px-2 py-1">No</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmWithdraw(true)} className="flex items-center gap-1 text-sm text-red-600 hover:underline">
              <ShieldOff size={14} /> Withdraw consent
            </button>
          )}
          {onNext && (
            <button type="button" onClick={onNext} className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800">
              Next learner →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- live capture (ported from Tick's LiveEnrol) ---------- */

const ENROL_MIN_PX = 96; // a good template needs a reasonably large face
const HOLD_MS = 700;

function LiveEnrol({ learner, existing, onAdded, onClose }: {
  learner: EnrolLearner; existing: number; onAdded: (count: number) => void; onClose: () => void;
}) {
  const cam = useCamera(true);
  const [state, setState] = useState<{ msg: string; tone: 'info' | 'hold' | 'warn' | 'done'; progress: number }>({ msg: 'Getting ready…', tone: 'info', progress: 0 });
  const [frame, setFrame] = useState<{ w: number; h: number; box: Box | null }>({ w: 0, h: 0, box: null });
  const [saved, setSaved] = useState(0);
  const [round, setRound] = useState(0);
  const [error, setError] = useState('');
  const capturing = saved === round && existing < FACE_MAX_ANGLES;
  const added = useRef(onAdded);
  added.current = onAdded;

  useEffect(() => {
    if (!cam.ready || !capturing) return;
    const reader = new FrameReader();
    const tracker = new Tracker(400);
    let alive = true;
    let busy = false;
    let stop = () => {};
    reader.start(m => setState({ msg: m, tone: 'info', progress: 0 })).then(() => {
      stop = runLoop(async () => {
        const v = cam.video.current;
        if (!v || busy) return;
        const f = await reader.read(v);
        if (!f) return;
        const now = performance.now();
        tracker.update(f.faces, now);
        const face = f.faces[0];
        setFrame({ w: f.width, h: f.height, box: f.faces.length === 1 ? face.box : null });
        if (!f.faces.length) return setState({ msg: 'Look at the camera', tone: 'info', progress: 0 });
        if (f.faces.length > 1) return setState({ msg: 'Only one face at a time, please', tone: 'warn', progress: 0 });
        if (Math.min(face.box[2], face.box[3]) < ENROL_MIN_PX) return setState({ msg: 'Move a little closer', tone: 'warn', progress: 0 });
        if (face.score < 0.88) return setState({ msg: 'Face the camera, in good light', tone: 'warn', progress: 0 });
        const t = tracker.tracks.find(x => x.seenAt === now)!;
        const held = now - t.stableSince;
        if (held < HOLD_MS) return setState({ msg: 'Hold still…', tone: 'hold', progress: held / HOLD_MS });
        busy = true;
        setState({ msg: 'Saving…', tone: 'hold', progress: 1 });
        try {
          const [embedding] = await reader.embed([face]);
          const r = await faceApi.enrol(learner.id, embedding, MODEL_VERSION);
          alive = false;
          setSaved(n => n + 1);
          setState({ msg: 'Face saved', tone: 'done', progress: 1 });
          added.current(r.templateCount);
        } catch (e) {
          setError((e as Error).message);
          busy = false;
          tracker.reset();
        }
      }, () => alive);
    }).catch((e: Error) => setError(e.message));
    return () => { alive = false; stop(); };
  }, [cam.ready, capturing, learner.id, cam.video]);

  const tone = state.tone === 'done' || state.tone === 'hold' ? 'match' : state.tone === 'warn' ? 'review' : 'looking';
  const noteColour = state.tone === 'done' ? 'bg-green-600/90' : state.tone === 'warn' ? 'bg-amber-500/90' : 'bg-black/60';
  return (
    <div className="space-y-3">
      {cam.error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{cam.error}</p> : (
        <Stage cam={cam} width={frame.w} height={frame.h} boxes={frame.box && capturing ? [{ key: 1, box: frame.box, tone, label: '' }] : []}>
          <div className={`absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 py-2 text-sm text-white ${noteColour}`} role="status">
            {state.tone === 'done' ? <Check size={16} /> : <ScanFace size={16} />} {state.msg}
            {state.tone === 'hold' && (
              <span className="ml-auto h-1.5 w-24 overflow-hidden rounded bg-white/30">
                <i className="block h-full bg-white" style={{ width: `${Math.round(state.progress * 100)}%` }} />
              </span>
            )}
          </div>
        </Stage>
      )}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {!capturing && existing < FACE_MAX_ANGLES && (
          <button
            type="button"
            onClick={() => { setError(''); setState({ msg: 'Turn the head slightly', tone: 'info', progress: 0 }); setRound(saved); }}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <RefreshCw size={14} /> Add another angle
          </button>
        )}
        <button type="button" onClick={onClose} className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
          <X size={14} /> {saved ? 'Done' : 'Close camera'}
        </button>
        <span className="ml-auto text-xs text-gray-500">{existing} of {FACE_TARGET_ANGLES} angles</span>
      </div>
      {capturing && (
        <p className="text-xs text-gray-500">
          The face is captured by itself once it is clear and still. Only an encrypted description of the face is stored — never the picture.
        </p>
      )}
    </div>
  );
}
