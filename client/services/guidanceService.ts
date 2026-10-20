// @/services/guidanceService.ts
//
// Guidance & counselling on Firestore.
//
//   staff_roles/{teacherId}__guidance-officer   who may use the module (admin sets)
//   sponsor_codes/{code}                        one-time codes for sponsors
//
// A code fixes, when it is made: the sponsor's name, the learners it covers,
// and the term/year of the reports. The sponsor types it into the Parent
// Portal (signed out). The portal first checks the code, builds the PDF,
// and only then spends the code in a transaction — so a code is never used
// up by a download that failed half way, and two people typing the same
// code at once cannot both get the reports.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Timestamp,
  type DocumentData,
} from '@/lib/auditedFirestore';
import { db } from '@/lib/firebase';
import { GUIDANCE_OFFICER_ROLE, SPONSOR_CODES, type SponsorCode } from '@/types/guidance';
import { codeProblem, generateCodeString, normalizeCodeInput, sortCardsByForm } from './guidancePlan';
import { resultsService, type ReportCardData } from './resultsService';

const STAFF_ROLES = 'staff_roles';

const toDate = (v: any): Date | undefined =>
  !v ? undefined : v instanceof Date ? v : typeof v.toDate === 'function' ? v.toDate() : typeof v === 'string' ? new Date(v) : v.seconds ? new Date(v.seconds * 1000) : undefined;

export interface Actor {
  uid: string;
  name: string;
}

// ==================== ROLE ====================

export interface GuidanceRole {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherEmail?: string;
  status: 'active' | 'ended';
  startDate?: Date;
  endDate?: Date | null;
}

export const guidanceRoleDocId = (teacherId: string) => `${teacherId}__${GUIDANCE_OFFICER_ROLE}`;

export async function listGuidanceOfficers(): Promise<GuidanceRole[]> {
  const snap = await getDocs(query(collection(db, STAFF_ROLES), where('role', '==', GUIDANCE_OFFICER_ROLE)));
  return snap.docs
    .map(d => {
      const x = d.data();
      return {
        id: d.id,
        teacherId: x.teacherId,
        teacherName: x.teacherName || '',
        teacherEmail: x.teacherEmail ?? undefined,
        status: x.status === 'active' ? 'active' : 'ended',
        startDate: toDate(x.startDate),
        endDate: toDate(x.endDate) ?? null,
      } as GuidanceRole;
    })
    .sort((a, b) => (a.status === b.status ? a.teacherName.localeCompare(b.teacherName) : a.status === 'active' ? -1 : 1));
}

export async function isGuidanceOfficer(teacherId: string | undefined | null): Promise<boolean> {
  if (!teacherId) return false;
  try {
    const snap = await getDoc(doc(db, STAFF_ROLES, guidanceRoleDocId(teacherId)));
    return snap.exists() && snap.data()?.status === 'active';
  } catch {
    return false;
  }
}

export async function assignGuidanceOfficer(teacher: { id: string; name: string; email?: string }, by: Actor): Promise<void> {
  const ref = doc(db, STAFF_ROLES, guidanceRoleDocId(teacher.id));
  const snap = await getDoc(ref);
  const history = (snap.exists() ? snap.data()?.history : null) ?? [];
  await setDoc(ref, {
    teacherId: teacher.id,
    teacherName: teacher.name,
    teacherEmail: teacher.email ?? null,
    role: GUIDANCE_OFFICER_ROLE,
    status: 'active',
    startDate: new Date(),
    endDate: null,
    assignedBy: by.uid,
    assignedByName: by.name,
    history: [...history, { action: 'assigned', at: new Date().toISOString(), byName: by.name }],
    updatedAt: serverTimestamp(),
  });
}

export async function endGuidanceOfficer(teacherId: string, by: Actor): Promise<void> {
  const ref = doc(db, STAFF_ROLES, guidanceRoleDocId(teacherId));
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const history = snap.data()?.history ?? [];
  await updateDoc(ref, {
    status: 'ended',
    endDate: new Date(),
    history: [...history, { action: 'ended', at: new Date().toISOString(), byName: by.name }],
    updatedAt: serverTimestamp(),
  });
}

// ==================== CODES ====================

function mapCode(id: string, d: DocumentData): SponsorCode {
  return {
    code: id,
    sponsorName: d.sponsorName || '',
    sponsorKeys: Array.isArray(d.sponsorKeys) ? d.sponsorKeys : [],
    learnerIds: Array.isArray(d.learnerIds) ? d.learnerIds : [],
    learnerCount: typeof d.learnerCount === 'number' ? d.learnerCount : (d.learnerIds?.length ?? 0),
    term: d.term || '',
    year: Number(d.year) || 0,
    status: d.status === 'used' || d.status === 'revoked' ? d.status : 'active',
    createdAt: toDate(d.createdAt),
    createdBy: d.createdBy || '',
    createdByName: d.createdByName || '',
    expiresAt: toDate(d.expiresAt),
    usedAt: toDate(d.usedAt) ?? null,
    revokedAt: toDate(d.revokedAt) ?? null,
    revokedByName: d.revokedByName ?? null,
  };
}

export interface NewSponsorCode {
  sponsorName: string;
  sponsorKeys: string[];
  learnerIds: string[];
  term: string;
  year: number;
  /** Days an unused code stays valid. */
  validDays: number;
}

