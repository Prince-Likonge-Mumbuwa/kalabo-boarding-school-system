// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/services/sponsorListService', () => ({
  getSponsorList: async () => ({ names: ['KGS', 'CAMFED', 'CDF', 'AP', 'WISE', 'Plan International'], aliases: {} }),
}));
import { SponsorSelect } from './SponsorSelect';

const renderIt = (value: string, onChange = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SponsorSelect value={value} onChange={onChange} />
    </QueryClientProvider>,
  );
  return onChange;
};

beforeEach(() => cleanup());

describe('SponsorSelect', () => {
  it('offers Self-sponsored and the listed sponsors (including ones the guidance teacher added)', async () => {
    const onChange = renderIt('');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Plan International' })).toBeTruthy());
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['Self-sponsored', 'KGS', 'CAMFED', 'CDF', 'AP', 'WISE', 'Plan International']);
    expect((screen.getByRole('combobox', { name: 'Sponsor' }) as HTMLSelectElement).value).toBe('Self-sponsored');
    fireEvent.change(screen.getByRole('combobox', { name: 'Sponsor' }), { target: { value: 'CAMFED' } });
    expect(onChange).toHaveBeenCalledWith('CAMFED');
    expect(screen.getByText(/Sponsor not listed\? The guidance teacher adds sponsors/)).toBeTruthy();
  });

  it('an old typed value shows as what it counts as', async () => {
    renderIt('Mr John Banda');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Plan International' })).toBeTruthy());
    expect((screen.getByRole('combobox', { name: 'Sponsor' }) as HTMLSelectElement).value).toBe('Self-sponsored');
    expect(screen.getByText('Was typed as “Mr John Banda” — counts as Self-sponsored.')).toBeTruthy();
  });

  it('a spelling of a listed sponsor selects it', async () => {
    renderIt('camfed');
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Sponsor' }) as HTMLSelectElement).value).toBe('CAMFED'));
  });
});
