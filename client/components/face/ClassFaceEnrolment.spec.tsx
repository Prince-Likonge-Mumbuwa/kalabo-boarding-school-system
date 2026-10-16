// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', async () => await import('../../test/fakeFirestore'));
vi.mock('@/lib/face', () => ({ readFaces: vi.fn(), warmUp: () => {}, FaceError: class extends Error {} }));
vi.mock('@/lib/face/faceApi', () => ({ faceApi: { setConsent: vi.fn(async () => ({ ok: true })) } }));
vi.mock('@/hooks/useFaceRecognition', () => ({
  useInvalidateFaceStatus: () => () => {},
  useClassFaceStatus: () => ({
    isLoading: false, isError: false,
    data: new Map([
      ['docA', { learnerId: 'docA', consent: true, templateCount: 3, templates: [] }],
      ['docB', { learnerId: 'docB', consent: true, templateCount: 0, templates: [] }],
    ]),
  }),
}));
import { ClassFaceEnrolment } from './ClassFaceEnrolment';

const learners = [
  { id: 'docA', studentId: 'F2A_001', fullName: 'Alice Phiri', status: 'active' },
  { id: 'docB', studentId: 'F2A_002', fullName: 'Ben Tembo' },
  { id: 'docC', studentId: 'F2A_003', fullName: 'Chipo Zulu', status: 'active' },
  { id: 'docD', studentId: 'F1A_009', fullName: 'Left School', status: 'archived' },
];

afterEach(cleanup);

describe('class face enrolment', () => {
  it('lists the class\'s active learners with their face status, by learner record', () => {
    render(<ClassFaceEnrolment open onOpenChange={() => {}} classId="F2A" className="Form 2A" learners={learners} />);
    expect(screen.getByText(/1 of 3 learners have a face saved/)).toBeTruthy();
    expect(screen.queryByText('Left School')).toBeNull(); // archived learners are not offered
    expect(screen.getByText('F2A_002')).toBeTruthy();
    expect(screen.getAllByTitle('Face recognition: Face added')).toHaveLength(1);
    expect(screen.getAllByTitle('Face recognition: Needs photo')).toHaveLength(1);
    expect(screen.getAllByTitle('Face recognition: No consent')).toHaveLength(1);
  });

  it('opens the learner with their existing name and student number; no consent → asks for it first', () => {
    render(<ClassFaceEnrolment open onOpenChange={() => {}} classId="F2A" className="Form 2A" learners={learners} />);
    fireEvent.click(screen.getByText('Chipo Zulu'));
    expect(screen.getByText('Face for Chipo Zulu')).toBeTruthy();
    expect(screen.getByText('F2A_003')).toBeTruthy();
    expect(screen.getByText(/No guardian consent recorded/)).toBeTruthy();
  });
});