export async function createSponsorCode(input: NewSponsorCode, by: Actor): Promise<SponsorCode> {
  const learnerIds = Array.from(new Set(input.learnerIds));
  if (!input.sponsorName.trim()) throw new Error('Choose a sponsor first.');
  if (learnerIds.length === 0) throw new Error('This sponsor has no learners to include.');
  if (learnerIds.length > 1500) throw new Error('Too many learners for one code.');

  // A clash is practically impossible (31^8 codes), but check anyway.
  let code = generateCodeString();
  for (let i = 0; i < 5 && (await getDoc(doc(db, SPONSOR_CODES, code))).exists(); i++) code = generateCodeString();

  const expiresAt = new Date(Date.now() + Math.max(1, input.validDays) * 24 * 60 * 60 * 1000);
  await setDoc(doc(db, SPONSOR_CODES, code), {
    sponsorName: input.sponsorName.trim(),
    sponsorKeys: Array.from(new Set(input.sponsorKeys)),
    learnerIds,
    learnerCount: learnerIds.length,
    term: input.term,
    year: Number(input.year),
    status: 'active',
    createdAt: serverTimestamp(),
    createdBy: by.uid,
    createdByName: by.name,
    expiresAt: Timestamp.fromDate(expiresAt),
    usedAt: null,
  });
  return {
    code,
    sponsorName: input.sponsorName.trim(),
    sponsorKeys: input.sponsorKeys,
    learnerIds,
    learnerCount: learnerIds.length,
    term: input.term,
    year: Number(input.year),
    status: 'active',
    createdAt: new Date(),
    createdBy: by.uid,
    createdByName: by.name,
    expiresAt,
    usedAt: null,
  };
}

export async function listSponsorCodes(max = 300): Promise<SponsorCode[]> {
  const snap = await getDocs(query(collection(db, SPONSOR_CODES), orderBy('createdAt', 'desc'), limit(max)));
  return snap.docs.map(d => mapCode(d.id, d.data()));
}

export async function revokeSponsorCode(code: string, by: Actor): Promise<void> {
  await updateDoc(doc(db, SPONSOR_CODES, code), {
    status: 'revoked',
    revokedAt: serverTimestamp(),
    revokedByName: by.name,
  });
}

/**
 * Look a typed code up WITHOUT using it (Parent Portal, step 1).
 * Throws an Error whose message can be shown to the sponsor.
 */
export async function checkSponsorCode(typed: string): Promise<SponsorCode> {
  const code = normalizeCodeInput(typed);
  if (!code) throw new Error('A sponsor code looks like SP-7KQ3-M9XP. Please check what you typed.');
  const snap = await getDoc(doc(db, SPONSOR_CODES, code));
  const found = snap.exists() ? mapCode(snap.id, snap.data()) : null;
  const problem = codeProblem(found);
  if (problem) throw new Error(problem);
  return found!;
}

/**
 * Spend the code (Parent Portal, last step, once the PDF is ready).
 * Fails if someone used, cancelled or outlived it in the meantime.
 */
export async function redeemSponsorCode(code: string): Promise<void> {
  await runTransaction(db, async tx => {
    const ref = doc(db, SPONSOR_CODES, code);
    const snap = await tx.get(ref);
    const problem = codeProblem(snap.exists() ? mapCode(snap.id, snap.data()) : null);
    if (problem) throw new Error(problem);
    tx.update(ref, { status: 'used', usedAt: serverTimestamp() });
  });
}

// ==================== REPORTS ====================

export interface SponsoredLearnerLite {
  id: string;
  fullName: string;
  studentId: string;
  className: string;
}

export interface SponsorReports {
  /** In order of form/grade, then class, then name. */
  cards: ReportCardData[];
  /** Learners in the code without any results for the term. */
  noResults: SponsoredLearnerLite[];
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * The report cards of a list of learners for one term — the same cards the
 * admin and parents see. `publicView` for the signed-out Parent Portal.
 */
export async function buildSponsorReports(
  learnerIds: string[],
  term: string,
  year: number,
  opts: { publicView?: boolean; onProgress?: (done: number, total: number) => void } = {}
): Promise<SponsorReports> {
  const ids = Array.from(new Set(learnerIds));
  let done = 0;
  const results = await pool(ids, 4, async id => {
    const [card, learnerSnap] = await Promise.all([
      resultsService
        .generateReportCard(id, term, year, { includeIncomplete: true, markMissing: true, publicView: opts.publicView })
        .catch(() => null),
      getDoc(doc(db, 'learners', id)).catch(() => null),
    ]);
    done++;
    opts.onProgress?.(done, ids.length);
    const d = learnerSnap?.exists() ? learnerSnap.data() : null;
    const lite: SponsoredLearnerLite = {
      id,
      fullName: d?.fullName || d?.name || 'Unknown learner',
      studentId: d?.studentId || '',
      className: d?.className || '',
    };
    return { card, lite };
  });
  return {
    cards: sortCardsByForm(results.filter(r => r.card).map(r => r.card!)),
    noResults: results
      .filter(r => !r.card)
      .map(r => r.lite)
      .sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }) || a.fullName.localeCompare(b.fullName)),
  };
}
