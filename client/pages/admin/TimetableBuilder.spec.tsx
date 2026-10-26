// @vitest-environment jsdom
// The timetable generator end to end on an in-memory Firestore: readiness
// (department sign-offs), generate a draft, review it, publish it.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('firebase/firestore', async () => await import('../../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}), onAuthStateChanged: () => () => {} }));
const who = vi.hoisted(() => ({ user: { uid: 'ADMIN', fullName: 'Head Teacher', userType: 'admin' } as any }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: who.user }) }));
vi.mock('@/utils/academicTerm', async orig => ({
  ...(await orig() as any),
  getCurrentAcademicTerm: () => ({ term: 'Term 3', year: 2026 }),
  getNextAcademicTerm: () => ({ term: 'Term 1', year: 2027 }),
}));

import { resetStore, store } from '../../test/fakeFirestore';
import TimetableBuilder from './TimetableBuilder';

const slot = (classId: string, subj: string, subject: string, owner: string | null) => ({
  classId, className: `Form ${classId}`, subject, normalizedSubject: subj, ownerTeacherId: owner, ownerTeacherName: owner ? `Teacher ${owner}` : null,
});
const req = (normalizedSubject: string, subject: string, min: number, extra: any = {}) => ({ normalizedSubject, subject, min, max: min, doubles: 0, triples: 0, time: 'any', ...extra });

beforeEach(() => {
  cleanup();
  who.user = { uid: 'ADMIN', fullName: 'Head Teacher', userType: 'admin' };
  resetStore({
    users: { ADMIN: { fullName: 'Head Teacher', userType: 'admin' } },
    classes: {
      '1A': { name: 'Form 1A', type: 'form', level: 1, isActive: true },
      '1B': { name: 'Form 1B', type: 'form', level: 1, isActive: true },
    },
    class_slots: {
      '1A__english': slot('1A', 'english', 'English', 'T1'),
      '1B__english': slot('1B', 'english', 'English', 'T1'),
      '1A__mathematics': slot('1A', 'mathematics', 'Mathematics', 'T2'),
      '1B__mathematics': slot('1B', 'mathematics', 'Mathematics', null),
    },
    system: { departments: { subjects: { Languages: ['english'], Mathematics: ['mathematics'] } } },
    staff_roles: { T2__hod: { role: 'hod', teacherId: 'T2', teacherName: 'Teacher T2', department: 'Mathematics', status: 'active' } },
    timetable_config: {
      school: {
        levels: { 'form-1': { label: 'Form 1', subjects: [req('english', 'English', 6, { doubles: 1 }), req('mathematics', 'Mathematics', 5, { doubles: 1, time: 'morning-only' })] } },
        events: [{ id: 'a', name: 'Assembly', days: [1], periods: [1], levels: [] }],
        rooms: [],
        exceptions: [],
        maxTeacherPeriodsPerDay: 6,
      },
    },
  });
});

const renderAt = (search = '?tt=readiness') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[`/dashboard/admin/timetable${search}`]}><TimetableBuilder /></MemoryRouter>
    </QueryClientProvider>,
  );

