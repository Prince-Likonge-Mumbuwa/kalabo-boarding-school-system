// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  calls: [] as string[],
  cards: [] as any[],
  redeemError: null as null | string,
}));

vi.mock('@/services/guidanceService', () => ({
  checkSponsorCode: vi.fn(async (typed: string) => {
    h.calls.push('check');
    if (typed.includes('USED')) throw new Error('That code has already been used.');
    return { code: 'SP-7KQ3-M9XP', sponsorName: 'CAMFED', term: 'Term 3', year: 2026, learnerIds: ['a', 'b'], learnerCount: 2, status: 'active' };
  }),
  buildSponsorReports: vi.fn(async () => {
    h.calls.push('reports');
    return { cards: h.cards, noResults: [] };
  }),
  redeemSponsorCode: vi.fn(async () => {
    h.calls.push('redeem');
    if (h.redeemError) throw new Error(h.redeemError);
  }),
}));
vi.mock('@/services/pdf/sponsorReportsPDF', () => ({
  generateSponsorReportsPDF: vi.fn(async () => { h.calls.push('pdf'); return new Uint8Array([1]); }),
  sponsorPdfFileName: () => 'x.pdf',
  downloadPdf: vi.fn(() => { h.calls.push('download'); }),
}));

import { SponsorPortalPanel } from './SponsorPortalPanel';

const card = (name: string, form: string, className: string) => ({ studentName: name, form, className, documentId: name });

const submit = (code: string) => {
  fireEvent.change(screen.getByPlaceholderText('e.g. SP-7KQ3-M9XP'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: /Get Report Cards/i }));
};

beforeEach(() => { cleanup(); h.calls = []; h.cards = [card('Ann', '1', 'Form 1A'), card('Bob', '10', 'Grade 10A')]; h.redeemError = null; });

describe('Sponsor side of the Parent Portal', () => {
  it('spends the code only after the PDF is ready, then downloads it', async () => {
    render(<SponsorPortalPanel />);
    submit('sp-7kq3-m9xp');
    await waitFor(() => expect(screen.getByText('CAMFED')).toBeTruthy());
    expect(h.calls).toEqual(['check', 'reports', 'pdf', 'redeem', 'download']);
    expect(screen.getByText('Form 1')).toBeTruthy();
    expect(screen.getByText('Grade 10')).toBeTruthy();
  });

  it('does not spend the code when there are no results yet', async () => {
    h.cards = [];
    render(<SponsorPortalPanel />);
    submit('SP-7KQ3-M9XP');
    await waitFor(() => expect(screen.getByText(/has NOT been used/)).toBeTruthy());
    expect(h.calls).not.toContain('redeem');
  });

  it('refuses a used code', async () => {
    render(<SponsorPortalPanel />);
    submit('SP-USED-USED');
    await waitFor(() => expect(screen.getByText(/already been used/)).toBeTruthy());
    expect(h.calls).toEqual(['check']);
  });

  it('gives nothing when someone else used the code meanwhile', async () => {
    h.redeemError = 'That code has already been used.';
    render(<SponsorPortalPanel />);
    submit('SP-7KQ3-M9XP');
    await waitFor(() => expect(screen.getByText(/already been used/)).toBeTruthy());
    expect(h.calls).not.toContain('download');
  });
});
