// Camera + face-box overlay shared by the face scan and enrolment screens.
// Ported from Tick (web/src/face/live-ui.tsx) to Tailwind, with zoom:
//   - hardware zoom on cameras that support it (best quality), then digital
//     zoom (a crop read at the camera's full resolution);
//   - pinch, mouse wheel, double-tap, +/− keys, slider and 1× 2× 3× buttons;
//   - drag to look around while digitally zoomed; a small map shows where.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Flashlight, FlashlightOff, Minus, Plus, SwitchCamera } from 'lucide-react';
import {
  FULL_VIEW, boxInView, maxZoom, panBy, splitZoom, videoPlacement, viewFor, zoomAt,
  type HwZoom, type View, type ZoomState,
} from '@/lib/face/zoom';

type Facing = 'user' | 'environment';
const FACING_KEY = 'kbs.face.facing';

type ZoomCaps = { zoom?: { min: number; max: number; step?: number }; torch?: boolean };

/**
 * Open the camera. `hd`: ask for the camera's higher resolutions (the live
 * scanner zooms into them); enrolment is fine at 720p.
 */
export function useCamera(on: boolean, opts: { hd?: boolean } = {}) {
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  const [facing, setFacing] = useState<Facing>(() => {
    try { return (localStorage.getItem(FACING_KEY) as Facing) || 'environment'; } catch { return 'environment'; }
  });
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [canSwitch, setCanSwitch] = useState(false);
  const [actual, setActual] = useState<Facing>(facing);
  const [hwZoom, setHwZoom] = useState<HwZoom>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torch, setTorchState] = useState(false);
  const hd = !!opts.hd;

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | undefined;
    let cancelled = false;
    setReady(false);
    setError('');
    setHwZoom(null);
    setTorchAvailable(false);
    setTorchState(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't open the camera here. The camera needs the school system's secure (https) address — or use Photo instead.");
      return;
    }
    const size = hd ? { width: { ideal: 1920 }, height: { ideal: 1080 } } : { width: { ideal: 1280 }, height: { ideal: 720 } };
    navigator.mediaDevices
      .getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, ...size, frameRate: { ideal: 30 } } })
      .then(async s => {
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        const t = s.getVideoTracks()[0] ?? null;
        track.current = t;
        const settings = t?.getSettings();
        // Laptops report no facing mode: their webcam faces the user.
        setActual(settings?.facingMode === 'environment' ? 'environment' : 'user');
        const caps = (t && typeof t.getCapabilities === 'function' ? t.getCapabilities() : {}) as ZoomCaps;
        if (caps.zoom && caps.zoom.max > 1) {
          setHwZoom({ min: caps.zoom.min ?? 1, max: caps.zoom.max, step: caps.zoom.step ?? 0.1 });
        }
        setTorchAvailable(caps.torch === true);
        // Keep focusing as learners move (where supported).
        t?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {});
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
    return () => { cancelled = true; track.current = null; stream?.getTracks().forEach(t => t.stop()); setReady(false); };
  }, [on, facing, hd]);

  const flip = () => {
    const next: Facing = facing === 'user' ? 'environment' : 'user';
    try { localStorage.setItem(FACING_KEY, next); } catch { /* ignore */ }
    setFacing(next);
  };

  // Hardware zoom: one change at a time, the latest wins.
  const zoomBusy = useRef(false);
  const zoomWanted = useRef<number | null>(null);
  const applyHardwareZoom = useCallback((z: number) => {
    zoomWanted.current = z;
    if (zoomBusy.current) return;
    const run = async () => {
      zoomBusy.current = true;
      while (zoomWanted.current !== null) {
        const want = zoomWanted.current;
        zoomWanted.current = null;
        await track.current?.applyConstraints({ advanced: [{ zoom: want } as MediaTrackConstraintSet] }).catch(() => {});
      }
      zoomBusy.current = false;
    };
    run();
  }, []);

  const setTorch = useCallback((onOff: boolean) => {
    track.current?.applyConstraints({ advanced: [{ torch: onOff } as MediaTrackConstraintSet] })
      .then(() => setTorchState(onOff))
      .catch(() => setTorchAvailable(false));
  }, []);

  return {
    video, error, ready, canSwitch, flip, mirror: actual === 'user',
    hwZoom, applyHardwareZoom, torchAvailable, torch, setTorch,
  };
}

export type Camera = ReturnType<typeof useCamera>;

