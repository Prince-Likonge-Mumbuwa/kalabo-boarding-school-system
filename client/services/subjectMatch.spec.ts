import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase/firestore', async () => await import('../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}), onAuthStateChanged: () => () => {} }));

import { createRequire } from 'node:module';
import { normalizeSubjectName, SUBJECT_ALIASES } from './resultsService';
import { editDistance, looseSubjectKey, tidyUnknownSubject } from './subjectMatch';

describe('normalizeSubjectName', () => {
  it('every name and alias in the subject list gives the same subject as before', () => {
    for (const [alias, subject] of Object.entries(SUBJECT_ALIASES)) {
      expect(normalizeSubjectName(alias)).toBe(subject);
      expect(normalizeSubjectName(alias.toUpperCase())).toBe(subject);
      expect(normalizeSubjectName(alias.toLowerCase())).toBe(subject);
      expect(normalizeSubjectName(`  ${alias}  `)).toBe(subject);
    }
  });

  it('the reported case: one subject, whatever the spelling', () => {
    for (const typed of [
      'PRINCIPLES OF ACCOUNTS', 'principles of accounts', 'Principles  of  Accounts', 'Principles of Accounts.',
      'priciples of accounts', 'Principals of Accounts', 'Principle of Account', 'Principles-of-Accounts', 'P.O.A',
    ]) {
      expect(normalizeSubjectName(typed), typed).toBe('Principles of Accounts');
    }
  });

  it('forgives "&"/"and", punctuation and small typos for other subjects', () => {
    expect(normalizeSubjectName('Design and Tech.')).not.toBe('Design & Technology'); // not a typo: a different word
    expect(normalizeSubjectName('DESIGN AND TECHNOLOGY')).toBe('Design & Technology');
    expect(normalizeSubjectName('Food and nutrition')).toBe('Food & Nutrition');
    expect(normalizeSubjectName('Mathematcs')).toBe('Mathematics');
    expect(normalizeSubjectName('Additional Mathematic')).toBe('Additional Mathematics');
    expect(normalizeSubjectName('Chemestry')).toBe('Chemistry');
    expect(normalizeSubjectName('Biolgy')).toBe('Biology');
    expect(normalizeSubjectName('Geograpy')).toBe('Geography');
    expect(normalizeSubjectName('Civic Educaton')).toBe('Civic Education');
    expect(normalizeSubjectName('Religous Education')).toBe('Religious Education');
    expect(normalizeSubjectName('Agricultural Sciences')).toBe('Agricultural Science');
    expect(normalizeSubjectName('Integrated  Science')).toBe('Integrated Science');
    expect(normalizeSubjectName('Litrature in English')).toBe('Literature in English');
  });

  it('never merges two different subjects', () => {
    expect(normalizeSubjectName('Physics')).toBe('Physics');
    expect(normalizeSubjectName('Physical Education')).toBe('Physical Education');
    expect(normalizeSubjectName('Mathematics')).not.toBe(normalizeSubjectName('Additional Mathematics'));
    expect(normalizeSubjectName('Economics')).not.toBe(normalizeSubjectName('Home Economics'));
    expect(normalizeSubjectName('Commerce')).not.toBe(normalizeSubjectName('Computer Science'));
    expect(normalizeSubjectName('Computer Science')).not.toBe(normalizeSubjectName('Integrated Science'));
    expect(normalizeSubjectName('Lunda')).toBe('Lunda');
    expect(normalizeSubjectName('Luvale')).toBe('Luvale');
    // No two subjects are within typo distance of each other.
    const subjects = [...new Set(Object.values(SUBJECT_ALIASES))].map(s => ({ s, k: looseSubjectKey(s).replace(/ /g, '') }));
    for (const a of subjects) for (const b of subjects) {
      if (a.s === b.s || a.k.length < 6 || b.k.length < 6) continue;
      const allowed = Math.max(a.k.length <= 8 ? 1 : 2, b.k.length <= 8 ? 1 : 2);
      expect(editDistance(a.k, b.k), `${a.s} vs ${b.s}`).toBeGreaterThan(allowed);
    }
  });

  it('unknown subjects: one spelling for case and spaces, otherwise as typed', () => {
    expect(normalizeSubjectName('LIFE SKILLS')).toBe('Life Skills');
    expect(normalizeSubjectName('life  skills')).toBe('Life Skills');
    expect(normalizeSubjectName('Life Skills')).toBe('Life Skills');
    expect(normalizeSubjectName('CTS')).toBe('CTS');
    expect(normalizeSubjectName('Form Teacher')).toBe('Form Teacher');
    expect(normalizeSubjectName('')).toBe('');
    expect(tidyUnknownSubject('KIDS IN THE WORLD')).toBe('Kids in the World');
  });
});

describe('the SMS server uses the same rules', () => {
  it('sms-functions/functions/src/lib/subjectMatch.js gives the same answers', () => {
    const req = createRequire(import.meta.url);
    const server = req('../../sms-functions/functions/src/lib/subjectMatch.js');
    const serverNormalize = server.makeSubjectNormalizer(SUBJECT_ALIASES);
    const inputs = [
      ...Object.keys(SUBJECT_ALIASES), ...Object.keys(SUBJECT_ALIASES).map(k => k.toUpperCase()),
      'priciples of accounts', 'P.O.A', 'Principle of Account', 'Mathematcs', 'LIFE SKILLS', 'life  skills', 'CTS', 'Form Teacher', 'Design and Tech.',
    ];
    for (const x of inputs) expect(serverNormalize(x), x).toBe(normalizeSubjectName(x));
  });
});
