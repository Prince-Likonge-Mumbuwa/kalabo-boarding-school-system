// Live recognition logic: zoom maths, face regions, quality, fusion,
// tracking, confirmation and one-learner-one-face. (The models themselves
// were checked separately on real photos — see FACE_RECOGNITION.md.)
import { describe, it, expect } from 'vitest';
import {
  DIGITAL_MAX, FULL_VIEW, TOTAL_MAX, boxInView, maxZoom, panBy, splitZoom, videoPlacement, viewFor, zoomAt,
} from './zoom';
import { faceQuality, faceRegion, fuseEmbeddings, keepBest, pose, sharpness, MIN_QUALITY } from './quality';
import { RETRY_MS, Tracker, WAIT_FOR_QUALITY_MS, frameSize, judge, resolveDuplicates, type LiveFace, type Track } from './live';

const close = (a: number, b: number, e = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(e);

describe('zoom', () => {
  const hw = { min: 1, max: 5, step: 0.1 };

  it('uses the camera zoom first, then crops', () => {
    expect(splitZoom(3, hw)).toEqual({ hardware: 3, digital: 1 });
    const s = splitZoom(8, hw);
    expect(s.hardware).toBe(5);
    close(s.digital, 1.6);
    expect(splitZoom(2.5, null)).toEqual({ hardware: 1, digital: 2.5 });
    expect(maxZoom(null)).toBe(DIGITAL_MAX);
    expect(maxZoom(hw)).toBe(TOTAL_MAX);
  });

  it('keeps the crop inside the picture', () => {
    const v = viewFor(2, 0.95, 0.05);
    expect(v).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
    expect(viewFor(1, 0.3, 0.3)).toEqual(FULL_VIEW);
  });

  it('pinch / wheel zoom keeps the point under the fingers in place', () => {
    const s = zoomAt({ z: 1, cx: 0.5, cy: 0.5 }, 2, null, 0.25, 0.75);
    const v = viewFor(2, s.cx, s.cy);
    // picture point (0.25, 0.75) was under screen (0.25, 0.75); it still is
    close(v.x + 0.25 * v.w, 0.25);
    close(v.y + 0.75 * v.h, 0.75);
  });

  it('mirrored (front) camera: zoom anchors and panning follow what the teacher sees', () => {
    const s = zoomAt({ z: 1, cx: 0.5, cy: 0.5 }, 2, null, 0.1, 0.5, true);
    const v = viewFor(2, s.cx, s.cy);
    // screen x 0.1 shows picture x 0.9 when mirrored
    close(v.x + (1 - 0.1) * v.w, 0.9);
    // dragging right reveals more of the (screen) left = picture right when mirrored
    const right = panBy({ z: 2, cx: 0.5, cy: 0.5 }, null, 0.2, 0, true);
    expect(right.cx).toBeGreaterThan(0.5);
    const plain = panBy({ z: 2, cx: 0.5, cy: 0.5 }, null, 0.2, 0, false);
    expect(plain.cx).toBeLessThan(0.5);
  });

  it('places boxes and the video consistently', () => {
    const v = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    expect(boxInView([0.5, 0.5, 0.1, 0.1], v)).toEqual([0.5, 0.5, 0.2, 0.2]);
    const m = boxInView([0.5, 0.5, 0.1, 0.1], v, true);
    close(m[0], 1 - 0.5 - 0.2);
    expect(videoPlacement(v)).toEqual({ left: '-50%', top: '-50%', width: '200%', height: '200%' });
    expect(videoPlacement(FULL_VIEW, true)).toEqual({ left: '0%', top: '0%', width: '100%', height: '100%' });
  });

  it('zoomed crops are enlarged to at least 1280 px (up to 4×); full HD is never shrunk', () => {
    expect(frameSize(1920, 1080)).toEqual({ width: 1920, height: 1080, scale: 1 });
    expect(frameSize(1280, 720).scale).toBe(1);
    const z3 = frameSize(640, 360);
    expect(z3.width).toBe(1280);
    expect(z3.scale).toBe(2);
    expect(frameSize(200, 112).scale).toBe(4);
    expect(frameSize(3840, 2160)).toEqual({ width: 1920, height: 1080, scale: 0.5 });
  });
});

// A synthetic face: landmarks of a level, frontal face in a 100 px box.
const rawFace = (x = 50, y = 40, s = 100, score = 0.95, noseShift = 0) => {
  const r = new Float32Array(15);
  r.set([x, y, s, s]);
  r.set([x + 0.3 * s, y + 0.4 * s, x + 0.7 * s, y + 0.4 * s, x + 0.5 * s + noseShift * s, y + 0.62 * s, x + 0.35 * s, y + 0.8 * s, x + 0.65 * s, y + 0.8 * s], 4);
  r[14] = score;
  return r;
};
const image = (w: number, h: number, f: (x: number, y: number) => number) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y), p = (y * w + x) * 4; data[p] = data[p + 1] = data[p + 2] = v; data[p + 3] = 255; }
  return { data, width: w, height: h };
};

