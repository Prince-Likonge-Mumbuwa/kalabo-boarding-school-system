/**
 * Real-time recognition from a camera stream: no photo needs to be taken.
 *
 * Each new video frame is read (only the zoomed part, at the camera's full
 * resolution), faces are found at a small size (fast), and each face is
 * followed from frame to frame (a "track"). Only new or still-unconfirmed
 * tracks are turned into embeddings and sent to the server for matching.
 * Frames never leave the device.
 *
 * Speed and accuracy:
 *   - frames are taken as the camera delivers them (requestVideoFrameCallback),
 *     never the same frame twice;
 *   - embeddings read only the pixels around each face, not the whole frame;
 *   - each sighting gets a quality score (size, sharpness, head turn). A track
 *     waits briefly for a good sighting, keeps its best few, and sends their
 *     combined embedding — steadier than any single frame;
 *   - a borderline match is confirmed by a second look before it counts;
 *   - one learner can only be one face on screen.
 */
import { MIN_FACE_PX, detect, embed, type Rgba } from "./core";
import { getEngine } from "./index";
import { faceQuality, faceRegion, fuseEmbeddings, keepBest, MIN_QUALITY, type FaceQuality } from "./quality";

export { faceRegion };
import { FULL_VIEW, type View } from "./zoom";

// The analysed frame: at least 1280 px (a zoomed crop is enlarged to it, so
// distant faces pass the size check), at most 1920 (never shrink a full HD
// frame — only face regions are read from it, so size costs little).
const MIN_FRAME_SIDE = 1280;
const MAX_FRAME_SIDE = 1920;
const MAX_UPSCALE = 4;
/** Faces smaller than this in the CAMERA's pixels are too unreliable even when zoomed. */
export const MIN_NATIVE_PX = 28;
const DETECT_SIDE = 640; // detection runs on a smaller copy: much faster, still finds faces ≥ 30 px

export type Box = [number, number, number, number];
/**
 * A face in the frame just read. `box`/`raw` in frame pixels; `nbox` in
 * normalised video coordinates; `scale` frame pixels per camera pixel.
 */
export type LiveFace = { box: Box; nbox: Box; raw: Float32Array; score: number; scale?: number };
export type Frame = { width: number; height: number; view: View; scale: number; faces: LiveFace[] };

/** Size of the analysed frame for a crop of `w`×`h` camera pixels. */
export function frameSize(w: number, h: number) {
  const native = Math.max(w, h);
  const target = Math.min(MAX_FRAME_SIDE, Math.max(native, MIN_FRAME_SIDE));
  const scale = Math.min(MAX_UPSCALE, target / native);
  return { width: Math.max(1, Math.trunc(w * scale)), height: Math.max(1, Math.trunc(h * scale)), scale };
}

type Ctx = CanvasRenderingContext2D;
const canvas = (): [HTMLCanvasElement, Ctx] => {
  const c = document.createElement("canvas");
  return [c, c.getContext("2d", { willReadFrequently: true })!];
};

/** Reads frames from a video and finds faces in them. */
export class FrameReader {
  private full = canvas();
  private small = canvas();
  private ready = false;
  private regions = new WeakMap<LiveFace, { img: Rgba; raw: Float32Array }>();

  async start(onProgress?: (msg: string) => void) {
    await getEngine(onProgress);
    this.ready = true;
  }

  /** Grab the current video frame (the `view` part of it) and find the faces in it. */
  async read(video: HTMLVideoElement, view: View = FULL_VIEW): Promise<Frame | null> {
    if (!this.ready || !video.videoWidth || video.readyState < 2) return null;
    const { ort, yunet } = await getEngine();
    const vw = video.videoWidth, vh = video.videoHeight;
    const sx = view.x * vw, sy = view.y * vh, sw = view.w * vw, sh = view.h * vh;
    const { width: fw, height: fh, scale: fs } = frameSize(sw, sh);
    const [fc, fx] = this.full;
    if (fc.width !== fw || fc.height !== fh) { fc.width = fw; fc.height = fh; }
    fx.drawImage(video, sx, sy, sw, sh, 0, 0, fw, fh);
    this.regions = new WeakMap();

    const ds = Math.min(1, DETECT_SIDE / Math.max(fw, fh));
    const dw = Math.max(1, Math.trunc(fw * ds)), dh = Math.max(1, Math.trunc(fh * ds));
    const [sc, sx2] = this.small;
    if (sc.width !== dw || sc.height !== dh) { sc.width = dw; sc.height = dh; }
    sx2.drawImage(fc, 0, 0, dw, dh);
    const img = sx2.getImageData(0, 0, dw, dh);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raws = await detect(ort as any, yunet as any, { data: img.data, width: dw, height: dh });
    const kx = fw / dw, ky = fh / dh;
    const faces: LiveFace[] = [];
    for (const r of raws) {
      const raw = new Float32Array(r);
      for (let i = 0; i < 14; i++) raw[i] = r[i] * (i % 2 ? ky : kx);
      const box: Box = [Math.trunc(raw[0]), Math.trunc(raw[1]), Math.trunc(raw[2]), Math.trunc(raw[3])];
      if (Math.min(box[2], box[3]) < MIN_FACE_PX || Math.min(raw[2], raw[3]) / fs < MIN_NATIVE_PX) continue;
      const nbox: Box = [view.x + (raw[0] / fw) * view.w, view.y + (raw[1] / fh) * view.h, (raw[2] / fw) * view.w, (raw[3] / fh) * view.h];
      faces.push({ box, nbox, raw, score: raw[14], scale: fs });
    }
    return { width: fw, height: fh, view, scale: fs, faces };
  }

