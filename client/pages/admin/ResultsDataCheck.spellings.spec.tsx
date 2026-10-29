// @vitest-environment jsdom
// The "Join spellings" button: confirm → progress → outcome shown in the card.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ fail: null as null | any, calls: 0 }));
vi.mock('@/services/resultsDataCheck', async () => ({
  planSlotMerge: (await vi.importActual<any>('@/services/resultsDataCheck')).planSlotMerge,
  mergeDuplicateSlots: vi.fn(async (groups: any[]) => {
    h.calls++;
    return { classesFixed: 1, assignmentsRemoved: 1, marksMoved: 4, registersMoved: 2, timetableMoved: 3, teacherRowsClosed: 0, toDecide: [{ className: 'Grade 11B', subject: 'Civic Education', reason: 'x' }], groups };
  }),
  fixSubjectSpellings: vi.fn(async (_g: any, onProgress: any) => {
    h.calls++;
    if (h.fail) throw h.fail;
    onProgress?.(0, 3);
    onProgress?.(3, 3);
    return { moved: 2, droppedOlder: 1, skipped: [] };
  }),
}));
vi.mock('@/services/resultsService', () => ({ resultsService: { invalidateGrid: vi.fn() } }));
vi.mock('@/lib/auditedFirestore', () => ({}));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('@/components/DashboardLayout', () => ({ DashboardLayout: ({ children }: any) => <div>{children}</div> }));

import { SpellingsCard } from './ResultsDataCheck';

const report = {
  totalRows: 10,
  groups: [{ from: 'PRINCIPLES OF ACCOUNTS', to: 'Principles of Accounts', resultIds: ['a', 'b', 'c'], classIds: ['C1'], terms: ['Term 3 2026'] }],
  duplicateSlots: [],
};

beforeEach(() => { cleanup(); h.fail = null; h.calls = 0; });

describe('Join spellings', () => {
  it('asks, joins, then says what happened and checks again', async () => {
    const onCheck = vi.fn(async () => {});
    render(<SpellingsCard report={report} checking={false} onCheck={onCheck} />);
    fireEvent.click(screen.getByRole('button', { name: /Join spellings \(3 marks\)/ }));
    expect(screen.getByText('Join the spellings of each subject?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, join them' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/2 mark\(s\) now under the right subject name; 1 older duplicate mark\(s\) removed/));
    expect(h.calls).toBe(1);
    expect(onCheck).toHaveBeenCalled();
  });

  it('shows a refusal by the database in the card', async () => {
    h.fail = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    render(<SpellingsCard report={report} checking={false} onCheck={async () => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Join spellings/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, join them' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/The database refused the change/));
  });
});

describe('Remove extra assignments', () => {
  const dup = {
    totalRows: 10,
    groups: [],
    duplicateSlots: [
      { classId: 'C1', className: 'Form 1B', subject: 'Food & Nutrition', slots: [
        { id: 'C1__Food & Nutrition', subject: 'Food & Nutrition', teacher: 'INAMBAO M. BRIDGET', ownerTeacherId: 'T1' },
        { id: 'C1__food and nutrition', subject: 'food and nutrition', teacher: null, ownerTeacherId: null },
      ] },
      { classId: 'C2', className: 'Grade 11B', subject: 'Civic Education', slots: [
        { id: 'C2__CIVIC EDUCATION', subject: 'CIVIC EDUCATION', teacher: 'Nosiku Namunji', ownerTeacherId: 'T6' },
        { id: 'C2__Civic Education', subject: 'Civic Education', teacher: 'Sibiho Kabika', ownerTeacherId: 'T7' },
      ] },
    ],
  };

  it('says what each class keeps, asks, removes, and reports', async () => {
    const onCheck = vi.fn(async () => {});
    render(<SpellingsCard report={dup as any} checking={false} onCheck={onCheck} />);
    expect(screen.getByText(/keeps "Food & Nutrition" \(INAMBAO M. BRIDGET\), removes "food and nutrition" \(no teacher\)/)).toBeTruthy();
    expect(screen.getByText(/assigned to Nosiku Namunji and Sibiho Kabika — choose who teaches it/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Remove extra assignments \(1 class\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove them' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Extra assignments removed' }).textContent)
      .toMatch(/1 extra assignment\(s\) removed in 1 class\(es\).*4 mark\(s\), 2 register\(s\), 3 timetable period\(s\).*Left for you: Grade 11B Civic Education/));
    expect(onCheck).toHaveBeenCalled();
  });
});
