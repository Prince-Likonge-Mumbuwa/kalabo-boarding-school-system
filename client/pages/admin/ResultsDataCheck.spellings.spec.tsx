// @vitest-environment jsdom
// The "Join spellings" button: confirm → progress → outcome shown in the card.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ fail: null as null | any, calls: 0 }));
vi.mock('@/services/resultsDataCheck', () => ({
  fixSubjectSpellings: vi.fn(async (_g: any, onProgress: any) => {
    h.calls++;
    if (h.fail) throw h.fail;
    onProgress?.(0, 3);
    onProgress?.(3, 3);
    return { moved: 2, droppedOlder: 1, skipped: [] };
  }),
}));
vi.mock('@/services/resultsService', () => ({ resultsService: { invalidateGrid: vi.fn() } }));
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
