import { describe, it, expect } from 'vitest';
import { chooseClass, findPossibleDuplicates, levelProgress, validateAdmission, admissionNumberFor } from './admissionsPlan';
import type { AdmissionInput, IntakeClass } from '@/types/admissions';

const c = (id: string, total: number, male: number, capacity = 40, extra: Partial<IntakeClass> = {}): IntakeClass => ({
  id, name: `Form 1${id}`, type: 'form', level: 1, section: id, capacity, excluded: false,
  total, male, female: total - male, admittedHere: 0, maxIndex: total, ...extra,
});
const F1 = { type: 'form' as const, level: 1 };

describe('chooseClass', () => {
  it('picks the least full class', () => {
    expect(chooseClass([c('A', 10, 5), c('B', 8, 4), c('C', 9, 4)], F1, 'male')!.classId).toBe('B');
  });

  it('compares fullness, not head count, when places differ', () => {
    // A: 20/40 = 50%, B: 18/30 = 60%
    expect(chooseClass([c('A', 20, 10, 40), c('B', 18, 9, 30)], F1, 'female')!.classId).toBe('A');
  });

  it('breaks ties by gender balance', () => {
    const classes = [c('A', 10, 7), c('B', 10, 3)];
    expect(chooseClass(classes, F1, 'male')!.classId).toBe('B');
    expect(chooseClass(classes, F1, 'female')!.classId).toBe('A');
  });

  it('never chooses a full or excluded class, and returns null when all are full', () => {
    expect(chooseClass([c('A', 40, 20), c('B', 39, 20), c('C', 0, 0, 40, { excluded: true })], F1, 'male')!.classId).toBe('B');
    expect(chooseClass([c('A', 40, 20), c('B', 40, 20)], F1, 'male')).toBeNull();
  });

  it('only considers the requested level', () => {
    const f2 = { ...c('X', 0, 0), level: 2, name: 'Form 2X' };
    expect(chooseClass([f2, c('A', 30, 15)], F1, 'male')!.classId).toBe('A');
  });

  it('filling one at a time keeps classes level and never over capacity', () => {
    const classes = [c('A', 0, 0, 5), c('B', 0, 0, 5), c('C', 0, 0, 5)];
    for (let i = 0; i < 15; i++) {
      const g = i % 3 === 0 ? 'female' : 'male';
      const pick = chooseClass(classes, F1, g)!;
      const k = classes.find(x => x.id === pick.classId)!;
      k.total++;
      if (g === 'male') k.male++; else k.female++;
      const totals = classes.map(x => x.total);
      expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(1);
    }
    expect(classes.map(x => x.total)).toEqual([5, 5, 5]);
    expect(chooseClass(classes, F1, 'male')).toBeNull();
    const boys = classes.map(x => x.male);
    expect(Math.max(...boys) - Math.min(...boys)).toBeLessThanOrEqual(1);
  });
});

describe('levelProgress', () => {
  it('adds up the level and the spread between classes', () => {
    const [lp] = levelProgress([c('A', 30, 14), c('B', 26, 13), c('C', 0, 0, 40, { excluded: true })], [F1]);
    expect(lp).toMatchObject({ total: 56, capacity: 80, remaining: 24, male: 27, female: 29, spread: 4, full: false });
    expect(lp.classes).toHaveLength(3);
  });
});

describe('validateAdmission', () => {
  const ok: AdmissionInput = {
    fullName: 'Mutinta Mwiinga', gender: 'female', dateOfBirth: '2013-04-02', address: 'Kalabo', guardian: 'Mr Mwiinga',
    guardianPhone: '0971234567', sponsor: 'Self', dateOfFirstEntry: '2027-01-12', admissionType: 'new_intake', level: F1,
  };
  it('accepts a complete form', () => {
    expect(validateAdmission(ok, new Date('2027-01-12'))).toEqual({});
  });
  it('flags missing and impossible values', () => {
    const e = validateAdmission({ ...ok, fullName: 'Mutinta', gender: '' as any, dateOfBirth: '2013-02-30', guardianPhone: '12' }, new Date('2027-01-12'));
    expect(Object.keys(e).sort()).toEqual(['dateOfBirth', 'fullName', 'gender', 'guardianPhone']);
    expect(validateAdmission({ ...ok, dateOfBirth: '2024-01-01' }, new Date('2027-01-12')).dateOfBirth).toMatch(/Age 3/);
  });
});

describe('findPossibleDuplicates', () => {
  it('matches the same name in any order, or the same birthday and phone', () => {
    const existing = [
      { id: '1', fullName: 'MWIINGA  Mutinta', guardianPhone: '+260 977 000 111' },
      { id: '2', fullName: 'Other Child', dateOfBirth: '2013-04-02', guardianPhone: '0971234567' },
      { id: '3', fullName: 'Other Child', dateOfBirth: '2012-01-01', guardianPhone: '0971234567' },
    ];
    const hits = findPossibleDuplicates({ fullName: 'Mutinta Mwiinga', dateOfBirth: '2013-04-02', guardianPhone: '+260971234567' }, existing);
    expect(hits.map(h => h.id)).toEqual(['1', '2']);
  });
});

it('admission numbers', () => {
  expect(admissionNumberFor(2027, 7)).toBe('ADM-2027-0007');
});
