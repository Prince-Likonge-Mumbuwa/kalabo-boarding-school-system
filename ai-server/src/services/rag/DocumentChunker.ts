/**
 * RAG step 2: cut page text into small overlapping chunks.
 * (The splitting is copied from Company Knowledge AI.)
 *
 * Why chunks? An embedding captures the meaning of a short passage well and
 * of a whole syllabus badly, and we only want to send the model the few
 * passages that matter. Why overlap? So a sentence that falls on a boundary
 * still appears whole in at least one chunk.
 *
 * The splitter is "recursive": it prefers to cut at paragraph breaks, then
 * line breaks, then sentence ends, then spaces, and only cuts mid-word when
 * nothing else fits.
 *
 * Every chunk carries its document's subject, class levels and type, which is
 * what lets a Form 2 lesson plan search only material that covers Form 2.
 * Passages under a "Sub-Topic 2.1.1: ..." heading (the CDC teaching modules
 * use them) also carry that topic and sub-topic, so a lesson on 2.1.1 finds
 * the module's own pages for it first.
 */
import type { Chunk, ChunkMetadata, CurriculumDocument } from "../../types.js";
import type { PageText } from "./PDFProcessor.js";

const SEPARATORS = ["\n\n", "\n", ". ", " "];

/**
 * The form subjects are compared in: case, spaces, punctuation and "&"/"and"
 * do not matter ("Design & Technology" = "design and technology"). Same rule
 * as looseSubjectKey in the school app's client/services/subjectMatch.ts.
 */
export const labelKey = (label: string) =>
  label.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

/** The ChromaDB field that marks a chunk as covering this level: "Form 2" -> "lv_form_2". */
export const levelFlag = (level: string) => `lv_${labelKey(level).replace(/ /g, "_")}` as const;

/** Breaks text into pieces no longer than `maxLength`, cutting at the best separator. */
function splitPieces(text: string, maxLength: number, separators: string[]): string[] {
  if (text.length <= maxLength) return [text];
  const [separator, ...rest] = separators;
  if (separator === undefined) {
    const pieces: string[] = [];
    for (let i = 0; i < text.length; i += maxLength) pieces.push(text.slice(i, i + maxLength));
    return pieces;
  }
  const parts = text.split(separator);
  if (parts.length === 1) return splitPieces(text, maxLength, rest);
  return parts
    .map((part, i) => (i < parts.length - 1 ? part + separator : part)) // keep the separator
    .filter((part) => part.length > 0)
    .flatMap((part) => splitPieces(part, maxLength, rest));
}

/** The last `overlap` characters of a chunk, starting at a word boundary. */
function tail(text: string, overlap: number): string {
  if (overlap <= 0 || text.length <= overlap) return overlap <= 0 ? "" : text;
  const slice = text.slice(-overlap);
  const firstSpace = slice.search(/\s/);
  return firstSpace === -1 ? slice : slice.slice(firstSpace + 1);
}

export function splitText(text: string, chunkSize: number, chunkOverlap: number): string[] {
  const overlap = Math.max(0, Math.min(chunkOverlap, Math.floor(chunkSize / 2)));
  const pieces = splitPieces(text, chunkSize - overlap, SEPARATORS);
  const chunks: string[] = [];
  let current = "";
  let fresh = false; // true once `current` holds text beyond the carried-over overlap
  for (const piece of pieces) {
    if (fresh && current.length + piece.length > chunkSize) {
      chunks.push(current.trim());
      current = tail(current, overlap);
      fresh = false;
    }
    current += piece;
    fresh = true;
  }
  if (fresh && current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

/** "Sub-Topic 2.1.1: Spreadsheets", "Subtopic: 1.5.1", "Sub- Topic 1.6.1" … → "2.1.1". */
const SUB_TOPIC_HEADING = /\bsub\s*-?\s*topic\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{1,2})(?![.\d])/gi;

/**
 * The sub-topic headings on a page. A page naming three or more different
 * sub-topics is a table of contents, not teaching, so it gives none.
 */
export function subTopicHeadings(text: string): { index: number; code: string }[] {
  const found = [...text.matchAll(SUB_TOPIC_HEADING)].map((m) => ({ index: m.index ?? 0, code: m[1] }));
  return new Set(found.map((h) => h.code)).size >= 3 ? [] : found;
}

export class DocumentChunker {
  constructor(
    private chunkSize: number,
    private chunkOverlap: number,
  ) {}

  /** Chunks each page separately so every chunk has exactly one page number. */
  chunk(pages: PageText[], document: CurriculumDocument): Chunk[] {
    const chunks: Chunk[] = [];
    // A syllabus lists every code in its tables, so only other documents are tagged.
    const tag = document.docType !== "syllabus";
    let current: string | null = null; // the sub-topic being taught, carried across pages
    for (const page of pages) {
      const headings = tag ? subTopicHeadings(page.text) : [];
      let searchFrom = 0;
      for (const text of splitText(page.text, this.chunkSize, this.chunkOverlap)) {
        // The sub-topic in force where this chunk starts, or the first one it introduces.
        const at = page.text.indexOf(text.slice(0, 60), searchFrom);
        if (at >= 0) searchFrom = at;
        const before = headings.filter((h) => h.index <= Math.max(at, 0)).pop();
        const inside = headings.find((h) => at >= 0 && h.index > at && h.index < at + text.length);
        const code = before?.code ?? inside?.code ?? current;
        const chunkIndex = chunks.length;
        const metadata: ChunkMetadata = {
          documentId: document.id,
          documentName: document.name,
          docType: document.docType,
          subject: document.subject,
          levels: document.levels.join(", "),
          subjectKey: labelKey(document.subject),
          pageNumber: page.pageNumber,
          chunkIndex,
        };
        for (const level of document.levels) metadata[levelFlag(level)] = true;
        if (code) {
          metadata.subTopicCode = code;
          metadata.topicCode = code.split(".").slice(0, 2).join(".");
        }
        chunks.push({ id: `${document.id}:${chunkIndex}`, text, metadata });
      }
      if (headings.length) current = headings[headings.length - 1].code;
    }
    return chunks;
  }
}
