// @/services/awardsService.ts
//
// Works out who gets an award certificate: the OVERALL top three learners of
// a term, (a) in each class and (b) across each grade level (all Form 2
// classes together, all Grade 11 classes together, ...).
//
// "Overall" is exactly the report card's overall percentage (resultsGrid →
// learnerProgress): each subject's average over the term's tests (Week 4,
// Week 8, End of Term), then the mean of those subject averages. So a class
// certificate always agrees with the position printed on the report card.
//
// Pure logic — no Firestore, no screen — so it can be tested on its own
// (awardsService.spec.ts). awardsLoader.ts reads the data; the Awards page
// shows the result and prints it with certificatePDF.ts.
//
// RULES
//   • Only learners whose results are COMPLETE are ranked (every test of
//     every subject entered, absent or not conducted — nothing pending).
//     A provisional average could change, so it can't win a certificate.
//   • Only passes qualify (overall 40% and above — the school's one rule).
//   • Ties share a position, like report cards: 82, 82, 80 → 1st, 1st, 3rd
//     ("joint first"). A group can have more than three winners.

import { isPassPercentage } from '@/services/resultsGrid';
import type { AwardPosition, AwardScope, CertificateAward } from '@/services/pdf/certificatePDF';

/* ============================================================
   TYPES
   ============================================================ */

/** One learner's term result, as the report card has it. */
export interface LearnerStanding {
  learnerId: string;
  name: string;
  overallPercentage: number;
  overallGrade: number;
  /** No test still pending in any subject. */
  isComplete: boolean;
  hasAnyMarks: boolean;
}

/** One class and its learners' standings. */
export interface ClassStanding {
  classId: string;
  className: string;
  type: 'grade' | 'form';
  level: number;
  learners: LearnerStanding[];
}

export interface AwardWinner {
  learnerId: string;
  learnerName: string;
  /** Class name — useful on grade level awards ("Form 2B"). */
  className: string;
  position: AwardPosition;
  tied: boolean;
  percentage: number;
  grade: number;
}

/** The winners of one class or one grade level. */
export interface AwardGroup {
  /** Stable id: "class:abc123" or "level:form-2" */
  id: string;
  scope: AwardScope;
  /** "Form 2A" (class) or "Form 2" (level) */
  groupLabel: string;
  /** For sorting and filtering: "form-2" */
  levelKey: string;
  winners: AwardWinner[];
  /** Learners left out because their results still have pending tests. */
  pendingCount: number;
}

export interface ComputeAwardsOptions {
  scopes?: AwardScope[];
}

/* ============================================================
   LABELS
   ============================================================ */

export const levelKeyOf = (c: Pick<ClassStanding, 'type' | 'level'>) => `${c.type}-${c.level}`;
export const levelLabelOf = (c: Pick<ClassStanding, 'type' | 'level'>) =>
  `${c.type === 'grade' ? 'Grade' : 'Form'} ${c.level}`;

