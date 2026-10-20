// @/types/guidance.ts
//
// Guidance & counselling: the admin makes some teachers GUIDANCE OFFICERS.
// They see the results of learners grouped by sponsor (the organisation
// paying for them) and give each sponsor a ONE-TIME CODE. The sponsor types
// the code into the Parent Portal and downloads every report card for the
// learners they sponsor in one PDF, in order of form/grade. Once used, the
// code is spent; the next download needs a new code.

/** `staff_roles/{teacherId}__guidance-officer` */
export const GUIDANCE_OFFICER_ROLE = 'guidance-officer';

/** `sponsor_codes/{code}` — the document id IS the code (e.g. SP-7KQ3-M9XP). */
export const SPONSOR_CODES = 'sponsor_codes';

export type SponsorCodeStatus = 'active' | 'used' | 'revoked';

export interface SponsorCode {
  code: string;
  /** Name shown to the sponsor and on the PDF cover. */
  sponsorName: string;
  /** Normalised sponsor names the code covers (spellings merged by the officer). */
  sponsorKeys: string[];
  /** Learners included, fixed when the code is made. */
  learnerIds: string[];
  learnerCount: number;
  term: string;
  year: number;
  status: SponsorCodeStatus;
  createdAt?: Date;
  createdBy: string;
  createdByName: string;
  /** An unused code stops working after this date. */
  expiresAt?: Date;
  usedAt?: Date | null;
  revokedAt?: Date | null;
  revokedByName?: string | null;
}

/** What the list shows: `used`/`revoked` as stored, `expired` when past its date. */
export type SponsorCodeDisplayStatus = SponsorCodeStatus | 'expired';

export interface SponsorGroup {
  /** Normalised name, used to match spellings. */
  key: string;
  /** The spelling most learners have. */
  name: string;
  /** Every spelling seen for this key. */
  spellings: string[];
  learnerIds: string[];
  count: number;
}
