// @vitest-environment jsdom
// Settings keeps only the face recognition on/off switch; enrolment and
// match levels moved to Attendance → Face recognition. Each saves only its
// own fields, so neither can undo the other.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('firebase/firestore', async () => await import('../../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'ADMIN', fullName: 'Head', userType: 'admin' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useSchoolClasses', () => ({
  useSchoolClasses: () => ({ isLoading: false, classes: [
    { id: 'A', name: 'Form 2A', learnerStats: { total: 40 } },
    { id: 'B', name: 'Form 2B', learnerStats: { total: 38 } },
  ] }),
}));

import { resetStore, getDocData } from '../../test/fakeFirestore';
import { FaceRecognitionToggleCard, FACE_ADMIN_PATH } from './FaceRecognitionToggleCard';
import FaceRecognitionPanel from './FaceRecognitionPanel';

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  cleanup();
  resetStore({
    system: { faceRecognition: { enabled: false, reviewThreshold: 0.4, matchThreshold: 0.5 } },
    face_status: {
      l1: { classId: 'A', consent: true, templateCount: 2 },
      l2: { classId: 'A', consent: true, templateCount: 0 },
      l3: { classId: 'B', consent: false, templateCount: 0 },
    },
  });
});

describe('Settings → face recognition switch', () => {
  it('turns the feature on without touching the match levels', async () => {
    wrap(<FaceRecognitionToggleCard />);
    const sw = await screen.findByRole('switch', { name: 'Face recognition for all teachers' });
    await screen.findByText('Off for teachers');
    fireEvent.click(sw);
    await waitFor(() => expect(getDocData('system', 'faceRecognition')?.enabled).toBe(true));
    expect(getDocData('system', 'faceRecognition')).toMatchObject({ reviewThreshold: 0.4, matchThreshold: 0.5, updatedBy: 'ADMIN' });
    expect(await screen.findByText('On for all teachers')).toBeTruthy();
  });

  it('links to the face recognition tab in Attendance (no class list or thresholds here)', async () => {
    wrap(<FaceRecognitionToggleCard />);
    expect(screen.getByRole('link', { name: /Enrol faces and set match levels/ }).getAttribute('href')).toBe(FACE_ADMIN_PATH);
    expect(screen.queryByText('Form 2A')).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });
});

describe('Attendance → Face recognition', () => {
  it('shows class progress and saves match levels without changing the switch', async () => {
    resetStore({
      system: { faceRecognition: { enabled: true, reviewThreshold: 0.363, matchThreshold: 0.45 } },
      face_status: { l1: { classId: 'A', consent: true, templateCount: 2 } },
    });
    wrap(<FaceRecognitionPanel />);
    expect(await screen.findByText('On for all teachers')).toBeTruthy();
    expect(await screen.findByText('1/40 · 1 consent')).toBeTruthy();
    expect(screen.getByText('0/38 · 0 consent')).toBeTruthy();
    expect(screen.getByText('1 of 78 learners have a face saved.')).toBeTruthy();

    const [match] = screen.getAllByRole('spinbutton');
    fireEvent.change(match, { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(getDocData('system', 'faceRecognition')?.matchThreshold).toBe(0.5));
    expect(getDocData('system', 'faceRecognition')?.enabled).toBe(true);
  });

  it('filters classes by name', async () => {
    wrap(<FaceRecognitionPanel />);
    await screen.findByText('Form 2A');
    fireEvent.change(screen.getByRole('textbox', { name: 'Find a class' }), { target: { value: '2b' } });
    expect(screen.queryByText('Form 2A')).toBeNull();
    expect(screen.getByText('Form 2B')).toBeTruthy();
  });
});
