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

// ==================== THE SPONSOR LIST ====================
//
// The school keeps ONE list of sponsors (system/sponsors). A learner's
// Sponsor field counts only when it matches a sponsor on the list (case,
// spaces and punctuation ignored — "C.D.F" is CDF — or a spelling the
// guidance teacher marked as the same sponsor). Anything else — a parent's
// name, "Self", blank — is SELF-SPONSORED. The guidance teacher adds a new
// sponsor when a real one is missing.

/** The sponsors the school started with. */
export const DEFAULT_SPONSORS = ['KGS', 'CAMFED', 'CDF', 'AP', 'WISE'];

/** What every learner without a listed sponsor is. */
export const SELF_SPONSORED = 'Self-sponsored';

export interface SponsorList {
  /** Official sponsor names, as shown. */
  names: string[];
  /** Other spellings → official name. Keyed by `sponsorKey(spelling)`. */
  aliases: Record<string, string>;
}

export const defaultSponsorList = (): SponsorList => ({ names: [...DEFAULT_SPONSORS], aliases: {} });

/** Comparison key: normalised, spaces removed ("C. D. F" and "cdf" → "cdf"). */
export const sponsorKey = (name: string | null | undefined) => normalizeSponsor(name).replace(/ /g, '');

/** The official sponsor a typed name means, or null (self-sponsored). */
export function resolveSponsor(raw: string | null | undefined, list: SponsorList): string | null {
  if (!isSponsored(raw)) return null;
  const k = sponsorKey(raw);
  const direct = list.names.find(n => sponsorKey(n) === k);
  if (direct) return direct;
  const alias = list.aliases[k];
  return alias && list.names.includes(alias) ? alias : null;
}

/** What the Sponsor field should say: the official name, or "Self-sponsored". */
export const sponsorLabel = (raw: string | null | undefined, list: SponsorList) => resolveSponsor(raw, list) ?? SELF_SPONSORED;

/** Why a new sponsor name can't be added; null when it can. */
export function newSponsorProblem(name: string, list: SponsorList): string | null {
  const t = name.trim().replace(/\s+/g, ' ');
  if (!t) return 'Type the sponsor\'s name.';
  if (t.length > 40) return 'Keep the name under 40 characters (use the short name, e.g. CAMFED).';
  if (!isSponsored(t)) return `"${t}" means self-sponsored; it is not a sponsor.`;
  const k = sponsorKey(t);
  const same = list.names.find(n => sponsorKey(n) === k) ?? (list.aliases[k] && list.names.includes(list.aliases[k]) ? list.aliases[k] : null);
  if (same) return `${same} is already on the list.`;
  return null;
}

export function addSponsor(list: SponsorList, name: string): SponsorList {
  const t = name.trim().replace(/\s+/g, ' ');
  const problem = newSponsorProblem(t, list);
  if (problem) throw new Error(problem);
  const aliases = { ...list.aliases };
  delete aliases[sponsorKey(t)];
  return { names: [...list.names, t], aliases };
}

/** Remove a sponsor (its learners become self-sponsored) and the spellings that pointed to it. */
export function removeSponsor(list: SponsorList, name: string): SponsorList {
  return {
    names: list.names.filter(n => n !== name),
    aliases: Object.fromEntries(Object.entries(list.aliases).filter(([, v]) => v !== name)),
  };
}

/** Mark a typed spelling as the same as an official sponsor ("Camfed Zambia" → CAMFED). */
export function addAlias(list: SponsorList, spelling: string, name: string): SponsorList {
  if (!list.names.includes(name)) throw new Error(`${name} is not on the sponsor list.`);
  const k = sponsorKey(spelling);
  if (!k || !isSponsored(spelling)) throw new Error('That spelling means self-sponsored.');
  return { ...list, aliases: { ...list.aliases, [k]: name } };
}

// ==================== GROUPING ====================

interface LearnerLike {
  id: string;
  sponsor?: string | null;
  status?: string | null;
}

const isCurrent = (status: string | null | undefined) =>
  status === undefined || status === null || status === '' || status === 'active';

