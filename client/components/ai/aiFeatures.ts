// @/components/ai/aiFeatures.ts — the list of AI tools: name, address, icon,
// colour and the boxes each tool's form shows (after Class and Subject,
// which every generator has).
//
// The box names must match `fields` in ai-server/src/services/generation/prompts.ts.
import { BookOpenCheck, CalendarDays, ClipboardList, FileQuestion, FolderOpen, NotebookPen, type LucideIcon } from 'lucide-react';
import type { FeatureKey } from '@/types/ai';

export interface AiField {
  name: string;
  label: string;
  placeholder?: string;
  hint?: string;
  /**
   * text / number / textarea: typed; select: one of `options`;
   * term: a school term, pre-set to the current one; date: a calendar date.
   * From the approved syllabus (see CurriculumFields.tsx); typed instead when
   * the class has no approved syllabus map yet:
   *   topic + subTopic: dropdowns; topics: a checklist; sections: the assessment's sections.
   * From the CDC teaching module (shown only when the module has them):
   *   activities: the sub-topic's learning activities to tick for this lesson.
   * lessonOf: "Lesson [n] of [N]" (writes lessonNumber and lessonsTotal).
   * criteria: how many rubric criteria a CBC assessment has (shown only for CBC types).
   * lessonImport: the class's lesson plans from the eFile, written into the `taught` box.
   * figures: pictures from the teacher's diagram library to use in an assessment (writes figureIds).
   */
  kind?: 'text' | 'number' | 'textarea' | 'select' | 'term' | 'date' | 'topic' | 'subTopic' | 'topics' | 'sections' | 'activities' | 'lessonOf' | 'criteria' | 'lessonImport' | 'figures';
  options?: { value: string; label: string }[];
  /** Pre-filled value (the teacher can change it). */
  defaultValue?: string;
  /** Takes the full width of the form. */
  wide?: boolean;
  /** May be left empty (hidden when there is nothing to choose from). */
  optional?: boolean;
}

/** Colour classes per tool. Written out in full so Tailwind keeps them. */
export interface Tone {
  icon: string; // icon tile
  soft: string; // light background
  text: string; // coloured text
  dot: string; // small solid marker
}

export interface AiFeatureInfo {
  key: FeatureKey;
  /** The last part of the page address: /dashboard/teacher/ai/<slug> */
  slug: string;
  label: string;
  /** What the eFile calls a group of these documents. */
  shelf: string;
  description: string;
  /** What the teacher gets, shown on the tool card. */
  outputs: string[];
  icon: LucideIcon;
  tone: Tone;
  fields: AiField[];
}

