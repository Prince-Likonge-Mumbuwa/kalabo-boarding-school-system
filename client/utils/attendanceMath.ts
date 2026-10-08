// @/utils/attendanceMath.ts
//
// Pure attendance math. No Firebase, no network, no React.
// Sessions in, rollups/indexes out. Runs in the browser.
// Replaces the deleted attendance Cloud Functions.

import type {
  AttendanceSession,
  AttendanceDailyRollup,
  StudentAttendanceIndex,
  WindowStats,
  AttendanceStatus,
} from '@/types/attendance';
import type { Learner } from '@/types/school';

const RISK = {
  OVERALL_RATE: 75,
  CONSECUTIVE_ABSENCES: 3,
  DITCHING_COUNT: 3,
  SUBJECT_RATE: 60,
  SUBJECT_ALERT_RATE: 75,
  HIGH_FACTORS: 3,
} as const;

const RECENT_LIMIT = 5;

// ── Date helpers ──────────────────────────────────────────────────────

export function formatLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function daysAgoYMD(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - days);
  return formatLocalYMD(dt);
}

export function isWeekday(ymd: string): boolean {
  const [y, m, d] = ymd.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day >= 1 && day <= 5;
}

// ── Window helpers ────────────────────────────────────────────────────

function emptyWindow(): WindowStats {
  return { total: 0, present: 0, absent: 0, late: 0, excused: 0, rate: 0 };
}

function accumulate(w: WindowStats, status: AttendanceStatus): void {
  w.total++;
  if (status === 'present') w.present++;
  else if (status === 'absent') w.absent++;
  else if (status === 'late') w.late++;
  else if (status === 'excused') w.excused++;
}

function finalizeWindow(w: WindowStats): WindowStats {
  return { ...w, rate: w.total > 0 ? ((w.present + w.late) / w.total) * 100 : 0 };
}

// ── buildRollup ───────────────────────────────────────────────────────

export function buildRollup(
  classId: string,
  className: string,
  date: string,
  sessions: AttendanceSession[],
  learnersById: Map<string, Learner>,
): AttendanceDailyRollup {
  const daily = sessions.find(s => s.kind === 'daily');
  const periodic = sessions.filter(s => s.kind === 'periodic');

  let dailySummary: AttendanceDailyRollup['daily'];
  if (daily) {
    let boysPresent = 0, girlsPresent = 0, boysAbsent = 0, girlsAbsent = 0;
    for (const [studentId, status] of Object.entries(daily.roster)) {
      const g = learnersById.get(studentId)?.gender;
      if (!g) continue;
      if (status === 'present' || status === 'late') {
        if (g === 'male') boysPresent++; else girlsPresent++;
      } else if (status === 'absent' || status === 'excused') {
        if (g === 'male') boysAbsent++; else girlsAbsent++;
      }
    }
    const { total, present, absent, late, excused } = daily.summary;
    dailySummary = {
      total, present, absent, late, excused,
      rate: total > 0 ? ((present + late) / total) * 100 : 0,
      boysPresent, girlsPresent, boysAbsent, girlsAbsent,
    };
  }

  const byPeriod: AttendanceDailyRollup['periodicTotals']['byPeriod'] = {};
  const bySubject: AttendanceDailyRollup['periodicTotals']['bySubject'] = {};
  const teachers = new Set<string>();

  for (const s of periodic) {
    if (!s.period || !s.subject) continue;
    teachers.add(s.markedByName);

    const pb = (byPeriod[s.period] ||= { present: 0, absent: 0, late: 0, excused: 0, total: 0 });
    const sb = (bySubject[s.subject] ||= { present: 0, absent: 0, late: 0, excused: 0, total: 0 });
    for (const k of ['present', 'absent', 'late', 'excused', 'total'] as const) {
      pb[k] += s.summary[k];
      sb[k] += s.summary[k];
    }
  }

  const lateArrivals: AttendanceDailyRollup['lateArrivals'] = [];
  const p1 = periodic.find(s => s.period === 1);
  if (daily && p1) {
    for (const [studentId, p1Status] of Object.entries(p1.roster)) {
      if (
        daily.roster[studentId] === 'absent' &&
        (p1Status === 'present' || p1Status === 'late')
      ) {
        lateArrivals.push({
          studentId,
          studentName: learnersById.get(studentId)?.fullName ?? '',
          date,
          firstPeriodSubject: p1.subject ?? '',
        });
      }
    }
  }

  const perStudent = new Map<string, Map<string, { present: number; total: number }>>();
  for (const s of periodic) {
    if (!s.subject) continue;
    for (const [studentId, status] of Object.entries(s.roster)) {
      let subjects = perStudent.get(studentId);
      if (!subjects) { subjects = new Map(); perStudent.set(studentId, subjects); }
      const bucket = subjects.get(s.subject) ?? { present: 0, total: 0 };
      bucket.total++;
      if (status === 'present' || status === 'late') bucket.present++;
      subjects.set(s.subject, bucket);
    }
  }

  const subjectAlerts: AttendanceDailyRollup['subjectAlerts'] = [];
  for (const [studentId, subjects] of perStudent) {
    for (const [subject, { present, total }] of subjects) {
      const rate = total > 0 ? (present / total) * 100 : 0;
      if (rate < RISK.SUBJECT_ALERT_RATE) {
        subjectAlerts.push({
          studentId,
          studentName: learnersById.get(studentId)?.fullName ?? '',
          subject,
          rate: Math.round(rate * 10) / 10,
          missed: total - present,
          total,
        });
      }
    }
  }
  subjectAlerts.sort((a, b) => a.rate - b.rate);

  return {
    id: `${classId}_${date}`,
    classId, className, date,
    daily: dailySummary,
    periodicTotals: {
      sessionCount: periodic.length,
      byPeriod, bySubject,
      distinctTeachers: Array.from(teachers).sort(),
    },
    lateArrivals,
    subjectAlerts,
    updatedAt: new Date(),
    schemaVersion: 1,
  };
}