describe('face region', () => {
  it('moves the landmarks into the region but keeps the face size (regression)', () => {
    const raw = rawFace(400, 300, 100);
    const g = faceRegion({ box: [400, 300, 100, 100], raw }, 1920, 1080);
    expect([g.x, g.y]).toEqual([325, 225]);
    expect([g.raw[0], g.raw[1], g.raw[2], g.raw[3]]).toEqual([75, 75, 100, 100]);
    close(g.raw[4], raw[4] - 325, 1e-4);
    close(g.raw[5], raw[5] - 225, 1e-4);
    expect(g.w).toBe(250);
  });

  it('stays inside the frame at the edges', () => {
    const g = faceRegion({ box: [5, 5, 100, 100], raw: rawFace(5, 5, 100) }, 160, 140);
    expect([g.x, g.y, g.x + g.w <= 160, g.y + g.h <= 140]).toEqual([0, 0, true, true]);
  });
});

describe('quality', () => {
  const sharpImg = image(220, 200, (x, y) => ((x >> 2) + (y >> 2)) % 2 ? 230 : 30); // fine detail
  const flatImg = image(220, 200, () => 128); // no detail at all (= extreme blur)

  it('detail scores sharp; a flat (blurred) face does not', () => {
    expect(sharpness(sharpImg, [50, 40, 100, 100])).toBeGreaterThan(1000);
    expect(sharpness(flatImg, [50, 40, 100, 100])).toBe(0);
    expect(faceQuality(rawFace(), sharpImg).sharp).toBe(1);
    expect(faceQuality(rawFace(), flatImg).score).toBe(0);
  });

  it('a turned head and a small face score lower', () => {
    expect(pose(rawFace()).yaw).toBeLessThan(0.01);
    const straight = faceQuality(rawFace(), sharpImg);
    const turned = faceQuality(rawFace(50, 40, 100, 0.95, 0.15), sharpImg);
    expect(turned.frontal).toBeLessThan(straight.frontal);
    expect(turned.score).toBeLessThan(straight.score);
    expect(straight.score).toBeGreaterThan(MIN_QUALITY);
    // the same face enlarged 3× from a zoomed crop counts its real (camera) size
    const enlarged = faceQuality(rawFace(), sharpImg, 3);
    expect(enlarged.size).toBeCloseTo(100 / 3 / 112, 5);
    expect(enlarged.score).toBeLessThan(straight.score);
  });

  it('fuses sightings into one unit-length embedding, weighted by quality; keeps the best 3', () => {
    const a = [1, 0, 0], b = [0, 1, 0];
    const f = fuseEmbeddings([{ embedding: a, q: 0.9 }, { embedding: b, q: 0.1 }]);
    close(Math.hypot(...f), 1, 1e-6);
    expect(f[0]).toBeGreaterThan(f[1]);
    expect(fuseEmbeddings([{ embedding: a, q: 0.5 }])).toBe(a);
    const kept = [0.2, 0.9, 0.5, 0.7].reduce((acc, q) => keepBest(acc, { q, embedding: [] }), [] as Array<{ q: number; embedding: number[] }>);
    expect(kept.map(k => k.q)).toEqual([0.9, 0.7, 0.5]);
  });
});

const face = (x: number, y = 0.2, w = 0.1): LiveFace => ({ box: [0, 0, 100, 100], nbox: [x, y, w, w], raw: rawFace(), score: 0.95 });

