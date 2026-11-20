/**
 * Turns teaching-module guides (TeachingModuleService) into the "TEACHING
 * MODULE" block of a prompt.
 *
 * The OFFICIAL SYLLABUS block says what must be achieved (competences and
 * standards, word for word). This block says how the Ministry wants it
 * taught and assessed: the learning activities with their environment,
 * materials, methods, "How to Conduct" steps and content tips; the topic's
 * hook, key terms and general competences; and the module's own CBC
 * assessment examples with their 4-level rubrics.
 *
 * Each tool gets the part it needs, so prompts stay a sensible size:
 *   lesson plan    the chosen activities in full, the others by title
 *   assessment     activities as learning objectives, key terms, the
 *                  module's assessment examples and rubrics (style only)
 *   scheme of work every activity by title, with methods and materials
 */
import type { ModuleActivity, ModuleAssessment, ModuleGuide } from "../curriculum/TeachingModuleService.js";

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, "")} …` : text);
const list = (items: string[], indent = "  ") => items.map((i) => `${indent}- ${i}`).join("\n");
/** "Demonstration Method: Showing how ..." -> "Demonstration Method". */
const label = (item: string) => item.split(":")[0].trim();
const pages = (g: ModuleGuide) => (g.sub.pages[0] === g.sub.pages[1] ? `p. ${g.sub.pages[0]}` : `pp. ${g.sub.pages[0]}–${g.sub.pages[1]}`);

/** The reference line the lesson plan and scheme should print for this module. */
export function moduleReference(g: ModuleGuide): string {
  return `${g.title || g.documentName}, Curriculum Development Centre, Ministry of Education, Zambia${g.year ? `, ${g.year}` : ""}. Topic ${g.topic.code}: ${g.topic.name}, Sub-Topic ${g.sub.code}: ${g.sub.name}, ${pages(g)}.`;
}

function header(g: ModuleGuide): string {
  const numbering = g.sameNumbering
    ? ""
    : "\n(The module numbers topics differently from this class's syllabus: always use the OFFICIAL SYLLABUS codes in the document; use the module for content and method only.)";
  return `TEACHING MODULE: "${g.title || g.documentName}" (Ministry of Education, Curriculum Development Centre${g.year ? `, ${g.year}` : ""}). The approved guide on how to teach and assess this sub-topic; follow its activities and methods.${numbering}
