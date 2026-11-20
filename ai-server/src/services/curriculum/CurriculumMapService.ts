/**
 * Curriculum maps: the topic → sub-topic → competence tree of each syllabus,
 * read straight from the syllabus PDF (SyllabusParser.ts), checked by the
 * superAdmin, then used by the teacher forms (topic and sub-topic dropdowns,
 * the assessment topic checklist) and by the prompts (the exact competences,
 * activities and expected standards).
 *
 *   storage/curriculum-maps.json   every map, one per syllabus document
 *
 * A map starts as a "draft". Only "approved" maps reach teachers, so a reading
 * mistake is fixed in the console before anyone plans a lesson from it.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { CurriculumDocument } from "../../types.js";
import { AppError } from "../../utils/errors.js";
import { JsonStore } from "../../utils/JsonStore.js";
import { labelKey } from "../rag/DocumentChunker.js";
import type { PageItems } from "../rag/PDFProcessor.js";
import { subjectKeysFor } from "../rag/subjectGroups.js";
import { type MapTopic, parseSyllabus } from "./SyllabusParser.js";

export type { MapCompetence, MapSubTopic, MapTopic } from "./SyllabusParser.js";

export interface CurriculumMap {
  id: string;
  /** The school subject, copied from the syllabus document's label. */
  subject: string;
  documentId: string;
  documentName: string;
  status: "draft" | "approved";
  topics: MapTopic[];
  /** What the reader was unsure about, for the reviewer. */
  warnings: string[];
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
}

/** What the console's list shows (without the whole tree). */
export interface CurriculumMapSummary {
  id: string;
  subject: string;
  documentId: string;
  documentName: string;
  status: CurriculumMap["status"];
  forms: number[];
  topics: number;
  subTopics: number;
  competences: number;
  warnings: number;
  updatedAt: string;
  approvedAt?: string;
}

/** "Form 3" / "Form 3A" → 3. Grades are not mapped: the CDC O-level syllabi number by Form. */
export function formOf(level: string): number | null {
  const m = level.match(/^\s*form\s*(\d)/i);
  return m ? Number(m[1]) : null;
}

function summarize(map: CurriculumMap): CurriculumMapSummary {
  const subs = map.topics.flatMap((t) => t.subTopics);
  return {
    id: map.id,
    subject: map.subject,
    documentId: map.documentId,
    documentName: map.documentName,
    status: map.status,
    forms: [...new Set(map.topics.map((t) => t.form))].sort((a, b) => a - b),
    topics: map.topics.length,
    subTopics: subs.length,
    competences: subs.reduce((n, s) => n + s.competences.length, 0),
    warnings: map.warnings.length,
    updatedAt: map.updatedAt,
    approvedAt: map.approvedAt,
  };
}

export class CurriculumMapService {
  private store: JsonStore<CurriculumMap[]>;

  constructor(dataDir: string) {
    this.store = new JsonStore(path.join(dataDir, "curriculum-maps.json"), () => []);
  }

  async list(): Promise<CurriculumMapSummary[]> {
    return (await this.store.read()).map(summarize).sort((a, b) => a.subject.localeCompare(b.subject));
  }

  async get(id: string): Promise<CurriculumMap> {
    const map = (await this.store.read()).find((m) => m.id === id);
    if (!map) throw new AppError(404, "Curriculum map not found.", "not_found");
    return structuredClone(map);
  }

  /**
   * Reads a syllabus document into a map. Reading the same document again
   * replaces its map and puts it back to draft, so it is checked once more.
   */
  async buildFromDocument(document: CurriculumDocument, pages: PageItems[]): Promise<CurriculumMap> {
    const parsed = parseSyllabus(pages);
    if (parsed.topics.length === 0)
      throw new AppError(
        422,
        "No syllabus table was found in this PDF. Curriculum maps are read from CDC syllabi with the columns Topic, Sub-topic, Specific competences, Learning activities and Expected standards.",
        "no_syllabus_table",
      );
    const now = new Date().toISOString();
    return this.store.update((maps) => {
      const existing = maps.find((m) => m.documentId === document.id);
      const map: CurriculumMap = {
        id: existing?.id ?? randomUUID(),
        subject: document.subject,
        documentId: document.id,
        documentName: document.name,
        status: "draft",
        topics: parsed.topics,
        warnings: parsed.warnings,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      if (existing) maps.splice(maps.indexOf(existing), 1, map);
      else maps.push(map);
      return structuredClone(map);
    });
  }

  /** Saves the reviewer's corrections. The map keeps its status. */
  async saveTopics(id: string, topics: MapTopic[]): Promise<CurriculumMap> {
    await this.get(id);
    return this.store.update((maps) => {
      const map = maps.find((m) => m.id === id)!;
      map.topics = topics;
      map.warnings = []; // the reviewer has seen them
      map.updatedAt = new Date().toISOString();
      return structuredClone(map);
    });
  }

  async setApproved(id: string, approved: boolean): Promise<CurriculumMap> {
    await this.get(id);
    return this.store.update((maps) => {
      const map = maps.find((m) => m.id === id)!;
      map.status = approved ? "approved" : "draft";
      if (approved) map.approvedAt = new Date().toISOString();
      else delete map.approvedAt;
      map.updatedAt = new Date().toISOString();
      return structuredClone(map);
    });
  }

  /** Keeps a map's subject in step when its document is relabelled. */
  async relabel(documentId: string, subject: string): Promise<void> {
    await this.store.update((maps) => {
      for (const m of maps) if (m.documentId === documentId) m.subject = subject;
    });
  }

  async remove(id: string): Promise<void> {
    await this.get(id);
    await this.store.update((maps) => void maps.splice(maps.findIndex((m) => m.id === id), 1));
  }

  async removeForDocument(documentId: string): Promise<void> {
    await this.store.update((maps) => {
      for (let i = maps.length - 1; i >= 0; i--) if (maps[i].documentId === documentId) maps.splice(i, 1);
    });
  }

  /** Which subjects have an approved map, for each Form: lets the teacher forms know when to show dropdowns. */
  async approvedCoverage(): Promise<{ subject: string; forms: number[] }[]> {
    return (await this.store.read())
      .filter((m) => m.status === "approved")
      .map((m) => ({ subject: m.subject, forms: [...new Set(m.topics.map((t) => t.form))].sort((a, b) => a - b) }));
  }

  /**
   * The approved topics for one class: the teacher's own subject's map first;
   * if that subject has none, a map of a subject that shares material
   * (an ICT teacher can use a Computer Studies syllabus). Never a mix of two
   * syllabi, which would put two different topic numberings in one dropdown.
   */
  async topicsFor(subject: string, level: string): Promise<{ subject: string; documentName: string; topics: MapTopic[] } | null> {
    const form = formOf(level);
    if (form === null) return null;
    const approved = (await this.store.read()).filter((m) => m.status === "approved" && m.topics.some((t) => t.form === form));
    const own = approved.find((m) => labelKey(m.subject) === labelKey(subject));
    const keys = subjectKeysFor(subject);
    const map = own ?? approved.find((m) => keys.includes(labelKey(m.subject)));
    if (!map) return null;
    return { subject: map.subject, documentName: map.documentName, topics: structuredClone(map.topics.filter((t) => t.form === form)) };
  }
}
