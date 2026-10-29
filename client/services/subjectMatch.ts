// @/services/subjectMatch.ts
//
// Turns whatever a person typed for a subject into ONE spelling, so the same
// subject is never split in two ("PRINCIPLES OF ACCOUNTS", "Principles  of
// Accounts.", "Priciples of Accounts", "Principle of Account" → all
// "Principles of Accounts").
//
//   1. Exact name or alias from the subject list              → its subject
//   2. Same letters ignoring case, spaces, punctuation, "&"/"and"
//      ("P.O.A" = "POA")                                      → its subject
//   3. A small typo of a subject or long alias (1 letter wrong for names up
//      to 8 letters, 2 for longer ones; only when exactly one subject is that
//      close)                                                  → its subject
//   4. Anything else: spaces tidied; ALL CAPS or all lower case put in Title
//      Case ("LIFE SKILLS", "life skills" → "Life Skills"); short acronyms
//      ("CTS") and mixed case are kept as typed.
//
// No Firebase here: the same rules run in the browser, on the server (the
// SMS functions keep a copy in sms-functions/functions/src/lib/subjectMatch.js)
// and in tests.

/** Lower case, "&" → "and", every non-letter/digit run → one space. */
export const looseSubjectKey = (s: string): string =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Optimal-string-alignment distance (insert, delete, replace, swap neighbours). */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

const SMALL_WORDS = new Set(['of', 'in', 'and', 'the', 'for', 'to', 'a']);
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

/** Tidy an unknown subject name (rule 4). */
export function tidyUnknownSubject(s: string): string {
  const cleaned = s.trim().replace(/\s+/g, ' ');
  const letters = cleaned.replace(/[^A-Za-z]/g, '');
  if (!letters) return cleaned;
  const allUpper = letters === letters.toUpperCase();
  const allLower = letters === letters.toLowerCase();
  if (allLower || (allUpper && letters.length > 4)) return titleCase(cleaned);
  return cleaned;
}

/** Build the normalizer for a subject list (alias → subject). */
export function makeSubjectNormalizer(map: Record<string, string>) {
  const loose = new Map<string, string>();
  // Same letters with no spaces at all ("P.O.A" → "poa").
  const compact = new Map<string, string>();
  for (const [alias, subject] of Object.entries(map)) {
    for (const name of [alias, subject]) {
      loose.set(looseSubjectKey(name), subject);
      compact.set(looseSubjectKey(name).replace(/ /g, ''), subject);
    }
  }
  // Typo matching only against names long enough not to collide
  // ("Bio", "Geo", "PE" are aliases only).
  const fuzzy = [...loose.entries()]
    .map(([key, subject]) => ({ key: key.replace(/ /g, ''), subject }))
    .filter(x => x.key.length >= 6);
  const cache = new Map<string, string>();

  return function normalizeSubjectName(subjectName: string): string {
    if (!subjectName) return '';
    const trimmed = String(subjectName).trim();
    if (map[trimmed]) return map[trimmed];
    const hit = cache.get(trimmed);
    if (hit !== undefined) return hit;

    let out: string | undefined = loose.get(looseSubjectKey(trimmed)) ?? compact.get(looseSubjectKey(trimmed).replace(/ /g, ''));
    if (!out) {
      const k = looseSubjectKey(trimmed).replace(/ /g, '');
      if (k.length >= 5) {
        let best = Infinity;
        const at = new Set<string>();
        for (const t of fuzzy) {
          const allowed = t.key.length <= 8 ? 1 : 2;
          const dist = editDistance(k, t.key, allowed);
          if (dist > allowed) continue;
          if (dist < best) { best = dist; at.clear(); }
          if (dist === best) at.add(t.subject);
        }
        if (at.size === 1) out = [...at][0];
      }
    }
    out ??= tidyUnknownSubject(trimmed);
    cache.set(trimmed, out);
    return out;
  };
}
