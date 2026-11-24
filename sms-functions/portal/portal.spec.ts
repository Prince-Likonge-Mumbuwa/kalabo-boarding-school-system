// The `portal` Cloud Function, end to end, against an in-memory database.
//
// Runs the REAL deployed files — src/portal/portal.js and the built
// src/portal/portalCore.cjs (npm run build:portal first) — with firebase-admin
// swapped for a fake that shares its data with the app's browser fake. So the
// same seeded school is seen by:
//   • the app (resultsService.generateReportCard, as in the Parent Portal fallback), and
//   • the Cloud Function (what parents and sponsors get once it is deployed)
// and their report cards must be identical.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import Module from 'node:module';
import path from 'node:path';

vi.mock('firebase/firestore', async () => await import('../../client/test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
const authState = vi.hoisted(() => ({ uid: 'T1' as string | null }));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: authState.uid ? { uid: authState.uid } : null }),
}));

import { resetStore, getDocData } from '../../client/test/fakeFirestore';
import * as fakeAdmin from './fakeAdminFirestore';
import { resultsService } from '../../client/services/resultsService';
import { clearReleaseCache, publishResults } from '../../client/services/resultsPublication';

const TERM = 'Term 3';
const YEAR = 2026;
const PHONE = '0970000000';
const CODE = 'SP-7KQ3-M9XP';

// ── load the deployed function files with firebase-admin replaced ──
const functionsDir = path.resolve(__dirname, '../functions');
let portal: { handle: (req: any) => Promise<any> };
let core: any;
beforeAll(() => {
  const origLoad = (Module as any)._load;
  (Module as any)._load = function (request: string, ...rest: any[]) {
    if (request === 'firebase-admin/firestore') return fakeAdmin;
    return origLoad.call(this, request, ...rest);
  };
  const req = Module.createRequire(path.join(functionsDir, 'index.js'));
  portal = req('./src/portal/portal.js');
  core = req('./src/portal/portalCore.cjs');
});

const call = (data: Record<string, unknown>, ip = '1.2.3.4') =>
  portal.handle({ data, rawRequest: { headers: { 'x-forwarded-for': ip } } });

function seed() {
  const learner = (studentId: string, name: string, phone = PHONE) =>
    ({ classId: 'C1', className: 'Form 1A', studentId, fullName: name, status: 'active', guardianPhone: phone });
  resetStore({
    system: { assignmentEngine: { migratedAt: 'x' } },
    classes: { C1: { name: 'Form 1A', level: 1, isActive: true, formTeacherId: 'T1' } },
    learners: {
      docA: learner('F1A_001', 'Alice Banda'),
      docB: learner('F1A_002', 'Ben Chola', '+260 97 000 0000'), // same number, other format
      docC: learner('F1A_003', 'Chipo Daka', '0961111111'),
    },
    class_slots: {
      C1__Mathematics: { classId: 'C1', className: 'Form 1A', subject: 'Mathematics', normalizedSubject: 'Mathematics', ownerTeacherId: 'T1', ownerTeacherName: 'Mr One' },
      C1__English: { classId: 'C1', className: 'Form 1A', subject: 'English', normalizedSubject: 'English', ownerTeacherId: 'T2', ownerTeacherName: 'Ms Two' },
    },
    examConfigs: {
      cfg: {
        term: TERM, year: YEAR, isActive: true, createdAt: '2026-09-01',
        examTypes: { week4: true, week8: false, endOfTerm: true },
        week4TotalMarks: 50, week8TotalMarks: 50, endOfTermTotalMarks: 100,
      },
    },
    sponsor_codes: {
      [CODE]: { sponsorName: 'CAMFED', learnerIds: ['docA', 'docC'], learnerCount: 2, term: TERM, year: YEAR, status: 'active', createdAt: '2026-10-01', expiresAt: '2099-01-01' },
    },
  });
}

async function enterAll() {
  const marks: Record<string, number> = { docA: 40, docB: 22, docC: 31 };
  for (const subject of ['Mathematics', 'English']) {
    for (const exam of ['week4', 'endOfTerm'] as const) {
      const teacherId = subject === 'Mathematics' ? 'T1' : 'T2';
      authState.uid = teacherId;
      const total = exam === 'week4' ? 50 : 100;
      await resultsService.saveClassResults(
        {
          classId: 'C1', className: 'Form 1A', subjectId: subject, subjectName: subject,
          teacherId, teacherName: teacherId, examType: exam, examName: `${exam} - ${subject}`,
          term: TERM, year: YEAR, totalMarks: total,
          results: Object.entries(marks).map(([id, m]) => ({ studentId: id, studentName: id, marks: Math.min(total, m * (total / 50)) })),
        },
        { overwrite: true }
      );
      resultsService.invalidateGrid();
    }
  }
  authState.uid = null; // the portal is signed out
}

// The function keeps a 15-second memory of "is this term released?" (its own
// copy of resultsPublication); clear it as the app's publish button does locally.
const publish = async () => {
  await publishResults(TERM, YEAR, { requiredEntries: 12, doneEntries: 12 }, { uid: 'ADMIN', name: 'Head Teacher' });
  core.clearReleaseCache();
};