describe('Timetable generator (admin)', () => {
  it('waits for every department, then generates a clash-free draft and publishes it to teachers', async () => {
    renderAt();
    expect(await screen.findByText('Not ready to generate yet.')).toBeTruthy();
    expect(screen.getByText(/Waiting for allocations to be marked complete: Languages, Mathematics/)).toBeTruthy();
    expect(screen.getByText('1 without a teacher')).toBeTruthy();

    // The admin marks both departments complete (e.g. on behalf of the HoDs).
    for (const name of ['Languages', 'Mathematics']) {
      const row = screen.getByText(name, { selector: 'p' }).closest('li')!;
      fireEvent.click(within(row).getByRole('button', { name: 'Mark complete' }));
      await screen.findByText(`${name} marked complete.`);
    }
    expect(await screen.findByText(/Ready to generate the Term 3 2026 timetable/)).toBeTruthy();

    // Generate
    fireEvent.click(screen.getByRole('tab', { name: /Generate/ }));
    expect(await screen.findByText(/The set-up adds up/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Generate timetable/ }));
    expect(await screen.findByRole('button', { name: /All timetables/ }, { timeout: 30_000 })).toBeTruthy();
    const drafts = [...store.get('timetable_versions')!.values()] as any[];
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ status: 'draft', term: 'Term 3', year: 2026, unplaced: [] });
    // 2 classes × (English 6 + Mathematics 5) = 22 periods, no Monday P1 (assembly).
    expect(drafts[0].lessons.reduce((n: number, l: any) => n + l.size, 0)).toBe(22);
    expect(drafts[0].lessons.some((l: any) => l.day === 1 && l.start === 1)).toBe(false);
    expect(drafts[0].lessons.filter((l: any) => l.slotId.endsWith('mathematics')).every((l: any) => l.start + l.size - 1 <= 4)).toBe(true);

    // Review: the class grid shows days as rows; Form 1B Mathematics has no teacher yet.
    const grid = await screen.findByRole('table', { name: 'Timetable of Form 1A' });
    expect(within(grid).getAllByRole('rowheader').map(r => r.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    expect(within(grid).getAllByText('Teacher T1').length).toBeGreaterThan(0);

    // Publish
    fireEvent.click(screen.getByRole('button', { name: /^Publish$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish now' }));
    expect(await screen.findByText(/Published: 22 periods are now every teacher's timetable/)).toBeTruthy();
    const live = [...store.get('timetable_entries')!.values()].filter((r: any) => r.status === 'active') as any[];
    expect(live).toHaveLength(22);
    expect(live.every(r => r.term === 'Term 3' && r.year === 2026 && r.isDouble === false && typeof r.effectiveFrom === 'string')).toBe(true);
    expect(screen.getByText('Published — teachers see this')).toBeTruthy();
  }, 60_000);

  it('cannot generate while a set-up is impossible, and says why', async () => {
    const cfg = store.get('timetable_config')!.get('school')!;
    cfg.levels['form-1'].subjects[0].min = 40;
    cfg.levels['form-1'].subjects[0].max = 40;
    store.set('timetable_signoffs', new Map([
      ['a', { department: 'Languages', term: 'Term 3', year: 2026, byUid: 'ADMIN', byName: 'Head', byRole: 'admin' }],
      ['b', { department: 'Mathematics', term: 'Term 3', year: 2026, byUid: 'ADMIN', byName: 'Head', byRole: 'admin' }],
    ]));
    renderAt('?tt=generate');
    expect(await screen.findByText(/Form 1A needs 45 periods a week but has only 39 free periods/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Generate timetable/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('curriculum: add a subject to a level and save', async () => {
    store.get('class_slots')!.set('1A__history', slot('1A', 'history', 'History', 'T3'));
    renderAt('?tt=curriculum');
    await screen.findByRole('tab', { name: /Form 1/ });
    fireEvent.change(screen.getByRole('combobox', { name: 'Add a subject' }), { target: { value: 'history' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'History min' }), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Save curriculum/ }));
    await screen.findByText('Curriculum saved.');
    const saved = store.get('timetable_config')!.get('school')! as any;
    expect(saved.levels['form-1'].subjects.find((s: any) => s.normalizedSubject === 'history')).toMatchObject({ min: 3, max: 4 });
    expect(saved.updatedBy).toBe('ADMIN');
  });

  it('curriculum: bulk import of the class allocation, checked first, then saved', async () => {
    renderAt('?tt=curriculum');
    await screen.findByRole('tab', { name: /Form 1/ });
    fireEvent.click(screen.getByRole('button', { name: /Bulk import class allocation/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Paste rows' }), {
      target: {
        value: [
          'Class / Level\tSubject\tPeriods\tDoubles\tTime of day\tRoom\tTaken',
          'Form 1\tEnglish\t5\t1\t\t\t',
          'Form 1\tMathematics\t6\t2\tMornings only\t\t',
          'Form 1B\tMathematics\t\t\t\t\tNo',
          'Form 1A\tHistory\t3\t\t\tLibrary\t',
          'Form 7\tEnglish\t5\t\t\t\t',
        ].join('\n'),
      },
    });
    expect((screen.getByRole('button', { name: 'Apply to curriculum' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Check rows/ }));
    expect(await screen.findByText(/4 of 5 rows can be imported — 1 with problems will be skipped/)).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Rows with problems' })).getByText(/Line 6: "Form 7" is not an active class or a level/)).toBeTruthy();
    expect(screen.getByText('New special rooms: Library.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Apply to curriculum' }));
    expect(await screen.findByText(/Imported 4 rows for Form 1\. Review, then Save curriculum\./)).toBeTruthy();
    expect((screen.getByRole('spinbutton', { name: 'Mathematics min' }) as HTMLInputElement).value).toBe('6');
    fireEvent.click(screen.getByRole('button', { name: /Save curriculum/ }));
    await screen.findByText('Curriculum saved.');

    const saved = store.get('timetable_config')!.get('school')! as any;
    const subj = Object.fromEntries(saved.levels['form-1'].subjects.map((s: any) => [s.normalizedSubject, s]));
    expect(subj.english).toMatchObject({ min: 5, max: 5, doubles: 1 });
    expect(subj.mathematics).toMatchObject({ min: 6, doubles: 2, time: 'morning-only' });
    const library = saved.rooms.find((r: any) => r.name === 'Library');
    expect(subj.History).toMatchObject({ min: 3, roomId: library.id });
    expect(saved.exceptions).toEqual(expect.arrayContaining([
      { classId: '1B', normalizedSubject: 'mathematics', excluded: true },
      { classId: '1B', normalizedSubject: 'History', excluded: true },
    ]));
    expect(saved.exceptions).toHaveLength(2);
  });
});
