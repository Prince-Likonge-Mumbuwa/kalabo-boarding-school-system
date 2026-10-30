// Parent Portal and Sponsor Portal → the Cloud Function `portal`.
//
// Parents and sponsors are not signed in, and the database is closed to
// signed-out visitors. The function finds a parent's children (by guardian
// number) or a sponsor code's learners, and builds their report cards on the
// server with the same code the app uses (sms-functions/functions/src/portal).
import type { Functions } from 'firebase/functions';
import type { resultsService } from '@/services/resultsService';
import type { SponsorReports } from '@/services/guidanceService';

export const PORTAL_REGION = 'us-central1'; // same region as the SMS and face functions

/** The report card the app builds (same shape on the server). */
export type PortalReportCard = NonNullable<Awaited<ReturnType<typeof resultsService.generateReportCard>>>;

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

let functionsP: Promise<{ fns: Functions; httpsCallable: typeof import('firebase/functions').httpsCallable }> | null = null;
function loadFunctions() {
  functionsP ??= Promise.all([import('firebase/functions'), import('@/lib/firebase')]).then(([m, fb]) => ({
    fns: m.getFunctions(fb.app, PORTAL_REGION),
    httpsCallable: m.httpsCallable,
  }));
  return functionsP;
}

/** A sentence a parent or sponsor can act on. */
export function portalErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string };
  const code = (err?.code || '').replace(/^functions\//, '');
  if (code === 'unavailable' || code === 'deadline-exceeded') return 'No connection to the school system. Check your internet and try again.';
  if (code === 'internal' && (!err.message || err.message === 'internal')) return 'Something went wrong. Please try again.';
  return err?.message || 'Something went wrong. Please try again.';
}

async function call<Res>(data: Record<string, unknown>, timeout = 60_000): Promise<Res> {
  const { fns, httpsCallable } = await loadFunctions();
  try {
    const res = await httpsCallable<Record<string, unknown>, Res>(fns, 'portal', { timeout })(data);
    return res.data;
  } catch (e) {
    throw new Error(portalErrorMessage(e));
  }
}

export const portalApi = {
  /** The active learners linked to a guardian phone number. */
  parentChildren: async (phone: string) =>
    (await call<{ children: PortalChild[] }>({ action: 'parentChildren', phone })).children,

  /** One child's report card (null when there are no results for the term). */
  parentReport: async (phone: string, learnerId: string, term: string, year: number) =>
    (await call<{ reportCard: PortalReportCard | null }>({ action: 'parentReport', phone, learnerId, term, year })).reportCard,

  /** Check a sponsor code without using it. */
  sponsorCheck: async (code: string) => (await call<{ code: PortalSponsorCode }>({ action: 'sponsorCheck', code })).code,

  /** The report cards in a sponsor code (may take a while for many learners). */
  sponsorReports: async (code: string) => (await call<{ reports: SponsorReports }>({ action: 'sponsorReports', code }, 300_000)).reports,

  /** Spend the code once the PDF is ready. */
  sponsorRedeem: async (code: string) => { await call<{ ok: true }>({ action: 'sponsorRedeem', code }); },
};
