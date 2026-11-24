// @/components/ai/DocumentPaper.tsx — a generated document as a sheet of
// school paper: the letterhead (logo, school name, motto, document type),
// a details strip filled from the school's records (subject, class,
// teacher, term, learners: boys / girls / total) and the AI-written body.
//
// The curriculum sources the AI used are NOT part of the document: they are
// shown under the sheet on screen only (SourcesPanel), so they never print
// or go into the Word file. Schemes of work are laid out landscape (screen,
// print and Word), because their table has nine columns.
//
// The same markup is used on screen, for Print / PDF (an A4 page printed
// from a hidden frame, so the app's sidebar never prints) and for Download
// for Word (a single .doc file with the logo inside it). One style sheet,
// DOC_CSS, gives all three the same look.
//
// Figures and maths are SVG pictures. Print keeps them as they are; the Word
// file gets each one as a PNG picture packed inside it (Word does not show
// SVG reliably). Notes marked data-screen-only (what the AI server found when
// it checked a figure) never print and never go into Word.
import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, FileDown, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DOC_TYPE_LABELS, type GeneratorKey, type Source } from '@/types/ai';
import { BRAND_NAVY, BRAND_SKY, SCHOOL_LOGO_URL, SCHOOL_MOTTO, SCHOOL_NAME } from './brand';
import { featureByKey } from './aiFeatures';
import { Markdown } from './Markdown';
import { cleanDocument } from './cleanStream';
import { STREAM_CSS, WritingCaret } from './GenerationStage';

/** The facts printed in the details strip. Missing ones print as a line to fill in by hand. */
export interface DocHeader {
  feature: GeneratorKey;
  title: string;
  subject?: string;
  className?: string;
  teacher?: string;
  term?: string;
  boys?: string;
  girls?: string;
  learners?: string;
  weekEnding?: string;
  /** The lesson date, when the teacher gave one. */
  date?: string;
}

/** Builds the header from what the form sent (the same keys are saved with the document in the eFile). */
export function headerFrom(feature: GeneratorKey, title: string, inputs: Record<string, string>): DocHeader {
  return {
    feature, title,
    subject: inputs.subject, className: inputs.className || inputs.level, teacher: inputs.teacherName,
    term: inputs.term, boys: inputs.boys, girls: inputs.girls, learners: inputs.learners, weekEnding: inputs.weekEnding, date: inputs.date,
  };
}

const BLANK = '________________';

