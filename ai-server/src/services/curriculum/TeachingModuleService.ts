/**
 * Teaching modules: the CDC "Teaching Module" PDFs read into structured
 * guides (ModuleParser.ts), one per document.
 *
 *   storage/teaching-modules.json   every module read so far
 *
 * A module is read automatically when a document of type textbook, teacher's
 * guide or other is indexed and turns out to be a teaching module. The
 * superAdmin can switch a module off, or read it again.
 *
 * Two jobs:
 *   1. Guides. For a lesson on a sub-topic, find the module's pages on it
 *      (learning activities, environment, materials, methods, how to conduct,
 *      content tips, hook, key terms, CBC assessment examples), so the
 *      generators follow the Ministry's own lesson design.
 *   2. A curriculum of its own. A module lists every topic, sub-topic,
 *      specific competence (with its syllabus number) and expected standard,
 *      so a subject that has a module but no approved syllabus map still gets
 *      topic dropdowns (see resolveCurriculum below).
 *
 * Matching across subjects: an ICT teacher's syllabus numbers Spreadsheets
 * 2.2.2, the Computer Science module numbers it 2.1.1. Codes are therefore
 * only trusted inside one subject; across a subject group (subjectGroups.ts)
 * sub-topics are matched by name.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { CurriculumDocument } from "../../types.js";
import { AppError } from "../../utils/errors.js";
import { JsonStore } from "../../utils/JsonStore.js";
import { labelKey } from "../rag/DocumentChunker.js";
import { subjectKeysFor } from "../rag/subjectGroups.js";
import type { PageItems } from "../rag/PDFProcessor.js";
import type { CurriculumMapService, MapTopic } from "./CurriculumMapService.js";
import { formOf } from "./CurriculumMapService.js";
import { type ModuleSubTopic, type ModuleTopic, parseModule } from "./ModuleParser.js";

export type { ModuleActivity, ModuleAssessment, ModuleRubricRow, ModuleSubTopic, ModuleTopic } from "./ModuleParser.js";

export interface TeachingModule {
  id: string;
  documentId: string;
  documentName: string;
  /** The subject the document is labelled with in the library, e.g. "Computer Science". */
  subject: string;
  /** "Computer Science Teaching Module – Form 2" (from the page header). */
  title: string;
  /** The Form the module is for (from its header, else from the document's levels). */
  form: number | null;
  year: string | null;
  /** Switched off by the superAdmin: not used by any generator. */
  active: boolean;
  topics: ModuleTopic[];
  warnings: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TeachingModuleSummary {
  id: string;
  documentId: string;
  documentName: string;
  subject: string;
  title: string;
  form: number | null;
  active: boolean;
  topics: { code: string; name: string; term: number | null; subTopics: { code: string; name: string; activities: number }[] }[];
  activities: number;
  rubrics: number;
  warnings: string[];
  updatedAt: string;
}

/** The module's material for one sub-topic, ready for a prompt. */
export interface ModuleGuide {
  moduleId: string;
  documentId: string;
  documentName: string;
  title: string;
  year: string | null;
  topic: ModuleTopic;
  sub: ModuleSubTopic;
  /** True when the module's numbering is the class's own (same subject), so its codes can be quoted. */
  sameNumbering: boolean;
}

const norm = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\b(the|of|and|to|introduction)\b/g, " ").replace(/\s+/g, " ").trim();
/** "Spreadsheets" = "Spreadsheet"; "Fundamentals of Algorithms" ~ "Algorithms". */
function sameName(a: string, b: string): boolean {
  const x = norm(a).replace(/s\b/g, "");
  const y = norm(b).replace(/s\b/g, "");
  if (!x || !y) return false;
  return x === y || (x.length >= 6 && y.includes(x)) || (y.length >= 6 && x.includes(y));
}

function summarize(m: TeachingModule): TeachingModuleSummary {
  const subs = m.topics.flatMap((t) => t.subTopics);
  return {
    id: m.id,
    documentId: m.documentId,
    documentName: m.documentName,
    subject: m.subject,
    title: m.title,
    form: m.form,
    active: m.active,
    topics: m.topics.map((t) => ({
      code: t.code,
      name: t.name,
      term: t.term,
      subTopics: t.subTopics.map((s) => ({ code: s.code, name: s.name, activities: s.activities.length })),
    })),
    activities: subs.reduce((n, s) => n + s.activities.length, 0),
    rubrics: subs.reduce((n, s) => n + (s.formative?.rubric.length ? 1 : 0) + (s.summative?.rubric.length ? 1 : 0), 0),
    warnings: m.warnings,
    updatedAt: m.updatedAt,
  };
}

