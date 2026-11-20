/**
 * RAG step 1: turn a PDF file into text. (Started from Company Knowledge AI.)
 *
 *   extract()       plain text, one entry per page, for indexing; keeping the
 *                   page number is what lets a document cite "syllabus, page 12"
 *   extractItems()  every piece of text with its position on the page, for the
 *                   syllabus parser, which needs to know which table column
 *                   a piece of text sits in
 *
 * Text from CorelDRAW PDFs (all CDC syllabi) comes out scrambled; each piece
 * is repaired by textRepair.ts.
 *
 * Scanned PDFs (pictures of pages) have no text to read. They are reported
 * with a clear message; OCR for them is not built yet.
 */
import { getDocument, Util } from "pdfjs-dist/legacy/build/pdf.mjs";
import { AppError } from "../../utils/errors.js";
import { isScrambledDocument, repairText } from "./textRepair.js";

export interface PageText {
  pageNumber: number;
  text: string;
}

export interface ExtractedPDF {
  pageCount: number;
  pages: PageText[];
}

/** One piece of text and where it sits. x grows rightwards, y grows downwards (from the top of the page). */
export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageItems {
  pageNumber: number;
  width: number;
  height: number;
  items: TextItem[];
}

/** A real PDF starts with the bytes "%PDF-". Checking this catches renamed files. */
export function looksLikePdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 1024).includes("%PDF-");
}

/** Tidies extracted text without flattening paragraphs. */
export function cleanText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t ]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Some PDFs (past-paper "solutions" sites, for one) draw the same block of text
 * two or three times on top of itself, so every passage would repeat. A run of
 * four long lines that already appeared, in the same order, earlier in the
 * document is such a copy (these PDFs also repeat a page's text, hidden, on
 * later pages). Pass the same `seen` set for every page of one document. Single repeated lines (a syllabus repeating "email or
 * cloud storage." in two rows, or a short list of examples) are real and are kept. Returns the item numbers
 * to skip.
 */
export function repeatedRuns(strings: string[], seen = new Set<string>()): Set<number> {
  const long = strings.map((s, i) => ({ s: s.trim(), i })).filter((x) => x.s.length >= 30);
  const skip = new Set<number>();
  for (let k = 0; k + 3 < long.length; k++) {
    const key = long.slice(k, k + 4).map((x) => x.s).join("\u0000");
    if (seen.has(key)) {
      // drop the four lines and anything short between them (bullets, numbers)
      for (let i = long[k].i; i <= long[k + 3].i; i++) skip.add(i);
    } else seen.add(key);
  }
  return skip;
}

const NO_TEXT_MESSAGE =
  "No readable text was found in this PDF. It is probably a scanned document (pictures of pages). Scanned documents cannot be indexed yet: upload a typed copy.";

export class PDFProcessor {
  /** Opens the PDF and calls `onPage` for each page's text pieces. */
  private async read(buffer: Buffer, onPage: (page: PageItems, hasEOL: boolean[]) => void): Promise<number> {
    if (!looksLikePdf(buffer)) throw new AppError(400, "This file is not a valid PDF.", "invalid_pdf");
    const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, verbosity: 0 });
    let pdf;
    try {
      pdf = await task.promise;
    } catch (err) {
      await task.destroy().catch(() => {});
      const message = String((err as Error)?.message ?? err);
      if (/password/i.test(message))
        throw new AppError(422, "This PDF is password-protected. Remove the password and upload it again.", "pdf_encrypted");
      throw new AppError(422, "This PDF is corrupted or cannot be read.", "pdf_corrupted");
    }
    try {
      // Read every page first: whether the text needs un-scrambling is decided
      // for the whole document at once (see isScrambledDocument in textRepair.ts).
      const raw: { pageNumber: number; width: number; height: number; transform: number[]; items: unknown[] }[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        raw.push({ pageNumber, width: viewport.width, height: viewport.height, transform: viewport.transform, items: content.items });
        page.cleanup();
      }
      const strings = function* () {
        for (const page of raw) for (const item of page.items) if (item && typeof item === "object" && "str" in item) yield String(item.str);
      };
      const scrambled = isScrambledDocument(strings());

      const seenRuns = new Set<string>(); // runs of lines already read in this document
      for (const { pageNumber, width, height, transform, items: pageItems } of raw) {
        const contentItems = pageItems as { str?: string; transform?: number[]; width?: number; height?: number; hasEOL?: boolean }[];
        const items: TextItem[] = [];
        const eol: boolean[] = [];
        const copies = repeatedRuns(contentItems.map((item) => ("str" in item ? String(item.str) : "")), seenRuns);
        for (const [index, item] of contentItems.entries()) {
          if (!("str" in item) || copies.has(index)) continue;
          // Through the page's own transform, so landscape (rotated) pages come out the right way up.
          const [a, b, , , e, f] = Util.transform(transform, item.transform as number[]) as number[];
          items.push({
            str: repairText(String(item.str), scrambled),
            x: e,
            y: f, // already measured from the top
            width: item.width ?? 0,
            height: item.height || Math.hypot(a, b),
          });
          eol.push(Boolean(item.hasEOL));
        }
        onPage({ pageNumber, width, height, items }, eol);
      }
      return pdf.numPages;
    } finally {
      await task.destroy().catch(() => {});
    }
  }

  async extract(buffer: Buffer): Promise<ExtractedPDF> {
    const pages: PageText[] = [];
    const pageCount = await this.read(buffer, (page, eol) => {
      const text = cleanText(page.items.map((item, i) => item.str + (eol[i] ? "\n" : "")).join(""));
      if (text) pages.push({ pageNumber: page.pageNumber, text });
    });
    if (pages.reduce((sum, p) => sum + p.text.length, 0) < 20) throw new AppError(422, NO_TEXT_MESSAGE, "pdf_no_text");
    return { pageCount, pages };
  }

  async extractItems(buffer: Buffer): Promise<PageItems[]> {
    const pages: PageItems[] = [];
    await this.read(buffer, (page) => pages.push(page));
    if (pages.every((p) => p.items.every((i) => !i.str.trim()))) throw new AppError(422, NO_TEXT_MESSAGE, "pdf_no_text");
    return pages;
  }
}
