/**
 * Camera zoom maths, shared by the live scanner's display and the frame
 * reader so that what the teacher sees is exactly what is analysed.
 *
 * Total zoom z = hardware × digital.
 *   - Hardware zoom (phones that support the `zoom` camera setting) changes
 *     the picture the camera sends, using the full sensor — best quality.
 *   - Digital zoom crops the picture. The crop ("view") is in normalised
 *     video coordinates (0–1) and can be panned.
 * Recognition reads the crop at the camera's full resolution, so faces at
 * the back of a classroom get more pixels than in the unzoomed frame.
 *
 * Pure functions; only erasable TypeScript so Node can run this file.
 */

export type View = { x: number; y: number; w: number; h: number };
export type HwZoom = { min: number; max: number; step: number } | null;
export type ZoomState = { z: number; cx: number; cy: number };

export const FULL_VIEW: View = { x: 0, y: 0, w: 1, h: 1 };
/** Digital zoom limit: beyond this the crop has too few pixels to help. */
export const DIGITAL_MAX = 4;
/** Total zoom limit (hardware × digital). */
export const TOTAL_MAX = 8;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function maxZoom(hw: HwZoom): number {
  return hw && hw.max > 1 ? Math.min(TOTAL_MAX, hw.max * DIGITAL_MAX) : DIGITAL_MAX;
}

/** How much of z the camera does itself, and how much is cropping. */
export function splitZoom(z: number, hw: HwZoom): { hardware: number; digital: number } {
  if (!hw || hw.max <= 1) return { hardware: 1, digital: Math.max(1, z) };
  const lo = Math.max(1, hw.min);
  let hardware = clamp(z, lo, hw.max);
  if (hw.step > 0) hardware = Math.round(hardware / hw.step) * hw.step;
  hardware = clamp(hardware, lo, hw.max);
  return { hardware, digital: Math.max(1, z / hardware) };
}

/** The crop for a digital zoom around (cx, cy), kept inside the picture. */
export function viewFor(digital: number, cx: number, cy: number): View {
  const d = Math.max(1, digital);
  const w = 1 / d, h = 1 / d;
  return { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h };
}

/** Centre of a view. */
export const centreOf = (v: View) => ({ cx: v.x + v.w / 2, cy: v.y + v.h / 2 });

/**
 * Zoom to `z` keeping the picture point under the screen point (sx, sy)
 * (0–1 across the displayed area) where it is. `mirror`: front camera shown
 * mirrored.
 */
export function zoomAt(s: ZoomState, z: number, hw: HwZoom, sx = 0.5, sy = 0.5, mirror = false): ZoomState {
  const nz = clamp(z, 1, maxZoom(hw));
  const before = viewFor(splitZoom(s.z, hw).digital, s.cx, s.cy);
  const after = viewFor(splitZoom(nz, hw).digital, 0.5, 0.5); // only its size matters
  const fx = mirror ? 1 - sx : sx;
  const px = before.x + fx * before.w;
  const py = before.y + sy * before.h;
  const x = px - fx * after.w;
  const y = py - sy * after.h;
  const v = viewFor(1 / after.w, x + after.w / 2, y + after.h / 2);
  return { z: nz, ...centreOf(v) };
}

/** Pan by a drag of (dx, dy), as fractions of the displayed area. */
export function panBy(s: ZoomState, hw: HwZoom, dx: number, dy: number, mirror = false): ZoomState {
  const v = viewFor(splitZoom(s.z, hw).digital, s.cx, s.cy);
  const moved = viewFor(1 / v.w, v.x + v.w / 2 + (mirror ? dx : -dx) * v.w, v.y + v.h / 2 - dy * v.h);
  return { z: s.z, ...centreOf(moved) };
}

/** A box in normalised video coordinates → fractions of the displayed view (mirroring applied). */
export function boxInView(b: [number, number, number, number], v: View, mirror = false): [number, number, number, number] {
  const x = (b[0] - v.x) / v.w, y = (b[1] - v.y) / v.h, w = b[2] / v.w, h = b[3] / v.h;
  return [mirror ? 1 - x - w : x, y, w, h];
}

/** CSS placement of the <video> so that only `v` shows in its box. */
export function videoPlacement(v: View, mirror = false) {
  const left = -(mirror ? 1 - v.x - v.w : v.x) / v.w;
  return { left: `${left * 100}%`, top: `${(-v.y / v.h) * 100}%`, width: `${100 / v.w}%`, height: `${100 / v.h}%` };
}
