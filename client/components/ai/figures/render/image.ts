// @/components/ai/figures/render/image.ts — a picture from the teacher's
// diagram library (a cleaned-up photo or scan) with its letters drawn on top
// (A, B, C… at the points the teacher clicked). The picture is put inside
// the SVG as data, so the figure prints and exports like any other.
import type { ImageSpec } from '../spec';
import { esc, FONT, INK } from './svg';

export interface LibraryPicture {
  /** data: URL of the cleaned picture. */
  dataUrl: string;
  width: number;
  height: number;
  /** x and y are fractions (0–1) of the picture's width and height. */
  labels: { letter: string; x: number; y: number; meaning?: string }[];
}

export function renderImage(spec: ImageSpec, pic: LibraryPicture): { svg: string; problems: string[] } {
  const W = 560, H = Math.round((W * pic.height) / Math.max(1, pic.width));
  const want = spec.showLabels?.map((l) => l.toUpperCase());
  const shown = pic.labels.filter((l) => !want || want.includes(l.letter.toUpperCase()));
  const problems = (want ?? []).filter((l) => !pic.labels.some((x) => x.letter.toUpperCase() === l)).map((l) => `The picture has no letter ${l}.`);
  const marks = shown.map((l) => {
    const x = l.x * W, y = l.y * H;
    return `<circle cx="${x}" cy="${y}" r="11" fill="#fff" stroke="${INK}" stroke-width="1.3"/><text x="${x}" y="${y + 5}" text-anchor="middle" font-family="${esc(FONT)}" font-size="14" font-weight="bold" fill="${INK}">${esc(l.letter)}</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><image href="${esc(pic.dataUrl)}" xlink:href="${esc(pic.dataUrl)}" x="0" y="0" width="${W}" height="${H}"/>${marks}</svg>`;
  return { svg, problems };
}
