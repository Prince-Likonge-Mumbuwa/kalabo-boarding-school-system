// @/services/pdf/efileParts.ts — what goes into the Teacher's File PDF, as
// parts for efilePDF.ts: AI documents (with their letterhead), the teacher's
// entries, the tables from the school system, scanned papers, and the
// sections in order (fileSections). No browser or font loading here, so it
// can be checked outside the app; efileExport.ts does the downloads.
import { SCHOOL_MOTTO, SCHOOL_NAME } from '@/components/ai/brand';
import { featureByKey } from '@/components/ai/aiFeatures';
import {
  EFILE_SECTIONS, SCRIPT_SLOTS, efileSection,
  type EFileDocument, type EFileEntry, type EFileMeta, type EFileScan, type EFileSectionId, type EFileSectionInfo,
} from '@/types/ai';
import type { SystemRecord } from '@/services/efileSystemTables';
import { withoutCitations, type PdfDocumentPart, type PdfSection } from './efilePDF';
import { cleanDocument } from '@/components/ai/cleanStream';

// ───────────── eFile items → PDF parts ─────────────

export const longDate = (iso?: string) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : undefined);

/** An AI document with the same letterhead details as on screen (DocumentPaper's Sheet). */
export function documentPart(d: EFileDocument): PdfDocumentPart {
  const i = d.inputs;
  const learners = i.learners ? `${i.learners} (B ${i.boys ?? '–'} · G ${i.girls ?? '–'})` : undefined;
  return {
    letterhead: {
      school: SCHOOL_NAME, motto: SCHOOL_MOTTO, kind: featureByKey(d.feature).label, title: d.title,
      details: [
        ['Subject', i.subject], ['Class', i.className || i.level], ['Teacher', i.teacherName],
        ['Term', i.term], ['Learners', learners], d.feature === 'recordOfWork' ? ['Week ending', i.weekEnding] : ['Date', i.date],
      ],
    },
    // Older documents may still hold the model's notes or a first draft (cleanStream.ts).
    markdown: d.feature === 'assessment' ? cleanDocument(d.content).content : withoutCitations(cleanDocument(d.content).content),
    landscape: d.feature === 'schemeOfWork',
  };
}

export function entryPart(e: EFileEntry, teacher: string): PdfDocumentPart {
  const section = efileSection(e.section);
  const kind = section.entryName ? section.entryName[0].toUpperCase() + section.entryName.slice(1) : section.title;
  // Wide tables (six or more columns) print across the page.
  // The work plan prints landscape, like the Ministry's form.
  const wide = e.section === 'workPlan' || e.content.split('\n').some((l) => l.trim().startsWith('|') && l.split('|').length - 2 >= 6);
  return {
    letterhead: { school: SCHOOL_NAME, motto: SCHOOL_MOTTO, kind, title: e.title, details: [['Teacher', teacher], ['Date', longDate(e.date)], ['Section', `${section.label}: ${section.title}`]] },
    markdown: e.content,
    landscape: wide,
  };
}

/** Where an assessment's marking key (or a CBC task's rubric) starts. */
const KEY_START = /^##\s+(Marking Key|Rubric)\b/im;

/** An assessment split for the file: the question paper (Question Samples) or its key (Marking Keys). */
export function assessmentPart(d: EFileDocument, part: 'questions' | 'key'): PdfDocumentPart | null {
  const whole = documentPart(d);
  const content = whole.markdown;
  const at = content.search(KEY_START);
  if (part === 'questions') return at < 0 ? whole : { ...whole, markdown: content.slice(0, at).trimEnd() };
  if (at < 0) return null;
  return { ...whole, letterhead: { ...whole.letterhead, kind: 'Marking Key', title: `Marking key: ${d.title}` }, markdown: content.slice(at) };
}

const sortKey = (d: { inputs?: Record<string, string>; date?: string; createdAt: string }) => d.date ?? d.inputs?.date ?? d.createdAt;

/** A table from the school system (timetable, register, progress chart…), printed like a document. */
export function systemPart(r: SystemRecord): PdfDocumentPart {
  return { letterhead: { school: SCHOOL_NAME, motto: SCHOOL_MOTTO, kind: efileSection(r.section).title, title: r.title, details: r.details }, markdown: r.markdown, landscape: r.landscape };
}

