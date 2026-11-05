// @vitest-environment jsdom
// Admin dashboard → Publish results. Today is Thu 12 Nov 2026 (Term 3 2026).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  // What the Results Entry Monitor reports now, and what it reports when asked again.
  shown: null as null | { requiredEntries: number; doneEntries: number },
  fresh: null as null | { requiredEntries: number; doneEntries: number },
  failed: [] as any[],
  records: {} as Record<string, any>,
  publish: vi.fn(async () => {}),
  unpublish: vi.fn(async () => {}),
  refetchCalls: 0,
}));

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('@/hooks/useResultsEntryMonitor', () => ({
  useResultsEntryMonitor: () => ({
    completion: h.shown,
    failedClasses: h.failed,
    isLoading: false,
    error: null,
    refetch: async () => {
      h.refetchCalls++;
      return { data: { completion: h.fresh ?? h.shown, failedClasses: h.failed } };
    },
  }),
}));

vi.mock('@/services/resultsPublication', async () => {
  const actual = await vi.importActual<typeof import('@/services/resultsPublication')>('@/services/resultsPublication');
  return {
    ...actual,
    getPublication: async (term: string, year: number) => h.records[`${term}|${year}`] ?? null,
    publishResults: (...args: any[]) => (h.publish as any)(...args),
    unpublishResults: (...args: any[]) => (h.unpublish as any)(...args),
  };
});

import { PublishResultsPanel } from './PublishResultsPanel';

const actor = { uid: 'ADMIN', name: 'Head Teacher' };
const renderIt = (a: typeof actor | null = actor) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <PublishResultsPanel actor={a} />
      </MemoryRouter>
    </QueryClientProvider>
  );

const publishBtn = () => screen.getByRole('button', { name: 'Publish results' }) as HTMLButtonElement;

beforeEach(() => {
  cleanup();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 12, 10, 20));
  h.shown = { requiredEntries: 1000, doneEntries: 710 };
  h.fresh = null;
  h.failed = [];
  h.records = {};
  h.publish.mockClear();
  h.unpublish.mockClear();
  h.refetchCalls = 0;
});
afterEach(() => vi.useRealTimers());

