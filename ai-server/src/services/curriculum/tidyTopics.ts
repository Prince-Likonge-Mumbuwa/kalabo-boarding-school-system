/**
 * Repairs syllabus topics that the PDF reader put together wrongly.
 *
 * Some syllabus tables have narrow Topic and Sub-topic columns whose words sit
 * against each other, so a topic can come out as
 *   "2.1.1 Cartesian Plane COORDINATE GEOMETRY"  with sub-topic 2.1.1 named "".
 * The topic name is the words in capitals ("Coordinate Geometry"); the words
 * after a sub-topic code are that sub-topic's name ("Cartesian Plane").
 * A sub-topic still without a name is named from its first competence, and
 * column headings caught in a competence ("SPECIFIC COMPETENCES …") are removed.
 *
 * It runs when topics are handed out (dropdowns and documents), not on the
 * stored map, so a superadmin's own corrections are never overwritten, and a
 * map that is already right is not changed.
 */
import type { MapTopic } from "./SyllabusParser.js";

const CODE = /^\d+\.\d+\.\d+$/;
const CAPS = /^[A-Z][A-Z&\-–,]+$/; // a word in capitals (two letters or more)
const HEADINGS = /\s+(?:SPECIFIC COMPETENCES?|SUGGESTED (?:LEARNING )?ACTIVITIES|EXPECTED STANDARDS?|GENERAL COMPETENCES?|KEY COMPETENCES?)\b.*$/;

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-(])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase()).replace(/\b(And|Of|In|The|To|For|On|A)\b/g, (w, _a, i: number) => (i === 0 ? w : w.toLowerCase()));

/** The first competence as a short sub-topic name: "Use straight lines to solve problems in real life". */
const nameFromCompetence = (text: string) => {
  const words = text.replace(HEADINGS, "").replace(/[.;:]+$/, "").trim().split(/\s+/);
  return words.length > 10 ? `${words.slice(0, 10).join(" ")}…` : words.join(" ");
};

export function tidyTopics(topics: MapTopic[]): MapTopic[] {
  for (const topic of topics) {
    for (const sub of topic.subTopics) for (const c of sub.competences) c.text = c.text.replace(HEADINGS, "").trim();

    const words = topic.name.trim().split(/\s+/).filter(Boolean);
    if (words.some((w) => CODE.test(w))) {
      const capitals: string[] = [];
      const names = new Map<string, string[]>();
      let current: string[] | null = null;
      for (const word of words) {
        if (CODE.test(word)) { current = []; names.set(word, current); }
        else if (CAPS.test(word)) capitals.push(word);
        else if (current) current.push(word);
        else capitals.push(word);
      }
      if (capitals.length) topic.name = titleCase(capitals.join(" "));
      for (const sub of topic.subTopics) {
        const found = names.get(sub.code)?.join(" ").trim();
        if (!sub.name.trim() && found) sub.name = found;
      }
    } else if (topic.name && topic.name === topic.name.toUpperCase() && /[A-Z]/.test(topic.name)) {
      topic.name = titleCase(topic.name);
    }

    for (const sub of topic.subTopics)
      if (!sub.name.trim()) sub.name = sub.competences[0]?.text ? nameFromCompetence(sub.competences[0].text) : `Sub-topic ${sub.code}`;
    if (!topic.name.trim()) topic.name = `Topic ${topic.code}`;
  }
  return topics;
}