  /** Pixels around one face of the frame just read (read once, then reused). */
  private region(face: LiveFace) {
    const hit = this.regions.get(face);
    if (hit) return hit;
    const [fc, fx] = this.full;
    const r = faceRegion(face, fc.width, fc.height);
    const d = fx.getImageData(r.x, r.y, r.w, r.h);
    const out = { img: { data: d.data, width: d.width, height: d.height } as Rgba, raw: r.raw };
    this.regions.set(face, out);
    return out;
  }

  /** Quality of a face from the frame just read (call before the next read). */
  quality(face: LiveFace): FaceQuality {
    const { img, raw } = this.region(face);
    return faceQuality(raw, img, face.scale ?? 1);
  }

  /** Embeddings for faces from the frame just read (call before the next read). */
  async embed(faces: LiveFace[]): Promise<number[][]> {
    const { ort, sface } = await getEngine();
    const out: number[][] = [];
    for (const f of faces) {
      const { img, raw } = this.region(f);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      out.push(await embed(ort as any, sface as any, img, raw));
    }
    return out;
  }
}

/* ---------- following faces between frames ---------- */

export type Verdict = "match" | "review" | "unknown";
export type Sample = { embedding: number[]; q: number };
export type Track = {
  id: number;
  /** Normalised video coordinates (stay put when zooming / panning). */
  box: Box;
  face: LiveFace;
  firstAt: number; seenAt: number; stableSince: number;
  tries: number; triedAt: number; pending: boolean;
  /** Quality of the sighting in the latest frame (null until measured). */
  q: number | null;
  /** Best sightings so far, combined when asking the server. */
  samples: Sample[];
  /** Learner the server proposed, and how many answers agreed. */
  candidate: string | null; confirms: number;
  /** The server's last answer for this face. */
  last: Verdict | null;
  learner_id: string | null; similarity: number | null; verdict: Verdict | null;
};

const boxOf = (f: LiveFace): Box => f.nbox ?? f.box;

const iou = (a: Box, b: Box) => {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]), y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const u = a[2] * a[3] + b[2] * b[3] - inter;
  return u > 0 ? inter / u : 0;
};

/** How long to wait before asking again about a face that is not settled yet. */
export const RETRY_MS = { first: 0, unconfirmed: 220, review: 450, unknown: 550 };
/** A brand-new face waits this long for a sharp, frontal sighting before asking anyway. */
export const WAIT_FOR_QUALITY_MS = 650;
const MAX_TRIES = 16;

export class Tracker {
  tracks: Track[] = [];
  private next = 1;
  constructor(private keepMs = 900) {}

  update(faces: LiveFace[], now: number) {
    const free = new Set(this.tracks);
    const pairs: [number, Track, LiveFace][] = [];
    for (const f of faces) for (const t of this.tracks) { const o = iou(boxOf(f), t.box); if (o > 0.25) pairs.push([o, t, f]); }
    pairs.sort((a, b) => b[0] - a[0]);
    const usedFaces = new Set<LiveFace>();
    for (const [o, t, f] of pairs) {
      if (!free.has(t) || usedFaces.has(f)) continue;
      free.delete(t); usedFaces.add(f);
      if (o < 0.6) t.stableSince = now; // moved a lot: not "holding still"
      t.box = boxOf(f); t.face = f; t.seenAt = now; t.q = null;
    }
    for (const f of faces) {
      if (usedFaces.has(f)) continue;
      this.tracks.push({
        id: this.next++, box: boxOf(f), face: f, firstAt: now, seenAt: now, stableSince: now,
        tries: 0, triedAt: 0, pending: false, q: null, samples: [], candidate: null, confirms: 0, last: null,
        learner_id: null, similarity: null, verdict: null,
      });
    }
    this.tracks = this.tracks.filter((t) => now - t.seenAt < this.keepMs);
  }

  /** Visible tracks — the ones on screen in this frame. */
  visible(now: number) { return this.tracks.filter((t) => now - t.seenAt < 50 || t.seenAt === now); }

  /** Tracks in this frame that are not settled (no confirmed match yet). */
  unsettled(now: number) {
    return this.tracks.filter((t) => t.seenAt === now && t.verdict !== "match" && t.tries < MAX_TRIES);
  }

