/**
 * Repairs scrambled text from PDFs made in CorelDRAW (how the Curriculum
 * Development Centre produces syllabi).
 *
 * Those PDFs embed fonts whose letters are stored 29 places lower than
 * normal: "Republic" is stored as "5HSXEOLF". A PDF reader copies the stored
 * codes, so the text comes out as nonsense. Some text in the same file is
 * stored normally, so each piece of text is checked on its own: whichever
 * version (as stored, or shifted back by 29) looks more like English wins.
 *
 * It also replaces the special glyphs these fonts use for "fi", "ff" and "fl".
 *
 * Only documents that really are scrambled get this treatment. A PDF made in
 * Word (the CDC teaching modules) is stored normally, and "repairing" it did
 * harm: a lone "-" became "J", a lone ":" became "W" and a lone capital "H"
 * became "e" ("real-life" -> "realJlife", "How" -> "eow"). Scrambled PDFs
 * always store some text as control characters (a space is stored as
 * character 3), so PDFProcessor checks the whole document for them first
 * (`isScrambledDocument`) and passes the answer to repairText.
 */

const SHIFT = 29;

// English letter frequencies (%), for judging which version is real text.
const ENGLISH: Record<string, number> = {
  a: 8.2, b: 1.5, c: 2.8, d: 4.3, e: 12.7, f: 2.2, g: 2.0, h: 6.1, i: 7.0, j: 0.15, k: 0.77, l: 4.0, m: 2.4,
  n: 6.7, o: 7.5, p: 1.9, q: 0.095, r: 6.0, s: 6.3, t: 9.1, u: 2.8, v: 0.98, w: 2.4, x: 0.15, y: 2.0, z: 0.074,
};

const LIGATURES: [RegExp, string][] = [
  [/¿/g, "fi"], // ¿
  [/൵/g, "ff"], // ൵
  [/À/g, "fl"], // À
  [/¶/g, "’"], // ¶ is where an apostrophe lands
  [/«/g, "…"], // « is where an ellipsis lands
  [/|||•/g, ""], // bullet glyphs
];

/** Shifts every stored code in the scrambled range back up by 29. */
export function unshift(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    out += code >= 0x03 && code <= 0x5d && ch !== " " ? String.fromCodePoint(code + SHIFT) : ch;
  }
  return out;
}

/** Lower is more English-like. */
function badness(text: string): number {
  const letters = [...text].filter((c) => /[A-Za-z]/.test(c)).map((c) => c.toLowerCase());
  if (letters.length === 0) return Number.POSITIVE_INFINITY;
  const n = letters.length;
  const counts: Record<string, number> = {};
  for (const c of letters) counts[c] = (counts[c] ?? 0) + 1;
  let chi = 0;
  for (const [letter, pct] of Object.entries(ENGLISH)) {
    const expected = (n * pct) / 100;
    chi += ((counts[letter] ?? 0) - expected) ** 2 / expected;
  }
  const lower = [...text].filter((c) => c >= "a" && c <= "z").length;
  const junk = [...text].filter((c) => {
    const code = c.codePointAt(0)!;
    return (code < 32 && c !== "\t" && c !== "\n") || "[]\\^_`{|}~".includes(c);
  }).length;
  return chi / n + (3 * junk) / text.length - (0.5 * lower) / n;
}

/** Picks the readable version of one piece of text. */
export function repairPiece(text: string): string {
  if (!text.trim()) return text;
  const shifted = unshift(text);
  // No letters (e.g. a code like "1.1.2.1"): stored control characters can only
  // be scrambled digits and dots, since real text never contains them.
  // A run of one capital letter that shifts to dots or dashes is a contents-page leader ("KKKK" = "....").
  if (/^([A-Z])\1{4,}$/.test(text.trim()) && !/[A-Za-z]/.test(shifted)) return shifted;
  if (!/[A-Za-z]/.test(text) && !/[A-Za-z]/.test(shifted))
    return /[\u0003-\u001f]/.test(text.replace(/[\t\n\r]/g, "")) ? shifted : text;
  // Shifting moves every lowercase letter out of a–z (e → H), so a piece with any
  // lowercase letter in it was stored normally ("Printed by" must stay as it is).
  if (/[a-z]/.test(text)) return text;
  // Control characters never appear in real text; a piece holding them is shifted.
  const controls = (text.replace(/[\t\n\r]/g, "").match(/[\u0003-\u001f]/g) ?? []).length;
  if (controls >= 1) return shifted;
  return badness(shifted) < badness(text) ? shifted : text;
}

/** Control characters that real text never contains (tab, newline and carriage return excluded). */
const CONTROL = /[\u0003-\u0008\u000b\u000c\u000e-\u001f]/;

/** True when any piece of the document holds control characters: a scrambled (CorelDRAW) PDF. */
export function isScrambledDocument(pieces: Iterable<string>): boolean {
  for (const piece of pieces) if (CONTROL.test(piece)) return true;
  return false;
}

/**
 * Repairs a piece of text, then replaces ligature glyphs. With
 * `scrambled = false` (a normally stored PDF) the text is kept as it is and
 * only bullet glyphs are removed.
 */
export function repairText(text: string, scrambled = true): string {
  if (!scrambled) return text.replace(LIGATURES[LIGATURES.length - 1][0], "");
  let out = repairPiece(text);
  for (const [pattern, replacement] of LIGATURES) out = out.replace(pattern, replacement);
  return out;
}
