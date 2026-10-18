/**
 * How good is this sighting of a face for recognition?
 *
 * A blurred, tiny or turned-away face gives an embedding that matches
 * nobody well (or, worse, the wrong learner a little). Live recognition
 * therefore prefers sharp, frontal, large sightings, and combines the best
 * few of the same face (see fuseEmbeddings) before asking the server.
 *
 * Pure functions; only erasable TypeScript so Node can run this file.
 */
import type { Rgba } from "./core";

export type FaceQuality = {
  /** 0–1: face size against SFace's 112 px input. */
  size: number;
  /** 0–1: 1 = looking straight at the camera. */
  frontal: number;
  /** 0–1: from the variance of the Laplacian (focus / motion blur). */
  sharp: number;
  /** Detector confidence, 0–1. */
  det: number;
  /** Overall 0–1. */
  score: number;
};

/** Head turn from the 5 YuNet landmarks (raw: x,y,w,h, 5×(lx,ly), score). */
export function pose(raw: ArrayLike<number>) {
  const [rex, rey, lex, ley, nx, ny, rmx, rmy, lmx, lmy] = [raw[4], raw[5], raw[6], raw[7], raw[8], raw[9], raw[10], raw[11], raw[12], raw[13]];
  const eyeMidX = (rex + lex) / 2, eyeMidY = (rey + ley) / 2;
  const eyeDist = Math.hypot(lex - rex, ley - rey) || 1;
  const mouthMidY = (rmy + lmy) / 2;
  const mouthMidX = (rmx + lmx) / 2;
  // Yaw: the nose moves sideways from the eye/mouth centre line when the head turns.
  const centreX = (eyeMidX + mouthMidX) / 2;
  const yaw = Math.abs(nx - centreX) / eyeDist;
  // Pitch: where the nose sits between eyes and mouth (about half-way when level).
  const span = mouthMidY - eyeMidY;
  const pitch = span > 0 ? Math.abs((ny - eyeMidY) / span - 0.55) : 1;
  return { yaw, pitch };
}

/** Variance of the 4-neighbour Laplacian on a grey copy of the box, at most 64 px wide. */
export function sharpness(img: Rgba, box: ArrayLike<number>): number {
  const x0 = Math.max(0, Math.floor(box[0])), y0 = Math.max(0, Math.floor(box[1]));
  const x1 = Math.min(img.width, Math.ceil(box[0] + box[2])), y1 = Math.min(img.height, Math.ceil(box[1] + box[3]));
  const bw = x1 - x0, bh = y1 - y0;
  if (bw < 8 || bh < 8) return 0;
  const step = Math.max(1, Math.floor(bw / 64));
  const gw = Math.floor(bw / step), gh = Math.floor(bh / step);
  const g = new Float32Array(gw * gh);
  const d = img.data;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const p = ((y0 + y * step) * img.width + (x0 + x * step)) * 4;
      g[y * gw + x] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
    }
  }
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < gh - 1; y++) {
    for (let x = 1; x < gw - 1; x++) {
      const i = y * gw + x;
      const l = g[i - 1] + g[i + 1] + g[i - gw] + g[i + gw] - 4 * g[i];
      sum += l; sum2 += l * l; n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  // Coarser sampling of a big face hides detail, so scale back up a little.
  return (sum2 / n - mean * mean) * Math.sqrt(step);
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Combine the parts into one score. `scale`: image pixels per camera pixel
 * (a zoomed crop is enlarged; size must count the camera's real pixels).
 * Calibrated on real faces: in-focus ≈ 800–3000 Laplacian variance, a
 * 2 px blur ≈ 190, a 4 px blur ≈ 25.
 */
export function faceQuality(raw: ArrayLike<number>, img: Rgba, scale = 1): FaceQuality {
  const box = [raw[0], raw[1], raw[2], raw[3]];
  const { yaw, pitch } = pose(raw);
  const size = clamp01(Math.min(box[2], box[3]) / Math.max(scale, 1e-6) / 112);
  const frontal = clamp01(1 - yaw / 0.45) * clamp01(1 - pitch / 0.45);
  const sharp = clamp01(sharpness(img, box) * Math.max(1, scale) / 400);
  const det = clamp01(raw[14] ?? 0);
  // Size and sharpness matter most for SFace; frontal next.
  const score = clamp01(Math.pow(size, 0.6) * Math.pow(sharp, 0.5) * (0.35 + 0.65 * frontal) * (0.5 + 0.5 * det));
  return { size, frontal, sharp, det, score };
}

/** Below this a sighting is only used if nothing better arrives in time. */
export const MIN_QUALITY = 0.28;

/**
 * One embedding from several sightings of the same face: quality-weighted
 * mean, made unit length again (SFace compares by cosine).
 */
export function fuseEmbeddings(samples: Array<{ embedding: number[]; q: number }>): number[] {
  if (!samples.length) return [];
  if (samples.length === 1) return samples[0].embedding;
  const n = samples[0].embedding.length;
  const out = new Array<number>(n).fill(0);
  for (const s of samples) {
    const w = Math.max(0.05, s.q);
    for (let i = 0; i < n; i++) out[i] += s.embedding[i] * w;
  }
  const norm = Math.hypot(...out) || 1;
  return out.map((x) => Math.fround(x / norm));
}

/** Keep the best `max` sightings (by quality). */
export function keepBest<T extends { q: number }>(samples: T[], next: T, max = 3): T[] {
  return [...samples, next].sort((a, b) => b.q - a.q).slice(0, max);
}

/** The pixels around a face (enough for alignment), with landmarks moved into them. */
export function faceRegion(face: { box: ArrayLike<number>; raw: Float32Array }, frameW: number, frameH: number) {
  const x = face.box[0], y = face.box[1], w = face.box[2], h = face.box[3];
  const m = Math.max(w, h) * 0.75;
  const x0 = Math.max(0, Math.floor(x - m)), y0 = Math.max(0, Math.floor(y - m));
  const x1 = Math.min(frameW, Math.ceil(x + w + m)), y1 = Math.min(frameH, Math.ceil(y + h + m));
  const raw = new Float32Array(face.raw);
  for (let i = 0; i < 14; i++) if (i !== 2 && i !== 3) raw[i] -= i % 2 ? y0 : x0; // not w, h
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0), raw };
}

