// @/services/portalApi.ts
// Parent Portal and Sponsor Portal → the Cloud Function `portal`.
//
// Parents and sponsors are not signed in, and the database is closed to
// signed-out visitors. The function finds a parent's children (by guardian
// number) or a sponsor code's learners, and builds their report cards on the
// server with the same code the app uses (sms-functions/functions/src/portal).
//
// v2 — distinguishes real infrastructure failures from legitimate empty
// states (no children / no results) and surfaces the server's actual
// message instead of a blanket "Something went wrong. Please try again."

import type { Functions } from 'firebase/functions';
import type { resultsService } from '@/services/resultsService';
import type { SponsorReports } from '@/services/guidanceService';
import { portalDirect } from '@/services/portalDirect';

export const PORTAL_REGION = 'us-central1'; // same region as the SMS and face functions

/** The report card the app builds (same shape on the server). */
export type PortalReportCard = NonNullable<
  Awaited<ReturnType<typeof resultsService.generateReportCard>>
>;

export interface PortalChild {
  /** Learner document id. */
  id: string;
  studentId: string;
  fullName: string;
  className: string;
}

export interface PortalSponsorCode {
  code: string;
  sponsorName: string;
  term: string;
  year: number;
  learnerCount: number;
}

// ───────────────────────── errors ─────────────────────────

/**
 * A Cloud Function failure with the original code preserved, so the page
 * can tell "the phone has no children" from "the server is down".
 */
export class PortalError extends Error {
  readonly code: string;
  readonly details?: unknown;
  /**
   * True when the function itself could not be reached — not deployed,
   * blocked, or down — as opposed to the function answering with an error.
   * The portals then fall back to reading Firestore directly.
   */
  readonly unreachable: boolean;
  constructor(message: string, code: string, details?: unknown, unreachable = false) {
    super(message);
    this.name = 'PortalError';
    this.code = code;
    this.details = details;
    this.unreachable = unreachable;
  }
  /** True when the phone was valid but simply matched no learner. */
  get isEmptyResult(): boolean {
    return this.code === 'not-found' || this.code === 'no-match';
  }
  /** True when the server is unreachable (offline, cold-start timeout). */
  get isTransport(): boolean {
    return (
      this.code === 'unavailable' ||
      this.code === 'deadline-exceeded' ||
      this.code === 'not-internal'
    );
  }
}

