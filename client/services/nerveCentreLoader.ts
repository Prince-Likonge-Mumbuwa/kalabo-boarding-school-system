// @/services/nerveCentreLoader.ts
//
// Firestore reads for the admin nerve centre (pure calculations are in
// nerveCentre.ts). Each loader is small and independent so the dashboard
// panels load (and fail) separately.

import { collection, getDocs, limit, orderBy, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { mapSlot, resolveAuthority } from '@/services/assignmentEngine';
import { examConfigService } from '@/services/examConfigService';
import { loadTermResults } from '@/services/resultsGridLoader';
import { listHolidays } from '@/services/timetableService';
import { mapAppEntry, type AuditRow } from '@/services/auditService';
import type { ClassLite, DailyRegister, LearnerLite, ResultRow, SlotLite, TeacherLite } from '@/services/nerveCentre';

const toDate = (v: any): Date | null =>
  !v ? null : v instanceof Date ? v : typeof v.toDate === 'function' ? v.toDate() : typeof v.seconds === 'number' ? new Date(v.seconds * 1000) : typeof v === 'string' ? new Date(v) : null;

export async function loadClassesLite(): Promise<ClassLite[]> {
  const snap = await getDocs(collection(db, 'classes'));
  return snap.docs.map(d => {
    const x = d.data();
    return {
      id: d.id,
      name: x.name || d.id,
      type: x.type ?? null,
      level: typeof x.level === 'number' ? x.level : Number(x.level) || null,
      formTeacherId: x.formTeacherId || null,
      isActive: x.isActive !== false && !x.archived,
    };
  });
}

/** Active learners (status active or none), with the fields the dashboard uses. */
export async function loadLearnersLite(): Promise<LearnerLite[]> {
  const snap = await getDocs(collection(db, 'learners'));
  return snap.docs
    .map(d => {
      const x = d.data();
      return {
        id: d.id,
        fullName: x.fullName || x.name || '',
        studentId: x.studentId || '',
        classId: x.classId || '',
        className: x.className || '',
        classLevel: typeof x.classLevel === 'number' ? x.classLevel : Number(x.classLevel) || null,
        gender: x.gender ?? null,
        status: x.status ?? null,
        dateOfBirth: x.dateOfBirth ?? null,
        guardianPhone: x.guardianPhone ?? null,
        parentPhone: x.parentPhone ?? null,
        sponsor: x.sponsor ?? null,
        dateOfFirstEntry: x.dateOfFirstEntry ?? null,
        createdAt: toDate(x.createdAt),
      } as LearnerLite;
    })
    .filter(l => !l.status || l.status === 'active');
}

/** Daily registers of each class between two dates (one small query per class). */
export async function loadDailyRegisters(classIds: string[], from: string, to: string): Promise<DailyRegister[]> {
  const per = await Promise.all(
    classIds.map(async classId => {
      const snap = await getDocs(query(
        collection(db, 'attendance_sessions'),
        where('classId', '==', classId),
        where('kind', '==', 'daily'),
        where('date', '>=', from),
        where('date', '<=', to),
      ));
      return snap.docs.map(d => {
        const x = d.data();
        const s = x.summary ?? {};
        return {
          classId,
          className: x.className || classId,
          date: x.date,
          summary: { total: s.total || 0, present: s.present || 0, absent: s.absent || 0, late: s.late || 0, excused: s.excused || 0 },
          roster: x.roster && typeof x.roster === 'object' ? x.roster : undefined,
        } as DailyRegister;
      });
    }),
  );
  return per.flat();
}

export async function loadTermRows(term: string, year: number): Promise<ResultRow[]> {
  return (await loadTermResults(term, year)) as ResultRow[];
}

export async function loadTermConfigs(term: string, year: number) {
  return examConfigService.getConfigs({ term: term as any, year });
}

export async function loadTeachersLite(): Promise<TeacherLite[]> {
  const snap = await getDocs(query(collection(db, 'users'), where('userType', '==', 'teacher')));
  return snap.docs.map(d => ({ id: d.id, name: d.data().fullName || d.data().name || 'Teacher', status: d.data().status ?? 'active' }));
}

export async function loadSlotsLite(now = new Date()): Promise<SlotLite[]> {
  const snap = await getDocs(collection(db, 'class_slots'));
  return snap.docs.map(d => {
    const s = mapSlot(d.id, d.data());
    const a = resolveAuthority(s, now);
    return {
      classId: s.classId,
      className: s.className,
      subject: s.subject,
      ownerTeacherId: s.ownerTeacherId,
      isFormTeacherSlot: !!s.isFormTeacherSlot,
      delegationState: a.delegationState,
      operatorTeacherName: a.operatorTeacherName ?? null,
    };
  });
}

export async function loadHolidaysBetween(from: string, to: string) {
  return listHolidays(from, to);
}

/** SMS that failed in the last `days` days. */
export async function loadSmsFailures(days = 7): Promise<number> {
  const since = Timestamp.fromDate(new Date(Date.now() - days * 86_400_000));
  const [sent, attempted] = await Promise.all([
    getDocs(query(collection(db, 'sms_logs'), where('sentAt', '>=', since))),
    getDocs(query(collection(db, 'sms_logs'), where('attemptedAt', '>=', since))),
  ]);
  const ids = new Set<string>();
  for (const d of [...sent.docs, ...attempted.docs]) if (d.data().status === 'failed') ids.add(d.id);
  return ids.size;
}

/** The latest changes from the audit trail (sign-ins left out). */
export async function loadRecentActivity(max = 12): Promise<AuditRow[]> {
  const snap = await getDocs(query(collection(db, 'audit_log'), orderBy('at', 'desc'), limit(max * 3)));
  return snap.docs
    .map(d => mapAppEntry(d.id, d.data()))
    .filter(r => r.ops.length > 0 && !r.ops.every(o => o.collection === 'session'))
    .slice(0, max);
}

/** Active sponsor codes that expire within `days` days. */
export async function loadSponsorCodesExpiring(days = 3): Promise<number> {
  const { listSponsorCodes } = await import('@/services/guidanceService');
  const { displayStatus } = await import('@/services/guidancePlan');
  const soon = Date.now() + days * 86_400_000;
  return (await listSponsorCodes()).filter(c => displayStatus(c) === 'active' && c.expiresAt && c.expiresAt.getTime() <= soon).length;
}
