// The results modules import each other (service ↔ loader ↔ assignment
// engine). This checks that loading them in the order a page might use does
// not hit an uninitialised export.
import { it, expect, vi } from 'vitest';

vi.mock('firebase/firestore', async () => await import('../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: null }) }));

it('loader first, then service and monitor', async () => {
  const loader = await import('./resultsGridLoader');
  const monitor = await import('./resultsMonitor');
  const service = await import('./resultsService');
  const engine = await import('./assignmentEngine');
  expect(typeof loader.loadClassGrid).toBe('function');
  expect(typeof loader.slotKeyFor('C1', 'Mathematics')).toBe('string');
  expect(loader.slotKeyFor('C1', 'Mathematics')).toBe('Mathematics');
  expect(typeof monitor.loadMonitorData).toBe('function');
  expect(typeof service.resultsService.generateReportCard).toBe('function');
  expect(service.normalizeSubjectName('Maths')).toBe('Mathematics');
  expect(engine.slotIdFor('C1', 'Maths')).toBe('C1__Mathematics');
});
