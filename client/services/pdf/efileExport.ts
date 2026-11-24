// @/services/pdf/efileExport.ts — turns eFile documents and entries into
// PDFs in the browser (efilePDF.ts does the layout with pdf-lib).
//
//   downloadDocumentPdf(doc)          one AI document (lesson plan, assessment…)
//   downloadEntryPdf(entry, teacher)  one of the teacher's own entries
//   downloadTeacherFilePdf({ … })     the whole Teacher's File, or some sections, with the
//                                     tables from the school system and the scanned papers
//
// The fonts (DejaVu Serif, client/assets/fonts) and the drawing code for
// figures and maths load only when someone downloads.
import { SCHOOL_MOTTO, SCHOOL_NAME } from '@/components/ai/brand';
import { loadSchoolLogo } from '@/lib/schoolLogo';
import {
  EFILE_SECTIONS, PROFILE_FIELDS, efileSection, sectionsOfFeature,
  type EFileDocument, type EFileEntry, type EFileMeta, type EFileSectionId,
} from '@/types/ai';
import type { SystemRecord } from '@/services/efileSystemTables';
import { documentPdf, downloadPdf, teacherFilePdf, type PdfKit } from './efilePDF';
import { documentPart, entryPart, fileSections } from './efileParts';

export { assessmentPart, documentPart, entryPart, fileSections, scanPart, systemPart } from './efileParts';

import regularUrl from '@/assets/fonts/DejaVuSerif.ttf?url';
import boldUrl from '@/assets/fonts/DejaVuSerif-Bold.ttf?url';
import italicUrl from '@/assets/fonts/DejaVuSerif-Italic.ttf?url';
import boldItalicUrl from '@/assets/fonts/DejaVuSerif-BoldItalic.ttf?url';

// ───────────── The browser's kit: fonts, logo, figures, maths, SVG → PNG ─────────────

async function bytesOf(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load a PDF font (${res.status}). Check your connection and try again.`);
  return new Uint8Array(await res.arrayBuffer());
}

/** An SVG length in CSS pixels ("240", "240px", "2.3ex" from MathJax: 1ex = 8px there). */
function cssPx(v: string | undefined | null): number {
  if (!v) return 0;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  return v.endsWith('ex') ? n * 8 : v.endsWith('em') ? n * 16 : v.endsWith('%') ? 0 : n;
}

async function rasterize(svg: string, scale: number): Promise<{ png: Uint8Array; width: number; height: number } | null> {
  const open = /<svg\b[^>]*>/.exec(svg)?.[0];
  if (!open) return null;
  let width = cssPx(/\swidth="([^"]+)"/.exec(open)?.[1]), height = cssPx(/\sheight="([^"]+)"/.exec(open)?.[1]);
  const vb = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(open);
  if ((!width || !height) && vb) { width = width || Number(vb[1]); height = height || (Number(vb[2]) * width) / Number(vb[1]); }
  if (!width || !height) return null;
  // A copy with plain pixel sizes, so the browser draws it at exactly that size.
  let tag = open.replace(/\s(width|height)="[^"]*"/g, '').replace(/\sstyle="[^"]*"/, '');
  tag = tag.replace('<svg', `<svg width="${width}" height="${height}"${tag.includes('xmlns=') ? '' : ' xmlns="http://www.w3.org/2000/svg"'}`);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(open, tag))}`;
  try { await img.decode(); } catch { return null; }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  return { png: new Uint8Array(await blob.arrayBuffer()), width, height };
}

