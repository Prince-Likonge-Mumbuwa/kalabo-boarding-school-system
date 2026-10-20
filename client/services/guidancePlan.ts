// @/services/guidancePlan.ts
//
// The rules behind the guidance module, without Firestore (so they can be
// tested on their own):
//   - which learners count as sponsored, and how sponsor spellings match;
//   - the order report cards go in (form/grade, then class, then name);
//   - what a sponsor code looks like, and how a typed code is read.

import type { SponsorCode, SponsorCodeDisplayStatus, SponsorGroup } from '@/types/guidance';

// ==================== SPONSORS ====================

/**
 * "Kalabo  Town Council." and "kalabo town council" are the same sponsor.
 * Case, extra spaces and punctuation are ignored.
 */
export function normalizeSponsor(name: string | null | undefined): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[.,'"`()\-_/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Names that mean "nobody outside the family pays". */
const NOT_SPONSORED = new Set([
  '', 'self', 'self sponsored', 'selfsponsored', 'parent', 'parents', 'guardian', 'guardians',
  'family', 'n a', 'na', 'none', 'nil', 'no', 'not applicable',
]);

export function isSponsored(name: string | null | undefined): boolean {
  return !NOT_SPONSORED.has(normalizeSponsor(name));
}

interface LearnerLike {
  id: string;
  sponsor?: string | null;
  status?: string | null;
}

const isCurrent = (status: string | null | undefined) =>
  status === undefined || status === null || status === '' || status === 'active';

/**
 * Active learners grouped by sponsor (self-sponsored learners left out),
 * biggest sponsor first. Each group is named by its most common spelling.
 */
export function groupLearnersBySponsor(learners: LearnerLike[]): SponsorGroup[] {
  const groups = new Map<string, { ids: string[]; spellings: Map<string, number> }>();
  for (const l of learners) {
    if (!isCurrent(l.status) || !isSponsored(l.sponsor)) continue;
    const key = normalizeSponsor(l.sponsor);
    const g = groups.get(key) ?? { ids: [], spellings: new Map() };
    g.ids.push(l.id);
    const spelling = String(l.sponsor).trim().replace(/\s+/g, ' ');
    g.spellings.set(spelling, (g.spellings.get(spelling) ?? 0) + 1);
    groups.set(key, g);
  }
  return Array.from(groups.entries())
    .map(([key, g]) => {
      const spellings = Array.from(g.spellings.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      return {
        key,
        name: spellings[0][0],
        spellings: spellings.map(s => s[0]),
        learnerIds: g.ids,
        count: g.ids.length,
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// ==================== ORDER ====================

const levelNumber = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? '').replace(/\D+/g, ''), 10);
  return Number.isFinite(n) ? n : 99;
};

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** Report cards in order of form/grade (Form 1 first), then class, then learner name. */
export function sortCardsByForm<T extends { form?: string | number; className?: string; studentName?: string }>(cards: T[]): T[] {
  return [...cards].sort((a, b) =>
    levelNumber(a.form) - levelNumber(b.form)
    || byText(a.className || '', b.className || '')
    || byText(a.studentName || '', b.studentName || ''));
}

/** Learners in the same order as their report cards. */
export function sortLearnersByForm<T extends { classLevel?: number; className?: string; fullName?: string }>(learners: T[]): T[] {
  return [...learners].sort((a, b) =>
    levelNumber(a.classLevel ?? a.className) - levelNumber(b.classLevel ?? b.className)
    || byText(a.className || '', b.className || '')
    || byText(a.fullName || '', b.fullName || ''));
}

/** "Form 1" / "Grade 10" heading for a level, from the class name when it says. */
export function levelHeading(className: string | undefined, level: unknown): string {
  const name = className || '';
  const m = name.match(/^(form|grade)\s*\d+/i);
  if (m) return m[0].replace(/\s+/, ' ').replace(/^./, c => c.toUpperCase());
  const n = levelNumber(level);
  return n === 99 ? 'Other' : `Level ${n}`;
}

// ==================== CODES ====================

/** No 0/O, 1/I/L — easy to read out over the phone. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_PREFIX = 'SP';

/** A new random code, e.g. SP-7KQ3-M9XP. */
export function generateCodeString(random: (n: number) => Uint8Array = cryptoRandom): string {
  const bytes = random(8);
  let body = '';
  for (let i = 0; i < 8; i++) body += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `${CODE_PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}

function cryptoRandom(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/**
 * What the sponsor typed → the stored code, or null when it cannot be one.
 * Accepts lower case, spaces, missing dashes and a missing "SP".
 */
export function normalizeCodeInput(input: string): string | null {
  let s = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length === 10 && s.startsWith(CODE_PREFIX)) s = s.slice(2);
  if (s.length !== 8) return null;
  if (![...s].every(c => CODE_ALPHABET.includes(c))) return null;
  return `${CODE_PREFIX}-${s.slice(0, 4)}-${s.slice(4)}`;
}

export function displayStatus(code: Pick<SponsorCode, 'status' | 'expiresAt'>, now = new Date()): SponsorCodeDisplayStatus {
  if (code.status !== 'active') return code.status;
  if (code.expiresAt && code.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}

/** Why a code cannot be used, in words for the sponsor; null when it can. */
export function codeProblem(code: Pick<SponsorCode, 'status' | 'expiresAt'> | null, now = new Date()): string | null {
  if (!code) return 'That code was not found. Please check it, or ask the school for a new one.';
  switch (displayStatus(code, now)) {
    case 'used': return 'That code has already been used. Each code works only once — please ask the school guidance office for a new one.';
    case 'revoked': return 'That code was cancelled by the school. Please ask the guidance office for a new one.';
    case 'expired': return 'That code has expired. Please ask the school guidance office for a new one.';
    default: return null;
  }
}

/** The message an officer sends to the sponsor with the code. */
export function shareMessage(code: Pick<SponsorCode, 'code' | 'sponsorName' | 'term' | 'year' | 'learnerCount' | 'expiresAt'>, portalUrl: string): string {
  const until = code.expiresAt
    ? ` before ${code.expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : '';
  return [
    `Kalabo Boarding Secondary School — ${code.term} ${code.year} report cards for ${code.sponsorName}.`,
    `Open ${portalUrl} (Parent Portal, "Sponsor") and enter the code ${code.code}${until}.`,
    `It downloads the report cards of the ${code.learnerCount} learner${code.learnerCount === 1 ? '' : 's'} you sponsor in one PDF.`,
    'The code works once only.',
  ].join(' ');
}