/** Zoom state for a camera: total zoom, where the digital crop is, and the controls. */
export function useZoom(cam: Camera) {
  const [s, setS] = useState<ZoomState>({ z: 1, cx: 0.5, cy: 0.5 });
  const hw = cam.hwZoom;
  const max = maxZoom(hw);
  const split = splitZoom(s.z, hw);
  const view: View = split.digital > 1.001 ? viewFor(split.digital, s.cx, s.cy) : FULL_VIEW;

  // Send the hardware part to the camera when it changes.
  const lastHw = useRef(1);
  useEffect(() => {
    if (!hw || !cam.ready) return;
    if (Math.abs(split.hardware - lastHw.current) < 1e-3) return;
    lastHw.current = split.hardware;
    cam.applyHardwareZoom(split.hardware);
  }, [hw, cam.ready, split.hardware, cam]);
  // A new camera starts unzoomed.
  useEffect(() => { setS({ z: 1, cx: 0.5, cy: 0.5 }); lastHw.current = 1; }, [cam.mirror, hw?.max]);

  const zoomTo = useCallback((z: number, sx = 0.5, sy = 0.5) => setS(p => zoomAt(p, z, hw, sx, sy, cam.mirror)), [hw, cam.mirror]);
  const pan = useCallback((dx: number, dy: number) => setS(p => panBy(p, hw, dx, dy, cam.mirror)), [hw, cam.mirror]);
  const reset = useCallback(() => setS({ z: 1, cx: 0.5, cy: 0.5 }), []);
  return { z: s.z, max, view, hardware: split.hardware, digital: split.digital, zoomTo, pan, reset, hasHardware: !!hw };
}

export type Zoom = ReturnType<typeof useZoom>;

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

/** A face box as fractions (0–1) of the displayed picture, already mirrored if needed. */
export interface StageBox { key: number; box: [number, number, number, number]; tone: Tone; label: string }

/** Frame-pixel box → StageBox fractions (for screens that don't zoom). */
export const frameBox = (b: [number, number, number, number], w: number, h: number, mirror: boolean): [number, number, number, number] =>
  boxInView([b[0] / w, b[1] / h, b[2] / w, b[3] / h], FULL_VIEW, mirror);