Module reference to print: ${moduleReference(g)}`;
}

function activityInFull(a: ModuleActivity): string {
  const env = a.environment;
  const parts = [
    `ACTIVITY ${a.number}: ${a.title} (module p. ${a.page})`,
    a.background && `  Background: ${cut(a.background, 700)}`,
    env.natural.length && `  Natural environment:\n${list(env.natural, "    ")}`,
    env.artificial.length && `  Artificial (physical) environment:\n${list(env.artificial, "    ")}`,
    env.technological.length && `  Technological environment:\n${list(env.technological, "    ")}`,
    a.materials.length && `  Teaching and learning materials:\n${list(a.materials, "    ")}`,
    a.methods.length && `  Suggested teaching methods:\n${list(a.methods, "    ")}`,
    a.howToConduct && `  How to conduct: ${a.howToConduct.replace(/\n/g, " ")}`,
    a.learningPoints.length && `  Suggested learning points:\n${list(a.learningPoints, "    ")}`,
    a.contentTip && `  Content tip (subject knowledge for the teacher): ${a.contentTip.replace(/\n/g, " ")}`,
    a.notes && `  Teaching notes: ${cut(a.notes.replace(/\n/g, " "), 900)}`,
  ];
  return parts.filter(Boolean).join("\n");
}

function topicFrame(g: ModuleGuide, withOverview: boolean): string {
  const t = g.topic;
  return [
    `TOPIC ${t.code}: ${t.name}${t.term ? ` (taught in Term ${t.term})` : ""}`,
    withOverview && t.overview && `Overview: ${cut(t.overview, 600)}`,
    t.generalCompetences.length && `General competences of this topic (choose from these):\n${list(t.generalCompetences.map((c) => (c.description ? `${c.name}: ${c.description}` : c.name)))}`,
    t.hook && `Hook (opening question): ${t.hook}`,
    t.keyTerms.length && `Key terms:\n${list(t.keyTerms.map((k) => `${k.term}: ${cut(k.meaning, 220)}`))}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function subFrame(g: ModuleGuide): string {
  const s = g.sub;
  return [
    `SUB-TOPIC ${s.code}: ${s.name}`,
    s.introduction && `Introduction: ${cut(s.introduction, 900)}`,
    s.competences.length && `Specific competence(s): ${s.competences.map((c) => `${c.code} ${c.text}`).join("; ")}`,
    s.expectedStandards.length && `Expected standard: ${s.expectedStandards.join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function assessmentExample(kind: string, a: ModuleAssessment | null): string {
  if (!a || (!a.scenario && !a.tasks.length)) return "";
  const rubric = a.rubric.length
    ? `\n  Rubric criteria and what each level looks like:\n${a.rubric
        .map((r) => `    - ${r.criterion}: Exceeding (4) ${cut(r.levels[0], 160)} | Meeting (3) ${cut(r.levels[1], 160)} | Approaching (2) ${cut(r.levels[2], 160)} | Beginning (1) ${cut(r.levels[3], 160)}`)
        .join("\n")}`
    : "";
  return `${kind} EXAMPLE FROM THE MODULE (for style and level only: never copy it):
  Scenario: ${cut(a.scenario, 600)}
  Tasks:\n${list(a.tasks.map((t) => cut(t, 400)), "    ")}${rubric}`;
}

/**
 * Which activities a lesson covers: the ones the teacher ticked, else the
 * one whose number is the lesson number (lesson 3 -> activity 3), else the first.
 */
export function chosenActivities(g: ModuleGuide, picked: string | undefined, lessonNumber: string | undefined): ModuleActivity[] {
  const numbers = (picked ?? "").split(/[,;\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const byNumber = g.sub.activities.filter((a) => numbers.includes(a.number));
  if (byNumber.length) return byNumber;
  const n = Number(lessonNumber);
  const same = g.sub.activities.find((a) => a.number === n);
  return same ? [same] : g.sub.activities.slice(0, 1);
}

export function lessonModuleBlock(g: ModuleGuide, activities: ModuleActivity[]): string {
  const others = g.sub.activities.filter((a) => !activities.includes(a));
  return [
    header(g),
    topicFrame(g, true),
    subFrame(g),
    `ACTIVITIES FOR THIS LESSON (build the lesson progression from these):\n\n${activities.map(activityInFull).join("\n\n")}`,
    others.length && `Other activities of this sub-topic (taught in other lessons; do not plan them here): ${others.map((a) => `${a.number}. ${a.title}`).join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function assessmentModuleBlock(guides: ModuleGuide[], cbc: "formative" | "summative" | null): string {
  if (!guides.length) return "";
  const parts = guides.map((g) => {
    const objectives = g.sub.activities.map((a) => {
      const focus = a.contentTip ? ` (key idea: ${cut(a.contentTip.replace(/\n/g, " "), 260)})` : "";
      return `${g.sub.code}/A${a.number} ${a.title}${focus}`;
    });
    const examples =
      cbc === "summative" ? assessmentExample("SUMMATIVE", g.sub.summative)
        : cbc === "formative" ? assessmentExample("FORMATIVE", g.sub.formative)
        : [assessmentExample("FORMATIVE", g.sub.formative), assessmentExample("SUMMATIVE", g.sub.summative)].filter(Boolean).join("\n");
    return [
      `TOPIC ${g.topic.code}: ${g.topic.name} / SUB-TOPIC ${g.sub.code}: ${g.sub.name} (module ${pages(g)})`,
      g.sub.competences.length && `Specific competence(s): ${g.sub.competences.map((c) => `${c.code} ${c.text}`).join("; ")}`,
      g.sub.expectedStandards.length && `Expected standard: ${g.sub.expectedStandards.join("; ")}`,
      `Learning objectives (the module's learning activities; every question must test one of these):\n${list(objectives)}`,
      g.topic.keyTerms.length && `Key terms: ${g.topic.keyTerms.map((k) => k.term).join(", ")}`,
      examples,
    ]
      .filter(Boolean)
      .join("\n");
  });
  const numbering = guides.some((g) => !g.sameNumbering)
    ? "\n(The module numbers topics differently from this class's syllabus: in the paper use the OFFICIAL SYLLABUS codes; the module labels like 2.1.1/A3 are only for the specification grid's activity column.)"
    : "";
  return `TEACHING MODULE: what learners were taught, activity by activity, and how the Ministry assesses it.${numbering}\n\n${parts.join("\n\n")}`;
}

export function schemeModuleBlock(guides: ModuleGuide[]): string {
  if (!guides.length) return "";
  const parts = guides.map((g) => {
    const methods = [...new Set(g.sub.activities.flatMap((a) => a.methods.map(label)))].slice(0, 8);
    const materials = [...new Set(g.sub.activities.flatMap((a) => a.materials.map((m) => cut(m, 70))))].slice(0, 8);
    return [
      `TOPIC ${g.topic.code}: ${g.topic.name}${g.topic.term ? ` (Term ${g.topic.term})` : ""} / SUB-TOPIC ${g.sub.code}: ${g.sub.name}`,
      `Reference: ${moduleReference(g)}`,
      `Learning activities, in teaching order (with module page):\n${list(g.sub.activities.map((a) => `Activity ${a.number}: ${a.title} (p. ${a.page})`))}`,
      g.sub.expectedStandards.length && `Expected standard: ${g.sub.expectedStandards.join("; ")}`,
      methods.length && `Teaching methods used: ${methods.join(", ")}`,
      materials.length && `Main materials: ${materials.join("; ")}`,
    ]
      .filter(Boolean)
      .join("\n");
  });
  return `TEACHING MODULE: the Ministry's activities for each sub-topic; plan the weeks around them.\n\n${parts.join("\n\n")}`;
}
