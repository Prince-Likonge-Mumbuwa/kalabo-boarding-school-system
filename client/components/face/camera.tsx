// Camera + face-box overlay shared by the face scan and enrolment screens.
// Ported from Tick (web/src/face/live-ui.tsx) to Tailwind.
import React, { useEffect, useRef, useState } from 'react';
import { SwitchCamera } from 'lucide-react';
import type { Box } from '@/lib/face/live';

type Facing = 'user' | 'environment';
const FACING_KEY = 'kbs.face.facing';

export function useCamera(on: boolean) {
  const video = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<Facing>(() => {
    try { return (localStorage.getItem(FACING_KEY) as Facing) || 'environment'; } catch { return 'environment'; }
  });
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [canSwitch, setCanSwitch] = useState(false);
  const [actual, setActual] = useState<Facing>(facing);

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | undefined;
    let cancelled = false;
    setReady(false);
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't open the camera here. The camera needs the school system's secure (https) address — or use Photo instead.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then(async s => {
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        const settings = s.getVideoTracks()[0]?.getSettings();
        // Laptops report no facing mode: their webcam faces the user.
        setActual(settings?.facingMode === 'environment' ? 'environment' : 'user');
        const v = video.current;
        if (v) {
          v.srcObject = s;
          await v.play().catch(() => {});
          setReady(true);
        }
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
        setCanSwitch(devices.filter(d => d.kind === 'videoinput').length > 1);
      })
      .catch((e: DOMException) => setError(
        e?.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow the camera for this site in the browser settings, or use Photo instead.'
          : "The camera couldn't start. Close other apps using it, or use Photo instead.",
      ));
    return () => { cancelled = true; stream?.getTracks().forEach(t => t.stop()); setReady(false); };
  }, [on, facing]);

  const flip = () => {
    const next: Facing = facing === 'user' ? 'environment' : 'user';
    try { localStorage.setItem(FACING_KEY, next); } catch { /* ignore */ }
    setFacing(next);
  };
  return { video, error, ready, canSwitch, flip, mirror: actual === 'user' };
}

export type Tone = 'match' | 'review' | 'unknown' | 'looking';
const TONE: Record<Tone, string> = {
  match: 'border-green-500 bg-green-500/10',
  review: 'border-amber-400 bg-amber-400/10',
  unknown: 'border-red-500 bg-red-500/10',
  looking: 'border-white/80',
};
const LABEL: Record<Tone, string> = {
  match: 'bg-green-600',
  review: 'bg-amber-500',
  unknown: 'bg-red-600',
  looking: 'bg-gray-700',
};

export interface StageBox { key: number; box: Box; tone: Tone; label: string }

/** The live video with face boxes drawn over it. Front cameras are shown mirrored. */
export function Stage({ cam, boxes, width, height, children }: {
  cam: ReturnType<typeof useCamera>;
  boxes: StageBox[];
  width: number;
  height: number;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-xl bg-black"
      style={{ aspectRatio: width && height ? `${width} / ${height}` : '4 / 3' }}
    >
      <video
        ref={cam.video}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
        style={cam.mirror ? { transform: 'scaleX(-1)' } : undefined}
      />
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {width > 0 && boxes.map(b => {
          const left = cam.mirror ? 1 - (b.box[0] + b.box[2]) / width : b.box[0] / width;
          return (
            <div
              key={b.key}
              className={`absolute rounded-md border-2 ${TONE[b.tone]}`}
              style={{
                left: `${left * 100}%`, top: `${(b.box[1] / height) * 100}%`,
                width: `${(b.box[2] / width) * 100}%`, height: `${(b.box[3] / height) * 100}%`,
              }}
            >
              {b.label && (
                <span className={`absolute -top-6 left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium text-white ${LABEL[b.tone]}`}>
                  {b.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {children}
      {cam.canSwitch && (
        <button
          type="button"
          onClick={cam.flip}
          className="absolute bottom-2 right-2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
          aria-label="Switch camera"
          title="Switch camera"
        >
          <SwitchCamera size={18} />
        </button>
      )}
    </div>
  );
}

export const firstName = (n?: string) => (n ?? '').trim().split(/\s+/)[0] ?? '';