// ── computeStudentIndex ───────────────────────────────────────────────

export function computeStudentIndex(
  studentId: string,
  studentName: string,
  classId: string,
  className: string,
  sessions: AttendanceSession[],
  today: string,
): StudentAttendanceIndex {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const daily = sorted.filter(s => s.kind === 'daily');
  const periodic = sorted.filter(s => s.kind === 'periodic');

  const cutoff7 = daysAgoYMD(today, 6);
  const cutoff30 = daysAgoYMD(today, 29);

  const last7 = emptyWindow();
  const last30 = emptyWindow();
  const term = emptyWindow();

  for (const s of daily) {
    const status = s.roster[studentId];
    if (!status) continue;
    accumulate(term, status);
    if (s.date >= cutoff30) accumulate(last30, status);
    if (s.date >= cutoff7) accumulate(last7, status);
  }

  let consecutive = 0;
  for (let i = daily.length - 1; i >= 0; i--) {
    const st = daily[i].roster[studentId];
    if (st === 'absent') consecutive++;
    else if (st === undefined) continue;
    else break;
  }

  let lastAbsentDate: string | null = null;
  for (let i = daily.length - 1; i >= 0; i--) {
    if (daily[i].roster[studentId] === 'absent') {
      lastAbsentDate = daily[i].date;
      break;
    }
  }

  const dailyByDate = new Map(daily.map(s => [s.date, s]));
  const periodicByDate = new Map<string, AttendanceSession[]>();
  for (const s of periodic) {
    if (!s.period || !s.subject) continue;
    const arr = periodicByDate.get(s.date) ?? [];
    arr.push(s);
    periodicByDate.set(s.date, arr);
  }

  const ditching: Array<{ date: string; subject: string; period: number }> = [];
  const late: Array<{ date: string; firstPeriodSubject: string }> = [];

  for (const [date, dayPeriodic] of periodicByDate) {
    const dayDaily = dailyByDate.get(date);
    if (!dayDaily) continue;
    const dailyStatus = dayDaily.roster[studentId];

    if (dailyStatus === 'present' || dailyStatus === 'late') {
      for (const s of dayPeriodic) {
        const st = s.roster[studentId];
        const excuse = s.excuseReasons?.[studentId];
        if (st === 'absent' && !excuse) {
          ditching.push({ date, subject: s.subject!, period: s.period! });
        }
      }
    }

    if (dailyStatus === 'absent') {
      const p1 = dayPeriodic.find(s => s.period === 1);
      const p1Status = p1?.roster[studentId];
      if (p1 && (p1Status === 'present' || p1Status === 'late')) {
        late.push({ date, firstPeriodSubject: p1.subject! });
      }
    }
  }

  ditching.sort((a, b) => a.date.localeCompare(b.date));
  late.sort((a, b) => a.date.localeCompare(b.date));

  const recentDitching = ditching.slice(-RECENT_LIMIT).reverse();
  const recentLate = late.slice(-RECENT_LIMIT).reverse();

  const bySubject = new Map<string, { present: number; total: number }>();
  for (const s of periodic) {
    if (!s.subject) continue;
    const st = s.roster[studentId];
    if (!st) continue;
    const b = bySubject.get(s.subject) ?? { present: 0, total: 0 };
    b.total++;
    if (st === 'present' || st === 'late') b.present++;
    bySubject.set(s.subject, b);
  }

  const riskFactors: string[] = [];
  const r30 = finalizeWindow(last30);

  if (r30.total > 0 && r30.rate < RISK.OVERALL_RATE) {
    riskFactors.push(`Overall attendance below ${RISK.OVERALL_RATE}% (${r30.rate.toFixed(1)}%)`);
  }
  if (consecutive >= RISK.CONSECUTIVE_ABSENCES) {
    riskFactors.push(`${consecutive} consecutive days absent`);
  }
  if (ditching.length > RISK.DITCHING_COUNT) {
    riskFactors.push(`${ditching.length} ditching incidents`);
  }

  const criticalSubjects: string[] = [];
  for (const [subject, { present, total }] of bySubject) {
    if (total === 0) continue;
    const rate = (present / total) * 100;
    if (rate < RISK.SUBJECT_RATE) criticalSubjects.push(subject);
  }
  if (criticalSubjects.length > 0) {
    riskFactors.push(`Critical absence in: ${criticalSubjects.join(', ')}`);
  }

  let riskLevel: StudentAttendanceIndex['riskLevel'] = 'low';
  if (riskFactors.length >= RISK.HIGH_FACTORS) riskLevel = 'high';
  else if (riskFactors.length >= 1) riskLevel = 'medium';

  return {
    studentId,
    studentName,
    classId,
    className,
    last7Days: finalizeWindow(last7),
    last30Days: r30,
    term: finalizeWindow(term),
    riskLevel,
    riskFactors,
    consecutiveAbsences: consecutive,
    lastAbsentDate,
    recentDitching,
    recentLate,
    updatedAt: new Date(),
    schemaVersion: 1,
  };
}