let kitPromise: Promise<PdfKit> | null = null;
function loadKit(): Promise<PdfKit> {
  kitPromise ??= (async () => {
    const [regular, bold, italic, boldItalic, logo] = await Promise.all([bytesOf(regularUrl), bytesOf(boldUrl), bytesOf(italicUrl), bytesOf(boldItalicUrl), loadSchoolLogo()]);
    return {
      fonts: { regular, bold, italic, boldItalic },
      logo,
      async figureSvg(json) {
        const [{ parseFigure }, { renderFigure }] = await Promise.all([import('@/components/ai/figures/spec'), import('@/components/ai/figures/render')]);
        const spec = parseFigure(json);
        if (!spec) return null;
        const out = await renderFigure(spec);
        if (!out.svg) return null;
        // The same default sizes as on screen (Figure.tsx).
        const size = spec.size ?? (['map', 'diagram', 'scene', 'construction'].includes(spec.type) ? 'large' : spec.type === 'molecule' || spec.type === 'solid' ? 'small' : 'medium');
        return { svg: out.svg, size, title: spec.title };
      },
      async mathSvg(tex, display) {
        const { texToSvg } = await import('@/components/ai/figures/render/math');
        try { return await texToSvg(tex, display); } catch { return null; }
      },
      rasterize,
    } satisfies PdfKit;
  })();
  kitPromise.catch(() => { kitPromise = null; }); // try again next time (e.g. after being offline)
  return kitPromise;
}

// ───────────── Downloads ─────────────

export async function downloadDocumentPdf(d: EFileDocument) {
  downloadPdf(await documentPdf(await loadKit(), documentPart(d)), d.title);
}

export async function downloadEntryPdf(e: EFileEntry, teacher: string) {
  downloadPdf(await documentPdf(await loadKit(), entryPart(e, teacher)), e.title);
}

/**
 * The whole Teacher's File (or the sections in `only`). `load` fetches each
 * AI document's full text; `onProgress` reports "n of m" while it does.
 */
export async function downloadTeacherFilePdf(o: {
  meta: EFileMeta;
  summaries: { id: string; feature: EFileDocument['feature'] }[];
  load: (id: string) => Promise<EFileDocument>;
  teacher: string;
  only?: EFileSectionId[];
  /** Tables from the school system (services/efileSystem.ts). */
  system?: SystemRecord[];
  /** Fetches one scanned page. */
  scanPage?: (id: string, page: number) => Promise<Blob>;
  onProgress?: (message: string) => void;
}) {
  const kit = loadKit();
  const sectionIds = o.only?.flatMap((id) => (efileSection(id).source === 'group' ? EFILE_SECTIONS.filter((x) => x.sub).map((x) => x.id) : [id]));
  const wanted = o.summaries.filter((s) => !sectionIds || sectionsOfFeature(s.feature).some((x) => sectionIds.includes(x.id)));
  const documents: EFileDocument[] = [];
  for (const [k, s] of wanted.entries()) {
    o.onProgress?.(`Collecting documents (${k + 1} of ${wanted.length})…`);
    documents.push(await o.load(s.id));
  }
  // Scanned pages of the sections asked for.
  const scanPages = new Map<string, Uint8Array[]>();
  const scans = (o.meta.scans ?? []).filter((x) => !sectionIds || sectionIds.includes(x.section));
  if (o.scanPage) {
    const total = scans.reduce((n, x) => n + x.pages, 0);
    let done = 0;
    for (const x of scans) {
      const pages: Uint8Array[] = [];
      for (let n = 1; n <= x.pages; n++) {
        o.onProgress?.(`Adding scanned pages (${++done} of ${total})…`);
        try { pages.push(new Uint8Array(await (await o.scanPage(x.id, n)).arrayBuffer())); } catch { /* a missing page is left out */ }
      }
      scanPages.set(x.id, pages);
    }
  }
  o.onProgress?.('Laying out the pages…');
  const p = o.meta.profile;
  const coverLines = [p.department && `${p.department} Department`, (p.term || p.year) && [p.term && `Term ${p.term}`, p.year].filter(Boolean).join(', ')].filter((x): x is string => Boolean(x));
  const bytes = await teacherFilePdf(await kit, {
    ministry: 'Ministry of Education', school: SCHOOL_NAME, motto: SCHOOL_MOTTO, teacher: o.teacher, coverLines,
    details: PROFILE_FIELDS.map((f) => [f.label, f.name === 'fullName' ? p.fullName || o.teacher : p[f.name] ?? '']),
    sections: fileSections(o.meta, documents, o.teacher, o.only, { system: o.system, scanPages }),
  });
  const which = o.only?.length === 1 ? ` - ${efileSection(o.only[0]).title}` : '';
  downloadPdf(bytes, `Teacher's File - ${o.teacher}${which}`);
}
