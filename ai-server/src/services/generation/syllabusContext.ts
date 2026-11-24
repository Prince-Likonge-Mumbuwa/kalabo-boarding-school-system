/**
 * Turns the approved curriculum map into the "OFFICIAL SYLLABUS" block of a
 * prompt, and the assessment's section plan into exact instructions.
 *
 * Why: the excerpts found by search are good for content, but the topic,
 * sub-topic, specific competences, learning activities and expected standards
 * must be the syllabus's own words, every time. The map holds exactly those,
 * so they are copied into the prompt instead of hoping the search finds them.
 */
import type { MapSubTopic, MapTopic } from "../curriculum/CurriculumMapService.js";
import { AppError } from "../../utils/errors.js";
import type { GeneratorKey, Inputs } from "./prompts.js";

export interface SyllabusContext {
  /** The block placed in the prompt. */
  block: string;
  /** Extra words for the curriculum search, so it finds passages about these competences. */
  searchHint: string;
  /** The syllabus topics involved ("2.1"): passages tagged with them are searched first. */
  topicCodes: string[];
  /** The topics the document is about (for matching teaching-module guides). */
  topics: MapTopic[];
  /** The scheme of work's topics were picked by term from the teaching module. */
  termPicked?: number;
}

/** What the prompt is built from: an approved syllabus map, or a teaching module standing in for one. */
export interface CurriculumSource {
  documentName: string;
  topics: MapTopic[];
  source?: "syllabus" | "module";
  /** Topic code -> term (1-3), when a teaching module says. */
  terms?: Record<string, number>;
}

