// @vitest-environment jsdom
// One learner's face from Add / Edit Learner and Admissions, looked up by
// learner record (so promotions and transfers never hide a saved face).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ user: { uid: 'ADMIN', fullName: 'Admin', userType: 'admin' } as any }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', async () => await import('../../test/fakeFirestore'));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('./FaceEnrolDialog', () => ({
  FaceEnrolDialog: ({ learner, status }: any) => <p>enrol {learner.name} · {learner.className} · {status ? `${status.templateCount} saved` : 'none saved'}</p>,
}));

import { resetStore } from '../../test/fakeFirestore';
import { fetchFaceStatus } from '@/hooks/useFaceRecognition';
import { LearnerFaceDialog, LearnerFaceRow, type FaceLearner } from './LearnerFace';

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const amy: FaceLearner = { id: 'L1', studentId: 'F3A_004', fullName: 'Amy Banda', className: 'Form 3A' };

function EditRow({ learner }: { learner: FaceLearner }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <LearnerFaceRow learner={learner} onOpen={() => setOpen(true)} />
      <LearnerFaceDialog learner={open ? learner : null} onClose={() => setOpen(false)} />
    </>
  );
}

beforeEach(() => {
  h.user = { uid: 'ADMIN', fullName: 'Admin', userType: 'admin' };
  resetStore({
    system: { faceRecognition: { enabled: false } },
    // Amy was promoted from Form 2A: the face record still says F2A until the next sync.
    face_status: {
      L1: { classId: 'F2A', className: 'Form 2A', consent: true, templateCount: 3, templates: [] },
      L2: { classId: 'F3A', consent: false, templateCount: 0 },
    },
  });
});
afterEach(cleanup);

describe('learner face', () => {
  it('finds face records by learner id, whatever class they still name', async () => {
    const m = await fetchFaceStatus(['L1', 'L2', 'L3', 'L1']);
    expect([...m.keys()].sort()).toEqual(['L1', 'L2']);
    expect(m.get('L1')?.templateCount).toBe(3);
    expect((await fetchFaceStatus([])).size).toBe(0);
  });

  it('Edit Learner: shows the face status and opens capture for this learner in their class now', async () => {
    wrap(<EditRow learner={amy} />);
    expect(await screen.findByTitle('Face recognition: Face added')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Manage face/ }));
    expect(await screen.findByText('enrol Amy Banda · Form 3A · 3 saved')).toBeTruthy();
  });

  it('a learner without a face is offered "Capture face"', async () => {
    wrap(<EditRow learner={{ ...amy, id: 'L9', fullName: 'New Learner' }} />);
    fireEvent.click(await screen.findByRole('button', { name: /Capture face/ }));
    expect(await screen.findByText('enrol New Learner · Form 3A · none saved')).toBeTruthy();
  });

  it('hidden from teachers while face recognition is switched off', async () => {
    h.user = { uid: 'T1', fullName: 'Teacher', userType: 'teacher' };
    wrap(<EditRow learner={amy} />);
    await new Promise(r => setTimeout(r, 50));
    expect(screen.queryByText('Face recognition')).toBeNull();
    expect(screen.queryByRole('button', { name: /face/i })).toBeNull();
  });
});
