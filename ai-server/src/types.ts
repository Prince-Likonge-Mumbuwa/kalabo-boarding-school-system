/**
 * Shared data shapes of the AI server. Reading this file first is the
 * quickest way to see what the server stores. The school app has a matching
 * copy in client/types/ai.ts.
 */

/** The AI tools a teacher can be given. The superAdmin switches each on or off. */
export const FEATURE_KEYS = ["lessonPlan", "schemeOfWork", "assessment", "recordOfWork", "learnerNotes", "eFile"] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface AiSettings {
  features: Record<FeatureKey, { enabled: boolean }>;
  /** Most documents one teacher may generate per day (controls the NVIDIA bill). 0 = no limit. */
  dailyLimit: number;
  /**
   * Who may use the AI tools:
   *  - "selected": only teachers the superAdmin has granted access;
   *  - "all": every signed-in teacher, except those the superAdmin revoked.
   */
  accessMode: "selected" | "all";
}

export type AccessState = "pending" | "granted" | "revoked";

/** A teacher the AI server has seen. Created the first time they open AI Tools. */
export interface TeacherRecord {
  uid: string; // the teacher's sign-in ID in the school app
  email: string;
  name: string;
  access: AccessState;
  firstSeenAt: string;
  lastSeenAt: string;
}

// ── Finances (storage/finance.json, see FinanceService) ─────────────────────

export type SchoolTerm = "Term 1" | "Term 2" | "Term 3";

/** An entry taken out of the totals. It stays in the books with the reason. */
export interface Voided { at: string; reason: string }

/** A teacher's fee for one term. All amounts are ZMW. */
export interface FeePayment {
  id: string;
  teacherUid: string;
  teacherName: string;
  teacherEmail: string;
  term: SchoolTerm;
  year: number;
  amount: number;
  receivedOn: string; // YYYY-MM-DD
  recordedAt: string;
  /** "grant": recorded when access was granted; "manual": entered by the superAdmin. */
  source: "grant" | "manual";
  reference?: string; // receipt, mobile money or bank reference
  note?: string;
  voided?: Voided;
}

/** Money paid to a service the system runs on (DeepInfra, Hostinger, the domain ...). ZMW. */
export interface ServicePayment {
  id: string;
  paidOn: string; // YYYY-MM-DD
  provider: string;
  description: string;
  amount: number;
  reference?: string;
  recordedAt: string;
  voided?: Voided;
}

export interface FinanceData {
  /** The fee for one term, ZMW. */
  termFee: number;
  payments: FeePayment[];
  expenses: ServicePayment[];
}

export interface FinanceSummary {
  currentTerm: { term: SchoolTerm; year: number };
  /** Totals of the entries that are not voided. */
  received: number;
  paidOut: number;
  balance: number;
  byTerm: { term: SchoolTerm; year: number; received: number; paidOut: number; teachers: number }[];
  /** Granted teachers with no fee recorded for the current term. */
  unpaid: { uid: string; name: string; email: string }[];
}

export interface FinanceView {
  termFee: number;
  payments: FeePayment[];
  expenses: ServicePayment[];
  summary: FinanceSummary;
}

/**
 * The class levels a curriculum document can cover, in teaching order.
 * A document covers one level ("Form 2") or a run of them ("Form 1" to "Form 4").
 * Teachers' classes are matched to these from the class name ("Form 3A" -> "Form 3").
 */
