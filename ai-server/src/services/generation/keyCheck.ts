/**
 * The marking-key check for Mathematics and Physics assessments.
 *
 * Once the paper is written, a second call asks the model to act as the
 * chief examiner. It solves every question again on its own, from the
 * question paper alone, and rewrites the Marking Key:
 *   - every calculation is shown as worked steps, one equation per line, each
 *     with its mark (M1 method, A1 accuracy, B1 independent), then "Answer:";
 *   - every answer that is wrong in the draft is corrected;
 *   - every construction, locus, graph, region, transformation or Venn diagram
 *     the learner must draw gets a figure of the complete correct answer.
 * The server then draws, measures and checks those figures as usual
 * (figures/process.ts), so a figure's numbers are confirmed after this step.
 *
 * If the check fails or returns something unusable, the first key is kept:
 * the teacher always gets a document.
 */
import type { Writer } from "../ai/NemotronProvider.js";
import { isAbortError, logError } from "../../utils/errors.js";
import { cleanDocument } from "./cleanup.js";
import { cbcKindOf, type Inputs } from "./prompts.js";
import { figureGuide } from "./figures.js";
import { WORKED_KEY_FORMAT, isWorkedSubject } from "./eczStyle.js";

export { isWorkedSubject };

export const needsKeyCheck = (feature: string, inputs: Inputs) =>
  feature === "assessment" && !cbcKindOf(inputs) && isWorkedSubject(inputs.subject ?? "") && process.env.KEY_CHECK !== "off";

const KEY_START = /^##\s+Marking Key\b[^\n]*$/im;

/** The paper, the key and whatever follows the key (the specification grid). */
export function splitKey(content: string): { paper: string; key: string; rest: string } | null {
  const start = content.search(KEY_START);
  if (start < 0) return null;
  const lineEnd = content.indexOf("\n", start);
  const body = lineEnd < 0 ? content.length : lineEnd + 1;
  const next = content.slice(body).search(/^##\s(?!#)/m);
  const end = next < 0 ? content.length : body + next;
  return { paper: content.slice(0, start).trimEnd(), key: content.slice(start, end).trim(), rest: content.slice(end).trim() };
}

const SYSTEM = (subject: string) => `You are the chief examiner of the Examinations Council of Zambia for ${subject}. You check a teacher's draft marking key before it is used.

RULES:
- Solve every question again yourself, carefully, using only the QUESTION PAPER (every figure in it is exact). Do not trust the draft key's numbers: recompute each one. Where the draft is wrong, write the correct answer.
- Keep the question numbers, parts and mark values of the paper. The marks for a part must add up to the marks the paper gives it.
- Do all your thinking silently. Your output is the finished marking key, written once: no notes, no doubts, no "Wait", "Let's", "Actually", no second version, no commentary.
- Copy any \`\`\`figure block from the draft key that is correct exactly as it is. Add a figure wherever the learner must draw, construct, plot, shade or sketch, if the draft has none.
- Output Markdown starting with the line "## Marking Key" and nothing after the key.

${WORKED_KEY_FORMAT}

${figureGuide(subject, "some")}`;

export async function checkMarkingKey(writer: Writer, content: string, inputs: Inputs, signal?: AbortSignal): Promise<{ content: string; changed: boolean }> {
  const parts = splitKey(content);
  if (!parts) return { content, changed: false };
  try {
    const answer = await writer.generate({
      system: SYSTEM(inputs.subject),
      user: `QUESTION PAPER (${inputs.subject}, ${inputs.className || inputs.level}, ${inputs.marks} marks):
"""
${parts.paper}
"""

DRAFT MARKING KEY (it may contain mistakes, missing working or missing figures):
"""
${parts.key}
"""

Write the corrected, complete Marking Key.`,
      signal,
      job: "keyCheck",
    });
    const cleaned = cleanDocument(answer).content;
    const at = cleaned.search(KEY_START);
    if (at < 0) return { content, changed: false };
    const key = cleaned.slice(at).replace(/\n##\s+(?!#)(?!Marking Key)[\s\S]*$/i, "").trim();
    // Unusable: much shorter than the draft, or fewer questions answered.
    const questions = (s: string) => (s.match(/^###\s/gm) ?? []).length;
    if (key.length < parts.key.length * 0.5 || questions(key) < questions(parts.key)) return { content, changed: false };
    return { content: [parts.paper, key, parts.rest].filter(Boolean).join("\n\n"), changed: true };
  } catch (err) {
    if (isAbortError(err)) throw err;
    logError("key-check", err);
    return { content, changed: false };
  }
}
