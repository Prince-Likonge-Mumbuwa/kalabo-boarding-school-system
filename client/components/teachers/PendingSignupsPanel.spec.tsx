// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  user: null as any,
  pending: [] as any[],
  approved: [] as string[],
  declined: [] as string[],
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: h.user, loading: false, isAuthenticated: !!h.user, logout: vi.fn() }),
}));
vi.mock('@/services/signupApprovalService', async () => {
  const real = await vi.importActual<any>('@/services/signupApprovalService');
  return {
    ...real,
    listPendingSignups: vi.fn(async () => h.pending.filter(p => !h.approved.includes(p.id) && !h.declined.includes(p.id))),
    approveSignup: vi.fn(async (id: string) => { h.approved.push(id); }),
    declineSignup: vi.fn(async (id: string) => { h.declined.push(id); }),
  };
});
vi.mock('@/lib/auditedFirestore', () => ({}));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PendingSignupsPanel } from './PendingSignupsPanel';

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  cleanup();
  h.user = null;
  h.approved = [];
  h.declined = [];
  h.pending = [
    { id: 'N1', fullName: 'Mutinta Hamoonga', email: 'm@x', tsNumber: '12345', employeeNumber: '', nrc: '', subjects: ['Biology'], createdAt: new Date(2026, 9, 27) },
    { id: 'N2', fullName: 'Stranger Danger', email: 's@x', tsNumber: '', employeeNumber: '', nrc: '', subjects: [], createdAt: null },
  ];
});

describe('a teacher waiting for approval', () => {
  it('sees the waiting page instead of the dashboard', () => {
    h.user = { uid: 'N1', userType: 'teacher', fullName: 'Mutinta', status: 'pending' };
    wrap(<ProtectedRoute><p>Dashboard</p></ProtectedRoute>);
    expect(screen.getByText('Waiting for approval')).toBeTruthy();
    expect(screen.queryByText('Dashboard')).toBeNull();
  });
  it('a declined teacher is told so', () => {
    h.user = { uid: 'N2', userType: 'teacher', fullName: 'S', status: 'rejected' };
    wrap(<ProtectedRoute><p>Dashboard</p></ProtectedRoute>);
    expect(screen.getByText('Sign-up not approved')).toBeTruthy();
  });
  it('approved and older accounts (no status) see the dashboard', () => {
    for (const status of ['active', undefined]) {
      cleanup();
      h.user = { uid: 'T1', userType: 'teacher', fullName: 'T', status };
      wrap(<ProtectedRoute><p>Dashboard</p></ProtectedRoute>);
      expect(screen.getByText('Dashboard')).toBeTruthy();
    }
  });
});

describe('Teacher Management → sign-ups waiting for approval', () => {
  it('lists them; approve and decline', async () => {
    const done = vi.fn();
    wrap(<PendingSignupsPanel adminName="Head" onDone={done} />);
    expect(await screen.findByText('2 teacher sign-ups waiting for approval')).toBeTruthy();
    expect(screen.getByText(/m@x · TS 12345/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Approve Mutinta Hamoonga' }));
    await waitFor(() => expect(done).toHaveBeenCalledWith('Mutinta Hamoonga can now use the system.', true));
    expect(await screen.findByText('1 teacher sign-up waiting for approval')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Decline Stranger Danger' }));
    await waitFor(() => expect(h.declined).toEqual(['N2']));
    await waitFor(() => expect(screen.queryByLabelText('Sign-ups waiting for approval')).toBeNull());
  });
  it('shows nothing when nobody is waiting', async () => {
    h.pending = [];
    const { container } = wrap(<PendingSignupsPanel adminName="Head" />);
    await new Promise(r => setTimeout(r, 20));
    expect(container.textContent).toBe('');
  });
});
