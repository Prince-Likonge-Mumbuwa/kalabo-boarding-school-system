/**
 * Subjects that share curriculum material. A teacher of any subject in a
 * group can use documents labelled with any other subject in the same group:
 * an ICT lesson plan may draw on a "Computer Studies" syllabus and a
 * "Computer Science" textbook.
 *
 * Add a group here (one line, names as the school writes them) and restart
 * the AI server. No re-indexing is needed: groups are applied when searching.
 */
import { labelKey } from "./DocumentChunker.js";

export const SUBJECT_GROUPS: string[][] = [
  ["ICT", "Computer Studies", "Computer Science"],
];

/** Every subject key that counts as `subject` (itself plus its group), for the ChromaDB filter. */
export function subjectKeysFor(subject: string): string[] {
  const key = labelKey(subject);
  const group = SUBJECT_GROUPS.find((g) => g.some((s) => labelKey(s) === key));
  return group ? [...new Set(group.map(labelKey))] : [key];
}

/** The display names that count as `subject` (itself plus its group). */
export function subjectNamesFor(subject: string): string[] {
  const key = labelKey(subject);
  const group = SUBJECT_GROUPS.find((g) => g.some((s) => labelKey(s) === key));
  return group ? [...new Set([subject.trim(), ...group])] : [subject.trim()];
}