export const DOC_CSS = `
.doc-paper{font-family:Inter,"Segoe UI",Arial,sans-serif;color:#1f2937;font-size:14px;line-height:1.6;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.doc-paper *{box-sizing:border-box}
.doc-paper :where(p,span,li,td,th,h1,h2,h3,h4,h5,strong,em){overflow-wrap:break-word;word-break:normal;hyphens:manual}
.doc-letterhead{width:100%;border-collapse:collapse;border-bottom:2px solid ${BRAND_NAVY};margin-bottom:4px}
.doc-letterhead td{padding:0 0 12px 0;vertical-align:middle;border:0}
.doc-logo{width:60px;height:60px;object-fit:contain;display:block}
.doc-school{font-family:Poppins,Inter,Arial,sans-serif;font-weight:700;font-size:18px;line-height:1.25;color:${BRAND_NAVY};margin:0}
.doc-motto{font-size:11.5px;color:#64748b;font-style:italic;margin:2px 0 0}
.doc-kind{text-align:right;font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${BRAND_NAVY};white-space:nowrap}
.doc-kind span{display:inline-block;border:1px solid ${BRAND_SKY};border-radius:999px;padding:3px 10px}
.doc-rule{height:3px;background:${BRAND_SKY};margin:0 0 18px;width:72px;border-radius:2px}
.doc-title{font-family:Poppins,Inter,Arial,sans-serif;font-size:19px;font-weight:600;line-height:1.35;color:#0f172a;margin:0 0 14px}
.doc-meta{width:100%;border-collapse:separate;border-spacing:0;border:1px solid #e2e8f0;border-radius:10px;margin:0 0 20px;font-size:13px}
.doc-meta td{padding:8px 12px;vertical-align:top;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;width:33.33%}
.doc-meta tr:last-child td{border-bottom:0}
.doc-meta td:last-child{border-right:0}
.doc-meta-label{display:block;font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#64748b}
.doc-meta-value{display:block;font-weight:600;color:#0f172a;margin-top:1px}
.doc-meta-value .muted{font-weight:400;color:#94a3b8}
.doc-body{min-height:2em}
.doc-h1{font-family:Poppins,Inter,Arial,sans-serif;font-size:17px;font-weight:600;color:${BRAND_NAVY};margin:22px 0 8px}
.doc-h2{font-family:Poppins,Inter,Arial,sans-serif;font-size:15px;font-weight:600;color:${BRAND_NAVY};margin:22px 0 8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0}
.doc-h3{font-size:14px;font-weight:600;color:#0f172a;margin:16px 0 6px}
.doc-h4{font-size:13.5px;font-weight:600;color:#334155;margin:12px 0 4px}
.doc-body>:first-child{margin-top:0}
.doc-p{margin:6px 0}
.doc-ul,.doc-ol{margin:6px 0;padding-left:22px}
.doc-ul li,.doc-ol li{margin:3px 0}
.doc-ul{list-style:disc}.doc-ol{list-style:decimal}
.doc-hr{border:0;border-top:1px solid #e2e8f0;margin:18px 0}
.doc-paper code{font-family:Consolas,monospace;font-size:.92em;background:#f1f5f9;border-radius:4px;padding:0 4px}
.doc-paper strong{font-weight:600;color:#0f172a}
.doc-table-wrap{overflow-x:auto;margin:10px 0 16px;-webkit-overflow-scrolling:touch}
.doc-table{width:100%;border-collapse:collapse;font-size:12.5px;line-height:1.5}
.doc-table th{background:#f1f5f9;color:#334155;font-weight:600;text-align:left;padding:8px 10px;border:1px solid #e2e8f0;vertical-align:bottom}
.doc-table td{padding:8px 10px;border:1px solid #e2e8f0;vertical-align:top}
.doc-figure{margin:14px 0 16px;text-align:center;break-inside:avoid;page-break-inside:avoid}
.doc-new-page{break-before:page;page-break-before:always}
.doc-figure-art{margin:0 auto;max-width:100%}
.doc-figure-art svg{width:100%;height:auto;display:block;margin:0 auto}
.doc-figure-cap{font-family:"Times New Roman",Tinos,serif;font-size:13px;font-weight:600;margin-top:6px;color:#111}
.doc-figure-wait{margin:12px auto;padding:22px;border:1px dashed #cbd5e1;border-radius:10px;color:#64748b;font-size:12.5px;text-align:center}
.doc-figure-check{margin:8px auto 0;max-width:560px;text-align:left;border:1px solid #fcd34d;background:#fffbeb;border-radius:8px;padding:8px 10px;font-size:12px;color:#78350f}
.doc-figure-check p{margin:2px 0}
.doc-figure-note{font-style:italic;color:#a16207}
.doc-math svg{display:inline-block}
.doc-math-display{text-align:center;margin:10px 0;overflow-x:auto}
.doc-work{width:100%;border-collapse:collapse;margin:4px 0 12px;border:0}
.doc-work td{border:0;padding:3px 0;vertical-align:middle}
.doc-work-math{padding:3px 0 3px 16px}
.doc-work-step .doc-work-math{border-left:2px solid #d6e0ee}
.doc-work-marks{width:1%;white-space:nowrap;text-align:right;padding-left:14px!important}
.doc-mark{display:inline-block;min-width:26px;margin-left:4px;padding:0 6px;border:1px solid #9fb3cf;border-radius:6px;font-size:11px;font-weight:700;line-height:18px;color:${BRAND_NAVY};text-align:center;background:#fff}
.doc-mark-total{border-color:${BRAND_NAVY};background:#eef3fa}
.doc-work-label{display:inline-block;font-weight:700;margin-right:10px;color:#111827}
.doc-work-part td{padding-top:10px}
.doc-work-answer .doc-work-math{background:#f1f8f3;border-left:3px solid #2f855a;padding:6px 12px;border-radius:0 8px 8px 0}
.doc-work-answer-label{display:inline-block;font-weight:700;color:#276749;margin-right:10px;text-transform:uppercase;font-size:10.5px;letter-spacing:.06em}
.doc-math-raw{font-family:Consolas,monospace;font-size:.92em;color:#334155}
.doc-pre{font-family:Consolas,"Courier New",monospace;font-size:12.5px;line-height:1.5;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;margin:8px 0;white-space:pre-wrap}
.doc-pre code{background:none;padding:0}
@media (max-width:600px){
  .doc-paper{font-size:13.5px}
  .doc-logo{width:44px;height:44px}
  .doc-school{font-size:15px}
  .doc-kind{display:none}
  .doc-meta{display:block;overflow:hidden}
  .doc-meta tbody{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#e2e8f0}
  .doc-meta tr{display:contents}
  .doc-meta td{display:block;width:auto;border:0;background:#fff}
  .doc-table-wide{min-width:560px}
}
@media print{
  @page{size:A4;margin:14mm 14mm 16mm}
  body{margin:0}
  .doc-table tr,.doc-meta tr{break-inside:avoid}
  .doc-table thead{display:table-header-group}
  .doc-h2,.doc-h3{break-after:avoid}
  .doc-table-wrap{overflow:visible}
  .doc-table-wide{min-width:0}
  [data-screen-only]{display:none!important}
}`;

