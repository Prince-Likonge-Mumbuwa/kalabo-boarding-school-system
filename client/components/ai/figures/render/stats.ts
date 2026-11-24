// @/components/ai/figures/render/stats.ts — the two Geography graphs drawn the
// textbook way:
//   • a climate graph: monthly rainfall as bars (left axis, mm) with the
//     temperature as a line on top (right axis, °C);
//   • a population pyramid: males on the left, females on the right, the
//     youngest age group at the bottom.
// Both are black and white so they photocopy cleanly.
import type { ClimateSpec, PopulationSpec } from '../spec';
import { FAINT, INK, n, niceStep, svg, text, ticks } from './svg';

export const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
export const AGE_GROUPS = ['0-4', '5-9', '10-14', '15-19', '20-24', '25-29', '30-34', '35-39', '40-44', '45-49', '50-54', '55-59', '60-64', '65-69', '70-74', '75-79', '80+'];

const vertical = (x: number, y: number, s: string) => `<g transform="translate(${n(x)} ${n(y)}) rotate(-90)">${text(0, 0, s, { size: 12.5, anchor: 'middle', weight: 'bold' })}</g>`;

export function renderClimate(spec: ClimateSpec): string {
  const months = spec.months?.length === 12 ? spec.months : MONTHS;
  const rain = months.map((_, i) => Math.max(0, Number(spec.rainfall?.[i]) || 0));
  const temp = months.map((_, i) => Number(spec.temperature?.[i]));
  const hasTemp = temp.some(Number.isFinite);
  const W = 560, H = 380, L = 64, R = hasTemp ? 64 : 24, T = 30, B = 52;
  const pw = W - L - R, ph = H - T - B;

  // Rainfall axis (left) from 0
  const rStep = niceStep(Math.max(...rain, 10), 7);
  const rMax = Math.ceil((Math.max(...rain, 10) * 1.05) / rStep) * rStep;
  const sr = (v: number) => T + ph - (v / rMax) * ph;
  // Temperature axis (right): same number of steps, so the gridlines are shared
  const steps = Math.round(rMax / rStep);
  const tVals = temp.filter(Number.isFinite);
  let tMin = 0, tStep = 5;
  if (tVals.length) {
    const lo = Math.min(...tVals), hi = Math.max(...tVals);
    tStep = [1, 2, 2.5, 5, 10].find((s) => Math.floor(Math.min(0, lo) / s) * s + s * steps >= hi + s * 0.3) ?? 10;
    tMin = Math.min(0, Math.floor(lo / tStep) * tStep);
  }
  const tMax = tMin + tStep * steps;
  const st = (v: number) => T + ph - ((v - tMin) / (tMax - tMin)) * ph;

  const parts: string[] = [];
  for (const v of ticks(0, rMax, rStep)) {
    parts.push(`<line x1="${L}" y1="${n(sr(v))}" x2="${L + pw}" y2="${n(sr(v))}" stroke="${FAINT}" stroke-width="0.5"/>`);
    parts.push(`<line x1="${L - 4}" y1="${n(sr(v))}" x2="${L}" y2="${n(sr(v))}" stroke="${INK}"/>`, text(L - 7, sr(v) + 4, String(v), { size: 11, anchor: 'end' }));
  }
  const slot = pw / 12;
  rain.forEach((v, i) => {
    const x = L + slot * i + slot * 0.12, w = slot * 0.76;
    parts.push(`<rect x="${n(x)}" y="${n(sr(v))}" width="${n(w)}" height="${n(T + ph - sr(v))}" fill="#d9d9d9" stroke="${INK}" stroke-width="1"/>`);
  });
  if (hasTemp) {
    for (let k = 0; k <= steps; k++) {
      const v = +(tMin + k * tStep).toFixed(1), y = st(v);
      parts.push(`<line x1="${L + pw}" y1="${n(y)}" x2="${L + pw + 4}" y2="${n(y)}" stroke="${INK}"/>`, text(L + pw + 7, y + 4, String(v), { size: 11 }));
    }
    const pts = temp.map((v, i) => (Number.isFinite(v) ? [L + slot * (i + 0.5), st(v)] : null)).filter((p): p is number[] => !!p);
    parts.push(`<polyline points="${pts.map(([a, b]) => `${n(a)},${n(b)}`).join(' ')}" fill="none" stroke="${INK}" stroke-width="2"/>`);
    pts.forEach(([a, b]) => parts.push(`<circle cx="${n(a)}" cy="${n(b)}" r="3.2" fill="${INK}"/>`));
    parts.push(`<line x1="${L + pw}" y1="${T - 6}" x2="${L + pw}" y2="${T + ph}" stroke="${INK}" stroke-width="1.2"/>`);
    parts.push(vertical(W - 14, T + ph / 2, 'Temperature (°C)'));
  }
  parts.push(`<line x1="${L}" y1="${T - 6}" x2="${L}" y2="${T + ph}" stroke="${INK}" stroke-width="1.2"/>`);
  parts.push(`<line x1="${L}" y1="${T + ph}" x2="${L + pw}" y2="${T + ph}" stroke="${INK}" stroke-width="1.2"/>`);
  months.forEach((m, i) => parts.push(text(L + slot * (i + 0.5), T + ph + 16, m, { size: 12, anchor: 'middle' })));
  parts.push(text(L + pw / 2, H - 22, 'Months', { size: 12.5, anchor: 'middle', weight: 'bold' }));
  parts.push(vertical(16, T + ph / 2, 'Rainfall (mm)'));
  // Key
  const kx = L + 6, ky = H - 8;
  parts.push(`<rect x="${kx}" y="${ky - 9}" width="14" height="10" fill="#d9d9d9" stroke="${INK}"/>`, text(kx + 19, ky, 'Rainfall', { size: 11 }));
  if (hasTemp) parts.push(`<line x1="${kx + 82}" y1="${ky - 4}" x2="${kx + 104}" y2="${ky - 4}" stroke="${INK}" stroke-width="2"/><circle cx="${kx + 93}" cy="${ky - 4}" r="3" fill="${INK}"/>`, text(kx + 109, ky, 'Temperature', { size: 11 }));
  const title = spec.title ?? (spec.station ? `Climate graph for ${spec.station}` : '');
  return svg(W, H, parts.join(''), title);
}