const slotLabel = (s?: EFileScan['slot']) => SCRIPT_SLOTS.find((x) => x.slot === s)?.label ?? '';
const markOf = (s: EFileScan) => (s.mark !== undefined ? `${s.mark}${s.outOf ? ` / ${s.outOf} (${Math.round((s.mark / s.outOf) * 100)}%)` : ''}` : undefined);

/** A scanned paper: a short record of what it is, then its pages. */
export function scanPart(s: EFileScan, pages: Uint8Array[], teacher: string): PdfDocumentPart {
  const script = s.section === 'scriptSamples';
  const title = script ? `${slotLabel(s.slot)}: ${s.learner ?? ''}` : s.title;
  const rows: [string, string | undefined][] = script
    ? [['Assessment', s.title], ['Category', slotLabel(s.slot)], ['Learner', s.learner], ['Mark', markOf(s)], ['Date', longDate(s.date)], ['Pages', String(s.pages)]]
    : [['Question paper', s.title], ['Set by', teacher], ['Date', longDate(s.date)], ['Pages', String(s.pages)]];
  return {
    letterhead: { school: SCHOOL_NAME, motto: SCHOOL_MOTTO, kind: script ? 'Marked script' : 'Question paper (scanned)', title, details: [['Teacher', teacher], ['Date', longDate(s.date)], ['Section', script ? '11 (v): Scripts Samples' : '11 (iii): Question Samples']] },
    markdown: `| Item | Detail |\n|---|---|\n${rows.filter(([, v]) => v).map(([k, v]) => `| ${k} | ${String(v).replace(/\|/g, '/')} |`).join('\n')}\n\n${script ? 'The marked script follows, as scanned.' : 'The question paper follows, as scanned.'}`,
    scans: pages.map((bytes, n) => ({ bytes, caption: `${title}: page ${n + 1} of ${pages.length}` })),
  };
}

/** Scripts in file order: by assessment, then highest, average, lowest. */
export function orderScans(scans: EFileScan[]): EFileScan[] {
  const slot = (s: EFileScan) => SCRIPT_SLOTS.findIndex((x) => x.slot === s.slot);
  return [...scans].sort((a, b) => sortKey(a).slice(0, 10).localeCompare(sortKey(b).slice(0, 10)) || a.title.localeCompare(b.title) || slot(a) - slot(b));
}

/**
 * The Teacher's File: every section and part in order (or only those in
 * `only`). In each: the records from the school system, the AI documents
 * oldest first, the scanned papers, then the teacher's own entries.
 */
export function fileSections(
  meta: EFileMeta, documents: EFileDocument[], teacher: string, only?: EFileSectionId[],
  extra: { system?: SystemRecord[]; scanPages?: Map<string, Uint8Array[]> } = {},
): PdfSection[] {
  const partsOf = (group: EFileSectionInfo) => EFILE_SECTIONS.filter((x) => x.sub && EFILE_SECTIONS.indexOf(x) > EFILE_SECTIONS.indexOf(group));
  // Asking for section 11 brings its parts with it.
  const wanted = only?.flatMap((id) => (efileSection(id).source === 'group' ? [id, ...partsOf(efileSection(id)).map((x) => x.id)] : [id]));
  return EFILE_SECTIONS.filter((s) => !wanted || wanted.includes(s.id)).map((s) => {
    const system = (extra.system ?? []).filter((r) => r.section === s.id).map(systemPart);
    const ai = s.source === 'ai'
      ? documents.filter((d) => d.feature === s.feature).sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
        .map((d) => (s.part ? assessmentPart(d, s.part) : documentPart(d))).filter((p): p is PdfDocumentPart => p !== null)
      : [];
    const scans = s.scans ? orderScans((meta.scans ?? []).filter((x) => x.section === s.id)).map((x) => scanPart(x, extra.scanPages?.get(x.id) ?? [], teacher)) : [];
    const entries = s.source === 'entries' || s.alsoEntries
      ? meta.entries.filter((e) => e.section === s.id).sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map((e) => entryPart(e, teacher))
      : [];
    return {
      label: s.label, ref: `${s.ref}.`, title: s.title, description: s.description, sub: s.sub, documents: [...system, ...ai, ...scans, ...entries],
      parts: s.source === 'group' ? partsOf(s).map((x) => `${x.ref}. ${x.title}`) : undefined,
    };
  });
}
