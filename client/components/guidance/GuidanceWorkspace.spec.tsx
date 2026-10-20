// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ created: null as any }));

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

import { GuidanceWorkspace } from './GuidanceWorkspace';

const renderIt = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <GuidanceWorkspace user={{ uid: 'T1', name: 'Mr T', isAdmin: false }} />
    </QueryClientProvider>
  );

beforeEach(() => { cleanup(); h.created = null; });

describe('Guidance workspace', () => {
  it('lists sponsors (not self-sponsored) and their learners in form order', async () => {
    renderIt();
    await waitFor(() => expect(screen.getByText('World Vision')).toBeTruthy());
    expect(screen.queryByText('Self')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /CAMFED/ }));
    const rows = screen.getAllByRole('row').map(r => r.textContent || '');
    const bob = rows.findIndex(r => r.includes('Bob'));
    const ann = rows.findIndex(r => r.includes('Ann'));
    expect(bob).toBeGreaterThan(-1);
    expect(bob).toBeLessThan(ann); // Form 1 before Grade 10
  });

  it('generates a one-time code for the sponsor', async () => {
    renderIt();
    await waitFor(() => expect(screen.getByText('World Vision')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /CAMFED/ }));
    fireEvent.click(screen.getByRole('button', { name: /Generate sponsor code/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate code' }));
    await waitFor(() => expect(within(dialog).getByText('SP-7KQ3-M9XP')).toBeTruthy());
    expect(h.created.learnerIds.sort()).toEqual(['a', 'b']);
    expect(h.created.sponsorKeys).toEqual(['camfed']);
  });
});
