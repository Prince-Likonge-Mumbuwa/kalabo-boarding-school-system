// Publishing results: the 98% rule, which terms are open, and the reads and
// writes of results_publication (Firestore mocked).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  stored: new Map<string, any>(),
  getError: null as any,
  writes: [] as Array<{ path: string; data: any }>,
  gets: 0,
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/auditedFirestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
  serverTimestamp: () => 'SERVER_TIME',
  getDoc: async (ref: { path: string }) => {
    h.gets++;
    if (h.getError) throw h.getError;
    const data = h.stored.get(ref.path);
    return { exists: () => data !== undefined, data: () => data };
  },
  setDoc: async (ref: { path: string }, data: any) => {
    h.writes.push({ path: ref.path, data });
    h.stored.set(ref.path, data);
  },
}));

import {
  assertTermReleased,
  clearReleaseCache,
  completionPercent,
  entriesNeededToPublish,
  getPublication,
  isOpenByDefault,
  isReleased,
  isTermReleased,
  meetsPublishThreshold,
  publicationId,
  publishBlocker,
  publishResults,
  ResultsNotReleasedError,
  unpublishResults,
} from './resultsPublication';

const c = (requiredEntries: number, doneEntries: number) => ({ requiredEntries, doneEntries });
const admin = { uid: 'ADMIN', name: 'Head Teacher' };

beforeEach(() => {
  h.stored.clear();
  h.writes = [];
  h.getError = null;
  h.gets = 0;
  clearReleaseCache();
});

describe('the 98% rule', () => {
  it('needs at least 98% — exactly, with no rounding up', () => {
    expect(meetsPublishThreshold(c(1000, 980))).toBe(true); // 98.0%
    expect(meetsPublishThreshold(c(1000, 979))).toBe(false); // 97.9%
    expect(meetsPublishThreshold(c(1000, 1000))).toBe(true);
    // 97.6% would round to 98% — it must still be refused.
    expect(meetsPublishThreshold(c(1000, 976))).toBe(false);
    expect(meetsPublishThreshold(c(2500, 2450))).toBe(true); // 98.0%
    expect(meetsPublishThreshold(c(2500, 2449))).toBe(false);
  });

  it('refuses an empty or impossible term', () => {
    expect(meetsPublishThreshold(c(0, 0))).toBe(false); // nothing expected is not "100%"
    expect(meetsPublishThreshold(c(100, 101))).toBe(false);
    expect(meetsPublishThreshold(c(100, -1))).toBe(false);
    expect(meetsPublishThreshold(c(NaN, 5))).toBe(false);
  });

  it('shows the share rounded down, never up to 98', () => {
    expect(completionPercent(c(1000, 976))).toBe(97.6);
    expect(completionPercent(c(10000, 9799))).toBe(97.9); // 97.99 → 97.9
    expect(completionPercent(c(1000, 980))).toBe(98);
    expect(completionPercent(c(3, 1))).toBe(33.3);
    expect(completionPercent(c(0, 0))).toBe(0);
    expect(completionPercent(c(100, 150))).toBe(100);
  });

  it('counts the results still to enter', () => {
    expect(entriesNeededToPublish(c(1000, 900))).toBe(80); // 980 - 900
    expect(entriesNeededToPublish(c(1000, 980))).toBe(0);
    expect(entriesNeededToPublish(c(1001, 900))).toBe(81); // ceil(980.98) = 981, minus 900
    expect(entriesNeededToPublish(c(0, 0))).toBe(0);
    // The number it reports is exactly enough.
    for (const [req, done] of [[1001, 900], [333, 100], [7, 0]]) {
      const need = entriesNeededToPublish(c(req, done));
      expect(meetsPublishThreshold(c(req, done + need))).toBe(true);
      if (need > 0) expect(meetsPublishThreshold(c(req, done + need - 1))).toBe(false);
    }
  });

  it('explains what stops a term being published', () => {
    expect(publishBlocker(null, 0, 'Term 3', 2026)).toMatch(/Checking/);
    expect(publishBlocker(c(1000, 990), 2, 'Term 3', 2026)).toMatch(/2 classes could not be loaded/);
    expect(publishBlocker(c(1000, 990), 1, 'Term 3', 2026)).toMatch(/1 class could not be loaded/);
    expect(publishBlocker(c(0, 0), 0, 'Term 3', 2026)).toMatch(/nothing to publish/);
    expect(publishBlocker(c(1000, 700), 0, 'Term 3', 2026)).toBe(
      'Only 70% of the results are entered; 98% is needed (280 more results to enter).'
    );
    expect(publishBlocker(c(1000, 979), 0, 'Term 3', 2026)).toMatch(/Only 97.9%.*1 more result to enter/);
    expect(publishBlocker(c(1000, 980), 0, 'Term 3', 2026)).toBeNull();
  });
});