/** "Week 4, Week 8 and End of Term tests" */
export function testsLabel(labels: string[]): string {
  if (labels.length === 0) return 'all tests';
  if (labels.length === 1) return `${labels[0]} tests`;
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]} tests`;
}

/* ============================================================
   RANKING
   ============================================================ */

type Candidate = LearnerStanding & { className: string };

/**
 * Top three positions, ties sharing a place (same as report card positions):
 * 82, 82, 80, 75 → 1, 1, 3 (75 is 4th, so not included).
 */
export function topThree(candidates: Candidate[]): AwardWinner[] {
  const sorted = [...candidates].sort(
    (a, b) => b.overallPercentage - a.overallPercentage || a.name.localeCompare(b.name),
  );
  const winners: AwardWinner[] = [];
  for (const c of sorted) {
    // position = 1 + how many learners scored strictly higher
    const position = sorted.findIndex(o => o.overallPercentage === c.overallPercentage) + 1;
    if (position > 3) break;
    winners.push({
      learnerId: c.learnerId,
      learnerName: c.name,
      className: c.className,
      position: position as AwardPosition,
      tied: sorted.filter(o => o.overallPercentage === c.overallPercentage).length > 1,
      percentage: c.overallPercentage,
      grade: c.overallGrade,
    });
  }
  return winners;
}

const eligible = (l: LearnerStanding) => l.hasAnyMarks && l.isComplete && isPassPercentage(l.overallPercentage);

/* ============================================================
   MAIN
   ============================================================ */

export function computeAwards(classes: ClassStanding[], options: ComputeAwardsOptions = {}): AwardGroup[] {
  const scopes = options.scopes ?? ['class', 'level'];
  const groups: AwardGroup[] = [];

  const pendingIn = (ls: LearnerStanding[]) => ls.filter(l => l.hasAnyMarks && !l.isComplete).length;
  const candidatesOf = (c: ClassStanding): Candidate[] =>
    c.learners.filter(eligible).map(l => ({ ...l, className: c.className }));

  if (scopes.includes('class')) {
    for (const c of classes) {
      groups.push({
        id: `class:${c.classId}`,
        scope: 'class',
        groupLabel: c.className,
        levelKey: levelKeyOf(c),
        winners: topThree(candidatesOf(c)),
        pendingCount: pendingIn(c.learners),
      });
    }
  }

  if (scopes.includes('level')) {
    const byLevel = new Map<string, ClassStanding[]>();
    for (const c of classes) {
      const k = levelKeyOf(c);
      byLevel.set(k, [...(byLevel.get(k) ?? []), c]);
    }
    for (const [key, list] of byLevel) {
      groups.push({
        id: `level:${key}`,
        scope: 'level',
        groupLabel: levelLabelOf(list[0]),
        levelKey: key,
        winners: topThree(list.flatMap(candidatesOf)),
        pendingCount: list.reduce((n, c) => n + pendingIn(c.learners), 0),
      });
    }
  }

  return groups.sort(compareGroups);
}

/** Grade levels first, then classes; Form before Grade; low level first; then name. */
function compareGroups(a: AwardGroup, b: AwardGroup) {
  if (a.scope !== b.scope) return a.scope === 'level' ? -1 : 1;
  const [at, al] = a.levelKey.split('-');
  const [bt, bl] = b.levelKey.split('-');
  if (at !== bt) return at === 'form' ? -1 : 1;
  if (al !== bl) return Number(al) - Number(bl);
  return a.groupLabel.localeCompare(b.groupLabel, undefined, { numeric: true });
}

/* ============================================================
   CERTIFICATES
   ============================================================ */

/** "Form 2A" → "F2A", "Grade 11" → "G11" */
const groupCode = (label: string) =>
  label.trim().replace(/^form\s*/i, 'F').replace(/^grade\s*/i, 'G').replace(/\s+/g, '').toUpperCase();

/**
 * Serial printed on each certificate. The same award always gets the same
 * number, so a lost certificate can be reprinted: KBS/2026/T3/F2A/1
 * (joint winners get -a, -b ...).
 */
export function serialFor(group: AwardGroup, winner: AwardWinner, term: string, year: number, prefix = 'KBS') {
  const t = term.replace(/\D/g, '') || term;
  const base = `${prefix}/${year}/T${t}/${groupCode(group.groupLabel)}/${winner.position}`;
  if (!winner.tied) return base;
  const same = group.winners.filter(w => w.position === winner.position);
  return `${base}-${String.fromCharCode(97 + same.indexOf(winner))}`;
}

/** Key for remembering which winners the admin has unticked. */
export const winnerKey = (g: AwardGroup, w: AwardWinner) => `${g.id}::${w.learnerId}`;

/** Flattens the groups into one certificate per (ticked) winner, in print order. */
export function toCertificates(
  groups: AwardGroup[],
  term: string,
  year: number,
  isIncluded: (group: AwardGroup, winner: AwardWinner) => boolean = () => true,
): CertificateAward[] {
  return groups.flatMap(g =>
    g.winners.filter(w => isIncluded(g, w)).map(w => ({
      learnerName: w.learnerName,
      position: w.position,
      tied: w.tied,
      scope: g.scope,
      groupLabel: g.groupLabel,
      percentage: w.percentage,
      grade: w.grade,
      serialNumber: serialFor(g, w, term, year),
    })),
  );
}
