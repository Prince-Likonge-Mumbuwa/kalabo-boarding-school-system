/**
 * The curriculum library: the PDFs the AI will draw on (syllabi, textbooks,
 * past papers, the school's templates).
 *
 *   storage/curriculum/<id>.pdf   the file itself (named by ID, never by upload name)
 *   storage/curriculum.json       the list, with each file's subject, level and type
 *
 * This file only keeps the files and the list. Making a document searchable
 * (extract, chunk, embed, save in ChromaDB) is rag/IndexingService.ts.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { type CurriculumDocument, type DocType, LEVELS } from "../types.js";
import { AppError } from "../utils/errors.js";
import { labelKey } from "./rag/DocumentChunker.js";
import { subjectNamesFor } from "./rag/subjectGroups.js";
import { JsonStore } from "../utils/JsonStore.js";

export interface DocumentLabels {
  subject: string;
  levels: string[];
  docType: DocType;
}

/** A level's place in teaching order (unknown levels go last). */
export function levelRank(level: string): number {
  const i = (LEVELS as readonly string[]).indexOf(level);
  return i === -1 ? LEVELS.length : i;
}

/** Puts levels in teaching order and removes repeats. */
export function orderLevels(levels: string[]): string[] {
  const rank = levelRank;
  return [...new Set(levels.map((l) => l.trim()).filter(Boolean))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Every real PDF starts with "%PDF-". */
export function looksLikePdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 1024).includes("%PDF-");
}

/** Keeps only a safe display name: no folders, no control characters. */
export function sanitizeFilename(original: string): string {
  // Browsers send UTF-8 names that the upload library reads as latin1; convert back.
  const decoded = Buffer.from(original, "latin1").toString("utf8");
  const name = (decoded.includes("�") ? original : decoded)
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 150);
  return name || "document.pdf";
}

/** A copy of the document that always has `levels`, even if it was saved before ranges existed. */
function withLevels(d: CurriculumDocument): CurriculumDocument {
  if (Array.isArray(d.levels) && d.levels.length) return { ...d };
  const { level, ...rest } = d;
  return { ...rest, levels: orderLevels([level ?? ""]) };
}

export class CurriculumService {
  private store: JsonStore<CurriculumDocument[]>;
  private dir: string;

  constructor(dataDir: string) {
    this.store = new JsonStore(path.join(dataDir, "curriculum.json"), () => []);
    this.dir = path.join(dataDir, "curriculum");
  }

  filePath(id: string): string {
    return path.join(this.dir, `${id}.pdf`);
  }

  /** Every document, newest first. An older single-level document is shown with that level. */
  async list(): Promise<CurriculumDocument[]> {
    return (await this.store.read()).map(withLevels).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }

  async get(id: string): Promise<CurriculumDocument> {
    const document = (await this.store.read()).find((d) => d.id === id);
    if (!document) throw new AppError(404, "Document not found.", "not_found");
    return withLevels(document);
  }

  async add(file: { name: string; buffer: Buffer }, labels: DocumentLabels): Promise<CurriculumDocument> {
    const document: CurriculumDocument = {
      id: randomUUID(),
      name: file.name,
      size: file.buffer.length,
      subject: labels.subject.trim(),
      levels: orderLevels(labels.levels),
      docType: labels.docType,
      uploadedAt: new Date().toISOString(),
      status: "stored",
    };
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.filePath(document.id), file.buffer);
    await this.store.update((documents) => void documents.push(document));
    return document;
  }

  /** Changes a document's labels or indexing status. */
  async update(id: string, patch: Partial<CurriculumDocument>): Promise<CurriculumDocument> {
    await this.get(id);
    return this.store.update((documents) => {
      const document = documents.find((d) => d.id === id)!;
      Object.assign(document, patch);
      if (patch.levels) document.levels = orderLevels(patch.levels);
      if ("error" in patch && patch.error === undefined) delete document.error;
      return { ...document };
    });
  }

  /** Every subject + level that at least one searchable document covers (grouped subjects included). */
  async catalog(): Promise<{ subject: string; level: string }[]> {
    const pairs = new Map<string, { subject: string; level: string }>();
    for (const d of await this.list()) {
      if (d.status !== "indexed") continue;
      // A Computer Studies syllabus also serves ICT and Computer Science teachers.
      for (const subject of subjectNamesFor(d.subject))
        for (const level of d.levels) {
          const key = `${labelKey(subject)}|${labelKey(level)}`;
          if (!pairs.has(key)) pairs.set(key, { subject, level });
        }
    }
    return [...pairs.values()].sort((a, b) => a.subject.localeCompare(b.subject) || levelRank(a.level) - levelRank(b.level));
  }

  /**
   * Documents uploaded before ranges existed had one `level`. Move it into
   * `levels`, and return the ones that were indexed: their chunks use the old
   * labels, so they must be indexed again.
   */
  async migrateLevels(): Promise<string[]> {
    return this.store.update((documents) => {
      const toReindex: string[] = [];
      for (const d of documents) {
        if (Array.isArray(d.levels) && d.levels.length) continue;
        d.levels = orderLevels([d.level ?? ""]);
        delete d.level;
        if (d.status === "indexed") toReindex.push(d.id);
      }
      return toReindex;
    });
  }

  /** Documents caught mid-indexing by a restart can never finish; mark them failed. */
  async failInterrupted(): Promise<void> {
    await this.store.update((documents) => {
      for (const d of documents)
        if (d.status === "indexing") {
          d.status = "failed";
          d.error = "Indexing was interrupted by a restart. Use Re-index to try again.";
        }
    });
  }

  async remove(id: string): Promise<void> {
    await this.get(id);
    await fs.rm(this.filePath(id), { force: true });
    await this.store.update((documents) => {
      const i = documents.findIndex((d) => d.id === id);
      if (i >= 0) documents.splice(i, 1);
    });
  }
}