// ── Batch helpers ─────────────────────────────────────────────────────

export function groupSessionsByClass(
  sessions: AttendanceSession[],
): Map<string, AttendanceSession[]> {
  const map = new Map<string, AttendanceSession[]>();
  for (const s of sessions) {
    const arr = map.get(s.classId) ?? [];
    arr.push(s);
    map.set(s.classId, arr);
  }
  return map;
}

export function indexLearnersByClass(
  learners: Learner[],
): Map<string, Map<string, Learner>> {
  const map = new Map<string, Map<string, Learner>>();
  for (const l of learners) {
    let byId = map.get(l.classId);
    if (!byId) { byId = new Map(); map.set(l.classId, byId); }
    byId.set(l.id, l);
  }
  return map;
}

export function buildRollupsForDate(
  date: string,
  sessions: AttendanceSession[],
  learners: Learner[],
): AttendanceDailyRollup[] {
  const sessionsByClass = groupSessionsByClass(sessions);
  const learnersByClass = indexLearnersByClass(learners);

  const out: AttendanceDailyRollup[] = [];
  for (const [classId, classSessions] of sessionsByClass) {
    const learnersById = learnersByClass.get(classId) ?? new Map();
    const className = classSessions[0]?.className ?? '';
    out.push(buildRollup(classId, className, date, classSessions, learnersById));
  }
  return out;
}

export function buildRollupsForRange(
  sessions: AttendanceSession[],
  learners: Learner[],
): AttendanceDailyRollup[] {
  const byClassDate = new Map<string, AttendanceSession[]>();
  for (const s of sessions) {
    const key = `${s.classId}_${s.date}`;
    const arr = byClassDate.get(key) ?? [];
    arr.push(s);
    byClassDate.set(key, arr);
  }

  const learnersByClass = indexLearnersByClass(learners);

  const out: AttendanceDailyRollup[] = [];
  for (const [key, classDaySessions] of byClassDate) {
    const [classId, date] = key.split('_');
    const learnersById = learnersByClass.get(classId) ?? new Map();
    const className = classDaySessions[0]?.className ?? '';
    out.push(buildRollup(classId, className, date, classDaySessions, learnersById));
  }
  return out;
}