function MetaCell({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <td>
      <span className="doc-meta-label">{label}</span>
      <span className="doc-meta-value">{children || <span className="muted">{BLANK}</span>}</span>
    </td>
  );
}

/** The sheet itself: letterhead, details and body (what prints and goes into Word). */
function Sheet({ header, content, writing, caret }: { header: DocHeader; content: string; writing: boolean; caret?: string }) {
  const kind = featureByKey(header.feature).label;
  const learners = header.learners
    ? <>{header.learners} <span className="muted">(B {header.boys ?? '–'} · G {header.girls ?? '–'})</span></>
    : null;
  const lastLabel = header.feature === 'recordOfWork' ? 'Week ending' : 'Date';
  // The model's notes to itself and a draft it started again are never shown (cleanStream.ts).
  const shown = useMemo(() => cleanDocument(content).content, [content]);
  return (
    <div className={writing ? 'doc-paper doc-writing' : 'doc-paper'}>
      <table className="doc-letterhead" role="presentation">
        <tbody>
          <tr>
            <td style={{ width: 72 }}><img className="doc-logo" data-logo src={SCHOOL_LOGO_URL} alt={`${SCHOOL_NAME} crest`} width={60} height={60} /></td>
            <td>
              <p className="doc-school">{SCHOOL_NAME}</p>
              <p className="doc-motto">{SCHOOL_MOTTO}</p>
            </td>
            <td className="doc-kind"><span>{kind}</span></td>
          </tr>
        </tbody>
      </table>
      <div className="doc-rule" />
      <h1 className="doc-title">{header.title}</h1>
      <table className="doc-meta">
        <tbody>
          <tr>
            <MetaCell label="Subject">{header.subject}</MetaCell>
            <MetaCell label="Class">{header.className}</MetaCell>
            <MetaCell label="Teacher">{header.teacher}</MetaCell>
          </tr>
          <tr>
            <MetaCell label="Term">{header.term}</MetaCell>
            <MetaCell label="Learners">{learners}</MetaCell>
            <MetaCell label={lastLabel}>{header.feature === 'recordOfWork' ? header.weekEnding : header.date}</MetaCell>
          </tr>
        </tbody>
      </table>
      <Markdown source={header.feature === 'assessment' || header.feature === 'learnerNotes' ? shown : withoutCitations(shown)} />
      {writing && <WritingCaret label={caret ?? 'Writing…'} />}
    </div>
  );
}

/**
 * Removes the "[2]"-style source numbers older documents carry in their text
 * (the sources are no longer printed, so the numbers would point nowhere).
 * Not for assessments: there "[2]" is the marks for a question.
 */
export const withoutCitations = (text: string) =>
  text.replace(/(?:[ \t]+|^)(?:\[\d{1,2}(?:\s*[,–-]\s*\d{1,2})*\])+(?=[\s.,;:)|]|$)/gm, '');

/** Schemes of work print landscape. */
export const isLandscape = (feature: GeneratorKey) => feature === 'schemeOfWork';

