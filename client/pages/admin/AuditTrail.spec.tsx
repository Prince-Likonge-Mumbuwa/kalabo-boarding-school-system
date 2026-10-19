// @vitest-environment jsdom
// Admin → Audit trail: entries read back as plain sentences, filtered by
// person / area / text, with the details of each change, and exported.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('firebase/firestore', async () => await import('../../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('@/components/DashboardLayout', () => ({ DashboardLayout: ({ children }: any) => <div>{children}</div> }));

import { resetStore } from '../../test/fakeFirestore';
import { auditCsv, loadAuditTrail, mapFaceEntry, summarizeOps, withActor } from '@/services/auditService';
import AuditTrail, { filterAuditRows } from './AuditTrail';

const at = (h: number, m = 0, daysAgo = 0) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d; };

beforeEach(() => {
  resetStore({
    audit_log: {
      E1: { actorId: 'ADMIN', actorName: 'Head Teacher', actorRole: 'admin', at: at(9, 5), page: '/dashboard/admin/classes',
        ops: [{ op: 'update', collection: 'learners', docId: 'L1', path: 'learners/L1', fields: ['guardianPhone'], values: { guardianPhone: '0977000111' } }] },
      E2: { actorId: 'T1', actorName: 'Muhau N', actorRole: 'teacher', at: at(10, 30),
        ops: Array.from({ length: 38 }, (_, i) => ({ op: 'set', collection: 'results', docId: `R${i}`, path: `results/R${i}` })) },
      E3: { actorId: 'T1', actorName: 'Muhau N', actorRole: 'teacher', at: at(7, 0), ops: [{ op: 'event', collection: 'session', docId: '', path: '', action: 'Signed in' }] },
      OLD: { actorId: 'T1', actorName: 'Muhau N', actorRole: 'teacher', at: at(8, 0, 30), ops: [{ op: 'event', collection: 'session', docId: '', path: '', action: 'Signed in' }] },
    },
    face_audit: {
      F1: { action: 'face.enrolled', userId: 'T1', userName: 'Muhau N', learnerId: 'L1', studentId: 'F2A_001', at: at(11, 0) },
    },
  });
});
afterEach(cleanup);

describe('audit trail service', () => {
  it('writes each entry as one sentence', () => {
    expect(summarizeOps([{ op: 'update', collection: 'learners', docId: 'L1', path: 'learners/L1', label: 'Amy Banda', fields: ['guardianPhone', 'address'] }]))
      .toBe('Updated learner Amy Banda (guardianPhone, address)');
    expect(summarizeOps([
      { op: 'set', collection: 'results', docId: 'a', path: 'results/a' }, { op: 'set', collection: 'results', docId: 'b', path: 'results/b' },
      { op: 'delete', collection: 'class_slots', docId: 'F2A__Biology', path: 'class_slots/F2A__Biology' },
    ])).toBe('Saved marks for 2 learners; Deleted class allocation F2A__Biology');
    expect(summarizeOps([{ op: 'event', collection: 'session', docId: '', path: '', action: 'Session ended after 2 hours' }])).toBe('Session ended after 2 hours');
    expect(summarizeOps([{ op: 'create', collection: 'sba_tasks', docId: 'x', path: 'sba_tasks/x' }])).toBe('Created SBA record x');
    expect(mapFaceEntry('f', { action: 'consent.granted', userId: 'T1', userName: 'Muhau N', studentId: 'F2A_001', at: at(8) }).summary)
      .toBe('Muhau N recorded guardian consent for face recognition — F2A_001');
  });

  it('says who saved which marks: class, subject, Week 4 / Week 8 / End of Term, term and year', () => {
    const mark = (i: number, examType = 'week4') => ({
      op: 'merge' as const, collection: 'results', docId: `L${i}_Mathematics_${examType}_Term3_2026`, path: `results/L${i}_Mathematics_${examType}_Term3_2026`,
      label: `Learner ${i}`, values: { className: 'Form 2A', subjectName: 'Mathematics', examType, term: 'Term 3', year: 2026, studentName: `Learner ${i}`, marks: 40 + i, totalMarks: 50 },
    });
    expect(withActor('Muhau Nakwebwa', summarizeOps([mark(1), mark(2), mark(3)])))
      .toBe('Muhau Nakwebwa saved Week 4 marks for 3 learners — Form 2A · Mathematics · Term 3 2026');
    expect(summarizeOps([mark(5, 'week8')])).toBe('Saved the Week 8 mark of Learner 5 (45/50) — Form 2A · Mathematics · Term 3 2026');
    expect(summarizeOps([mark(1, 'endOfTerm'), mark(2, 'week4')]))
      .toBe('Saved the End of Term mark of Learner 1 (41/50) — Form 2A · Mathematics · Term 3 2026; Saved the Week 4 mark of Learner 2 (42/50) — Form 2A · Mathematics · Term 3 2026');
    // A deletion (no values) still names the exam, subject and term from the record ID.
    expect(summarizeOps([{ op: 'delete', collection: 'results', docId: 'L1_Mathematics_week8_Term1_2026', path: 'results/L1_Mathematics_week8_Term1_2026' }]))
      .toBe('Deleted the Week 8 mark — Mathematics · Term 1 2026');
    expect(summarizeOps([
      { op: 'set', collection: 'attendance_sessions', docId: 'a', path: 'attendance_sessions/a', values: { className: 'Form 1B', subject: 'Biology', date: '2026-10-19', kind: 'periodic', period: 3 } },
      { op: 'set', collection: 'attendance_sessions', docId: 'b', path: 'attendance_sessions/b', values: { className: 'Form 1B', subject: 'Biology', date: '2026-10-19', kind: 'periodic', period: 4 } },
    ])).toMatch(/^Took the register \(2 periods\) — Form 1B · Biology · .*2026 · periods 3, 4$/);
    expect(withActor('Muhau N', 'Signed in')).toBe('Muhau N signed in');
  });

  it('loads the dates asked for, app and face recognition entries together, newest first', async () => {
    const p = await loadAuditTrail(at(0, 0, 6), new Date());
    expect(p.rows.map(r => r.id)).toEqual(['face_F1', 'E2', 'E1', 'E3']); // OLD (30 days ago) is outside
    expect(p.cursor).toBeNull();
    expect(p.rows[1].summary).toBe('Muhau N saved marks for 38 learners');
    expect(p.rows[1].areas).toEqual(['Results']);
  });

  it('filters by person, area and text; CSV has one line per change', async () => {
    const { rows } = await loadAuditTrail(at(0, 0, 6), new Date());
    expect(filterAuditRows(rows, { person: 'ADMIN', area: '', text: '' }).map(r => r.id)).toEqual(['E1']);
    expect(filterAuditRows(rows, { person: '', area: 'Face recognition', text: '' }).map(r => r.id)).toEqual(['face_F1']);
    expect(filterAuditRows(rows, { person: '', area: '', text: '0977000111' }).map(r => r.id)).toEqual(['E1']);
    const csv = auditCsv(filterAuditRows(rows, { person: 'T1', area: '', text: '' })).split('\n');
    expect(csv[0]).toMatch(/^Date,Time,Person,Role,Action,Change,Area,Record/);
    expect(csv).toHaveLength(1 + 1 + 38 + 1); // header, face, 38 results, sign-in
  });
});