/** A sentence a parent or sponsor can act on. */
export function portalErrorMessage(e: unknown): string {
  // Already a PortalError → its message is already user-safe.
  if (e instanceof PortalError) return e.message;

  const err = e as { code?: string; message?: string; details?: unknown };
  const code = (err?.code || '').replace(/^functions\//, '');

  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return 'No connection to the school system. Check your internet and try again.';
  }
  if (code === 'not-found' || code === 'no-match') {
    return "We couldn't find any learners linked to that phone number. Please confirm the number with the school office.";
  }
  if (code === 'permission-denied') {
    return 'The school records service refused the request. Please contact the school office.';
  }
  if (code === 'unauthenticated') {
    return 'The school records service rejected the request. Please refresh and try again.';
  }
  if (code === 'invalid-argument') {
    return err?.message || 'That request was rejected by the school records service. Please check the phone number and try again.';
  }

  // Only fall back to the generic line when we truly have nothing better.
  if (err?.message && err.message !== 'internal' && !/^[A-Za-z]+(\/[A-Za-z-]+)?$/.test(err.message)) {
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}

// ───────────────────────── transport ─────────────────────────

let functionsP: Promise<{
  fns: Functions;
  httpsCallable: typeof import('firebase/functions').httpsCallable;
}> | null = null;

function loadFunctions() {
  functionsP ??= Promise.all([
    import('firebase/functions'),
    import('@/lib/firebase'),
  ]).then(([m, fb]) => ({
    fns: m.getFunctions(fb.app, PORTAL_REGION),
    httpsCallable: m.httpsCallable,
  }));
  return functionsP;
}

async function call<Res>(data: Record<string, unknown>, timeout = 60_000): Promise<Res> {
  const { fns, httpsCallable } = await loadFunctions();
  try {
    const res = await httpsCallable<Record<string, unknown>, Res>(fns, 'portal', {
      timeout,
    })(data);
    return res.data;
  } catch (e) {
    // Keep the original code so the UI can branch, but expose a
    // user-safe message through portalErrorMessage().
    const raw = e as { code?: string; message?: string; details?: unknown };
    const code = (raw?.code || 'internal').replace(/^functions\//, '');
    // eslint-disable-next-line no-console
    console.error('[portalApi] cloud function failed:', { code, raw });
    throw new PortalError(portalErrorMessage({ code, message: raw?.message, details: raw?.details }), code, raw?.details, isUnreachable(code, raw?.message));
  }
}

/**
 * The function answers every error with a sentence (HttpsError message).
 * A bare code instead ("internal", "not-found", "Not Found") means the
 * request never reached it: a missing function answers 404 without CORS
 * headers, which the SDK reports as "internal".
 */
function isUnreachable(code: string, message?: string): boolean {
  if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'unimplemented') return true;
  const m = (message || '').trim();
  return !m || /^[a-z]+([ _-][a-z]+)*$/i.test(m);
}

/** Once the function is found missing, later calls go straight to Firestore. */
let directMode = false;

/**
 * Ask the function; if it cannot be reached, do the same work in the
 * browser (portalDirect). Errors the function itself returns are shown as
 * they are.
 */
async function viaPortal<T>(remote: () => Promise<T>, direct: () => Promise<T>): Promise<T> {
  if (!directMode) {
    try {
      return await remote();
    } catch (e) {
      if (!(e instanceof PortalError) || !e.unreachable) throw e;
      // eslint-disable-next-line no-console
      console.warn('[portalApi] the portal function is not reachable; reading the school records directly.');
      directMode = true;
    }
  }
  try {
    return await direct();
  } catch (e) {
    if (e instanceof PortalError) throw e;
    const err = e as { code?: string; message?: string };
    if (err?.code === 'permission-denied') {
      throw new PortalError(
        'The school records service is not available right now. Please try again later or contact the school office.',
        'permission-denied'
      );
    }
    // checkSponsorCode / redeemSponsorCode throw sentences meant for the sponsor.
    throw new PortalError(err?.message || 'Something went wrong. Please try again.', err?.code || 'internal');
  }
}

/**
 * Guardians and sponsors only get a term the school has published. Checked
 * here as well as in the report card builder, so the answer is the same
 * whether the portal function or the browser fallback builds the cards.
 */
async function requireReleased(term: string, year: number): Promise<void> {
  // Loaded on demand, like Firebase above, to keep this module light.
  const { isTermReleased, ResultsNotReleasedError } = await import('@/services/resultsPublication');
  let released: boolean;
  try {
    released = await isTermReleased(term, year);
  } catch (e) {
    const err = e as { message?: string };
    throw new PortalError(
      'We could not check whether these results have been released. Please try again.',
      'internal',
      err?.message
    );
  }
  if (!released) {
    const notReleased = new ResultsNotReleasedError(term, year);
    throw new PortalError(notReleased.message, notReleased.code);
  }
}

/** For tests. */
export function resetPortalMode() {
  directMode = false;
}

// ───────────────────────── API ─────────────────────────

export const portalApi = {
  /**
   * The active learners linked to a guardian phone number.
   * Returns [] when the phone is valid but matches nothing — that is a
   * normal empty state, not an error.
   */
  async parentChildren(phone: string): Promise<PortalChild[]> {
    const clean = (phone || '').trim();
    if (!clean) return [];

    const res = await viaPortal(
      () => call<{ children?: PortalChild[] }>({ action: 'parentChildren', phone: clean }),
      async () => ({ children: await portalDirect.parentChildren(clean) })
    );

    if (!Array.isArray(res?.children)) {
      // Server responded but the shape was wrong — surface a real error
      // instead of letting .map() blow up in the page.
      // eslint-disable-next-line no-console
      console.error('[portalApi.parentChildren] unexpected response:', res);
      throw new PortalError(
        'The school records service returned an unexpected response. Please try again.',
        'internal'
      );
    }

    return res.children;
  },

  /**
   * One child's report card (null when there are no results for the term).
   */
  async parentReport(
    phone: string,
    learnerId: string,
    term: string,
    year: number
  ): Promise<PortalReportCard | null> {
    const clean = (phone || '').trim();
    if (!clean || !learnerId) return null;

    await requireReleased(term, year);

    const res = await viaPortal(
      () => call<{ reportCard?: PortalReportCard | null }>({ action: 'parentReport', phone: clean, learnerId, term, year }),
      async () => ({ reportCard: await portalDirect.parentReport(clean, learnerId, term, year) })
    );

    // `undefined` means the server didn't include the field at all — treat
    // it as "no results" but log it so we notice server-shape drift.
    if (res?.reportCard === undefined) {
      // eslint-disable-next-line no-console
      console.warn('[portalApi.parentReport] server returned no reportCard field:', res);
      return null;
    }

    return res.reportCard;
  },

  /** Check a sponsor code without using it. */
  async sponsorCheck(code: string): Promise<PortalSponsorCode> {
    const clean = (code || '').trim();
    if (!clean) {
      throw new PortalError('Please enter a sponsor code.', 'invalid-argument');
    }
    const res = await viaPortal(
      () => call<{ code?: PortalSponsorCode }>({ action: 'sponsorCheck', code: clean }),
      async () => ({ code: await portalDirect.sponsorCheck(clean) })
    );
    if (!res?.code) {
      throw new PortalError('That sponsor code could not be checked.', 'internal');
    }
    // Before any report is built and before the code could be spent.
    await requireReleased(res.code.term, res.code.year);
    return res.code;
  },

  /** The report cards in a sponsor code (may take a while for many learners). */
  async sponsorReports(code: string): Promise<SponsorReports> {
    const clean = (code || '').trim();
    if (!clean) {
      throw new PortalError('Please enter a sponsor code.', 'invalid-argument');
    }
    const res = await viaPortal(
      () => call<{ reports?: SponsorReports }>({ action: 'sponsorReports', code: clean }, 300_000),
      async () => ({ reports: await portalDirect.sponsorReports(clean) })
    );
    if (!res?.reports) {
      throw new PortalError(
        'The sponsor reports could not be generated. Please try again.',
        'internal'
      );
    }
    // The portal function builds these from the code's own term; hold back
    // any term that is not published.
    const seen = new Set<string>();
    for (const card of res.reports.cards ?? []) {
      const key = `${card.term}|${card.year}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await requireReleased(card.term, Number(card.year));
    }
    return res.reports;
  },

  /** Spend the code once the PDF is ready. */
  async sponsorRedeem(code: string): Promise<void> {
    const clean = (code || '').trim();
    if (!clean) {
      throw new PortalError('Please enter a sponsor code.', 'invalid-argument');
    }
    await viaPortal(
      () => call<{ ok: true }>({ action: 'sponsorRedeem', code: clean }),
      async () => { await portalDirect.sponsorRedeem(clean); return { ok: true as const }; }
    );
  },
};