/** The curriculum passages a document was made from: on screen only, never printed or exported. */
export function SourcesPanel({ sources, className }: { sources: Source[]; className?: string }) {
  if (sources.length === 0) return null;
  return (
    <details className={`mx-auto w-full rounded-2xl border border-gray-200 bg-white/70 px-4 py-3 text-sm text-gray-700 ${className ?? ''}`}>
      <summary className="cursor-pointer select-none font-medium text-gray-800">
        Curriculum sources used ({sources.length}) <span className="font-normal text-gray-500">· shown here only, not printed</span>
      </summary>
      <ol className="mt-2 space-y-1.5 pl-1">
        {sources.map((s) => (
          <li key={s.index} className="text-xs leading-relaxed">
            <span className="font-semibold text-gray-800">{s.documentName}</span>, page {s.pageNumber} <span className="text-gray-500">({DOC_TYPE_LABELS[s.docType]})</span>
            <span className="mt-0.5 block text-gray-500">{s.excerpt}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs italic text-gray-500">Prepared with AI from these sources. Check before use.</p>
    </details>
  );
}

// ------------------------------------------------------------ export helpers

const safeFileName = (title: string) => title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'document';
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The logo as base64, so it travels inside the printed page and the Word file. */
async function logoBase64(): Promise<string | null> {
  try {
    const blob = await (await fetch(SCHOOL_LOGO_URL)).blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** A picture packed into the Word file. */
interface Picture { name: string; base64: string }

/** Draws an on-screen SVG into a PNG (twice the size, for sharp printing). Null if it is not visible. */
async function svgToPng(el: SVGSVGElement): Promise<{ base64: string; width: number; height: number } | null> {
  const box = el.getBoundingClientRect();
  const width = Math.round(box.width), height = Math.round(box.height);
  if (!width || !height) return null;
  const copy = el.cloneNode(true) as SVGSVGElement;
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', String(width));
  copy.setAttribute('height', String(height));
  copy.removeAttribute('style');
  const xml = new XMLSerializer().serializeToString(copy);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  try { await img.decode(); } catch { return null; }
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  try { return { base64: canvas.toDataURL('image/png').split(',')[1], width, height }; } catch { return null; }
}

/**
 * The sheet's HTML with the logo pointing at `logoSrc`, without screen-only
 * notes. With `pictures`, every figure and piece of maths becomes a PNG
 * (for Word); the PNGs are added to that list.
 */
async function sheetHtml(sheet: HTMLElement, logoSrc: string | null, pictures?: Picture[]): Promise<string> {
  const copy = sheet.cloneNode(true) as HTMLElement;
  if (pictures) {
    const live = [...sheet.querySelectorAll<SVGSVGElement>('[data-figure] svg, [data-math] svg')].filter((el) => !el.parentElement?.closest('svg'));
    const copies = [...copy.querySelectorAll<SVGSVGElement>('[data-figure] svg, [data-math] svg')].filter((el) => !el.parentElement?.closest('svg'));
    for (let i = 0; i < live.length && i < copies.length; i++) {
      const png = await svgToPng(live[i]);
      if (!png) continue;
      const name = `figure-${pictures.length + 1}.png`;
      pictures.push({ name, base64: png.base64 });
      const img = document.createElement('img');
      img.setAttribute('src', `file:///C:/${name}`);
      img.setAttribute('width', String(png.width));
      img.setAttribute('height', String(png.height));
      const inlineMath = !!live[i].closest('.doc-math');
      if (inlineMath) img.setAttribute('style', 'vertical-align:middle');
      copies[i].replaceWith(img);
    }
  }
  copy.querySelectorAll('[aria-hidden], [data-screen-only], .doc-figure-wait').forEach((n) => n.remove());
  copy.querySelectorAll<HTMLImageElement>('img[data-logo]').forEach((img) => {
    if (logoSrc) img.setAttribute('src', logoSrc); else img.remove();
  });
  return copy.outerHTML;
}

const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700&family=Inter:wght@400;600&display=swap">';
const page = (title: string, body: string, head = '', landscape = false) =>
  `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>${head}<style>${DOC_CSS}${landscape ? LANDSCAPE_CSS : ''}</style></head><body>${landscape ? `<div class="WordSection1">${body}</div>` : body}</body></html>`;

/** A4 across: for the browser's print dialog (@page size) and for Word (mso-page-orientation, WordSection1). */
const LANDSCAPE_CSS = `
@page{size:A4 landscape;margin:12mm 12mm 14mm}
@page WordSection1{size:841.9pt 595.3pt;mso-page-orientation:landscape;margin:36pt 36pt 40pt}
div.WordSection1{page:WordSection1}
.doc-table{font-size:11.5px}`;

/** Prints from a hidden frame holding only the document (Save as PDF works from the same dialog). */
async function printSheet(sheet: HTMLElement, title: string, landscape: boolean) {
  const logo = await logoBase64();
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  // The app's fonts (Poppins, Inter) when online; the page falls back to Arial when not.
  doc.write(page(title, await sheetHtml(sheet, logo ? `data:image/png;base64,${logo}` : null), FONTS, landscape));
  doc.close();
  const img = doc.querySelector('img');
  if (img && !img.complete) await new Promise((r) => { img.onload = r; img.onerror = r; });
  await Promise.race([doc.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => frame.remove(), 60_000);
}

/**
 * A Word document with the logo inside it. It is an "MHTML" file (the web
 * page and its picture packed together), which Word opens like a normal
 * document; Save As there turns it into a .docx if needed.
 */
async function downloadWord(sheet: HTMLElement, title: string, landscape: boolean) {
  const logo = await logoBase64();
  const pictures: Picture[] = [];
  const html = page(title, await sheetHtml(sheet, logo ? 'file:///C:/kalabo-logo.png' : null, pictures), '', landscape)
    // Word draws a table only from attributes it understands; keep the borders.
    .replace(/<table class="(doc-table[^"]*)">/g, '<table class="$1" border="1" cellspacing="0" cellpadding="6">');
  const b64 = (text: string) => {
    // btoa needs bytes; encode the UTF-8 text in slices to avoid very long argument lists.
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  };
  const wrap = (s: string) => s.replace(/.{1,76}/g, '$&\r\n');
  const boundary = '----=_KalaboBoardingAI';
  const parts = [
    'MIME-Version: 1.0',
    `Content-Type: multipart/related; boundary="${boundary}"; type="text/html"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    'Content-Location: file:///C:/document.htm',
    '',
    wrap(b64(html)),
  ];
  if (logo)
    parts.push(`--${boundary}`, 'Content-Type: image/png', 'Content-Transfer-Encoding: base64', 'Content-Location: file:///C:/kalabo-logo.png', '', wrap(logo));
  for (const pic of pictures)
    parts.push(`--${boundary}`, 'Content-Type: image/png', 'Content-Transfer-Encoding: base64', `Content-Location: file:///C:/${pic.name}`, '', wrap(pic.base64));
  parts.push(`--${boundary}--`, '');
  const url = URL.createObjectURL(new Blob([parts.join('\r\n')], { type: 'application/msword' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFileName(title)}.doc`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// --------------------------------------------------------------- components

export interface DocumentPaperHandle {
  print: () => Promise<void>;
  word: () => Promise<void>;
}

interface DocumentPaperProps {
  header: DocHeader;
  content: string;
  /** Shown under the sheet on screen only. */
  sources: Source[];
  /** True while the document is still arriving. */
  writing?: boolean;
  /** What the pen at the end says while writing (e.g. "Checking every answer in the marking key…"). */
  caret?: string;
}

/** The sheet on a shadowed page. The parent can call print() and word() through a ref. */
export const DocumentPaper = forwardRef<DocumentPaperHandle, DocumentPaperProps>(function DocumentPaper({ header, content, sources, writing = false, caret }, ref) {
  const sheet = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    print: () => printSheet(sheet.current!.firstElementChild as HTMLElement, header.title, isLandscape(header.feature)),
    word: () => downloadWord(sheet.current!.firstElementChild as HTMLElement, header.title, isLandscape(header.feature)),
  }), [header.title, header.feature]);
  const width = isLandscape(header.feature) ? 'max-w-[1200px]' : 'max-w-[860px]';
  return (
    <div className="space-y-3">
      <div className={`mx-auto w-full ${width} rounded-2xl bg-white px-4 py-6 shadow-[0_1px_3px_rgba(16,24,40,0.06),0_12px_32px_-12px_rgba(16,24,40,0.18)] ring-1 ring-gray-200 sm:px-10 sm:py-10`}>
        <style>{DOC_CSS}</style>
        {writing && <style>{STREAM_CSS}</style>}
        <div ref={sheet}><Sheet header={header} content={content} writing={writing} caret={caret} /></div>
      </div>
      {!writing && <SourcesPanel sources={sources} className={width} />}
    </div>
  );
});

/** Print / PDF, Word and Copy buttons for a DocumentPaper. */
export function DocumentActions({ paper, content, disabled, className }: {
  paper: React.RefObject<DocumentPaperHandle>; content: string; disabled?: boolean; className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<'print' | 'word' | null>(null);
  const run = async (kind: 'print' | 'word') => {
    setBusy(kind);
    try { await paper.current?.[kind](); } finally { setBusy(null); }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}>
      <Button size="sm" disabled={disabled || busy !== null} onClick={() => run('print')} className="h-9 rounded-xl bg-blue-600 hover:bg-blue-700">
        <Printer size={16} className="mr-2" /> {busy === 'print' ? 'Preparing…' : 'Print / PDF'}
      </Button>
      <Button size="sm" variant="outline" disabled={disabled || busy !== null} onClick={() => run('word')} className="h-9 rounded-xl">
        <FileDown size={16} className="mr-2" /> {busy === 'word' ? 'Preparing…' : 'Word'}
      </Button>
      <Button size="sm" variant="ghost" disabled={disabled} onClick={copy} aria-label="Copy the text" className="h-9 rounded-xl px-2.5 text-gray-700 sm:px-3">
        {copied ? <Check size={16} className="text-emerald-600 sm:mr-2" /> : <Copy size={16} className="sm:mr-2" />}<span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
      </Button>
    </div>
  );
}