describe('audit trail paging', () => {
  it('loads 200 at a time; the next page continues where the first stopped, nothing twice', async () => {
    const many: Record<string, any> = {};
    for (let i = 0; i < 205; i++) many[`M${String(i).padStart(3, '0')}`] = { actorId: 'T1', actorName: 'Muhau N', at: new Date(at(6).getTime() + i * 1000), ops: [{ op: 'update', collection: 'learners', docId: `L${i}`, path: `learners/L${i}` }] };
    resetStore({ audit_log: many });
    const p1 = await loadAuditTrail(at(0), new Date());
    expect(p1.rows).toHaveLength(200);
    expect(p1.cursor).not.toBeNull();
    const p2 = await loadAuditTrail(at(0), new Date(), p1.cursor);
    expect(p2.rows).toHaveLength(5);
    expect(p2.cursor).toBeNull();
    const ids = [...p1.rows, ...p2.rows].map(r => r.id);
    expect(new Set(ids).size).toBe(205);
    expect(p2.rows[p2.rows.length - 1].id).toBe('M000'); // oldest last
  });
});

describe('Audit trail page', () => {
  const page = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><AuditTrail /></MemoryRouter>
    </QueryClientProvider>,
  );

  it('lists who did what and when, and shows the details of a change', async () => {
    page();
    expect(await screen.findByText('Head Teacher updated learner L1 (guardianPhone)')).toBeTruthy();
    expect(screen.getByText('Muhau N saved marks for 38 learners')).toBeTruthy();
    expect(screen.getByText('Muhau N signed in')).toBeTruthy();
    expect(screen.getByText('Muhau N added a face — F2A_001')).toBeTruthy();
    expect(screen.getByText(/4 entries/)).toBeTruthy();

    fireEvent.click(screen.getByText('Head Teacher updated learner L1 (guardianPhone)'));
    const details = screen.getByText('learners/L1').closest('li')!;
    expect(within(details).getByText(/guardianPhone: 0977000111/)).toBeTruthy();
    expect(screen.getByText(/page \/dashboard\/admin\/classes/)).toBeTruthy();
  });

  it('filters by person', async () => {
    page();
    await screen.findByText('Muhau N saved marks for 38 learners');
    fireEvent.change(screen.getByLabelText('Person'), { target: { value: 'ADMIN' } });
    expect(screen.queryByText('Muhau N saved marks for 38 learners')).toBeNull();
    expect(screen.getByText(/1 entry of 4 loaded/)).toBeTruthy();
  });
});
