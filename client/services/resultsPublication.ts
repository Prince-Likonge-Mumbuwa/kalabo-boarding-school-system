// @/services/resultsPublication.ts
//
// Publishing a term's results to guardians and sponsors.
//
// Until now every term's results (finished or not) could be opened in the
// Parent Portal, so a guardian could take an unfinished Term 3 report card
// for Term 2's. Now a term's results reach guardians and sponsors only when
// the admin has PUBLISHED them, and a term can only be published once at
// least 98% of the results the school expects have been entered.
//
// One document per term: results_publication/{year}_{Term}, e.g.
// `2026_Term3`. Admin and teachers are never gated — only the signed-out
// Parent Portal and Sponsor Portal ("public view") are.
//
// Terms BEFORE Term 3 2026 (the term that was current when publishing was
// introduced) were already open to guardians, so they stay open unless the
// admin withdraws them: this change does not take Term 1 / Term 2 away.
// From Term 3 2026 onwards a term is closed until it is published.
//
// See RESULTS_PUBLICATION.md.

import { doc, getDoc, serverTimestamp, setDoc } from '@/lib/auditedFirestore';
import { db } from '@/lib/firebase';

// ==================== CONSTANTS ====================

export const PUBLICATION_COLLECTION = 'results_publication';

/** A term may be published when this share of expected results is entered. */
export const PUBLISH_THRESHOLD_PERCENT = 98;

/** Terms before this one were open before publishing existed and stay open. */
export const FIRST_PUBLISHED_TERM = { term: 'Term 3', year: 2026 } as const;

const TERM_NUMBERS: Record<string, number> = { 'Term 1': 1, 'Term 2': 2, 'Term 3': 3 };

// ==================== TYPES ====================

export interface ResultsPublication {
  term: string;
  year: number;
  published: boolean;
  /** Entries expected / entered when it was published (kept as evidence). */
  requiredEntries: number;
  doneEntries: number;
  /** Share entered when it was published, one decimal (e.g. 98.4). */
  completionPercent: number;
  publishedAt: Date | null;
  publishedByName: string;
  unpublishedAt: Date | null;
  unpublishedByName: string;
}

export interface PublishActor {
  uid: string;
  name: string;
}

/** How many results the school expects for a term and how many are in. */
export interface TermCompletion {
  requiredEntries: number;
  doneEntries: number;
}

/** Thrown when a signed-out visitor asks for a term that is not published. */
export class ResultsNotReleasedError extends Error {
  readonly code = 'results-not-published';
  readonly term: string;
  readonly year: number;
  constructor(term: string, year: number) {
    super(
      `${term} ${year} results have not been released yet. ` +
        `They will be available here once the school has published them.`
    );
    this.name = 'ResultsNotReleasedError';
    this.term = term;
    this.year = year;
  }
}

// ==================== PURE HELPERS ====================

/** Document id of a term's publication record, e.g. `2026_Term3`. */
export const publicationId = (term: string, year: number): string =>
  `${Number(year)}_${String(term).replace(/\s+/g, '')}`;

/** 1, 2 or 3; NaN for anything else. */
const termNumber = (term: string): number => TERM_NUMBERS[term] ?? NaN;

/** A number that orders terms in time: later terms are larger. */
const termOrder = (term: string, year: number): number => Number(year) * 3 + termNumber(term);

/**
 * True when at least 98% of the expected results are entered. Exact (no
 * rounding: 97.6% does not count as 98%), and false when nothing is expected
 * — an empty term has nothing to publish.
 */
export function meetsPublishThreshold(c: TermCompletion): boolean {
  const { requiredEntries: required, doneEntries: done } = c;
  if (!Number.isFinite(required) || !Number.isFinite(done)) return false;
  if (required <= 0 || done < 0 || done > required) return false;
  return done * 100 >= required * PUBLISH_THRESHOLD_PERCENT;
}

/**
 * The share entered for display, rounded DOWN to one decimal so it never
 * shows 98% while the real figure is 97.96%. 0 when nothing is expected.
 */
export function completionPercent(c: TermCompletion): number {
  if (c.requiredEntries <= 0) return 0;
  const pct = (Math.min(c.doneEntries, c.requiredEntries) / c.requiredEntries) * 100;
  return Math.floor(pct * 10 + 1e-9) / 10;
}

/** Results still to enter before the term reaches the 98% mark (0 if reached). */
export function entriesNeededToPublish(c: TermCompletion): number {
  if (c.requiredEntries <= 0) return 0;
  const target = Math.ceil((c.requiredEntries * PUBLISH_THRESHOLD_PERCENT) / 100);
  return Math.max(0, target - c.doneEntries);
}

/**
 * Why a term cannot be published right now, in words for the admin — or null
 * when it can. `completion` is null while the term is still loading;
 * `failedClasses` are classes whose results could not be loaded (the total is
 * then unknown, so nothing may be published on it).
 */
export function publishBlocker(
  completion: TermCompletion | null,
  failedClasses: number,
  term: string,
  year: number
): string | null {
  if (!completion) return 'Checking how many results are entered…';
  if (failedClasses > 0) {
    return (
      `${failedClasses} class${failedClasses === 1 ? '' : 'es'} could not be loaded, so the total is unknown. ` +
      `Refresh and try again.`
    );
  }
  if (completion.requiredEntries <= 0) {
    return `No results are expected for ${term} ${year} (no tests are set up for it), so there is nothing to publish.`;
  }
  if (!meetsPublishThreshold(completion)) {
    const more = entriesNeededToPublish(completion);
    return (
      `Only ${completionPercent(completion)}% of the results are entered; ${PUBLISH_THRESHOLD_PERCENT}% is needed ` +
      `(${more} more result${more === 1 ? '' : 's'} to enter).`
    );
  }
  return null;
}