const tones = {
  blue: { icon: 'bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100', soft: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  indigo: { icon: 'bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-100', soft: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  amber: { icon: 'bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100', soft: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  emerald: { icon: 'bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100', soft: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  slate: { icon: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200', soft: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-500' },
  rose: { icon: 'bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-100', soft: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
} satisfies Record<string, Tone>;

// One period at Kalabo Boarding is 40 minutes.
const DURATIONS = [
  { value: '40', label: '40 minutes (1 period)' },
  { value: '80', label: '80 minutes (2 periods)' },
  { value: '120', label: '120 minutes (3 periods)' },
];

/** The CBC assessment types (a scenario, tasks and a 4-level rubric), as in the CDC teaching modules. Same names as CBC_KINDS on the AI server. */
export const CBC_KINDS = ['Formative Assessment (CBC scenario + rubric)', 'Summative Assessment (CBC project + rubric)'];
export const isCbcKind = (kind: string | undefined) => CBC_KINDS.includes(kind ?? '');

export const AI_FEATURES: AiFeatureInfo[] = [
  {
    key: 'lessonPlan', slug: 'lesson-plan', label: 'Lesson Plan', shelf: 'Lesson plans', icon: BookOpenCheck, tone: tones.blue,
    description: 'One lesson in the Ministry’s CBC lesson plan format, built on the teaching module’s activities.',
    outputs: ['Goal, rationale & environment', 'Lesson progression table', 'Evaluation after the lesson'],
    fields: [
      { name: 'topic', label: 'Topic', kind: 'topic', placeholder: 'e.g. Spreadsheets' },
      { name: 'subTopic', label: 'Sub-topic', kind: 'subTopic', placeholder: 'e.g. Formulas' },
      { name: 'activities', label: 'Module activities for this lesson', kind: 'activities', optional: true, wide: true },
      { name: 'lessonNumber', label: 'Lesson in this sub-topic', kind: 'lessonOf', optional: true, defaultValue: '1', hint: 'Printed in the rationale, e.g. “Lesson 1 of 5”.' },
      { name: 'duration', label: 'Lesson length', kind: 'select', options: DURATIONS, defaultValue: '40' },
      { name: 'date', label: 'Date', kind: 'date', optional: true },
      { name: 'time', label: 'Time', kind: 'text', optional: true, placeholder: 'e.g. 08:20 – 09:40' },
    ],
  },
  {
    key: 'schemeOfWork', slug: 'scheme-of-work', label: 'Scheme of Work', shelf: 'Schemes of work', icon: CalendarDays, tone: tones.indigo,
    description: 'A full term laid out week by week, with the teaching module’s activities.',
    outputs: ['Competences & activities by week', 'Methods and materials', 'Landscape, test weeks marked'],
    fields: [
      { name: 'term', label: 'Term', kind: 'term' },
      { name: 'weeks', label: 'Teaching weeks', kind: 'number', defaultValue: '13', hint: 'Including test weeks.' },
      { name: 'topics', label: 'Topics this term', kind: 'topics', optional: true, hint: 'Leave all unticked to use the term’s topics from the teaching module (or the syllabus from its first topic).' },
    ],
  },
  {
    key: 'assessment', slug: 'assessment', label: 'Assessment', shelf: 'Assessments', icon: FileQuestion, tone: tones.amber,
    description: 'A test paper with marking key and specification grid, or a CBC scenario task with a rubric.',
    outputs: ['Questions tied to competences', 'Marking key or rubric', 'Specification grid'],
    fields: [
      { name: 'topics', label: 'Topics covered', kind: 'topics', placeholder: 'e.g. Spreadsheets, Databases', wide: true },
      {
        name: 'kind', label: 'Type', kind: 'select', defaultValue: 'Week 4 Test',
        options: [
          ...['Week 4 Test', 'Week 8 Test', 'End of Term Examination', 'Topic Test', 'Class Exercise', 'Homework'].map((v) => ({ value: v, label: v })),
          { value: CBC_KINDS[0], label: 'Formative task (CBC scenario + rubric)' },
          { value: CBC_KINDS[1], label: 'Summative project (CBC + rubric)' },
        ],
      },
      { name: 'criteria', label: 'Rubric criteria', kind: 'criteria', defaultValue: '5', hint: 'Each scored 4 Exceeding, 3 Meeting, 2 Approaching, 1 Beginning.' },
      { name: 'sections', label: 'Sections', kind: 'sections', wide: true },
      {
        name: 'diagrams', label: 'Diagrams', kind: 'select', defaultValue: 'some',
        options: [
          { value: 'none', label: 'No diagrams' },
          { value: 'some', label: 'Some questions with diagrams' },
          { value: 'many', label: 'Mostly diagram-based questions' },
        ],
        hint: 'Maps, graphs, charts, timelines, structures and flowcharts, drawn accurately by the app.',
      },
      { name: 'figureIds', label: 'Pictures from your diagram library', kind: 'figures', optional: true, wide: true },
    ],
  },
  {
    key: 'recordOfWork', slug: 'record-of-work', label: 'Record of Work', shelf: 'Records of work', icon: ClipboardList, tone: tones.emerald,
    description: 'Your week’s lessons, imported from your lesson plans and matched to the syllabus competences.',
    outputs: ['One row per lesson', 'Competences covered', 'Assessment given'],
    fields: [
      { name: 'term', label: 'Term', kind: 'term' },
      { name: 'weekEnding', label: 'Week ending', kind: 'date' },
      { name: 'lessonImport', label: 'Lessons from your eFile', kind: 'lessonImport', optional: true, wide: true },
      {
        name: 'taught', label: 'What you taught this week', kind: 'textarea', wide: true,
        placeholder: 'Filled in from your lesson plans for this week, or type one lesson per line, e.g.\nMon 18 Jan: SUM and AVERAGE, class exercise',
        hint: 'The AI only formats what is here; it never invents lessons. Add anything the plans do not show (e.g. a lesson missed).',
      },
    ],
  },
  {
    key: 'learnerNotes', slug: 'learner-notes', label: 'Learner Notes', shelf: 'Learner notes', icon: NotebookPen, tone: tones.rose,
    description: 'Class notes for learners on one sub-topic or a whole topic, from the syllabus and teaching module.',
    outputs: ['Explanations, examples & diagrams', 'Key terms and summary', 'Practice exercise, answers on a separate page'],
    fields: [
      { name: 'topic', label: 'Topic', kind: 'topic', placeholder: 'e.g. Spreadsheets' },
      { name: 'subTopic', label: 'Sub-topic', kind: 'subTopic', optional: true, placeholder: 'Leave empty for the whole topic', hint: 'Leave empty for notes on the whole topic (a chapter).' },
    ],
  },
  {
    key: 'eFile', slug: 'efile', label: 'eFile', shelf: '', icon: FolderOpen, tone: tones.slate,
    description: 'Your Teacher’s File: every document you generate, in one place.',
    outputs: ['Search and filter', 'Print or download', 'Always available'],
    fields: [],
  },
];

export const GENERATORS = AI_FEATURES.filter((f) => f.key !== 'eFile');
export const featureBySlug = (slug: string | undefined) => AI_FEATURES.find((f) => f.slug === slug);
export const featureByKey = (key: FeatureKey) => AI_FEATURES.find((f) => f.key === key)!;
