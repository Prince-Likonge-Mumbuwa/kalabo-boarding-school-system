// @/components/ai/figures/render/chart.ts — bar charts (values printed on the
// bars, as ECZ charts do), histograms (bars touching) and line graphs. Several
// series are told apart by plain / hatched / dotted fills and a key, never by colour.
import type { ChartSpec } from '../spec';
import { FAINT, INK, esc, fillFor, n, niceStep, patterns, svg, text, ticks, uid, wrap, multiline } from './svg';

const FILLS = ['none', 'hatch', 'dots', 'grey'] as const;

export function renderChart(spec: ChartSpec): string {
  const id = uid('c');
  const cats = spec.categories;
  const series = spec.series.filter((s) => s.values.length);
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  const W = Math.max(440, Math.min(680, 90 + cats.length * (spec.kind === 'line' ? 52 : 46 * Math.max(1, series.length)))), H = 380;
  const L = 62, R = 18, T = series.length > 1 ? 40 : 22, B = 64;
  const pw = W - L - R, ph = H - T - B;
  const ymin = spec.y?.min ?? Math.min(0, ...all);
  const step = spec.y?.step ?? niceStep(((spec.y?.max ?? Math.max(...all)) - ymin) || 1, 7);
  const ymax = spec.y?.max ?? Math.ceil((Math.max(...all) * 1.08) / step) * step;
  const sy = (v: number) => T + ph - ((v - ymin) / (ymax - ymin || 1)) * ph;
  const parts: string[] = [patterns(id)];

  for (const v of ticks(ymin, ymax, step)) {
    parts.push(`<line x1="${L}" y1="${n(sy(v))}" x2="${L + pw}" y2="${n(sy(v))}" stroke="${FAINT}" stroke-width="0.5"/>`);
    parts.push(`<line x1="${L - 4}" y1="${n(sy(v))}" x2="${L}" y2="${n(sy(v))}" stroke="${INK}"/>`);
    parts.push(text(L - 7, sy(v) + 4, String(v), { size: 11, anchor: 'end' }));
  }
  parts.push(`<line x1="${L}" y1="${T - 6}" x2="${L}" y2="${T + ph}" stroke="${INK}" stroke-width="1.2"/>`);
  parts.push(`<line x1="${L}" y1="${n(sy(Math.max(ymin, 0)))}" x2="${L + pw}" y2="${n(sy(Math.max(ymin, 0)))}" stroke="${INK}" stroke-width="1.2"/>`);

  const slot = pw / cats.length;
  const base = sy(Math.max(ymin, 0));
  if (spec.kind === 'line') {
    series.forEach((s, si) => {
      const pts = s.values.map((v, i) => [L + slot * (i + 0.5), sy(v)] as const);
      parts.push(`<polyline points="${pts.map(([a, b]) => `${n(a)},${n(b)}`).join(' ')}" fill="none" stroke="${INK}" stroke-width="1.6"${si % 2 ? ' stroke-dasharray="6 4"' : ''}/>`);
      pts.forEach(([a, b], i) => {
        parts.push(si % 2 ? `<rect x="${n(a - 3)}" y="${n(b - 3)}" width="6" height="6" fill="${INK}"/>` : `<circle cx="${n(a)}" cy="${n(b)}" r="3.2" fill="${INK}"/>`);
        if (spec.showValues !== false) parts.push(text(a, b - 8, String(s.values[i]), { size: 11, anchor: 'middle', halo: true }));
      });
    });
  } else {
    const gap = spec.kind === 'histogram' ? 0 : slot * 0.22;
    const bw = (slot - gap) / series.length;
    series.forEach((s, si) =>
      s.values.forEach((v, i) => {
        const x0 = L + slot * i + gap / 2 + bw * si;
        const top = sy(v);
        const fill = series.length > 1 ? fillFor(id, FILLS[si % FILLS.length]) : 'none';
        parts.push(`<rect x="${n(x0)}" y="${n(Math.min(top, base))}" width="${n(bw)}" height="${n(Math.abs(base - top))}" fill="${fill === 'none' ? '#fff' : fill}" stroke="${INK}" stroke-width="1.2"/>`);
        if (spec.showValues !== false) parts.push(text(x0 + bw / 2, Math.min(top, base) - 5, String(v), { size: 11, anchor: 'middle', weight: 'bold' }));
      }),
    );
  }
  cats.forEach((c, i) => {
    const lines = wrap(c, Math.max(6, Math.floor(slot / 6.5)));
    parts.push(multiline(L + slot * (i + 0.5), T + ph + 16, lines.slice(0, 3), { size: 11.5, anchor: 'middle', lineHeight: 12 }));
  });
  if (spec.x?.label) parts.push(text(L + pw / 2, H - 8, spec.x.label, { size: 12.5, anchor: 'middle', weight: 'bold' }));
  if (spec.y?.label) parts.push(`<g transform="translate(16 ${n(T + ph / 2)}) rotate(-90)">${text(0, 0, spec.y.label, { size: 12.5, anchor: 'middle', weight: 'bold' })}</g>`);

  // Key for several series.
  if (series.length > 1) {
    let kx = L;
    series.forEach((s, si) => {
      const label = s.name ?? `Series ${si + 1}`;
      parts.push(spec.kind === 'line'
        ? `<line x1="${kx}" y1="14" x2="${kx + 22}" y2="14" stroke="${INK}" stroke-width="1.6"${si % 2 ? ' stroke-dasharray="6 4"' : ''}/>`
        : `<rect x="${kx}" y="7" width="16" height="12" fill="${fillFor(id, FILLS[si % FILLS.length]) === 'none' ? '#fff' : fillFor(id, FILLS[si % FILLS.length])}" stroke="${INK}"/>`);
      parts.push(text(kx + 26, 18, label, { size: 12 }));
      kx += 40 + label.length * 6.5;
    });
  }
  return svg(W, H, parts.join(''), esc(spec.title ?? 'Chart'));
}