  /**
   * Tracks worth (re)identifying now: new faces as soon as a good sighting
   * arrives, unconfirmed ones quickly, uncertain ones now and then.
   * Call after `q` is set for this frame's unsettled tracks.
   */
  needingId(now: number, max = 6) {
    return this.unsettled(now)
      .filter((t) => {
        if (t.pending) return false;
        const gap = t.tries === 0 ? RETRY_MS.first
          : t.last === "match" ? RETRY_MS.unconfirmed
          : t.last === "review" ? RETRY_MS.review : RETRY_MS.unknown;
        if (now - t.triedAt < gap) return false;
        // Wait (briefly) for a usable sighting.
        const good = (t.q ?? 0) >= MIN_QUALITY || t.samples.some((s) => s.q >= MIN_QUALITY);
        return good || now - Math.max(t.firstAt, t.triedAt) > WAIT_FOR_QUALITY_MS;
      })
      .sort((a, b) => a.tries - b.tries || b.box[2] - a.box[2])
      .slice(0, max);
  }

  /** Add this frame's embedding to a track's best sightings. Returns the combined embedding. */
  addSample(t: Track, embedding: number[], q: number) {
    t.samples = keepBest(t.samples, { embedding, q }, 3);
    return fuseEmbeddings(t.samples);
  }

  reset() { this.tracks = []; }
}

/* ---------- deciding what a server answer means ---------- */

export type Answer = { learnerId: string | null; similarity: number | null; verdict: Verdict };
export type JudgeOptions = { matchThreshold: number; /** above match + this, one answer is enough */ strongMargin?: number };

/**
 * Apply a server answer to a track. Returns true when the track has just
 * become a confirmed match.
 *   - a clear match well above the threshold counts at once;
 *   - a clear match near the threshold needs a second agreeing answer;
 *   - a different learner proposed later starts the count again;
 *   - "not known" after a candidate keeps the candidate (one bad frame).
 */
export function judge(t: Track, a: Answer, o: JudgeOptions): boolean {
  if (t.verdict === "match") return false;
  t.last = a.learnerId ? a.verdict : "unknown";
  if (!a.learnerId || a.verdict === "unknown") {
    if (!t.candidate) t.verdict = "unknown";
    return false;
  }
  if (t.candidate === a.learnerId) {
    t.confirms++;
    t.similarity = Math.max(t.similarity ?? 0, a.similarity ?? 0);
  } else {
    t.candidate = a.learnerId;
    t.confirms = 1;
    t.similarity = a.similarity;
  }
  t.learner_id = a.learnerId;
  const strong = (a.similarity ?? 0) >= o.matchThreshold + (o.strongMargin ?? 0.08);
  if (a.verdict === "match" && (strong || t.confirms >= 2)) {
    t.verdict = "match";
    return true;
  }
  t.verdict = "review";
  return false;
}

/**
 * One learner, one face. When `winner` holds `learnerId`, other tracks that
 * claim the same learner with a weaker answer are sent back to be asked
 * again. Returns the tracks that were reset.
 */
export function resolveDuplicates(tracks: Track[], winner: Track): Track[] {
  const reset: Track[] = [];
  for (const t of tracks) {
    if (t === winner || t.learner_id !== winner.learner_id) continue;
    if (t.verdict === "match" && (t.similarity ?? 0) >= (winner.similarity ?? 0)) continue;
    t.candidate = null; t.confirms = 0; t.last = null; t.learner_id = null; t.similarity = null; t.verdict = null; t.triedAt = 0;
    reset.push(t);
  }
  return reset;
}

/* ---------- the loop ---------- */

type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number; cancelVideoFrameCallback?: (h: number) => void };

/** Resolves when the camera has delivered a frame we have not seen (or after `maxWait`). */
export function nextFrame(video: HTMLVideoElement | null, maxWait = 100): Promise<void> {
  const v = video as FrameVideo | null;
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const timer = setTimeout(finish, maxWait);
    if (v?.requestVideoFrameCallback) {
      v.requestVideoFrameCallback(() => { clearTimeout(timer); finish(); });
    }
  });
}

/**
 * Run `step` once per new camera frame while `active()` is true, at least
 * `minGapMs` apart. Slower devices simply process fewer frames.
 */
export function runLoop(step: () => Promise<void>, active: () => boolean, minGapMs = 40, video?: () => HTMLVideoElement | null) {
  let stopped = false;
  (async () => {
    while (!stopped && active()) {
      const t0 = performance.now();
      if (document.visibilityState === "visible") {
        try { await step(); } catch (e) { console.error(e); }
      }
      const rest = minGapMs - (performance.now() - t0);
      if (document.visibilityState !== "visible") await new Promise((r) => setTimeout(r, 500));
      else if (rest > 0) await new Promise((r) => setTimeout(r, rest));
      if (video) await nextFrame(video(), 100);
      else await new Promise((r) => setTimeout(r, 16));
    }
  })();
  return () => { stopped = true; };
}
