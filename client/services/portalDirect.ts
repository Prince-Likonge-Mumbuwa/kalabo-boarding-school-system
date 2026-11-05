// @/services/portalDirect.ts
//
// The Parent Portal and Sponsor Portal WITHOUT the Cloud Function `portal`:
// the same lookups done in the browser, straight from Firestore — how the
// portals worked before the function existed.
//
// portalApi uses this only when the function cannot be reached (not
// deployed yet, or down). It works while the Firestore rules still let
// signed-out visitors read learners and results; once the security update
// closes those reads, the function is the only way in (and by then it is
// deployed, so this is never used).
//
// Only PUBLISHED terms are shown (resultsPublication.ts): the report card
// builder refuses an unpublished term for a public view.

import type { PortalChild, PortalReportCard, PortalSponsorCode } from './portalApi';
import type { SponsorReports } from './guidanceService';

const toChild = (l: { id: string; studentId?: string; fullName?: string; name?: string; className?: string }): PortalChild => ({
  id: l.id,
  studentId: l.studentId || '',
  fullName: l.fullName || l.name || 'Unknown',
  className: l.className || '',
});

export const portalDirect = {
  async parentChildren(phone: string): Promise<PortalChild[]> {
    const { learnerService } = await import('./schoolService');
    const learners = await learnerService.getLearnersByGuardianPhone(phone);
    return learners.map(toChild);
  },

  async parentReport(phone: string, learnerId: string, term: string, year: number): Promise<PortalReportCard | null> {
    // Only a child linked to this guardian number (same check as the function).
    const children = await portalDirect.parentChildren(phone);
    if (!children.some(c => c.id === learnerId)) return null;
    const { resultsService } = await import('./resultsService');
    return resultsService.generateReportCard(learnerId, term, year, {
      includeIncomplete: true,
      markMissing: true,
      publicView: true,
    });
  },

  async sponsorCheck(code: string): Promise<PortalSponsorCode> {
    const { checkSponsorCode } = await import('./guidanceService');
    const c = await checkSponsorCode(code);
    return { code: c.code, sponsorName: c.sponsorName, term: c.term, year: c.year, learnerCount: c.learnerCount };
  },

  async sponsorReports(code: string): Promise<SponsorReports> {
    const { checkSponsorCode, buildSponsorReports } = await import('./guidanceService');
    const c = await checkSponsorCode(code);
    // Say "not released" once, up front, instead of per learner (a learner
    // whose card cannot be built is listed as "no results").
    const { assertTermReleased } = await import('./resultsPublication');
    await assertTermReleased(c.term, c.year);
    return buildSponsorReports(c.learnerIds, c.term, c.year, { publicView: true });
  },

  async sponsorRedeem(code: string): Promise<void> {
    const { redeemSponsorCode } = await import('./guidanceService');
    const { normalizeCodeInput } = await import('./guidancePlan');
    await redeemSponsorCode(normalizeCodeInput(code) || code);
  },
};