/** The live video with face boxes drawn over it. Front cameras are shown mirrored. */
export function Stage({ cam, boxes, aspect, zoom, children }: {
  cam: Camera;
  boxes: StageBox[];
  /** Width / height of the picture (falls back to 4:3 until known). */
  aspect?: number;
  /** Pass to enable zooming (pinch, wheel, double-tap, drag to look around). */
  zoom?: Zoom;
  children?: React.ReactNode;
}) {
  const view = zoom?.view ?? FULL_VIEW;
  const ref = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; z: number } | null>(null);
  const lastTap = useRef(0);

  const rel = (x: number, y: number) => {
    const r = ref.current!.getBoundingClientRect();
    return { sx: (x - r.left) / r.width, sy: (y - r.top) / r.height, w: r.width, h: r.height };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!zoom) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: zoom.z };
    } else if (e.pointerType !== 'mouse' || e.button === 0) {
      const now = performance.now();
      if (now - lastTap.current < 300) {
        const { sx, sy } = rel(e.clientX, e.clientY);
        zoom.zoomTo(zoom.z > 1.5 ? 1 : 2.5, sx, sy);
        lastTap.current = 0;
      } else lastTap.current = now;
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!zoom || !pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const { sx, sy } = rel((a.x + b.x) / 2, (a.y + b.y) / 2);
      zoom.zoomTo(pinch.current.z * (d / pinch.current.dist), sx, sy);
    } else if (pointers.current.size === 1 && zoom.digital > 1.001) {
      const { w, h } = rel(e.clientX, e.clientY);
      zoom.pan((e.clientX - prev.x) / w, (e.clientY - prev.y) / h);
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  // Wheel zoom needs a non-passive listener so the page doesn't scroll.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const zoomable = !!zoom;
  useEffect(() => {
    const el = ref.current;
    if (!el || !zoomable) return;
    const onWheel = (e: WheelEvent) => {
      const z = zoomRef.current;
      if (!z) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      z.zoomTo(z.z * Math.exp(-e.deltaY * 0.0015), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomable]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!zoom) return;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom.zoomTo(zoom.z * 1.25); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoom.zoomTo(zoom.z / 1.25); }
    else if (e.key === '0') { e.preventDefault(); zoom.reset(); }
    else if (zoom.digital > 1.001 && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const s = 0.1;
      zoom.pan(e.key === 'ArrowLeft' ? s : e.key === 'ArrowRight' ? -s : 0, e.key === 'ArrowUp' ? s : e.key === 'ArrowDown' ? -s : 0);
    }
  };

  const zoomed = !!zoom && zoom.digital > 1.001;
  return (
    <div
      ref={ref}
      className={`relative w-full select-none overflow-hidden rounded-xl bg-black ${zoom ? 'touch-none' : ''} ${zoomed ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{ aspectRatio: aspect && Number.isFinite(aspect) ? String(aspect) : '4 / 3' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      tabIndex={zoom ? 0 : undefined}
      aria-label={zoom ? 'Camera. Pinch, scroll or use + and − to zoom; drag to look around.' : undefined}
    >
      <video
        ref={cam.video}
        autoPlay
        playsInline
        muted
        className="absolute max-w-none object-cover"
        style={{ ...videoPlacement(view, cam.mirror), ...(cam.mirror ? { transform: 'scaleX(-1)' } : {}) }}
      />
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {boxes.map(b => (
          <div
            key={b.key}
            className={`absolute rounded-md border-2 ${TONE[b.tone]}`}
            style={{ left: `${b.box[0] * 100}%`, top: `${b.box[1] * 100}%`, width: `${b.box[2] * 100}%`, height: `${b.box[3] * 100}%` }}
          >
            {b.label && (
              <span className={`absolute -top-6 left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium text-white ${LABEL[b.tone]}`}>
                {b.label}
              </span>
            )}
          </div>
        ))}
      </div>
      {zoomed && <MiniMap view={view} mirror={cam.mirror} />}
      {children}
      <div className="absolute bottom-2 right-2 flex gap-2">
        {cam.torchAvailable && (
          <button
            type="button"
            onClick={() => cam.setTorch(!cam.torch)}
            onPointerDown={e => e.stopPropagation()}
            className="rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
            aria-label={cam.torch ? 'Light off' : 'Light on'}
            aria-pressed={cam.torch}
            title={cam.torch ? 'Light off' : 'Light on'}
          >
            {cam.torch ? <FlashlightOff size={18} /> : <Flashlight size={18} />}
          </button>
        )}
        {cam.canSwitch && (
          <button
            type="button"
            onClick={cam.flip}
            onPointerDown={e => e.stopPropagation()}
            className="rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
            aria-label="Switch camera"
            title="Switch camera"
          >
            <SwitchCamera size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Where the zoomed view is within the whole picture. */
function MiniMap({ view, mirror }: { view: View; mirror: boolean }) {
  const [x, y, w, h] = boxInView([view.x, view.y, view.w, view.h], FULL_VIEW, mirror);
  return (
    <div className="pointer-events-none absolute right-2 top-2 h-10 w-14 rounded border border-white/70 bg-black/40" aria-hidden>
      <div
        className="absolute border-2 border-yellow-300"
        style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }}
      />
    </div>
  );
}

/** Zoom controls under the camera: −, slider, +, and quick 1× 2× 3×. */
export function ZoomBar({ zoom }: { zoom: Zoom }) {
  const presets = [1, 2, 3, 4].filter(p => p <= zoom.max + 1e-6);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5">
      <button
        type="button"
        onClick={() => zoom.zoomTo(zoom.z / 1.25)}
        disabled={zoom.z <= 1.001}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-40"
        aria-label="Zoom out"
      >
        <Minus size={16} />
      </button>
      <input
        type="range"
        min={1}
        max={zoom.max}
        step={0.05}
        value={zoom.z}
        onChange={e => zoom.zoomTo(Number(e.target.value))}
        aria-label="Zoom"
        aria-valuetext={`${zoom.z.toFixed(1)} times`}
        className="h-9 min-w-[6rem] flex-1 accent-blue-600"
      />
      <button
        type="button"
        onClick={() => zoom.zoomTo(zoom.z * 1.25)}
        disabled={zoom.z >= zoom.max - 1e-3}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-40"
        aria-label="Zoom in"
      >
        <Plus size={16} />
      </button>
      <span className="w-12 text-center font-mono text-sm tabular-nums text-gray-800" aria-live="polite">{zoom.z.toFixed(1)}×</span>
      <div className="flex gap-1">
        {presets.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => (p === 1 ? zoom.reset() : zoom.zoomTo(p))}
            aria-pressed={Math.abs(zoom.z - p) < 0.05}
            className={`h-9 min-w-[2.5rem] rounded-md px-2 text-xs font-semibold ${Math.abs(zoom.z - p) < 0.05 ? 'bg-blue-600 text-white' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`}
          >
            {p}×
          </button>
        ))}
      </div>
      {zoom.hasHardware && <span className="text-[10px] text-gray-500" title="This camera zooms optically / at full sensor resolution first">camera zoom</span>}
    </div>
  );
}

export const firstName = (n?: string) => (n ?? '').trim().split(/\s+/)[0] ?? '';