export function renderPopulation(spec: PopulationSpec): string {
  const groups = spec.groups?.length ? spec.groups : AGE_GROUPS.slice(0, Math.max(spec.male?.length ?? 0, spec.female?.length ?? 0) || AGE_GROUPS.length);
  const male = groups.map((_, i) => Math.abs(Number(spec.male?.[i]) || 0));
  const female = groups.map((_, i) => Math.abs(Number(spec.female?.[i]) || 0));
  const unit = spec.unit === 'thousands' ? 'Population (thousands)' : spec.unit === 'millions' ? 'Population (millions)' : 'Percentage of population (%)';
  const W = 580, rowH = Math.max(15, Math.min(24, 330 / groups.length)), T = 34, mid = W / 2, gutter = 26;
  const H = T + groups.length * rowH + 64, half = mid - gutter - 30;
  const step = niceStep(Math.max(...male, ...female, 1), 4);
  const max = Math.ceil(Math.max(...male, ...female, 1) / step) * step;
  const sx = (v: number) => (v / max) * half;
  const parts: string[] = [];
  const base = T + groups.length * rowH;
  for (const v of ticks(0, max, step)) {
    for (const sgn of [-1, 1]) {
      const x = mid + sgn * (gutter + sx(v));
      parts.push(`<line x1="${n(x)}" y1="${T}" x2="${n(x)}" y2="${base}" stroke="${FAINT}" stroke-width="0.5"/>`);
      parts.push(`<line x1="${n(x)}" y1="${base}" x2="${n(x)}" y2="${base + 4}" stroke="${INK}"/>`, text(x, base + 16, String(v), { size: 10.5, anchor: 'middle' }));
    }
  }
  groups.forEach((g, i) => {
    const y = base - (i + 1) * rowH;
    parts.push(`<rect x="${n(mid - gutter - sx(male[i]))}" y="${n(y)}" width="${n(sx(male[i]))}" height="${n(rowH)}" fill="#d9d9d9" stroke="${INK}" stroke-width="0.9"/>`);
    parts.push(`<rect x="${n(mid + gutter)}" y="${n(y)}" width="${n(sx(female[i]))}" height="${n(rowH)}" fill="#fff" stroke="${INK}" stroke-width="0.9"/>`);
    parts.push(text(mid, y + rowH / 2 + 4, g, { size: Math.min(10.5, rowH * 0.62), anchor: 'middle' }));
  });
  parts.push(`<line x1="${mid - gutter}" y1="${T}" x2="${mid - gutter}" y2="${base}" stroke="${INK}" stroke-width="1.2"/>`);
  parts.push(`<line x1="${mid + gutter}" y1="${T}" x2="${mid + gutter}" y2="${base}" stroke="${INK}" stroke-width="1.2"/>`);
  parts.push(`<line x1="${mid - gutter - half}" y1="${base}" x2="${mid - gutter}" y2="${base}" stroke="${INK}" stroke-width="1.2"/>`);
  parts.push(`<line x1="${mid + gutter}" y1="${base}" x2="${mid + gutter + half}" y2="${base}" stroke="${INK}" stroke-width="1.2"/>`);
  parts.push(text(mid - gutter - half / 2, T - 10, 'Males', { size: 13, anchor: 'middle', weight: 'bold' }));
  parts.push(text(mid + gutter + half / 2, T - 10, 'Females', { size: 13, anchor: 'middle', weight: 'bold' }));
  parts.push(text(mid, T - 10, 'Age', { size: 11, anchor: 'middle', weight: 'bold' }));
  parts.push(text(mid, base + 38, unit, { size: 12, anchor: 'middle', weight: 'bold' }));
  const title = spec.title ?? (spec.place ? `Population structure of ${spec.place}${spec.year ? `, ${spec.year}` : ''}` : '');
  return svg(W, H + 8, parts.join(''), title);
}