/** "Term 2 2026", "Term 2, 2026" -> 2. */
export function termNumber(term: string | undefined): number | null {
  const m = /term\s*(\d)/i.exec(term ?? "");
  return m ? Number(m[1]) : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Codes the form sent ("1.1, 1.3") or, failing that, topics matched by name. */
function pickTopics(topics: MapTopic[], inputs: Inputs): MapTopic[] {
  const codes = (inputs.topicCodes ?? "").split(/[,;\s]+/).filter(Boolean);
  if (codes.length) return topics.filter((t) => codes.includes(t.code));
  const named = (inputs.topics ?? "").split(/[;,\n]+/).map(norm).filter(Boolean);
  if (named.length) return topics.filter((t) => named.some((n) => norm(t.name) === n || n.endsWith(norm(t.name))));
  return [];
}

function findSubTopic(topics: MapTopic[], inputs: Inputs): { topic: MapTopic; sub: MapSubTopic } | null {
  for (const topic of topics)
    for (const sub of topic.subTopics) {
      if (inputs.subTopicCode && sub.code === inputs.subTopicCode) return { topic, sub };
      if (!inputs.subTopicCode && norm(sub.name) === norm(inputs.subTopic ?? "") && (!inputs.topic || norm(topic.name) === norm(inputs.topic)))
        return { topic, sub };
    }
  return null;
}

const bullets = (items: string[], indent = "    ") => items.map((a) => `${indent}- ${a}`).join("\n");

function describeSubTopic(sub: MapSubTopic, detail: "full" | "standards" | "outline"): string {
  const lines = [`  ${sub.code} ${sub.name}`];
  for (const c of sub.competences) {
    lines.push(`   Specific competence ${c.code}: ${c.text}`);
    if (detail === "full" && c.activities.length) lines.push("   Learning activities:", bullets(c.activities));
    if (detail !== "outline" && c.standards.length) lines.push("   Expected standard(s):", bullets(c.standards));
  }
  return lines.join("\n");
}

function describeTopics(topics: MapTopic[], detail: "full" | "standards" | "outline"): string {
  return topics.map((t) => [`TOPIC ${t.code} ${t.name}`, ...t.subTopics.map((s) => describeSubTopic(s, detail))].join("\n")).join("\n\n");
}

const header = (map: CurriculumSource) =>
  map.source === "module"
    ? `OFFICIAL SYLLABUS (topics, sub-topics, specific competences and expected standards as numbered in the Ministry's teaching module "${map.documentName}"; copy names, codes and competences exactly):`
    : `OFFICIAL SYLLABUS (approved curriculum map, from "${map.documentName}"; copy names, codes and competences exactly):`;

export function buildSyllabusContext(
  feature: GeneratorKey,
  inputs: Inputs,
  map: CurriculumSource | null,
): SyllabusContext | null {
  if (!map || map.topics.length === 0) return null;

  if (feature === "lessonPlan") {
    const found = findSubTopic(map.topics, inputs);
    if (!found) return null;
    return {
      block: `${header(map)}\nTOPIC ${found.topic.code} ${found.topic.name}\n${describeSubTopic(found.sub, "full")}`,
      searchHint: found.sub.competences.map((c) => c.text).join(". "),
      topicCodes: [found.topic.code],
      topics: [{ ...found.topic, subTopics: [found.sub] }],
    };
  }

  // Learner notes: one sub-topic (a section), or with no sub-topic chosen the whole topic (a chapter).
  if (feature === "learnerNotes") {
    if (inputs.subTopic || inputs.subTopicCode) {
      const found = findSubTopic(map.topics, inputs);
      if (!found) return null;
      return {
        block: `${header(map)}\nTOPIC ${found.topic.code} ${found.topic.name}\n${describeSubTopic(found.sub, "full")}`,
        searchHint: found.sub.competences.map((c) => c.text).join(". "),
        topicCodes: [found.topic.code],
        topics: [{ ...found.topic, subTopics: [found.sub] }],
      };
    }
    const topic = map.topics.find((t) => t.code === inputs.topic || (inputs.topic && norm(t.name) === norm(inputs.topic)));
    if (!topic) return null;
    return {
      block: `${header(map)}\n${describeTopics([topic], "full")}`,
      searchHint: topic.subTopics.map((s) => s.name).join(", "),
      topicCodes: [topic.code],
      topics: [topic],
    };
  }

  if (feature === "assessment") {
    const chosen = pickTopics(map.topics, inputs);
    if (chosen.length === 0) return null;
    return {
      block: `${header(map)}\n${describeTopics(chosen, "full")}`,
      searchHint: chosen.map((t) => t.subTopics.map((s) => s.name).join(", ")).join("; "),
      topicCodes: chosen.map((t) => t.code),
      topics: chosen,
    };
  }

  if (feature === "schemeOfWork") {
    const chosen = pickTopics(map.topics, inputs);
    // Nothing ticked: the term's own topics, when the teaching module says which term each is taught in.
    const term = termNumber(inputs.term);
    const ofTerm = !chosen.length && term && map.terms ? map.topics.filter((t) => map.terms![t.code] === term) : [];
    const topics = chosen.length ? chosen : ofTerm.length ? ofTerm : map.topics;
    return {
      block: `${header(map)}\n${describeTopics(topics, "standards")}`,
      searchHint: topics.map((t) => t.name).join(", "),
      topicCodes: (chosen.length ? chosen : ofTerm).map((t) => t.code),
      topics,
      termPicked: ofTerm.length ? term! : undefined,
    };
  }

  // Record of work: an outline is enough to match what was taught to the syllabus.
  return { block: `${header(map)}\n${describeTopics(map.topics, "outline")}`, searchHint: "", topicCodes: [], topics: [] };
}

// ── Assessment sections ─────────────────────────────────────────────────────

export const QUESTION_TYPES = {
  mcq: "Multiple choice (four options A–D, one correct answer)",
  short: "Short answer (one word to a few sentences)",
  structured: "Structured questions (a stem followed by parts (a), (b), (c) of increasing difficulty)",
  essay: "Essay / extended answer (a developed written answer)",
  working: "Show your working (calculations or step-by-step problem solving; marks for method and for the answer)",
  practical: "Practical task (done at the computer or with apparatus; marked against a checklist)",
} as const;
export type QuestionType = keyof typeof QUESTION_TYPES;

export interface SectionPlan {
  type: QuestionType;
  questions: number;
  marks: number; // the section's total
}

/** Reads and checks the section plan the form sends as JSON text. */
export function parseSections(inputs: Inputs): SectionPlan[] | null {
  if (!inputs.sections) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(inputs.sections);
  } catch {
    throw new AppError(400, "The assessment sections could not be read. Set them up again.", "bad_sections");
  }
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 6)
    throw new AppError(400, "An assessment needs between one and six sections.", "bad_sections");
  const sections = raw.map((s): SectionPlan => {
    const type = (s as SectionPlan)?.type;
    const questions = Number((s as SectionPlan)?.questions);
    const marks = Number((s as SectionPlan)?.marks);
    if (!(type in QUESTION_TYPES) || !Number.isInteger(questions) || questions < 1 || questions > 60 || !Number.isInteger(marks) || marks < 1 || marks > 200)
      throw new AppError(400, "Every section needs a question type, 1–60 questions and 1–200 marks.", "bad_sections");
    if (type === "mcq" && marks < questions)
      throw new AppError(400, "A multiple-choice section needs at least one mark per question.", "bad_sections");
    return { type, questions, marks };
  });
  const total = sections.reduce((n, s) => n + s.marks, 0);
  if (inputs.marks && Number(inputs.marks) !== total)
    throw new AppError(400, `The sections add up to ${total} marks, not ${inputs.marks}.`, "bad_sections");
  return sections;
}

/** The "Section A … Section B …" part of the assessment layout. */
export function describeSections(sections: SectionPlan[]): string {
  return sections
    .map((s, i) => {
      const letter = String.fromCharCode(65 + i);
      const each = s.type === "mcq" && s.marks % s.questions === 0 ? `, ${s.marks / s.questions} mark(s) each` : "";
      return `## Section ${letter}: ${QUESTION_TYPES[s.type].split(" (")[0]}
Exactly ${s.questions} question(s), ${s.marks} marks in total${each}. Type: ${QUESTION_TYPES[s.type]}.`;
    })
    .join("\n\n");
}
