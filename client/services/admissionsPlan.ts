// @/services/admissionsPlan.ts
//
// Pure admissions rules (no Firestore — unit-tested):
//   - which intake class a new learner goes to,
//   - class fill figures for the progress board,
//   - validation of the enrolment form,
//   - possible duplicate learners.
//
// Placement rule
// ──────────────
// Only classes of the learner's level that are open for the intake and not
// full are considered. The learner goes to the class that is LEAST FULL
// (learners ÷ places). Ties go to the class with fewer learners of the
// learner's gender (keeps boys and girls balanced), then fewer learners,
// then the class name. With equal capacities this fills classes evenly,
// one learner each in turn, so no class runs ahead of the others or over
// its places.

import type { AdmissionInput, IntakeClass, IntakeLevel, IntakeSettings, PlacementChoice } from '@/types/admissions';

export const DEFAULT_CAPACITY = 45;

export const levelKey = (l: IntakeLevel) => `${l.type}-${l.level}`;
export const levelLabel = (l: IntakeLevel) => `${l.type === 'grade' ? 'Grade' : 'Form'} ${l.level}`;

export const admissionNumberFor = (year: number, seq: number) => `ADM-${year}-${String(seq).padStart(4, '0')}`;

export const defaultIntakeSettings = (year: number): IntakeSettings => ({
  year,
  isOpen: false,
  levels: [{ type: 'form', level: 1 }],
  defaultCapacity: DEFAULT_CAPACITY,
  capacities: {},
  excludedClassIds: [],
  seq: 0,
});

export const capacityOf = (settings: Pick<IntakeSettings, 'capacities' | 'defaultCapacity'>, classId: string) => {
  const c = settings.capacities?.[classId];
  return typeof c === 'number' && c > 0 ? c : settings.defaultCapacity || DEFAULT_CAPACITY;
};

export const isFull = (c: Pick<IntakeClass, 'total' | 'capacity'>) => c.total >= c.capacity;

/** The class a learner of this gender should go to, or null when every class is full. */
export function chooseClass(
  classes: IntakeClass[],
  level: IntakeLevel,
  gender: 'male' | 'female'
): PlacementChoice | null {
  const open = classes.filter(c =>
    c.type === level.type && c.level === level.level && !c.excluded && !isFull(c)
  );
  if (open.length === 0) return null;
  const sameGender = (c: IntakeClass) => (gender === 'male' ? c.male : c.female);
  const sorted = [...open].sort((a, b) => {
    // Compare fill ratios exactly (a.total / a.capacity vs b.total / b.capacity).
    const byFill = a.total * b.capacity - b.total * a.capacity;
    if (byFill !== 0) return byFill;
    return sameGender(a) - sameGender(b) || a.total - b.total || a.name.localeCompare(b.name);
  });
  const best = sorted[0];
  const reason = `${best.name} has the most room (${best.total} of ${best.capacity} places taken, ${sameGender(best)} ${gender === 'male' ? 'boys' : 'girls'}).`;
  return { classId: best.id, reason };
}

export interface LevelProgress {
  level: IntakeLevel;
  label: string;
  classes: IntakeClass[];
  capacity: number;
  total: number;
  male: number;
  female: number;
  admittedHere: number;
  remaining: number;
  /** Largest gap between the fullest and emptiest class (learners). */
  spread: number;
  full: boolean;
}

export function levelProgress(classes: IntakeClass[], levels: IntakeLevel[]): LevelProgress[] {
  return levels.map(level => {
    const cs = classes
      .filter(c => c.type === level.type && c.level === level.level)
      .sort((a, b) => a.name.localeCompare(b.name));
    const counted = cs.filter(c => !c.excluded);
    const sum = (k: 'capacity' | 'total' | 'male' | 'female' | 'admittedHere') => counted.reduce((n, c) => n + c[k], 0);
    const totals = counted.map(c => c.total);
    return {
      level,
      label: levelLabel(level),
      classes: cs,
      capacity: sum('capacity'),
      total: sum('total'),
      male: sum('male'),
      female: sum('female'),
      admittedHere: sum('admittedHere'),
      remaining: Math.max(0, sum('capacity') - sum('total')),
      spread: totals.length ? Math.max(...totals) - Math.min(...totals) : 0,
      full: counted.length > 0 && counted.every(isFull),
    };
  });
}

// ==================== VALIDATION ====================

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const validDate = (s: string) => {
  if (!ISO.test(s || '')) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};

export const phoneDigits = (p: string) => (p || '').replace(/\D/g, '');

/** field → message; empty when the form can be saved. */
export function validateAdmission(input: AdmissionInput, today = new Date()): Record<string, string> {
  const e: Record<string, string> = {};
  const req = (k: keyof AdmissionInput, label: string) => {
    if (!String(input[k] ?? '').trim()) e[k as string] = `${label} is required`;
  };
  req('fullName', 'Full name');
  req('address', 'Address');
  req('guardian', 'Guardian');
  req('guardianPhone', 'Guardian phone');
  req('sponsor', 'Sponsor');
  if (input.fullName && input.fullName.trim().split(/\s+/).length < 2) e.fullName = 'Enter first name and surname';
  if (input.gender !== 'male' && input.gender !== 'female') e.gender = 'Choose male or female';

  if (!validDate(input.dateOfBirth)) e.dateOfBirth = 'Enter a valid date of birth';
  else {
    const y = Number(input.dateOfBirth.slice(0, 4));
    const age = today.getFullYear() - y;
    if (age < 8 || age > 30) e.dateOfBirth = `Age ${age} looks wrong — check the date of birth`;
  }
  if (!validDate(input.dateOfFirstEntry)) e.dateOfFirstEntry = 'Enter a valid date';

  const d = phoneDigits(input.guardianPhone);
  if (input.guardianPhone && (d.length < 9 || d.length > 15)) e.guardianPhone = 'Enter a valid phone number (9–15 digits)';
  if (input.alternativeGuardianPhone) {
    const a = phoneDigits(input.alternativeGuardianPhone);
    if (a.length < 9 || a.length > 15) e.alternativeGuardianPhone = 'Enter a valid phone number (9–15 digits)';
  }
  return e;
}

// ==================== DUPLICATES ====================

export const normName = (s: string) => (s || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim().split(' ').filter(Boolean).sort().join(' ');

export interface ExistingLearnerLite {
  id: string;
  fullName: string;
  dateOfBirth?: string;
  guardianPhone?: string;
  className?: string;
  studentId?: string;
  status?: string;
}

/**
 * Learners who may be the same person: same name (any word order), or the
 * same date of birth and guardian phone.
 */
export function findPossibleDuplicates(input: Pick<AdmissionInput, 'fullName' | 'dateOfBirth' | 'guardianPhone'>, existing: ExistingLearnerLite[]): ExistingLearnerLite[] {
  const name = normName(input.fullName);
  const phone = phoneDigits(input.guardianPhone).slice(-9);
  return existing.filter(l => {
    const sameName = name && normName(l.fullName) === name;
    const samePhone = phone.length === 9 && phoneDigits(l.guardianPhone || '').slice(-9) === phone;
    const sameDob = !!input.dateOfBirth && l.dateOfBirth === input.dateOfBirth;
    return sameName || (samePhone && sameDob);
  });
}
