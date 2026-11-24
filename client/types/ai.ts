// @/types/ai.ts — data shapes shared with the AI server (mirror of
// ai-server/src/types.ts). Keep the two files in step.

export const FEATURE_KEYS = ['lessonPlan', 'schemeOfWork', 'assessment', 'recordOfWork', 'learnerNotes', 'eFile'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface AiSettings {
  features: Record<FeatureKey, { enabled: boolean }>;
  /** Most documents one teacher may generate per day. 0 = no limit. */
  dailyLimit: number;
  /** 'selected' = only teachers the superAdmin granted; 'all' = every teacher not revoked. */
  accessMode: 'selected' | 'all';
}

export type AccessState = 'pending' | 'granted' | 'revoked';

/** A subject + class level that has curriculum material the AI can use. */
export interface CatalogEntry {
  subject: string;
  level: string;
}

/** What a teacher gets back when they open AI Tools. */
export interface TeacherAiSession {
  features: AiSettings['features'];
  accessState: AccessState;
  hasAccess: boolean;
  catalog: CatalogEntry[];
  dailyLimit: number;
  /** null when there is no daily limit. */
  remainingToday: number | null;
  /** Subjects with an approved curriculum map or a teaching module, and the Forms covered (topic dropdowns). */
  maps?: { subject: string; forms: number[] }[];
}

// ── Curriculum maps (read from CDC syllabi, approved by the superAdmin) ─────

export interface MapCompetence {
  code: string; // 1.1.1.1
  text: string;
  activities: string[];
  standards: string[];
  page: number;
}

export interface MapSubTopic {
  code: string; // 1.1.1
  name: string;
  competences: MapCompetence[];
}

export interface MapTopic {
  code: string; // 1.1
  name: string;
  form: number;
  subTopics: MapSubTopic[];
}

export interface CurriculumMap {
  id: string;
  subject: string;
  documentId: string;
  documentName: string;
  status: 'draft' | 'approved';
  topics: MapTopic[];
  warnings: string[];
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
}

export interface CurriculumMapSummary {
  id: string;
  subject: string;
  documentId: string;
  documentName: string;
  status: CurriculumMap['status'];
  forms: number[];
  topics: number;
  subTopics: number;
  competences: number;
  warnings: number;
  updatedAt: string;
  approvedAt?: string;
}

/** A CDC teaching module's learning activities for one sub-topic (the lesson plan's activity checklist). */
export interface ModuleGuideSummary {
  documentName: string;
  /** The module's own sub-topic, e.g. "2.1.1 Spreadsheets" (its numbering can differ from the syllabus). */
  subTopic: string;
  activities: { number: number; title: string; page: number }[];
}

/**
 * What a teacher's form gets for one class: the topics of that Form, from an
 * approved syllabus map or, when there is none, from a CDC teaching module.
 */
export interface ClassCurriculum {
  subject: string;
  documentName: string;
  topics: MapTopic[];
  source?: 'syllabus' | 'module';
  /** Topic code -> term (1-3), when a teaching module says which term it is taught in. */
  terms?: Record<string, number>;
  /** Sub-topic code -> the teaching module's activities for it. */
  guides?: Record<string, ModuleGuideSummary>;
}

// ── Teaching modules (CDC "Teaching Module" PDFs, read on the AI server) ────

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

// ── Lesson evaluation (after the lesson) ────────────────────────────────────

export interface LessonEvaluationAnswers {
  achieved: 'fully' | 'mostly' | 'partly' | 'not';
  reached: 'all' | 'most' | 'half' | 'few';
  evidence: string;
  engaging: string[];
  engagingNote: string;
  coverage: 'all' | 'most' | 'part';
  notCovered: string;
  challenges: string[];
  challengesNote: string;
  support: string;
  nextSteps: string[];
  nextNote: string;
}

/**
 * What a lesson's evaluation calls for (the same rule as the AI server's followUp.ts):
 *   remedial      goal partly/not achieved, or only half/few learners met the standard: re-teach it differently
 *   continuation  goal met but part of the plan not covered: finish what was left
 *   revision      mostly achieved / most learners: a short recap at the start of the next lesson (no plan written)
 */
export type FollowUpKind = 'remedial' | 'continuation';
export type FollowUpAdvice = FollowUpKind | 'revision';

export function followUpFor(a: Pick<LessonEvaluationAnswers, 'achieved' | 'reached' | 'coverage'>): FollowUpAdvice | null {
  if (a.achieved === 'partly' || a.achieved === 'not' || a.reached === 'half' || a.reached === 'few') return 'remedial';
  if (a.coverage === 'most' || a.coverage === 'part') return 'continuation';
  if (a.achieved === 'mostly' || a.reached === 'most') return 'revision';
  return null;
}

export interface LessonEvaluation {
  answers: LessonEvaluationAnswers;
  statement: string;
  evaluatedAt: string;
}

/** "Form 3" / "Form 3A" -> 3 (the CDC syllabi number topics by Form). */
export function formOfLevel(level: string): number | null {
  const m = /^\s*form\s*(\d)/i.exec(level);
  return m ? Number(m[1]) : null;
}

export type GeneratorKey = Exclude<FeatureKey, 'eFile'>;

/** A reference shown under a generated document (built by the server, not the model). */
export interface Source {
  index: number;
  documentName: string;
  docType: DocType;
  pageNumber: number;
  excerpt: string;
}

/** A document in a teacher's eFile. */
export interface EFileDocument {
  id: string;
  feature: GeneratorKey;
  title: string;
  inputs: Record<string, string>;
  content: string; // Markdown
  sources: Source[];
  model: string;
  createdAt: string;
  /** Lesson plans only, once evaluated after the lesson. */
  evaluation?: LessonEvaluation;
  /** Lesson plans only: the remedial or continuation lesson written from the evaluation. */
  followUp?: { id: string; kind: FollowUpKind; createdAt: string };
}

/**
 * Short pieces of a lesson plan, sent with the eFile list (AI server
 * EFileService.lessonExtracts): they fill 10 Records of Work and 11 (i) Homework
 * without loading every plan.
 */
export interface LessonExtracts { goal?: string; homework?: string; remedial?: string }

export type EFileSummary = Omit<EFileDocument, 'content' | 'sources'> & { extracts?: LessonExtracts };

export interface AiTeacher {
  uid: string;
  email: string;
  name: string;
  access: AccessState;
  firstSeenAt: string;
  lastSeenAt: string;
}

// ── Finances (same shapes as the AI server's FinanceService) ────────────────

export type SchoolTerm = 'Term 1' | 'Term 2' | 'Term 3';
export interface Voided { at: string; reason: string }

/** A teacher's fee for one term (ZMW). "grant": recorded when access was granted. */
export interface FeePayment {
  id: string;
  teacherUid: string;
  teacherName: string;
  teacherEmail: string;
  term: SchoolTerm;
  year: number;
  amount: number;
  receivedOn: string;
  recordedAt: string;
  source: 'grant' | 'manual';
  reference?: string;
  note?: string;
  voided?: Voided;
}

/** Money paid to a service provider (ZMW). */
export interface ServicePayment {
  id: string;
  paidOn: string;
  provider: string;
  description: string;
  amount: number;
  reference?: string;
  recordedAt: string;
  voided?: Voided;
}

export interface FinanceView {
  termFee: number;
  payments: FeePayment[];
  expenses: ServicePayment[];
  summary: {
    currentTerm: { term: SchoolTerm; year: number };
    received: number;
    paidOut: number;
    balance: number;
    byTerm: { term: SchoolTerm; year: number; received: number; paidOut: number; teachers: number }[];
    unpaid: { uid: string; name: string; email: string }[];
  };
}

/** The class levels a curriculum document can cover, in teaching order (same list as the AI server). */
export const LEVELS = ['Form 1', 'Form 2', 'Form 3', 'Form 4', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'] as const;
export type Level = (typeof LEVELS)[number];

/** "Form 3A" -> "Form 3", "Grade 10 Blue" -> "Grade 10"; null if the class name has no level in it. */
export function levelOfClass(className: string): Level | null {
  const match = /\b(form|grade)\s*(\d{1,2})/i.exec(className);
  if (!match) return null;
  const level = `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${Number(match[2])}`;
  return (LEVELS as readonly string[]).includes(level) ? (level as Level) : null;
}

/** ["Form 1","Form 2","Form 3","Form 4"] -> "Form 1–4"; levels that are not a run are listed. */
export function describeLevels(levels: string[]): string {
  if (levels.length <= 1) return levels[0] ?? '';
  const series = levels[0].split(' ')[0];
  const numbers = levels.map((l) => Number(l.split(' ')[1]));
  const sameSeries = levels.every((l) => l.startsWith(`${series} `));
  const consecutive = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
  return sameSeries && consecutive ? `${series} ${numbers[0]}–${numbers[numbers.length - 1]}` : levels.join(', ');
}

export const DOC_TYPES = ['syllabus', 'textbook', 'teachers_guide', 'past_paper', 'template', 'other'] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  syllabus: 'Syllabus',
  textbook: 'Textbook',
  teachers_guide: "Teacher's guide / teaching module",
  past_paper: 'Past paper',
  template: 'Template (official format)',
  other: 'Other',
};

export interface CurriculumDocument {
  id: string;
  name: string;
  size: number;
  subject: string;
  /** Every class level the document covers, in teaching order. */
  levels: string[];
  docType: DocType;
  uploadedAt: string;
  /** 'stored' = saved, not searchable; 'indexing' = being read; 'indexed' = ready; 'failed' = see error. */
  status: 'stored' | 'indexing' | 'indexed' | 'failed';
  pages?: number;
  chunks?: number;
  error?: string;
}

export interface UsageSummary {
  total: number;
  last30Days: number;
  generated: number;
  generatedLast30Days: number;
  byFeature: Record<FeatureKey, number>;
  byTeacher: { uid: string; count: number; lastAt: string }[];
}

export interface SuperAdminOverview {
  settings: AiSettings;
  teachers: AiTeacher[];
  documents: CurriculumDocument[];
  maps?: CurriculumMapSummary[];
  modules?: TeachingModuleSummary[];
  /** Missing from AI servers older than the finances section. */
  finance?: FinanceView;
  usage: UsageSummary;
  system: {
    nvidiaConfigured: boolean;
    chatModel: string;
    embeddingModel: string;
    chroma: { ok: boolean; error?: string };
  };
}

// ── Diagram library (pictures teachers upload for tests) ─────────────────────

/** A letter placed on a library picture: x and y are fractions (0–1) of its width and height. */
export interface FigureLabel { letter: string; x: number; y: number; meaning?: string }

export interface LibraryFigure {
  id: string;
  ownerUid: string;
  ownerName: string;
  title: string;
  description: string;
  subject: string;
  level: string;
  topic: string;
  tags: string[];
  labels: FigureLabel[];
  width: number;
  height: number;
  shared: boolean;
  createdAt: string;
  updatedAt: string;
  /** Uploaded by the signed-in teacher (only they can change or delete it). */
  mine?: boolean;
}

export type FigureDetails = Pick<LibraryFigure, 'title' | 'description' | 'subject' | 'level' | 'topic' | 'tags' | 'labels' | 'shared'>;

/** What the vision model suggests for a picture (the teacher checks it). */
export interface PictureSuggestion {
  title: string;
  description: string;
  tags: string[];
  labels: { letter: string; meaning: string; x?: number; y?: number }[];
}

// ── The Teacher's File (eFile) ────────────────────────────────────────────
// The Ministry of Education's Teacher's File as Kalabo Boarding Secondary keeps
// it: a cover, the Teacher's Details, a table of contents, then sections 1–11;
// section 11 (Assessment Records) has the eight parts i–viii.

/** KEEP IN STEP with EFILE_SECTION_IDS in ai-server/src/types.ts. */
export type EFileSectionId =
  | 'vision' | 'mission' | 'workPlan' | 'timetable' | 'classList' | 'syllabus' | 'lessonGrid'
  | 'schemesOfWork' | 'lessonPlans' | 'recordsOfWork' | 'assessmentRecords'
  | 'homework' | 'progressChart' | 'questionSamples' | 'markingKeys' | 'scriptSamples' | 'analysisSheet' | 'remedialPlan' | 'miscellaneous'
  | 'learnerNotes';

/** What happened to the remedial work when an evaluation was saved (AI server, PUT /efile/:id/evaluation). */
export type RemedialWorkResult =
  | { status: 'written'; entryId: string; kind: FollowUpKind }
  | { status: 'removed' | 'none' }
  | { status: 'failed'; error: string };

/** Something the teacher writes into a section (the vision, a timetable, an analysis sheet…). */
export interface EFileEntry {
  id: string;
  section: EFileSectionId;
  title: string;
  content: string; // Markdown
  date?: string;   // YYYY-MM-DD
  /** Remedial work written by the AI from a lesson's evaluation: that lesson plan. */
  lessonId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EFileMeta {
  /** The Teacher's Details (name, TS number, TCZ number, department, phone, term, year). */
  profile: Record<string, string>;
  entries: EFileEntry[];
  /** Scanned papers: marked scripts and the teacher's own question papers. */
  scans: EFileScan[];
}

export type ScriptSlot = 'highest' | 'average' | 'lowest';
export const SCRIPT_SLOTS: { slot: ScriptSlot; label: string }[] = [
  { slot: 'highest', label: 'Highest mark' }, { slot: 'average', label: 'Average mark' }, { slot: 'lowest', label: 'Lowest mark' },
];

/** A scanned paper kept as evidence (pages are JPEGs on the AI server). */
export interface EFileScan {
  id: string;
  section: 'scriptSamples' | 'questionSamples';
  /** The AI assessment it belongs to, if any. */
  assessmentId?: string;
  title: string;
  slot?: ScriptSlot;
  learner?: string;
  mark?: number;
  outOf?: number;
  date?: string;
  pages: number;
  createdAt: string;
}

export interface EFileSectionInfo {
  id: EFileSectionId;
  /** "1" … "10" for sections, "i" … "viii" for the parts of Assessment Records. */
  ref: string;
  /** Printed reference: "Section 8", "11 (iii)". */
  label: string;
  title: string;
  description: string;
  /** A part of section 11. */
  sub?: boolean;
  /** Where its contents come from: AI documents of one kind, the teacher's own entries, or (section 11) its parts. */
  source: 'ai' | 'entries' | 'group';
  feature?: GeneratorKey;
  /** AI assessments print as Question Samples (the paper) and again as Marking Keys (the key only). */
  part?: 'questions' | 'key';
  /** For entry sections: what one entry is called, and the page it starts from. */
  entryName?: string;
  template?: string;
  /** Also filled from the school system (services/efileSystem.ts): what it brings in. */
  system?: string;
  /** Holds scanned papers (marked scripts, or the teacher's own question papers). */
  scans?: boolean;
  /** An AI section that also takes the teacher's own entries (their own question papers). */
  alsoEntries?: boolean;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const rows = (n: number, cells: number, numbered = false) => Array.from({ length: n }, (_, i) => `|${numbered ? ` ${i + 1} |` : ' |'}${' |'.repeat(numbered ? cells - 1 : cells - 1)}`).join('\n');

export const EFILE_SECTIONS: EFileSectionInfo[] = [
  {
    id: 'vision', ref: '1', label: 'Section 1', title: 'Vision', source: 'entries', entryName: 'vision',
    description: "The vision of the Ministry of Education and of the school, as displayed at the school.",
    system: 'The vision of the Ministry, the school and your department comes in from the school\u2019s settings (written by the administrator).',
    template: "## Vision of the Ministry of Education\n________________________________________________\n\n## Vision of Kalabo Boarding Secondary School\n________________________________________________\n\n## Vision of the Mathematics Department\n________________________________________________",
  },
  {
    id: 'mission', ref: '2', label: 'Section 2', title: 'Mission Statement', source: 'entries', entryName: 'mission statement',
    description: 'The mission statement of the Ministry, the school and the department.',
    system: 'The mission statements come in from the school\u2019s settings (written by the administrator).',
    template: "## Mission statement of the Ministry of Education\n________________________________________________\n\n## Mission statement of Kalabo Boarding Secondary School\n________________________________________________\n\n## Mission statement of the Mathematics Department\n________________________________________________",
  },
  {
    id: 'workPlan', ref: '3', label: 'Section 3', title: 'Individual Work Plan', source: 'entries', entryName: 'work plan',
    description: "The teacher's targets for the term or year in the Ministry format (key result areas, principal accountabilities, activities and targets), written by the AI from your timetable, the school calendar, your schemes of work and the official curriculum.",
    template: `## Individual Work Plan\n| Item | Detail |\n|---|---|\n| Name of teacher | |\n| TS number | |\n| Job title | Subject Teacher |\n| Department / section | |\n| Classes | |\n| Work plan period | |\n\n## Job Purpose\n- ________________________________________________\n\n## Work Plan\n| Key result area | Principal accountability (main duties) | Schedule of activities | Target |\n|---|---|---|---|\n| Planning | | | |\n| Teaching | | | |\n| Continuous assessment | | | |\n| Class management | | | |\n| Co-curricular activities | | | |\n| Professional development | | | |\n\n## Assumptions\n- ________________\n\n## Signatures\n| Role | Name | Signature | Date |\n|---|---|---|---|\n| Job holder | | | |\n| Supervisor (Head of Department) | | | |\n| Counter-signing officer (Head teacher) | | | |`,
  },
  {
    id: 'timetable', ref: '4', label: 'Section 4', title: 'Time Table', source: 'entries', entryName: 'timetable',
    description: 'The personal timetable (and the timetables of the classes taught).',
    system: 'Your timetable for this term comes in from the school timetable.',
    template: `## Personal timetable\n| Day | P1 | P2 | P3 | P4 | P5 | P6 | P7 | P8 |\n|---|---|---|---|---|---|---|---|---|\n${DAYS.map((d) => `| ${d} |${' |'.repeat(8)}`).join('\n')}\n\nPeriods P1–P8 run from 07:20 to 13:00, with break from 10:00 to 10:20.`,
  },
  {
    id: 'classList', ref: '5', label: 'Section 5', title: 'Class List / Register', source: 'entries', entryName: 'class list',
    description: 'The list of learners in each class taught, used as the subject register.',
    system: 'The class lists come in from the school register, and each subject register fills in as soon as you take attendance in that lesson.',
    template: `## Class list: ________\n| No. | Learner's name | Sex | Exam / ID number | Remarks |\n|---|---|---|---|---|\n${rows(10, 5, true)}`,
  },
  {
    id: 'syllabus', ref: '6', label: 'Section 6', title: 'Syllabus', source: 'entries', entryName: 'syllabus record',
    description: 'The syllabus for the classes taught this term: topics, sub-topics, specific competences and expected standards.',
    system: 'The syllabus of each class you teach comes in from the official curriculum loaded by the system administrator: topics, sub-topics, specific competences and expected standards.',
    template: '## Syllabus: ________\n| Topic | Sub-topic | Specific competences | Expected standards |\n|---|---|---|---|\n| | | | |',
  },
  {
    id: 'lessonGrid', ref: '7', label: 'Section 7', title: 'Lesson Grid', source: 'entries', entryName: 'lesson grid',
    description: 'The Lesson Grid (Syllabus Analysis Grid) of each class for the term: week by week, from topic and competence to learning strategies, assessment, environment, materials and references. The AI writes it from the official curriculum and your scheme of work.',
    template: `## Lesson Grid: ________\n| WK | TOPIC | SUB-TOPIC | CURRICULUM PHILOSOPHY AND GOALS | PRESCRIBED COMPETENCE | KEY CONCEPTS AND CONTENT | LEARNING STRATEGIES | ASSESSMENT | LEARNING ENVIRONMENT | MATERIAL DEVELOPMENT | TEACHER STATUS | REFERENCES |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n${[1, 2, 3].map((w) => `| ${w} |${' |'.repeat(11)}`).join('\n')}`,
  },
  { id: 'schemesOfWork', ref: '8', label: 'Section 8', title: 'Schemes of Work', source: 'ai', feature: 'schemeOfWork', description: 'What the teacher intends to teach: topics, competences and activities week by week, for each class and term.' },
  { id: 'lessonPlans', ref: '9', label: 'Section 9', title: 'Lesson Plan', source: 'ai', feature: 'lessonPlan', description: 'The plan for each lesson, with its evaluation written after the lesson.' },
  {
    id: 'recordsOfWork', ref: '10', label: 'Section 10', title: 'Records of Work', source: 'ai', feature: 'recordOfWork', description: 'What the teacher has actually taught: dates, topics and work covered.',
    system: 'Every lesson plan you have evaluated after teaching is recorded here, class by class: date, topic and sub-topic, the work covered, the homework and how the lesson went.',
  },
  { id: 'assessmentRecords', ref: '11', label: 'Section 11', title: 'Assessment Records', source: 'group', description: "Evidence of learners' performance: homework, progress, question papers, marking keys, scripts, analysis and remedial work." },
  {
    id: 'homework', ref: 'i', label: '11 (i)', sub: true, title: 'Homework', source: 'entries', entryName: 'homework record',
    description: 'Homework given, when it was marked and how learners did.',
    system: 'The homework set in each of your lesson plans comes in here; fill in when it was marked and how learners did.',
    template: `## Homework record\n| Date given | Class | Topic | Homework | Date marked | Learners who did it | Remarks |\n|---|---|---|---|---|---|---|\n${rows(5, 7)}`,
  },
  {
    id: 'progressChart', ref: 'ii', label: '11 (ii)', sub: true, title: 'Progress Chart', source: 'entries', entryName: 'progress chart',
    description: "Each learner's marks across the term's assessments.",
    system: 'The Week 4, Week 8 and End of Term marks come in from Results as soon as they are entered. Choose the year and term at the top to see earlier terms.',
    template: `## Progress chart: ________ (Term ___)\n| No. | Learner | Week 4 test | Week 8 test | End of term | SBA | Average | Remarks |\n|---|---|---|---|---|---|---|---|\n${rows(10, 8, true)}`,
  },
  { id: 'questionSamples', ref: 'iii', label: '11 (iii)', sub: true, title: 'Question Samples', source: 'ai', feature: 'assessment', part: 'questions', description: 'The tests and examinations set (question papers only): the assessments written with the AI, and your own papers, typed or scanned.', scans: true, alsoEntries: true, entryName: 'own question paper' },
  { id: 'markingKeys', ref: 'iv', label: '11 (iv)', sub: true, title: 'Marking Keys', source: 'ai', feature: 'assessment', part: 'key', description: 'The marking key (or rubric) and specification grid of each test.' },
  {
    id: 'scriptSamples', ref: 'v', label: '11 (v)', sub: true, title: 'Scripts Samples', source: 'entries', entryName: 'script sample record',
    description: "Marked scripts kept as evidence of each assessment: the highest, an average and the lowest mark, scanned with the phone camera.",
    scans: true,
    template: `## Script samples: ________\n| Test | Learner | Mark | Category (best / average / weakest) | Comment |\n|---|---|---|---|---|\n${rows(3, 5)}`,
  },
  {
    id: 'analysisSheet', ref: 'vi', label: '11 (vi)', sub: true, title: 'Analysis Sheet', source: 'entries', entryName: 'analysis sheet',
    description: "Analysis of results to show strengths and weaknesses: grade distribution, pass rate and how each question was answered.",
    system: 'The grade distribution, pass rate and mean are worked out from Results (grade 9 is the only fail). Add your question analysis as an entry.',
    template: `## Analysis sheet: ________ (Class ________)\n### Grade distribution\n| Grade | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | Total |\n|---|---|---|---|---|---|---|---|---|---|---|\n| Number of learners | | | | | | | | | | |\n\nLearners who sat: ____  Passed (grades 1–8): ____  Pass rate: ____%  Mean mark: ____\n\n### Question analysis\n| Question | Topic | Marks | Learners who scored full marks | % correct | Remarks |\n|---|---|---|---|---|---|\n${rows(5, 6)}\n\n### Strengths and weaknesses\n- Strong areas: ________\n- Weak areas: ________`,
  },
  {
    id: 'remedialPlan', ref: 'vii', label: '11 (vii)', sub: true, title: 'Remedial Work Plan', source: 'entries', entryName: 'remedial work plan',
    description: 'Remedial work for learners who struggled. When a lesson evaluation shows the lesson did not go well (the competence not achieved by enough learners, or the lesson not fully delivered), the AI writes that lesson\u2019s remedial work here.',
    system: 'Learners who failed (grade 9) come in from Results, and the lessons whose evaluation called for remedial or continuation work come in from your evaluations, each with the remedial work the AI wrote for it.',
    template: `## Remedial work plan\n| Date | Class | Learners | Topic / area of difficulty | Remedial activity | Outcome |\n|---|---|---|---|---|---|\n${rows(4, 6)}`,
  },
  {
    id: 'miscellaneous', ref: 'viii', label: '11 (viii)', sub: true, title: 'Miscellaneous', source: 'entries', entryName: 'record',
    description: 'Anything else for the file: circulars, CPD (TGM / SBCPD) records, lesson observation reports, notices.',
    template: '## ________\n| Item | Detail |\n|---|---|\n| Date | |\n| Subject | |\n| Details | |',
  },
  // Not one of the Ministry's sections: kept after them so the file's numbering stays as on the official form.
  { id: 'learnerNotes', ref: '12', label: 'Section 12', title: 'Learner Notes', source: 'ai', feature: 'learnerNotes', description: 'Class notes given to learners, by sub-topic or whole topic, with their practice exercises.' },
];

export const efileSection = (id: EFileSectionId) => EFILE_SECTIONS.find((s) => s.id === id)!;
/** Where an AI document is filed (assessments: Question Samples; they also print under Marking Keys). */
export const sectionOfFeature = (feature: GeneratorKey) => EFILE_SECTIONS.find((s) => s.feature === feature)!;
/** The sections an AI document appears in. */
export const sectionsOfFeature = (feature: GeneratorKey) => EFILE_SECTIONS.filter((s) => s.feature === feature);

/** The Teacher's Details, as on the school's form. */
export const PROFILE_FIELDS: { name: string; label: string; placeholder?: string; wide?: boolean }[] = [
  { name: 'fullName', label: "Teacher's name", wide: true },
  { name: 'tsNumber', label: 'TS number' },
  { name: 'tczNumber', label: 'TCZ number', placeholder: 'Teaching Council of Zambia registration' },
  { name: 'department', label: 'Department', placeholder: 'e.g. Mathematics' },
  { name: 'phone', label: 'Phone number' },
  { name: 'term', label: 'Term', placeholder: 'e.g. 3' },
  { name: 'year', label: 'Year', placeholder: 'e.g. 2026' },
];