describe('Publish results panel', () => {
  it('offers the current term and five before it, opening on the current one', async () => {
    renderIt();
    const select = (await screen.findByLabelText('Term')) as HTMLSelectElement;
    const labels = [...select.options].map(o => o.textContent);
    expect(labels).toEqual([
      'Term 3 2026 (current)', 'Term 2 2026', 'Term 1 2026', 'Term 3 2025', 'Term 2 2025', 'Term 1 2025',
    ]);
    expect(select.selectedIndex).toBe(0);
  });

  it('below 98%: not published, shows how much is missing, and the button is off', async () => {
    renderIt();
    expect(await screen.findByText(/Not published — guardians and sponsors cannot see Term 3 2026/)).toBeTruthy();
    expect(screen.getByText('71%')).toBeTruthy();
    expect(screen.getByText(/710 of 1000/)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(
      'Only 71% of the results are entered; 98% is needed (270 more results to enter).'
    );
    expect(publishBtn().disabled).toBe(true);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('71');
  });

  it('97.9% still cannot be published', async () => {
    h.shown = { requiredEntries: 1000, doneEntries: 979 };
    renderIt();
    await screen.findByText(/Not published/);
    expect(screen.getByText('97.9%')).toBeTruthy();
    expect(publishBtn().disabled).toBe(true);
  });

  it('at 98% the button is on; it asks first, then publishes with a fresh count', async () => {
    h.shown = { requiredEntries: 1000, doneEntries: 981 };
    h.fresh = { requiredEntries: 1000, doneEntries: 990 }; // more were entered since the screen loaded
    renderIt();
    await screen.findByText(/Not published/);
    expect(publishBtn().disabled).toBe(false);

    fireEvent.click(publishBtn());
    const confirm = screen.getByRole('group', { name: 'Confirm' });
    expect(within(confirm).getByText('Publish Term 3 2026 results? Guardians and sponsors will be able to open them.')).toBeTruthy();
    expect(h.publish).not.toHaveBeenCalled();

    fireEvent.click(within(confirm).getByRole('button', { name: 'Yes, publish' }));
    await waitFor(() => expect(h.publish).toHaveBeenCalledTimes(1));
    expect(h.refetchCalls).toBe(1);
    expect(h.publish).toHaveBeenCalledWith('Term 3', 2026, { requiredEntries: 1000, doneEntries: 990 }, actor);
    expect((await screen.findByText(/Term 3 2026 results are published/)).textContent).toMatch(/Guardians and sponsors can now open them/);
  });

  it('Cancel writes nothing', async () => {
    h.shown = { requiredEntries: 1000, doneEntries: 1000 };
    renderIt();
    await screen.findByText(/Not published/);
    fireEvent.click(publishBtn());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'Confirm' })).toBeNull();
    expect(h.publish).not.toHaveBeenCalled();
    expect(h.refetchCalls).toBe(0);
  });

  it('a stale screen cannot publish: the recount below 98% is refused', async () => {
    h.shown = { requiredEntries: 1000, doneEntries: 985 };
    h.fresh = { requiredEntries: 1000, doneEntries: 900 }; // marks were deleted meanwhile
    renderIt();
    await screen.findByText(/Not published/);
    fireEvent.click(publishBtn());
    fireEvent.click(screen.getByRole('button', { name: 'Yes, publish' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Only 90% of the results are entered; 98% is needed (80 more results to enter).');
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('classes that failed to load block publishing', async () => {
    h.failed = [{ classId: 'C2', className: 'Form 2B', error: 'offline' }];
    renderIt();
    await screen.findByText(/Not published/);
    expect(screen.getByRole('status').textContent).toMatch(/1 class could not be loaded/);
    expect(publishBtn().disabled).toBe(true);
  });

  it('a term with no tests set up cannot be published', async () => {
    h.shown = { requiredEntries: 0, doneEntries: 0 };
    renderIt();
    await screen.findByText(/Not published/);
    expect(screen.getByRole('status').textContent).toMatch(/nothing to publish/);
    expect(publishBtn().disabled).toBe(true);
  });

  it('while counting, the button stays off (not mistaken for 100%)', async () => {
    h.shown = null;
    renderIt();
    await screen.findByText(/Not published/);
    expect(screen.getByRole('status').textContent).toMatch(/Checking how many results are entered/);
    expect(publishBtn().disabled).toBe(true);
  });

  it('a published term shows who and when, and can be withdrawn after a confirmation', async () => {
    h.records['Term 3|2026'] = {
      published: true, publishedAt: new Date(2026, 10, 5), publishedByName: 'Head Teacher', completionPercent: 98.4,
    };
    renderIt();
    expect(await screen.findByText(/Published — guardians and sponsors can open Term 3 2026/)).toBeTruthy();
    expect(screen.getByText(/5 Nov 2026 by Head Teacher · 98.4% entered at the time/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Publish results' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Withdraw results' }));
    expect(h.unpublish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, withdraw' }));
    await waitFor(() => expect(h.unpublish).toHaveBeenCalledWith('Term 3', 2026, actor));
    expect((await screen.findByText(/Term 3 2026 results are withdrawn/)).textContent).toMatch(/can no longer open them/);
  });

  it('an older term is open already and can be withdrawn', async () => {
    renderIt();
    await screen.findByText(/Not published/);
    fireEvent.change(screen.getByLabelText('Term'), { target: { value: '1' } }); // Term 2 2026
    expect(await screen.findByText(/Published — guardians and sponsors can open Term 2 2026/)).toBeTruthy();
    expect(screen.getByText('Open since before publishing was introduced.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Withdraw results' })).toBeTruthy();
  });

  it('shows a failed save and keeps the term unpublished', async () => {
    h.shown = { requiredEntries: 1000, doneEntries: 1000 };
    h.publish.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'));
    renderIt();
    await screen.findByText(/Not published/);
    fireEvent.click(publishBtn());
    fireEvent.click(screen.getByRole('button', { name: 'Yes, publish' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Missing or insufficient permissions.');
    expect(screen.getByText(/Not published/)).toBeTruthy();
  });

  it('without a signed-in admin nothing can be published', async () => {
    h.shown = { requiredEntries: 1000, doneEntries: 1000 };
    renderIt(null);
    await screen.findByText(/Not published/);
    expect(publishBtn().disabled).toBe(true);
  });
});