/** The term is older than the first one that needs publishing. */
export function isOpenByDefault(term: string, year: number): boolean {
  const order = termOrder(term, year);
  if (Number.isNaN(order)) return false;
  return order < termOrder(FIRST_PUBLISHED_TERM.term, FIRST_PUBLISHED_TERM.year);
}

/**
 * Are this term's results open to guardians and sponsors?
 *  - an explicit record decides (published, or withdrawn);
 *  - with no record, terms before Term 3 2026 stay open as they were, and
 *    every later term is closed until it is published.
 */
export function isReleased(
  record: Pick<ResultsPublication, 'published'> | null,
  term: string,
  year: number
): boolean {
  if (record) return record.published === true;
  return isOpenByDefault(term, year);
}

// ==================== READING ====================

const isPermissionDenied = (e: any) =>
  e?.code === 'permission-denied' || /missing or insufficient permissions/i.test(e?.message ?? '');

const toDate = (v: any): Date | null =>
  v && typeof v.toDate === 'function' ? v.toDate() : v instanceof Date ? v : null;

const fromDoc = (d: Record<string, any>): ResultsPublication => ({
  term: String(d.term ?? ''),
  year: Number(d.year),
  published: d.published === true,
  requiredEntries: Number(d.requiredEntries ?? 0),
  doneEntries: Number(d.doneEntries ?? 0),
  completionPercent: Number(d.completionPercent ?? 0),
  publishedAt: toDate(d.publishedAt),
  publishedByName: String(d.publishedByName ?? ''),
  unpublishedAt: toDate(d.unpublishedAt),
  unpublishedByName: String(d.unpublishedByName ?? ''),
});

/**
 * A term's publication record, or null when the admin has never published or
 * withdrawn it. Before the updated firestore.rules are deployed, signed-out
 * visitors cannot read the collection; that counts as "no record" (the
 * date-based default then applies) instead of locking everyone out.
 */
export async function getPublication(term: string, year: number): Promise<ResultsPublication | null> {
  try {
    const snap = await getDoc(doc(db, PUBLICATION_COLLECTION, publicationId(term, year)));
    return snap.exists() ? fromDoc(snap.data()) : null;
  } catch (e) {
    if (isPermissionDenied(e)) return null;
    throw e;
  }
}

// A class of 40 (or a sponsor with 1,500 learners) asks the same question
// once per learner; answer it from memory for a few seconds.
const CACHE_TTL_MS = 15_000;
const releasedCache = new Map<string, { at: number; promise: Promise<boolean> }>();

/** Clears the short-lived memory (after publishing, and in tests). */
export function clearReleaseCache(): void {
  releasedCache.clear();
}

/** Are this term's results open to guardians and sponsors right now? */
export function isTermReleased(term: string, year: number): Promise<boolean> {
  const key = publicationId(term, year);
  const hit = releasedCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;
  const promise = getPublication(term, year).then(record => isReleased(record, term, year));
  releasedCache.set(key, { at: Date.now(), promise });
  promise.catch(() => releasedCache.delete(key));
  return promise;
}

/** Throws ResultsNotReleasedError unless the term's results are open. */
export async function assertTermReleased(term: string, year: number): Promise<void> {
  if (!(await isTermReleased(term, year))) throw new ResultsNotReleasedError(term, year);
}

// ==================== WRITING (admin) ====================

/**
 * Publish a term's results. Refuses unless 98% of the expected results are
 * entered (the Firestore rules check the same figures).
 */
export async function publishResults(
  term: string,
  year: number,
  completion: TermCompletion,
  actor: PublishActor
): Promise<void> {
  if (Number.isNaN(termNumber(term))) throw new Error(`Unknown term "${term}".`);
  if (!meetsPublishThreshold(completion)) {
    throw new Error(
      `${term} ${year} cannot be published yet: ${completionPercent(completion)}% of the results ` +
        `are entered and ${PUBLISH_THRESHOLD_PERCENT}% is needed.`
    );
  }
  await setDoc(doc(db, PUBLICATION_COLLECTION, publicationId(term, year)), {
    term,
    year: Number(year),
    published: true,
    requiredEntries: completion.requiredEntries,
    doneEntries: completion.doneEntries,
    completionPercent: completionPercent(completion),
    publishedAt: serverTimestamp(),
    publishedBy: actor.uid,
    publishedByName: actor.name,
    updatedAt: serverTimestamp(),
    updatedBy: actor.uid,
  });
  clearReleaseCache();
}

/** Withdraw a term's results from guardians and sponsors. */
export async function unpublishResults(term: string, year: number, actor: PublishActor): Promise<void> {
  if (Number.isNaN(termNumber(term))) throw new Error(`Unknown term "${term}".`);
  await setDoc(doc(db, PUBLICATION_COLLECTION, publicationId(term, year)), {
    term,
    year: Number(year),
    published: false,
    unpublishedAt: serverTimestamp(),
    unpublishedBy: actor.uid,
    unpublishedByName: actor.name,
    updatedAt: serverTimestamp(),
    updatedBy: actor.uid,
  });
  clearReleaseCache();
}
