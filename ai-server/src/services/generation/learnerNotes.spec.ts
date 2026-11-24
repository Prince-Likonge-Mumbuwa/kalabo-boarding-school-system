// Learner notes: what the AI is given and asked for, for one sub-topic or a whole topic.
import { describe, expect, it } from "vitest";
import type { MapTopic } from "../curriculum/CurriculumMapService.js";
import { GENERATORS, buildUserMessage } from "./prompts.js";
import { buildSyllabusContext, type CurriculumSource } from "./syllabusContext.js";

const competence = (code: string, text: string) => ({ code, text, activities: [`Explore ${text}`], standards: [`Learners ${text} correctly`], page: 3 });
const topic: MapTopic = {
  code: "2.1", name: "Spreadsheets", form: 2,
  subTopics: [
    { code: "2.1.1", name: "Formulas", competences: [competence("2.1.1.1", "write formulas")] },
    { code: "2.1.2", name: "Charts", competences: [competence("2.1.2.1", "draw charts from data")] },
  ],
};
const map: CurriculumSource = { documentName: "Computer Studies Syllabus", topics: [topic, { code: "2.2", name: "Databases", form: 2, subTopics: [] }] };
const base = { subject: "Computer Studies", level: "Form 2", className: "Form 2A", topic: "Spreadsheets" };

describe("learner notes", () => {
  it("one sub-topic: only that sub-topic's competences", () => {
    const ctx = buildSyllabusContext("learnerNotes", { ...base, subTopic: "Formulas", subTopicCode: "2.1.1" }, map)!;
    expect(ctx.topics[0].subTopics.map((s) => s.code)).toEqual(["2.1.1"]);
    expect(ctx.block).toContain("Specific competence 2.1.1.1: write formulas");
    expect(ctx.block).not.toContain("2.1.2");
  });

  it("no sub-topic: the whole topic, every sub-topic", () => {
    const ctx = buildSyllabusContext("learnerNotes", base, map)!;
    expect(ctx.topicCodes).toEqual(["2.1"]);
    expect(ctx.topics[0].subTopics.map((s) => s.code)).toEqual(["2.1.1", "2.1.2"]);
    expect(ctx.block).toContain("Specific competence 2.1.2.1: draw charts from data");
    expect(ctx.block).not.toContain("Databases");
  });

  it("asks for notes written for learners, with the answers on a teacher page", () => {
    const user = buildUserMessage("learnerNotes", { ...base, subTopic: "Formulas" }, [], "OFFICIAL SYLLABUS …");
    for (const heading of ["## Learning Outcomes", "## Key Terms", "## Summary", "## Practice Exercise", "## Answers (Teacher's Copy)"])
      expect(user).toContain(heading);
    expect(user).toContain("LEARNERS");
    expect(user).toContain("FIGURES IN LEARNER NOTES");
    expect(GENERATORS.learnerNotes.title({ ...base, subTopic: "Formulas" })).toBe("Learner notes: Formulas (Spreadsheets)");
    expect(GENERATORS.learnerNotes.title(base)).toBe("Learner notes: Spreadsheets");
  });

  it("a whole topic gets one section per sub-topic", () => {
    const user = buildUserMessage("learnerNotes", base, [], "OFFICIAL SYLLABUS …");
    expect(user).toContain("one ## section per sub-topic");
    expect(user).toContain("Scope: the whole topic");
  });
});
