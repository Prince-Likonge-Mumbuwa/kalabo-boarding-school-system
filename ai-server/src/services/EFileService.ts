/**
 * The teachers' eFiles: every document a teacher generates is kept here, one
 * file per teacher (storage/efile/<uid>.json), so one teacher's file can
 * never show another teacher's documents.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import type { EFileDocument, EFileEntry, EFileMeta, EFileScan, EFileSectionId, LessonEvaluation } from "../types.js";
import { AppError } from "../utils/errors.js";
import { JsonStore } from "../utils/JsonStore.js";

/**
 * Short pieces of a lesson plan's text, sent with the list so the eFile can
 * build the Homework record (10 i), the Records of Work (9) and the planned
 * remedial work (10 vii) without downloading every plan.
 */
export interface LessonExtracts {
  goal?: string;
  homework?: string;
  remedial?: string;
}

export type EFileSummary = Omit<EFileDocument, "content" | "sources"> & { extracts?: LessonExtracts };

/** The text of one "## Heading" section (without the heading), or "" if the plan has none. */
export function sectionText(content: string, heading: string): string {
  const match = new RegExp(`^##\\s+${heading}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, "im").exec(content);
  return match ? match[1].trim() : "";
}

const cap = (text: string, max: number) => (text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, "")} …` : text);

export function lessonExtracts(content: string): LessonExtracts {
  const pick = (heading: string, max: number) => cap(sectionText(content, heading), max) || undefined;
  return { goal: pick("Lesson Goal", 400), homework: pick("Homework", 900), remedial: pick("Remedial Work", 1200) };
}

/** Section names used before the school's own Teacher's File layout (18 Nov 2026). */
const LEGACY_SECTIONS: Record<string, EFileSectionId> = {
  timetables: "timetable", results: "progressChart", remedial: "remedialPlan", cpd: "miscellaneous", observations: "miscellaneous", circulars: "miscellaneous",
};
/** Where an entry is shown: old section names mapped, and lesson grids written before the Lesson Grid had its own section (22 Nov 2026) moved there from Syllabus. */
const sectionOf = (e: EFileEntry): EFileSectionId =>
  e.section === "syllabus" && /^(syllabus analysis grid|lesson grid)\b/i.test(e.title) ? "lessonGrid" : LEGACY_SECTIONS[e.section as string] ?? e.section;

export class EFileService {
  private stores = new Map<string, JsonStore<EFileDocument[]>>();
  private metas = new Map<string, JsonStore<EFileMeta>>();

  constructor(private dataDir: string) {}

  private storeFor(uid: string): JsonStore<EFileDocument[]> {
    // Firebase uids are letters and digits; anything else is refused rather than used in a file name.
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new AppError(400, "Invalid user.", "invalid_user");
    let store = this.stores.get(uid);
    if (!store) {
      store = new JsonStore(path.join(this.dataDir, "efile", `${uid}.json`), () => [], { pretty: false });
      this.stores.set(uid, store);
    }
    return store;
  }

  /** The personal record and entries live beside the documents (storage/efile/<uid>.meta.json). */
  private metaFor(uid: string): JsonStore<EFileMeta> {
    this.storeFor(uid); // same uid check
    let store = this.metas.get(uid);
    if (!store) {
      store = new JsonStore(path.join(this.dataDir, "efile", `${uid}.meta.json`), () => ({ profile: {}, entries: [], scans: [] }));
      this.metas.set(uid, store);
    }
    return store;
  }

  async meta(uid: string): Promise<EFileMeta> {
    const m = await this.metaFor(uid).read();
    const entries = m.entries.map((e) => ({ ...e, section: sectionOf(e) }));
    return {
      profile: { ...m.profile },
      entries: entries.sort((a, b) => (a.date ?? a.createdAt).localeCompare(b.date ?? b.createdAt)),
      scans: [...(m.scans ?? [])].sort((a, b) => (a.date ?? a.createdAt).localeCompare(b.date ?? b.createdAt)),
    };
  }

  // ── Scanned papers (marked scripts, the teacher's own question papers) ──

  private scanDir(uid: string): string {
    this.storeFor(uid); // same uid check
    return path.join(this.dataDir, "efile", "scans", uid);
  }

  /** Saves the pages (already JPEGs) and the scan's details. */
  async addScan(uid: string, details: Omit<EFileScan, "id" | "pages" | "createdAt">, pages: Buffer[]): Promise<EFileScan> {
    if (pages.length === 0) throw new AppError(400, "Add at least one page.", "no_pages");
    const saved: EFileScan = { ...details, id: randomUUID(), pages: pages.length, createdAt: new Date().toISOString() };
    const dir = this.scanDir(uid);
    await mkdir(dir, { recursive: true });
    await Promise.all(pages.map((p, n) => writeFile(path.join(dir, `${saved.id}-${n + 1}.jpg`), p)));
    return this.metaFor(uid).update((m) => {
      m.scans ??= [];
      // One script per slot per assessment: a new highest replaces the old one.
      if (saved.section === "scriptSamples" && saved.slot) {
        const old = m.scans.filter((x) => x.section === "scriptSamples" && x.slot === saved.slot && x.assessmentId === saved.assessmentId && x.title === saved.title);
        for (const o of old) void this.dropPages(dir, o);
        m.scans = m.scans.filter((x) => !old.includes(x));
      }
      m.scans.push(saved);
      return saved;
    });
  }

  private async dropPages(dir: string, scan: EFileScan) {
    for (let n = 1; n <= scan.pages; n++) await rm(path.join(dir, `${scan.id}-${n}.jpg`), { force: true });
  }

  async scanPage(uid: string, id: string, page: number): Promise<Buffer> {
    const scan = ((await this.metaFor(uid).read()).scans ?? []).find((x) => x.id === id);
    if (!scan || !Number.isInteger(page) || page < 1 || page > scan.pages) throw new AppError(404, "Scanned page not found.", "not_found");
    return readFile(path.join(this.scanDir(uid), `${id}-${page}.jpg`));
  }

  async removeScan(uid: string, id: string): Promise<void> {
    const store = this.metaFor(uid);
    const scan = ((await store.read()).scans ?? []).find((x) => x.id === id);
    if (!scan) throw new AppError(404, "Scan not found in your eFile.", "not_found");
    await store.update((m) => { m.scans = (m.scans ?? []).filter((x) => x.id !== id); });
    await this.dropPages(this.scanDir(uid), scan);
  }

  setProfile(uid: string, profile: Record<string, string>): Promise<Record<string, string>> {
    return this.metaFor(uid).update((m) => {
      m.profile = Object.fromEntries(Object.entries(profile).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
      return { ...m.profile };
    });
  }

  addEntry(uid: string, entry: { section: EFileSectionId; title: string; content: string; date?: string; lessonId?: string }): Promise<EFileEntry> {
    const now = new Date().toISOString();
    const saved: EFileEntry = { ...entry, id: randomUUID(), createdAt: now, updatedAt: now };
    return this.metaFor(uid).update((m) => {
      m.entries.push(saved);
      return saved;
    });
  }

  async updateEntry(uid: string, id: string, change: Partial<Pick<EFileEntry, "section" | "title" | "content" | "date">>): Promise<EFileEntry> {
    const store = this.metaFor(uid);
    if (!(await store.read()).entries.some((e) => e.id === id)) throw new AppError(404, "Entry not found in your eFile.", "not_found");
    return store.update((m) => {
      const e = m.entries.find((x) => x.id === id)!;
      Object.assign(e, change, { updatedAt: new Date().toISOString() });
      if (change.date === "") delete e.date;
      return structuredClone(e);
    });
  }

  async removeEntry(uid: string, id: string): Promise<void> {
    const store = this.metaFor(uid);
    if (!(await store.read()).entries.some((e) => e.id === id)) throw new AppError(404, "Entry not found in your eFile.", "not_found");
    await store.update((m) => { m.entries = m.entries.filter((e) => e.id !== id); });
  }

  async list(uid: string): Promise<EFileSummary[]> {
    return (await this.storeFor(uid).read())
      .map(({ content, sources: _s, ...summary }): EFileSummary =>
        summary.feature === "lessonPlan" ? { ...summary, extracts: this.extractsOf(summary.id, content) } : summary)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Lesson-plan extracts, worked out once per version of the plan (the list is asked for often). */
  private extracts = new Map<string, { length: number; value: LessonExtracts }>();
  private extractsOf(id: string, content: string): LessonExtracts {
    const hit = this.extracts.get(id);
    if (hit && hit.length === content.length) return hit.value;
    const value = lessonExtracts(content);
    this.extracts.set(id, { length: content.length, value });
    return value;
  }

  async get(uid: string, id: string): Promise<EFileDocument> {
    const document = (await this.storeFor(uid).read()).find((d) => d.id === id);
    if (!document) throw new AppError(404, "Document not found in your eFile.", "not_found");
    return document;
  }

  /** Several of the teacher's own documents with their text (unknown ids are refused). */
  async getMany(uid: string, ids: string[]): Promise<EFileDocument[]> {
    const all = await this.storeFor(uid).read();
    return ids.map((id) => {
      const document = all.find((d) => d.id === id);
      if (!document) throw new AppError(404, "Document not found in your eFile.", "not_found");
      return document;
    });
  }

  add(uid: string, document: Omit<EFileDocument, "id" | "createdAt">): Promise<EFileDocument> {
    const saved: EFileDocument = { ...document, id: randomUUID(), createdAt: new Date().toISOString() };
    return this.storeFor(uid).update((documents) => {
      documents.push(saved);
      return saved;
    });
  }

  /**
   * Saves a lesson plan's evaluation and writes the statement into the plan's
   * "## Lesson Evaluation" section (replacing the questions, or an earlier
   * evaluation), so printing and the Word download include it.
   */
  async setEvaluation(uid: string, id: string, evaluation: LessonEvaluation): Promise<EFileDocument> {
    await this.get(uid, id);
    return this.storeFor(uid).update((documents) => {
      const document = documents.find((d) => d.id === id)!;
      document.evaluation = evaluation;
      document.content = withEvaluation(document.content, evaluation);
      return structuredClone(document);
    });
  }

  /** Links a lesson plan to the remedial or continuation lesson written from its evaluation. */
  async setFollowUp(uid: string, id: string, followUp: NonNullable<EFileDocument["followUp"]>): Promise<void> {
    await this.get(uid, id);
    await this.storeFor(uid).update((documents) => {
      documents.find((d) => d.id === id)!.followUp = followUp;
    });
  }

  async remove(uid: string, id: string): Promise<void> {
    await this.get(uid, id);
    await this.storeFor(uid).update((documents) => {
      const i = documents.findIndex((d) => d.id === id);
      if (i >= 0) documents.splice(i, 1);
      // A removed follow-up lesson no longer counts as planned.
      for (const d of documents) if (d.followUp?.id === id) delete d.followUp;
    });
  }
}

/** The plan's text with its "## Lesson Evaluation" section holding the statement. */
export function withEvaluation(content: string, evaluation: LessonEvaluation): string {
  const date = new Date(evaluation.evaluatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const section = `## Lesson Evaluation\n*Completed after the lesson, ${date}.*\n\n${evaluation.statement.trim()}\n`;
  const start = content.search(/^##\s+Lesson Evaluation\s*$/im);
  if (start < 0) return `${content.trimEnd()}\n\n${section}`;
  const rest = content.slice(start).replace(/^##[^\n]*\n/, "");
  const next = rest.search(/^##\s/m);
  return `${content.slice(0, start)}${section}${next >= 0 ? `\n${rest.slice(next)}` : ""}`.trimEnd() + "\n";
}