const tidy = (s: string | null | undefined) => String(s ?? '').trim().replace(/\s+/g, ' ');

/**
 * Active learners grouped by the sponsors ON THE LIST (every listed sponsor
 * appears, even with no learners), biggest first. Learners whose sponsor is
 * not on the list are self-sponsored and left out.
 */
export function groupLearnersBySponsor(learners: LearnerLike[], list: SponsorList = defaultSponsorList()): SponsorGroup[] {
  const groups = new Map<string, { name: string; ids: string[]; spellings: Map<string, number> }>();
  for (const n of list.names) groups.set(n, { name: n, ids: [], spellings: new Map() });
  for (const l of learners) {
    if (!isCurrent(l.status)) continue;
    const name = resolveSponsor(l.sponsor, list);
    if (!name) continue;
    const g = groups.get(name)!;
    g.ids.push(l.id);
    const spelling = tidy(l.sponsor);
    g.spellings.set(spelling, (g.spellings.get(spelling) ?? 0) + 1);
  }
  return Array.from(groups.values())
    .map(g => {
      const others = Array.from(g.spellings.entries())
        .filter(([s]) => s !== g.name)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([s]) => s);
      return { key: normalizeSponsor(g.name), name: g.name, spellings: [g.name, ...others], learnerIds: g.ids, count: g.ids.length };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export interface UnlistedSponsorName {
  key: string;
  /** Most common spelling. */
  name: string;
  spellings: string[];
  learnerIds: string[];
  count: number;
}

/**
 * Names typed in the Sponsor field of active learners that are NOT on the
 * list (and are not "Self", "Parent"…): parents' names, sponsors not added
 * yet. They are counted as self-sponsored until the guidance teacher adds
 * the sponsor or marks the name as a spelling of a listed one.
 */
export function unlistedSponsorNames(learners: LearnerLike[], list: SponsorList): UnlistedSponsorName[] {
  const m = new Map<string, { ids: string[]; spellings: Map<string, number> }>();
  for (const l of learners) {
    if (!isCurrent(l.status) || !isSponsored(l.sponsor) || resolveSponsor(l.sponsor, list)) continue;
    const k = sponsorKey(l.sponsor);
    const g = m.get(k) ?? { ids: [], spellings: new Map() };
    g.ids.push(l.id);
    const sp = tidy(l.sponsor);
    g.spellings.set(sp, (g.spellings.get(sp) ?? 0) + 1);
    m.set(k, g);
  }
  return Array.from(m.entries())
    .map(([key, g]) => {
      // Most common spelling first; on a tie the better-capitalised one ("World Vision").
      const caps = (x: string) => (x.match(/[A-Z]/g) ?? []).length;
      const sp = Array.from(g.spellings.entries())
        .sort((a, b) => b[1] - a[1] || caps(b[0]) - caps(a[0]) || a[0].localeCompare(b[0]))
        .map(([s]) => s);
      return { key, name: sp[0], spellings: sp, learnerIds: g.ids, count: g.ids.length };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Active learners counted as self-sponsored (not on the list, "Self", blank…). */
export const selfSponsoredCount = (learners: LearnerLike[], list: SponsorList) =>
  learners.filter(l => isCurrent(l.status) && !resolveSponsor(l.sponsor, list)).length;

export interface SponsorFix {
  id: string;
  from: string;
  to: string;
}

/**
 * Tidying learner records: every ACTIVE learner whose Sponsor field is not
 * exactly an official name or "Self-sponsored" gets one of them — the listed
 * sponsor it matches, otherwise "Self-sponsored" (parents' names, "Self",
 * "N/A", blank…). Past learners are left as they were.
 */
export function sponsorRecordFixes(learners: LearnerLike[], list: SponsorList): SponsorFix[] {
  const out: SponsorFix[] = [];
  for (const l of learners) {
    if (!isCurrent(l.status)) continue;
    const from = String(l.sponsor ?? '');
    const to = sponsorLabel(from, list);
    if (from !== to) out.push({ id: l.id, from, to });
  }
  return out;
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