describe('tracking', () => {
  it('follows a face through zooming (boxes are in whole-picture coordinates)', () => {
    const t = new Tracker();
    t.update([face(0.4)], 0);
    const id = t.tracks[0].id;
    t.update([face(0.405)], 40); // same place in the picture, even if the crop changed
    expect(t.tracks).toHaveLength(1);
    expect(t.tracks[0].id).toBe(id);
    t.update([face(0.8)], 80); // someone else
    expect(t.tracks.map(x => x.id)).toContain(id + 1);
  });

  it('asks at once about a sharp new face; waits briefly for a better look at a poor one', () => {
    const t = new Tracker();
    t.update([face(0.1), face(0.6)], 0);
    const [good, poor] = t.tracks;
    good.q = 0.7; poor.q = 0.1;
    expect(t.needingId(0)).toEqual([good]);
    t.update([face(0.1), face(0.6)], WAIT_FOR_QUALITY_MS + 10);
    good.q = 0.7; poor.q = 0.1;
    expect(t.needingId(WAIT_FOR_QUALITY_MS + 10)).toContain(poor); // asked anyway in the end
  });

  it('re-asks quickly to confirm a borderline match, less often when unsure', () => {
    const t = new Tracker();
    t.update([face(0.1)], 0);
    const tr = t.tracks[0];
    tr.q = 0.8; tr.tries = 1; tr.triedAt = 0; tr.last = 'match'; tr.candidate = 'A'; tr.confirms = 1; tr.verdict = 'review';
    t.update([face(0.1)], RETRY_MS.unconfirmed - 10); tr.q = 0.8;
    expect(t.needingId(RETRY_MS.unconfirmed - 10)).toEqual([]);
    t.update([face(0.1)], RETRY_MS.unconfirmed + 10); tr.q = 0.8;
    expect(t.needingId(RETRY_MS.unconfirmed + 10)).toEqual([tr]);
    tr.last = 'unknown'; tr.triedAt = RETRY_MS.unconfirmed + 10;
    t.update([face(0.1)], RETRY_MS.unconfirmed + 300); tr.q = 0.8;
    expect(t.needingId(RETRY_MS.unconfirmed + 300)).toEqual([]);
  });

  it('settled (matched) faces are never asked about again', () => {
    const t = new Tracker();
    t.update([face(0.1)], 0);
    t.tracks[0].verdict = 'match'; t.tracks[0].q = 1;
    expect(t.needingId(0)).toEqual([]);
  });

  it('keeps the best sightings and sends their combination', () => {
    const t = new Tracker();
    t.update([face(0.1)], 0);
    const tr = t.tracks[0];
    t.addSample(tr, [1, 0], 0.3);
    const fused = t.addSample(tr, [0, 1], 0.9);
    expect(tr.samples.map(s => s.q)).toEqual([0.9, 0.3]);
    expect(fused[1]).toBeGreaterThan(fused[0]);
  });
});

const blankTrack = (): Track => ({
  id: 1, box: [0, 0, 0.1, 0.1], face: face(0), firstAt: 0, seenAt: 0, stableSince: 0, tries: 1, triedAt: 0, pending: false,
  q: null, samples: [], candidate: null, confirms: 0, last: null, learner_id: null, similarity: null, verdict: null,
});

describe('confirming a match', () => {
  const o = { matchThreshold: 0.45 };

  it('a strong match counts at once', () => {
    const t = blankTrack();
    expect(judge(t, { learnerId: 'A', similarity: 0.7, verdict: 'match' }, o)).toBe(true);
    expect(t.verdict).toBe('match');
  });

  it('a borderline match needs a second agreeing answer', () => {
    const t = blankTrack();
    expect(judge(t, { learnerId: 'A', similarity: 0.48, verdict: 'match' }, o)).toBe(false);
    expect(t.verdict).toBe('review');
    expect(t.last).toBe('match');
    expect(judge(t, { learnerId: 'A', similarity: 0.5, verdict: 'match' }, o)).toBe(true);
    expect(t.similarity).toBe(0.5);
  });

  it('a different learner restarts the count; one "not known" frame keeps the candidate', () => {
    const t = blankTrack();
    judge(t, { learnerId: 'A', similarity: 0.48, verdict: 'match' }, o);
    expect(judge(t, { learnerId: null, similarity: null, verdict: 'unknown' }, o)).toBe(false);
    expect(t.candidate).toBe('A');
    expect(judge(t, { learnerId: 'B', similarity: 0.49, verdict: 'match' }, o)).toBe(false);
    expect([t.candidate, t.confirms]).toEqual(['B', 1]);
    expect(judge(t, { learnerId: 'B', similarity: 0.47, verdict: 'match' }, o)).toBe(true);
  });

  it('"check" answers never become a match by repetition', () => {
    const t = blankTrack();
    judge(t, { learnerId: 'A', similarity: 0.4, verdict: 'review' }, o);
    expect(judge(t, { learnerId: 'A', similarity: 0.41, verdict: 'review' }, o)).toBe(false);
    expect(t.verdict).toBe('review');
  });

  it('an unknown face stays unknown', () => {
    const t = blankTrack();
    judge(t, { learnerId: null, similarity: null, verdict: 'unknown' }, o);
    expect(t.verdict).toBe('unknown');
  });

  it('one learner, one face: weaker claims on the same learner are asked again', () => {
    const win = { ...blankTrack(), id: 1, learner_id: 'A', similarity: 0.7, verdict: 'match' as const };
    const weak = { ...blankTrack(), id: 2, learner_id: 'A', similarity: 0.5, verdict: 'review' as const, candidate: 'A', confirms: 1 };
    const other = { ...blankTrack(), id: 3, learner_id: 'B', similarity: 0.6, verdict: 'match' as const };
    expect(resolveDuplicates([win, weak, other], win)).toEqual([weak]);
    expect([weak.learner_id, weak.verdict, weak.candidate]).toEqual([null, null, null]);
    expect(other.verdict).toBe('match');
  });
});