/** A module's topics in the shape of a curriculum map (for dropdowns and the OFFICIAL SYLLABUS block). */
export function moduleAsMapTopics(module: TeachingModule): MapTopic[] {
  return module.topics.map((t) => ({
    code: t.code,
    name: t.name,
    form: module.form ?? 0,
    subTopics: t.subTopics.map((s) => ({
      code: s.code,
      name: s.name,
      competences: s.competences.map((c) => ({
        code: c.code,
        text: c.text,
        activities: s.activities.map((a) => a.title),
        standards: s.expectedStandards,
        page: s.pages[0],
      })),
    })),
  }));
}

export class TeachingModuleService {
  private store: JsonStore<TeachingModule[]>;

  constructor(dataDir: string) {
    this.store = new JsonStore(path.join(dataDir, "teaching-modules.json"), () => []);
  }

  async list(): Promise<TeachingModuleSummary[]> {
    return (await this.store.read()).map(summarize).sort((a, b) => a.subject.localeCompare(b.subject) || (a.form ?? 0) - (b.form ?? 0));
  }

  async get(id: string): Promise<TeachingModule> {
    const found = (await this.store.read()).find((m) => m.id === id);
    if (!found) throw new AppError(404, "Teaching module not found.", "not_found");
    return structuredClone(found);
  }

