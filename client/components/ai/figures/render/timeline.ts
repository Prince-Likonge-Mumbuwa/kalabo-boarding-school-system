// @/components/ai/figures/render/timeline.ts — timelines, horizontal or
// vertical (the WWII timeline in ECZ History 2024 is vertical, with events on
// both sides). An event with `blank` shows its letter instead of its label.
import type { TimelineSpec } from '../spec';
import { INK, esc, multiline, n, patterns, svg, text, uid, wrap } from './svg';

export function renderTimeline(spec: TimelineSpec): string {
  const id = uid('t');
  const ev = spec.events;
  const shown = (e: TimelineSpec['events'][number]) => (e.blank ? e.blank : e.label);
  if ((spec.orientation ?? (ev.length > 7 ? 'vertical' : 'horizontal')) === 'vertical') {
    const W = 560, rowH = 46, T = 24;
    const H = T * 2 + rowH * ev.length;
    const cx = W / 2;
    const parts = [patterns(id), `<rect x="${cx - 7}" y="${T - 10}" width="14" height="${H - 2 * T + 20}" fill="#fff" stroke="${INK}" stroke-width="1.3"/>`];
    ev.forEach((e, i) => {
      const y = T + rowH * i + rowH / 2;
      const right = e.side ? e.side === 'right' : i % 2 === 1;
      parts.push(`<line x1="${cx + (right ? 7 : -7)}" y1="${n(y)}" x2="${cx + (right ? 26 : -26)}" y2="${n(y)}" stroke="${INK}"/>`);
      const lines = wrap(shown(e), 30);
      const x = cx + (right ? 32 : -32);
      parts.push(text(x, y - (lines.length > 1 ? 8 : -1), e.date, { size: 12.5, weight: 'bold', anchor: right ? 'start' : 'end' }));
      parts.push(multiline(x, y + (lines.length > 1 ? 7 : 15), lines.slice(0, 2), { size: 12, anchor: right ? 'start' : 'end', weight: e.blank ? 'bold' : undefined }));
    });
    return svg(W, H, parts.join(''), esc(spec.title ?? 'Timeline'));
  }
  const W = Math.max(520, Math.min(760, ev.length * 120)), H = 190, L = 40, R = 40, y = 92;
  const step = (W - L - R) / Math.max(1, ev.length - 1);
  const parts = [patterns(id), `<line x1="${L - 20}" y1="${y}" x2="${W - R + 26}" y2="${y}" stroke="${INK}" stroke-width="1.6" marker-end="url(#${id}-arrow)"/>`];
  ev.forEach((e, i) => {
    const x = ev.length === 1 ? W / 2 : L + step * i;
    const up = i % 2 === 0;
    parts.push(`<line x1="${n(x)}" y1="${y - 7}" x2="${n(x)}" y2="${y + 7}" stroke="${INK}" stroke-width="1.6"/>`);
    parts.push(text(x, up ? y - 14 : y + 26, e.date, { size: 12.5, weight: 'bold', anchor: 'middle' }));
    const lines = wrap(shown(e), 18).slice(0, 3);
    parts.push(multiline(x, up ? y - 30 - (lines.length - 1) * 13 : y + 42, lines, { size: 11.5, anchor: 'middle', lineHeight: 13, weight: e.blank ? 'bold' : undefined }));
  });
  return svg(W, H, parts.join(''), esc(spec.title ?? 'Timeline'));
}
