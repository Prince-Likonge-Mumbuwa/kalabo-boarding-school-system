// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('firebase/firestore', async () => await import('../../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'OFF1' } }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'OFF1', fullName: 'Mrs Officer', userType: 'teacher' } }) }));
vi.mock('@/components/face/FaceEnrolDialog', () => ({ FaceEnrolDialog: ({ learner }: any) => <p>face dialog for {learner.name} ({learner.id})</p> }));
const printed = vi.hoisted(() => ({ calls: [] as any[] }));
vi.mock('./admissionSlip', () => ({ printAdmissionSlip: (r: any) => printed.calls.push(r) }));

import { resetStore, getDocData } from '../../test/fakeFirestore';
import { AdmissionsWorkspace } from './AdmissionsWorkspace';

beforeEach(() => {
  cleanup();
  printed.calls = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2027-01-12T09:00:00'));
  resetStore({
    system: { academicYear: { currentYear: 2027 }, faceRecognition: { enabled: true } },
    classes: {
      A: { name: 'Form 1A', type: 'form', level: 1, section: 'A', isActive: true, students: 0 },
      B: { name: 'Form 1B', type: 'form', level: 1, section: 'B', isActive: true, students: 0 },
    },
    learners: {},
    admission_settings: {
      '2027': { year: 2027, isOpen: true, levels: [{ type: 'form', level: 1 }], defaultCapacity: 40, capacities: {}, excludedClassIds: [], seq: 0 },
    },
  });
});
afterEach(() => vi.useRealTimers());

const renderIt = (isAdmin = false) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AdmissionsWorkspace user={{ uid: isAdmin ? 'ADMIN' : 'OFF1', name: isAdmin ? 'Head' : 'Mrs Officer', isAdmin }} />
    </QueryClientProvider>
  );

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
// Date of birth is three dropdowns: day, month, year.
const dob = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  fireEvent.change(screen.getByLabelText('Year of birth'), { target: { value: String(y) } });
  fireEvent.change(screen.getByLabelText('Month of birth'), { target: { value: String(m) } });
  fireEvent.change(screen.getByLabelText('Day of birth'), { target: { value: String(d) } });
};

describe('Admissions workspace', () => {
  it('an officer enrols a learner: class shown before saving, student id generated, slip printed', async () => {
    renderIt();
    await screen.findByText('Learner');
    expect(screen.queryByRole('tab', { name: /Settings/ })).toBeNull(); // officers have no settings tab

    type('Full name', 'Mutinta Mwiinga');
    fireEvent.click(screen.getByRole('button', { name: 'Female' }));
    dob('2013-04-02');
    type('Home address', 'Kalabo');
    type('Guardian name', 'Mr Mwiinga');
    type('Guardian phone', '0971234567');
    expect(await screen.findByText(/Will be placed in/)).toBeTruthy();
    expect(screen.getByText('Form 1A', { selector: 'b' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Save and generate student ID/ }));
    await screen.findByText('Learner admitted');
    expect(screen.getByText('F1A_001')).toBeTruthy();
    expect(getDocData('admissions', '2027-0001')).toMatchObject({ fullName: 'Mutinta Mwiinga', classId: 'A', admittedByName: 'Mrs Officer' });

    fireEvent.click(screen.getByRole('button', { name: /Print admission slip/ }));
    expect(printed.calls[0]).toMatchObject({ studentId: 'F1A_001', className: 'Form 1A' });

    // The face is captured at enrolment, under the new learner's record.
    fireEvent.click(await screen.findByRole('button', { name: /Capture face now/ }));
    const learnerId = getDocData('admissions', '2027-0001')?.learnerId;
    expect(await screen.findByText(`face dialog for Mutinta Mwiinga (${learnerId})`)).toBeTruthy();

    // Progress shows the class filling.
    fireEvent.click(screen.getByRole('tab', { name: /Class progress/ }));
    expect(await screen.findByText(/Form 1: 1 of 80 places/)).toBeTruthy();
  });

  it('Admitted: faces for admitted learners — per learner, and the whole list', async () => {
    renderIt(true);
    await screen.findByText('Learner');
    type('Full name', 'Mutinta Mwiinga');
    fireEvent.click(screen.getByRole('button', { name: 'Female' }));
    dob('2013-04-02');
    type('Home address', 'Kalabo');
    type('Guardian name', 'Mr Mwiinga');
    type('Guardian phone', '0971234567');
    await screen.findByText(/Will be placed in/);
    fireEvent.click(screen.getByRole('button', { name: /Save and generate student ID/ }));
    await screen.findByText('Learner admitted');
    const learnerId = getDocData('admissions', '2027-0001')?.learnerId;

    fireEvent.click(screen.getByRole('tab', { name: /Admitted/ }));
    expect(await screen.findByRole('button', { name: /Faces \(1 without\)/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Face for Mutinta Mwiinga' }));
    expect(await screen.findByText(`face dialog for Mutinta Mwiinga (${learnerId})`)).toBeTruthy();
  });

  it('warns about a possible duplicate before admitting', async () => {
    resetStore({
      system: { academicYear: { currentYear: 2027 } },
      classes: { A: { name: 'Form 1A', type: 'form', level: 1, section: 'A', isActive: true } },
      learners: { e: { fullName: 'Mutinta Mwiinga', classId: 'A', className: 'Form 1A', studentId: 'F1A_001', status: 'active', academicYear: 2027 } },
      admission_settings: { '2027': { year: 2027, isOpen: true, levels: [{ type: 'form', level: 1 }], defaultCapacity: 40, capacities: {}, excludedClassIds: [], seq: 0 } },
    });
    renderIt();
    await screen.findByText('Learner');
    type('Full name', 'Mutinta Mwiinga');
    fireEvent.click(screen.getByRole('button', { name: 'Female' }));
    dob('2013-04-02');
    type('Home address', 'Kalabo');
    type('Guardian name', 'Mr Mwiinga');
    type('Guardian phone', '0971234567');
    await screen.findByText(/Will be placed in/);
    fireEvent.click(screen.getByRole('button', { name: /Save and generate student ID/ }));
    const card = (await screen.findByText('Already on the system?')).closest('section')!;
    expect(within(card).getByText('F1A_001')).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: /different learner/ }));
    await screen.findByText('Learner admitted');
    expect(getDocData('admissions', '2027-0001')!.studentId).toBe('F1A_002');
  });
});

describe('admission slip', () => {
  it('has both copies with the id, class and admission number', async () => {
    const { admissionSlipHtml } = await vi.importActual<typeof import('./admissionSlip')>('./admissionSlip');
    const html = admissionSlipHtml({
      id: '2027-0001', admissionNumber: 'ADM-2027-0001', year: 2027, seq: 1, learnerId: 'l', studentId: 'F1A_001',
      fullName: 'Mutinta <Mwiinga>', gender: 'female', dateOfBirth: '2013-04-02', classId: 'A', className: 'Form 1A',
      classType: 'form', classLevel: 1, guardian: 'Mr M', guardianPhone: '097', sponsor: 'Self', admissionType: 'new_intake',
      dateOfFirstEntry: '2027-01-12', placement: 'auto', admittedBy: 'OFF1', admittedByName: 'Mrs Officer', status: 'admitted',
    });
    expect(html.match(/F1A_001/g)!.length).toBe(2);
    expect(html).toContain("Guardian&#39;s copy");
    expect(html).toContain("School&#39;s copy");
    expect(html).toContain('Mutinta &lt;Mwiinga&gt;');
  });
});