  /**
   * Reads a document as a teaching module. Returns null (and keeps nothing)
   * when the document is not one. Reading again replaces the old reading but
   * keeps the on/off switch.
   */
  async buildFromDocument(document: CurriculumDocument, pages: PageItems[]): Promise<TeachingModule | null> {
    const parsed = parseModule(pages);
    const withActivities = parsed.topics.some((t) => t.subTopics.some((s) => s.activities.length > 0));
    if (!withActivities) {
      await this.removeForDocument(document.id);
      return null;
    }
    const levelForm = document.levels.map(formOf).find((f): f is number => f !== null) ?? null;
    const now = new Date().toISOString();
    return this.store.update((modules) => {
      const existing = modules.find((m) => m.documentId === document.id);
      const module: TeachingModule = {
        id: existing?.id ?? randomUUID(),
        documentId: document.id,
        documentName: document.name,
        subject: document.subject,
        title: parsed.title || document.name.replace(/\.pdf$/i, ""),
        form: parsed.form ?? levelForm,
        year: parsed.year,
        active: existing?.active ?? true,
        topics: parsed.topics,
        warnings: parsed.warnings,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      if (existing) modules.splice(modules.indexOf(existing), 1, module);
      else modules.push(module);
      return structuredClone(module);
    });
  }

  async setActive(id: string, active: boolean): Promise<TeachingModule> {
    await this.get(id);
    return this.store.update((modules) => {
      const m = modules.find((x) => x.id === id)!;
      m.active = active;
      m.updatedAt = new Date().toISOString();
      return structuredClone(m);
    });
  }

  async relabel(documentId: string, subject: string): Promise<void> {
    await this.store.update((modules) => {
      for (const m of modules) if (m.documentId === documentId) m.subject = subject;
    });
  }

  async removeForDocument(documentId: string): Promise<void> {
    await this.store.update((modules) => {
      for (let i = modules.length - 1; i >= 0; i--) if (modules[i].documentId === documentId) modules.splice(i, 1);
    });
  }

  /** Active modules for a Form: the subject's own first, then those of subjects that share material. */
  private async candidates(subject: string, level: string): Promise<{ module: TeachingModule; own: boolean }[]> {
    const form = formOf(level);
    if (form === null) return [];
    const key = labelKey(subject);
    const group = subjectKeysFor(subject);
    const active = (await this.store.read()).filter((m) => m.active && m.form === form);
    // Two modules for one Form (a Term 1-2 part and a Term 3 part) are both searched.
    return [
      ...active.filter((m) => labelKey(m.subject) === key).map((module) => ({ module, own: true })),
      ...active.filter((m) => labelKey(m.subject) !== key && group.includes(labelKey(m.subject))).map((module) => ({ module, own: false })),
    ];
  }

  /**
   * The module pages for one sub-topic. `numbering` is the subject whose
   * codes `code` follows (the subject of the curriculum map the teacher
   * picked from): a code is only matched inside that subject's modules;
   * everywhere else the name decides.
   */
  async guideFor(subject: string, level: string, target: { code?: string; name: string }, numbering = subject): Promise<ModuleGuide | null> {
    const list = await this.candidates(subject, level);
    const sameNumbering = (m: TeachingModule) => labelKey(m.subject) === labelKey(numbering);
    const make = (module: TeachingModule, topic: ModuleTopic, sub: ModuleSubTopic): ModuleGuide => ({
      moduleId: module.id, documentId: module.documentId, documentName: module.documentName, title: module.title, year: module.year,
      topic: structuredClone(topic), sub: structuredClone(sub), sameNumbering: sameNumbering(module),
    });
    if (target.code)
      for (const { module } of list)
        if (sameNumbering(module))
          for (const topic of module.topics) for (const sub of topic.subTopics) if (sub.code === target.code) return make(module, topic, sub);
    for (const { module } of list)
      for (const topic of module.topics) for (const sub of topic.subTopics) if (sameName(sub.name, target.name)) return make(module, topic, sub);
    return null;
  }

  /** Guides for whole topics (tests, schemes): every sub-topic of each matched topic. */
  async guidesForTopics(subject: string, level: string, topics: { code: string; name: string; subTopics: { code: string; name: string }[] }[], numbering = subject): Promise<ModuleGuide[]> {
    const out: ModuleGuide[] = [];
    const seen = new Set<string>();
    for (const topic of topics)
      for (const sub of topic.subTopics) {
        const guide = await this.guideFor(subject, level, sub, numbering);
        if (guide && !seen.has(`${guide.moduleId}:${guide.sub.code}`)) {
          seen.add(`${guide.moduleId}:${guide.sub.code}`);
          out.push(guide);
        }
      }
    return out;
  }

  /**
   * The module itself as a curriculum: all its topics (both term parts of a
   * Form merged, in code order), with the term each one is taught in.
   */
  async asCurriculum(subject: string, level: string, ownOnly: boolean): Promise<{ subject: string; documentName: string; topics: MapTopic[]; terms: Record<string, number> } | null> {
    const list = (await this.candidates(subject, level)).filter((c) => c.own || !ownOnly);
    if (!list.length) return null;
    // Only modules of one subject: two numberings in one dropdown would confuse.
    const subjectKey = labelKey(list[0].module.subject);
    const modules = list.map((c) => c.module).filter((m) => labelKey(m.subject) === subjectKey);
    const byCode = new Map<string, MapTopic>();
    const terms: Record<string, number> = {};
    for (const m of modules)
      for (const t of moduleAsMapTopics(m)) {
        if (!byCode.has(t.code)) byCode.set(t.code, t);
        const term = m.topics.find((x) => x.code === t.code)?.term;
        if (term) terms[t.code] = term;
      }
    const order = (code: string) => code.split(".").map(Number);
    const topics = [...byCode.values()].sort((a, b) => {
      const [x, y] = [order(a.code), order(b.code)];
      return x[0] - y[0] || x[1] - y[1];
    });
    return { subject: modules[0].subject, documentName: [...new Set(modules.map((m) => m.title || m.documentName))].join(" + "), topics, terms };
  }

  /** The term each topic is taught in, by topic name (works across numberings). */
  async termsByName(subject: string, level: string): Promise<{ name: string; term: number }[]> {
    const out: { name: string; term: number }[] = [];
    for (const { module } of await this.candidates(subject, level))
      for (const t of module.topics) {
        if (t.term) out.push({ name: t.name, term: t.term });
        for (const s of t.subTopics) if (t.term) out.push({ name: s.name, term: t.term });
      }
    return out;
  }

  /** Subjects and Forms that a module covers (shown to teachers as "topics available"). */
  async coverage(): Promise<{ subject: string; forms: number[] }[]> {
    const bySubject = new Map<string, Set<number>>();
    for (const m of await this.store.read())
      if (m.active && m.form) {
        const set = bySubject.get(m.subject) ?? new Set<number>();
        set.add(m.form);
        bySubject.set(m.subject, set);
      }
    return [...bySubject].map(([subject, forms]) => ({ subject, forms: [...forms].sort((a, b) => a - b) }));
  }
}

/**
 * The curriculum a class's forms and prompts use, in this order:
 *   1. an approved syllabus map of the class's own subject;
 *   2. a teaching module of the class's own subject;
 *   3. an approved map of a subject that shares material;
 *   4. a module of a subject that shares material.
 * The first one found is used whole: topic numbers are never mixed.
 */
export interface ResolvedCurriculum {
  subject: string;
  documentName: string;
  topics: MapTopic[];
  source: "syllabus" | "module";
  /** Topic code -> term (1-3), when the module says. */
  terms?: Record<string, number>;
}

export async function resolveCurriculum(maps: CurriculumMapService, modules: TeachingModuleService, subject: string, level: string): Promise<ResolvedCurriculum | null> {
  const map = await maps.topicsFor(subject, level);
  const ownMap = map && labelKey(map.subject) === labelKey(subject);
  if (ownMap) return { ...map, source: "syllabus" };
  const ownModule = await modules.asCurriculum(subject, level, true);
  if (ownModule) return { ...ownModule, source: "module" };
  if (map) return { ...map, source: "syllabus" };
  const groupModule = await modules.asCurriculum(subject, level, false);
  return groupModule ? { ...groupModule, source: "module" } : null;
}
