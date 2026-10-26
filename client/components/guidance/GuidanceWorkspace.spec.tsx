// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ created: null as any, saved: [] as any[], fixes: null as any, list: null as any }));

vi.mock('@/services/schoolService', () => ({
  learnerService: {
    getAllLearners: async () => [
      { id: 'a', fullName: 'Ann', studentId: 'G10A_001', className: 'Grade 10A', classLevel: 10, sponsor: 'CAMFED', status: 'active' },
      { id: 'b', fullName: 'Bob', studentId: 'F1A_002', className: 'Form 1A', classLevel: 1, sponsor: 'Camfed', status: 'active' },
      { id: 'c', fullName: 'Cate', studentId: 'F2A_003', className: 'Form 2A', classLevel: 2, sponsor: 'Self', status: 'active' },
      { id: 'd', fullName: 'Dan', studentId: 'F1B_004', className: 'Form 1B', classLevel: 1, sponsor: 'World Vision', status: 'active' },
    ],
  },
}));
vi.mock('@/services/guidanceService', () => ({
  buildSponsorReports: vi.fn(async () => ({ cards: [], noResults: [] })),
  listSponsorCodes: vi.fn(async () => []),
  revokeSponsorCode: vi.fn(),
  createSponsorCode: vi.fn(async (input: any) => {
    h.created = input;
    return { ...input, code: 'SP-7KQ3-M9XP', learnerCount: input.learnerIds.length, status: 'active', createdBy: 'T1', createdByName: 'Mr T', expiresAt: new Date('2026-11-19') };
  }),
}));

vi.mock('@/services/sponsorListService', () => ({
  SPONSORS_DOC: ['system', 'sponsors'],
  getSponsorList: vi.fn(async () => h.list ?? { names: ['KGS', 'CAMFED', 'CDF', 'AP', 'WISE'], aliases: {} }),
  saveSponsorList: vi.fn(async (list: any) => { h.saved.push(list); }),
  applySponsorFixes: vi.fn(async (fixes: any[]) => { h.fixes = fixes; return fixes.length; }),
}));

import { GuidanceWorkspace } from './GuidanceWorkspace';

const renderIt = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <GuidanceWorkspace user={{ uid: 'T1', name: 'Mr T', isAdmin: false }} />
    </QueryClientProvider>
  );

beforeEach(() => { cleanup(); h.created = null; h.saved = []; h.fixes = null; h.list = null; });

describe('Guidance workspace', () => {
  it('lists the sponsors on the list; other names count as self-sponsored', async () => {
    renderIt();
    await waitFor(() => expect(screen.getByRole('button', { name: /CAMFED/ })).toBeTruthy());
    expect(screen.getByRole('button', { name: /KGS/ })).toBeTruthy(); // listed, even with no learners
    expect(screen.queryByRole('button', { name: /World Vision/ })).toBeNull();
    expect(screen.getByText(/2 sponsored learners · 2 self-sponsored/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '1 with a name not on the sponsor list' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /CAMFED/ }));
    const rows = screen.getAllByRole('row').map(r => r.textContent || '');
    const bob = rows.findIndex(r => r.includes('Bob'));
    const ann = rows.findIndex(r => r.includes('Ann'));
    expect(bob).toBeGreaterThan(-1);
    expect(bob).toBeLessThan(ann); // Form 1 before Grade 10
  });

  it('generates a one-time code for the sponsor', async () => {
    renderIt();
    await waitFor(() => expect(screen.getByRole('button', { name: /CAMFED/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /CAMFED/ }));
    fireEvent.click(screen.getByRole('button', { name: /Generate sponsor code/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate code' }));
    await waitFor(() => expect(within(dialog).getByText('SP-7KQ3-M9XP')).toBeTruthy());
    expect(h.created.learnerIds.sort()).toEqual(['a', 'b']);
    expect(h.created.sponsorKeys).toEqual(['camfed']);
  });

  it('Sponsor list: add a sponsor; a name typed but not listed can be added or marked as a listed one', async () => {
    renderIt();
    await waitFor(() => expect(screen.getByRole('button', { name: /CAMFED/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '1 with a name not on the sponsor list' }));

    const listSec = await screen.findByRole('region', { name: 'Sponsors' });
    expect(within(listSec).getAllByRole('listitem').map(li => li.textContent?.replace(/\s+/g, ''))).toEqual(['KGS0', 'CAMFED2', 'CDF0', 'AP0', 'WISE0']);

    // Add a new sponsor
    const input = screen.getByRole('textbox', { name: 'New sponsor name' });
    fireEvent.change(input, { target: { value: 'camfed' } });
    expect(screen.getByText('CAMFED is already on the list.')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'Plan International' } });
    fireEvent.click(screen.getByRole('button', { name: /Add sponsor/ }));
    await waitFor(() => expect(h.saved).toHaveLength(1));
    expect(h.saved[0].names).toEqual(['KGS', 'CAMFED', 'CDF', 'AP', 'WISE', 'Plan International']);
    expect(await screen.findByText('Plan International added to the sponsor list.')).toBeTruthy();

    // "World Vision" was typed for Dan: not on the list → offered to add, or mark as the same as one.
    const other = screen.getByRole('region', { name: 'Other names typed as sponsor' });
    expect(within(other).getByText('World Vision')).toBeTruthy();
    fireEvent.change(within(other).getByRole('combobox', { name: 'World Vision is the same as' }), { target: { value: 'WISE' } });
    await waitFor(() => expect(h.saved).toHaveLength(2));
    expect(h.saved[1].aliases).toEqual({ worldvision: 'WISE' });
    expect(await screen.findByText('"World Vision" now counts as WISE.')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Other names typed as sponsor' })).getByText(/None/)).toBeTruthy();
  });

  it('Sponsor list: tidy learner records — spellings to the listed name, everything else to Self-sponsored', async () => {
    renderIt();
    await waitFor(() => expect(screen.getByRole('button', { name: /CAMFED/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Sponsor list' }));
    const tidy = await screen.findByRole('region', { name: 'Tidy learner records' });
    expect(tidy.textContent).toMatch(/3 current learners — 2 to Self-sponsored, 1 to the listed sponsor's name/);
    expect(within(tidy).getAllByRole('listitem').map(li => li.textContent)).toEqual([
      '“Camfed” → CAMFED (1)', '“Self” → Self-sponsored (1)', '“World Vision” → Self-sponsored (1)',
    ]);
    // Warns that a real sponsor should be added first.
    expect(within(tidy).getByText(/Add any real sponsor above first/)).toBeTruthy();
    fireEvent.click(within(tidy).getByRole('button', { name: 'Update 3 learner records' }));
    fireEvent.click(within(tidy).getByRole('button', { name: /Yes, update records/ }));
    await waitFor(() => expect(h.fixes).toHaveLength(3));
    expect(h.fixes).toEqual(expect.arrayContaining([
      { id: 'b', from: 'Camfed', to: 'CAMFED' },
      { id: 'c', from: 'Self', to: 'Self-sponsored' },
      { id: 'd', from: 'World Vision', to: 'Self-sponsored' },
    ]));
    expect(await screen.findByText('3 learner records updated.')).toBeTruthy();
  });
});