/** Drop the moment-of-generation stamps; everything else must match. */
const stable = (card: any) => JSON.parse(JSON.stringify(card, (k, v) => (/^(generatedAt|createdAt|updatedAt)$/.test(k) ? undefined : v)));

beforeEach(async () => {
  seed();
  resultsService.invalidateGrid();
  clearReleaseCache();
  core.clearReleaseCache();
  await enterAll();
});

describe('parentChildren', () => {
  it('finds every active child on the number, whatever format it was saved in', async () => {
    const r = await call({ action: 'parentChildren', phone: '097 000 0000' });
    expect(r.children.map((c: any) => c.id).sort()).toEqual(['docA', 'docB']);
    expect(r.children[0]).toMatchObject({ studentId: expect.any(String), fullName: expect.any(String), className: 'Form 1A' });
  });
  it('returns an empty list (not an error) for a number with no children, or a partial number', async () => {
    expect((await call({ action: 'parentChildren', phone: '0955555555' })).children).toEqual([]);
    expect((await call({ action: 'parentChildren', phone: '097' })).children).toEqual([]);
  });
  it('asks for a phone number when none is given', async () => {
    await expect(call({ action: 'parentChildren', phone: '' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('parentReport', () => {
  it('refuses a term the school has not published, with a sentence', async () => {
    const err = await call({ action: 'parentReport', phone: PHONE, learnerId: 'docA', term: TERM, year: YEAR }).catch((e) => e);
    expect(err.code).toBe('failed-precondition');
    expect(err.message).toBe('Term 3 2026 results have not been released yet. They will be available here once the school has published them.');
  });

  it('once published, returns exactly the card the app builds', async () => {
    await publish();
    const fromFunction = (await call({ action: 'parentReport', phone: PHONE, learnerId: 'docA', term: TERM, year: YEAR })).reportCard;
    clearReleaseCache();
    const fromApp = await resultsService.generateReportCard('docA', TERM, YEAR, { includeIncomplete: true, markMissing: true, publicView: true });
    expect(fromFunction).toBeTruthy();
    expect(fromFunction.studentName).toBe('Alice Banda');
    expect(stable(fromFunction)).toEqual(stable(fromApp));
  });

  it('gives nothing for a learner who is not on that phone number', async () => {
    await publish();
    const r = await call({ action: 'parentReport', phone: PHONE, learnerId: 'docC', term: TERM, year: YEAR });
    expect(r.reportCard).toBeNull();
  });

  it('rejects a missing term or year', async () => {
    await expect(call({ action: 'parentReport', phone: PHONE, learnerId: 'docA', term: '', year: YEAR })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call({ action: 'parentReport', phone: PHONE, learnerId: 'docA', term: TERM, year: 'x' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('sponsor codes', () => {
  it('checks a code without spending it', async () => {
    const r = await call({ action: 'sponsorCheck', code: CODE.toLowerCase() });
    expect(r.code).toMatchObject({ code: CODE, sponsorName: 'CAMFED', term: TERM, year: YEAR, learnerCount: 2 });
    expect(getDocData('sponsor_codes', CODE)?.status).toBe('active');
  });

  it('builds the sponsor reports once published (same cards as the app)', async () => {
    await publish();
    const r = (await call({ action: 'sponsorReports', code: CODE })).reports;
    expect(r.cards.map((c: any) => c.studentName).sort()).toEqual(['Alice Banda', 'Chipo Daka']);
    clearReleaseCache();
    const appCard = await resultsService.generateReportCard('docC', TERM, YEAR, { includeIncomplete: true, markMissing: true, publicView: true });
    expect(stable(r.cards.find((c: any) => c.studentName === 'Chipo Daka'))).toEqual(stable(appCard));
  });

  it('spends the code once; a second use gets the school\'s sentence', async () => {
    expect(await call({ action: 'sponsorRedeem', code: CODE })).toEqual({ ok: true });
    expect(getDocData('sponsor_codes', CODE)?.status).toBe('used');
    const err = await call({ action: 'sponsorRedeem', code: CODE }).catch((e) => e);
    expect(err.code).toBe('failed-precondition');
    expect(err.message).toMatch(/already been used/);
  });

  it('explains a mistyped code', async () => {
    const err = await call({ action: 'sponsorCheck', code: 'hello' }).catch((e) => e);
    expect(err.code).toBe('failed-precondition');
    expect(err.message).toMatch(/SP-7KQ3-M9XP/);
  });
});

describe('the request itself', () => {
  it('rejects an unknown action with a sentence (never a bare word, which the app would read as "unreachable")', async () => {
    const err = await call({ action: 'dropTables' }).catch((e) => e);
    expect(err.code).toBe('invalid-argument');
    expect(err.message).toMatch(/[.]$/);
  });

  it('slows down one address that hammers the function', async () => {
    let last: any;
    for (let i = 0; i < 45; i++) last = await call({ action: 'parentChildren', phone: '0955555555' }, '9.9.9.9').catch((e) => e);
    expect(last.code).toBe('resource-exhausted');
  });

  it('bundles the current app code', () => {
    expect(typeof core.portalDirect.parentReport).toBe('function');
  });
});