describe('which terms are open to guardians and sponsors', () => {
  it('terms before Term 3 2026 stay open as they were', () => {
    expect(isOpenByDefault('Term 1', 2026)).toBe(true);
    expect(isOpenByDefault('Term 2', 2026)).toBe(true);
    expect(isOpenByDefault('Term 3', 2025)).toBe(true);
    expect(isOpenByDefault('Term 1', 2020)).toBe(true);
  });

  it('Term 3 2026 and every later term are closed until published', () => {
    expect(isOpenByDefault('Term 3', 2026)).toBe(false);
    expect(isOpenByDefault('Term 1', 2027)).toBe(false);
    expect(isOpenByDefault('Term 3', 2030)).toBe(false);
  });

  it('is not fooled by an unknown term name', () => {
    expect(isOpenByDefault('Term 4', 2020)).toBe(false);
    expect(isOpenByDefault('', 2020)).toBe(false);
  });

  it('an explicit record always wins', () => {
    expect(isReleased({ published: true }, 'Term 3', 2026)).toBe(true);
    expect(isReleased({ published: false }, 'Term 2', 2026)).toBe(false); // withdrawn
    expect(isReleased(null, 'Term 2', 2026)).toBe(true);
    expect(isReleased(null, 'Term 3', 2026)).toBe(false);
  });

  it('names the record by year and term', () => {
    expect(publicationId('Term 3', 2026)).toBe('2026_Term3');
    expect(publicationId('Term 1', 2027)).toBe('2027_Term1');
  });
});

describe('reading the publication record', () => {
  it('no record → the default for that term', async () => {
    expect(await getPublication('Term 3', 2026)).toBeNull();
    expect(await isTermReleased('Term 3', 2026)).toBe(false);
    expect(await isTermReleased('Term 2', 2026)).toBe(true);
  });

  it('a published record opens the term; a withdrawn one closes it', async () => {
    h.stored.set('results_publication/2026_Term3', { term: 'Term 3', year: 2026, published: true, publishedByName: 'Head' });
    expect(await isTermReleased('Term 3', 2026)).toBe(true);
    clearReleaseCache();
    h.stored.set('results_publication/2026_Term2', { term: 'Term 2', year: 2026, published: false });
    expect(await isTermReleased('Term 2', 2026)).toBe(false);
  });

  it('assertTermReleased explains itself to the guardian', async () => {
    await expect(assertTermReleased('Term 3', 2026)).rejects.toBeInstanceOf(ResultsNotReleasedError);
    await expect(assertTermReleased('Term 3', 2026)).rejects.toThrow(
      'Term 3 2026 results have not been released yet. They will be available here once the school has published them.'
    );
    await expect(assertTermReleased('Term 2', 2026)).resolves.toBeUndefined();
  });

  it('answers from memory for a class of learners', async () => {
    await Promise.all(Array.from({ length: 40 }, () => isTermReleased('Term 3', 2026)));
    expect(h.gets).toBe(1);
  });

  it('rules not deployed yet (permission denied) → falls back to the default, no lock-out', async () => {
    h.getError = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    expect(await isTermReleased('Term 2', 2026)).toBe(true);
    clearReleaseCache();
    expect(await isTermReleased('Term 3', 2026)).toBe(false);
  });

  it('any other failure is an error, never a silent "open" or "closed"', async () => {
    h.getError = Object.assign(new Error('offline'), { code: 'unavailable' });
    await expect(isTermReleased('Term 3', 2026)).rejects.toThrow('offline');
    // A failure is not remembered: the next ask tries again.
    h.getError = null;
    expect(await isTermReleased('Term 3', 2026)).toBe(false);
  });
});

describe('publishing and withdrawing', () => {
  it('publishes with the figures and the admin\'s name', async () => {
    await publishResults('Term 3', 2026, c(1000, 985), admin);
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0].path).toBe('results_publication/2026_Term3');
    expect(h.writes[0].data).toEqual({
      term: 'Term 3',
      year: 2026,
      published: true,
      requiredEntries: 1000,
      doneEntries: 985,
      completionPercent: 98.5,
      publishedAt: 'SERVER_TIME',
      publishedBy: 'ADMIN',
      publishedByName: 'Head Teacher',
      updatedAt: 'SERVER_TIME',
      updatedBy: 'ADMIN',
    });
    expect(await isTermReleased('Term 3', 2026)).toBe(true);
  });

  it('refuses below 98% and writes nothing', async () => {
    await expect(publishResults('Term 3', 2026, c(1000, 976), admin)).rejects.toThrow(
      'Term 3 2026 cannot be published yet: 97.6% of the results are entered and 98% is needed.'
    );
    await expect(publishResults('Term 3', 2026, c(0, 0), admin)).rejects.toThrow(/cannot be published yet/);
    await expect(publishResults('Term 9', 2026, c(1000, 1000), admin)).rejects.toThrow('Unknown term');
    expect(h.writes).toHaveLength(0);
  });

  it('withdraws, and the portals see it straight away', async () => {
    await publishResults('Term 3', 2026, c(1000, 1000), admin);
    expect(await isTermReleased('Term 3', 2026)).toBe(true);
    await unpublishResults('Term 3', 2026, admin);
    expect(h.writes[1].data).toMatchObject({ published: false, unpublishedBy: 'ADMIN', unpublishedByName: 'Head Teacher' });
    expect(await isTermReleased('Term 3', 2026)).toBe(false);
  });

  it('can withdraw an older term that was open by default', async () => {
    expect(await isTermReleased('Term 2', 2026)).toBe(true);
    await unpublishResults('Term 2', 2026, admin);
    expect(await isTermReleased('Term 2', 2026)).toBe(false);
  });
});
