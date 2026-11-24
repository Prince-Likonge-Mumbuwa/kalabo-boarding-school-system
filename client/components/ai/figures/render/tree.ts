// @/components/ai/figures/render/tree.ts — family and succession trees
// (matrilineal vs patrilineal succession, royal genealogies) and simple
// hierarchies. With `people`, each person is a small figure, like the
// succession charts in ECZ History 2023. Partners are joined by a short line.
import type { TreeSpec } from '../spec';
import { INK, esc, multiline, n, svg, uid, wrap } from './svg';

type Node = TreeSpec['nodes'][number];

function person(x: number, y: number) {
  // A plain stick figure, about 34 high.
  return `<g stroke="${INK}" stroke-width="1.4" fill="none"><circle cx="${n(x)}" cy="${n(y + 5)}" r="5"/><line x1="${n(x)}" y1="${n(y + 10)}" x2="${n(x)}" y2="${n(y + 24)}"/><line x1="${n(x - 8)}" y1="${n(y + 15)}" x2="${n(x + 8)}" y2="${n(y + 15)}"/><line x1="${n(x)}" y1="${n(y + 24)}" x2="${n(x - 6)}" y2="${n(y + 34)}"/><line x1="${n(x)}" y1="${n(y + 24)}" x2="${n(x + 6)}" y2="${n(y + 34)}"/></g>`;
}

export function renderTree(spec: TreeSpec): string {
  uid('tr');
  const nodes = spec.nodes;
  const byId = new Map(nodes.map((d) => [d.id, d]));
  const kids = (id: string) => nodes.filter((d) => d.parent === id);
  // A partner sits beside the person they are paired with, in the same row.
  const partnerOf = new Map<string, string>();
  for (const d of nodes) if (d.partner && byId.has(d.partner)) { partnerOf.set(d.id, d.partner); partnerOf.set(d.partner, d.id); }
  const roots = nodes.filter((d) => !d.parent && !(d.partner && byId.get(d.partner)?.parent) && !(partnerOf.has(d.id) && nodes.indexOf(byId.get(partnerOf.get(d.id)!)!) < nodes.indexOf(d) && !byId.get(partnerOf.get(d.id)!)!.parent));

  const colW = 120, rowH = spec.people ? 110 : 78;
  const pos = new Map<string, { x: number; y: number }>();
  let cursor = 0;
  const place = (d: Node, depth: number): number => {
    if (pos.has(d.id)) return pos.get(d.id)!.x;
    const children = [...kids(d.id), ...(partnerOf.has(d.id) ? kids(partnerOf.get(d.id)!) : [])].filter((c, i, a) => a.indexOf(c) === i);
    let x: number;
    if (children.length === 0) x = cursor++ * colW;
    else {
      const xs = children.map((c) => place(c, depth + 1));
      x = (Math.min(...xs) + Math.max(...xs)) / 2;
    }
    pos.set(d.id, { x, y: depth * rowH });
    const p = partnerOf.get(d.id);
    if (p && !pos.has(p)) {
      pos.set(p, { x: x + colW, y: depth * rowH });
      cursor = Math.max(cursor, Math.round((x + colW) / colW) + 1);
    }
    return x;
  };
  for (const r of roots) place(r, 0);
  for (const d of nodes) if (!pos.has(d.id)) place(d, 0);

  const xs = [...pos.values()].map((p) => p.x), ys = [...pos.values()].map((p) => p.y);
  const minX = Math.min(...xs) - 70, W = Math.max(...xs) - minX + 70, H = Math.max(...ys) + rowH;
  const X = (v: number) => v - minX, Y = (v: number) => v + 18;
  const parts: string[] = [];
  const boxH = spec.people ? 34 : 30;
  // Lines first, so boxes and figures sit on top.
  for (const d of nodes) {
    const p = pos.get(d.id)!;
    const partner = partnerOf.get(d.id);
    if (partner && nodes.indexOf(d) < nodes.indexOf(byId.get(partner)!)) {
      const q = pos.get(partner)!;
      parts.push(`<line x1="${n(X(p.x))}" y1="${n(Y(p.y) + 14)}" x2="${n(X(q.x))}" y2="${n(Y(q.y) + 14)}" stroke="${INK}" stroke-width="1.2"/>`);
    }
    if (d.parent && pos.has(d.parent)) {
      const q = pos.get(d.parent)!;
      const qp = partnerOf.get(d.parent);
      const fromX = qp && pos.has(qp) ? (q.x + pos.get(qp)!.x) / 2 : q.x;
      const fromY = qp && pos.has(qp) ? Y(q.y) + 14 : Y(q.y) + boxH + (spec.people ? 22 : 0);
      const midY = Y(p.y) - 16;
      parts.push(`<path d="M${n(X(fromX))},${n(fromY)} V${n(midY)} H${n(X(p.x))} V${n(Y(p.y) - 2)}" fill="none" stroke="${INK}" stroke-width="1.2"/>`);
    }
  }
  for (const d of nodes) {
    const p = pos.get(d.id)!;
    const label = d.blank ?? d.label;
    const lines = wrap(label, 16).slice(0, 2);
    if (spec.people) {
      parts.push(`<rect x="${n(X(p.x) - 14)}" y="${n(Y(p.y) - 2)}" width="28" height="40" fill="#fff" stroke="none"/>`);
      parts.push(person(X(p.x), Y(p.y)));
      parts.push(multiline(X(p.x), Y(p.y) + 50, lines, { size: 12, anchor: 'middle', weight: d.blank ? 'bold' : undefined, lineHeight: 13 }));
      if (d.note) parts.push(multiline(X(p.x), Y(p.y) + 50 + lines.length * 13, wrap(d.note, 18).slice(0, 2), { size: 10.5, anchor: 'middle', lineHeight: 12 }));
    } else {
      const w = Math.max(80, Math.min(110, Math.max(...lines.map((l) => l.length)) * 7 + 16));
      parts.push(`<rect x="${n(X(p.x) - w / 2)}" y="${n(Y(p.y))}" width="${w}" height="${boxH}" fill="#fff" stroke="${INK}" stroke-width="1.2"/>`);
      parts.push(multiline(X(p.x), Y(p.y) + (lines.length > 1 ? 12 : 19), lines, { size: 12, anchor: 'middle', weight: d.blank ? 'bold' : undefined, lineHeight: 12 }));
    }
  }
  return svg(W, H + 10, parts.join(''), esc(spec.title ?? 'Chart'));
}