export const LEVELS = ["Form 1", "Form 2", "Form 3", "Form 4", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"] as const;

export const DOC_TYPES = ["syllabus", "textbook", "teachers_guide", "past_paper", "template", "other"] as const;
export type DocType = (typeof DOC_TYPES)[number];

/** One curriculum PDF in the library, with the labels the AI will filter by. */
export interface CurriculumDocument {
  id: string;
  name: string;
  size: number;
  subject: string; // the school's subject name, e.g. "ICT"
  /** Every class level this document covers, e.g. ["Form 1", "Form 2", "Form 3", "Form 4"]. */
  levels: string[];
  /** Older documents had one level only; it is moved into `levels` when the server starts. */
  level?: string;
  docType: DocType;
  uploadedAt: string;
  /**
   * "stored":   saved, not yet searchable (uploaded before indexing existed);
   * "indexing": text is being extracted, chunked and embedded;
   * "indexed":  searchable: its chunks are in ChromaDB;
   * "failed":   could not be indexed (see `error`).
   */
  status: "stored" | "indexing" | "indexed" | "failed";
  pages?: number;
  chunks?: number;
  /** Chunks left out because NVIDIA's content safety screening refused them. */
  skippedChunks?: number;
  error?: string;
}

/** A piece of a curriculum PDF page, ready to be embedded. */
export interface Chunk {
  id: string; // `${documentId}:${chunkIndex}`
  text: string;
  metadata: ChunkMetadata;
}

/**
 * Saved with every chunk in ChromaDB. The search filters on `subjectKey` and
 * on one flag per level the document covers: a Form 1-4 syllabus's chunks
 * carry lv_form_1, lv_form_2, lv_form_3 and lv_form_4 (all true), so a
 * Form 3 search finds them. (ChromaDB cannot filter on "list contains", so
 * each level is its own true/false field.)
 */
export interface ChunkMetadata {
  documentId: string;
  documentName: string;
  docType: DocType;
  subject: string;
  /** For display: "Form 1, Form 2, Form 3". */
  levels: string;
  subjectKey: string;
  pageNumber: number;
  chunkIndex: number;
  /**
   * The syllabus topic and sub-topic this passage teaches ("2.1", "2.1.1"),
   * when the document says so in a heading such as "Sub-Topic 2.1.1:
   * Spreadsheets" (the CDC teaching modules do). Absent otherwise.
   */
  topicCode?: string;
  subTopicCode?: string;
  [levelFlag: `lv_${string}`]: boolean;
}

export interface RetrievedChunk extends Chunk {
  /** Cosine distance from ChromaDB: 0 = same meaning, larger = less related. */
  distance: number;
}

/** A reference shown under a generated document. Built from chunk metadata, never by the model. */
export interface Source {
  index: number;
  documentName: string;
  docType: DocType;
  pageNumber: number;
  excerpt: string;
}

/** A subject + class level that has indexed material, so teachers can pick it. */
export interface CatalogEntry {
  subject: string;
  level: string;
}

/**
 * A lesson plan's evaluation, written after the lesson: the teacher's
 * answers and the statement made from them (also written into the plan's
 * "Lesson Evaluation" section).
 */
export interface LessonEvaluation {
  answers: Record<string, unknown>;
  statement: string;
  evaluatedAt: string;
}

/** A document a teacher generated, kept in their eFile (storage/efile/<uid>.json). */
export interface EFileDocument {
  id: string;
  feature: Exclude<FeatureKey, "eFile">;
  title: string;
  inputs: Record<string, string>;
  content: string; // Markdown
  sources: Source[];
  model: string;
  createdAt: string;
  /** Lesson plans only, once the lesson has been taught and evaluated. */
  evaluation?: LessonEvaluation;
  /**
   * Lesson plans only: the remedial or continuation lesson written after this
   * one's evaluation (that plan's inputs carry followUpOf = this id).
   */
  followUp?: { id: string; kind: "remedial" | "continuation"; createdAt: string };
}

export interface UsageEvent {
  at: string;
  uid: string;
  feature: FeatureKey;
  action: "opened" | "generated";
}

/**
 * The sections of the Teacher's File (Ministry of Education), as Kalabo
 * Boarding Secondary keeps it: 1 Vision … 10 Assessment Records with its parts
 * i–viii. AI documents file themselves by kind; the other sections hold
 * entries the teacher writes (EFileEntry).
 * KEEP IN STEP with EFILE_SECTIONS in client/types/ai.ts.
 */
export const EFILE_SECTION_IDS = [
  "vision", "mission", "workPlan", "timetable", "classList", "syllabus", "lessonGrid",
  "schemesOfWork", "lessonPlans", "recordsOfWork", "assessmentRecords",
  "homework", "progressChart", "questionSamples", "markingKeys", "scriptSamples", "analysisSheet", "remedialPlan", "miscellaneous",
  "learnerNotes",
] as const;
/** Sections filled by AI documents (or made of parts): teachers' entries never go there. */
export const EFILE_AI_SECTIONS: readonly string[] = ["schemesOfWork", "lessonPlans", "recordsOfWork", "assessmentRecords", "markingKeys", "learnerNotes"]; // Question Samples also take the teacher's own papers
export type EFileSectionId = (typeof EFILE_SECTION_IDS)[number];

/** Something the teacher writes into a section of their file (a CPD record, an observation report…). */
export interface EFileEntry {
  id: string;
  section: EFileSectionId;
  title: string;
  /** Markdown, like the AI documents (tables allowed). */
  content: string;
  /** The date it refers to (YYYY-MM-DD), if any. */
  date?: string;
  /** Remedial work written from a lesson's evaluation: the lesson plan it belongs to. */
  lessonId?: string;
  createdAt: string;
  updatedAt: string;
}

/** The rest of the Teacher's File: the personal record and the teacher's own entries. */
export interface EFileMeta {
  /** The Teacher's Details (name, TS number, TCZ number, department, phone, term, year), field -> value. */
  profile: Record<string, string>;
  entries: EFileEntry[];
  /** Scanned pages kept as evidence: marked scripts and the teacher's own question papers. */
  scans: EFileScan[];
}

/**
 * A scanned paper in the file (photos taken with the phone camera, cleaned
 * in the browser). The pages are JPEGs in storage/efile/scans/<uid>/.
 *   scriptSamples   a learner's marked script for one assessment: the highest, average or lowest mark
 *   questionSamples the teacher's own question paper (not written with the AI)
 */
export interface EFileScan {
  id: string;
  section: "scriptSamples" | "questionSamples";
  /** The assessment in the eFile it belongs to (an AI assessment), if any. */
  assessmentId?: string;
  /** The assessment's name, e.g. "Form 3A Computer Studies Week 4 test". */
  title: string;
  slot?: "highest" | "average" | "lowest";
  learner?: string;
  mark?: number;
  outOf?: number;
  date?: string;
  pages: number;
  createdAt: string;
}
