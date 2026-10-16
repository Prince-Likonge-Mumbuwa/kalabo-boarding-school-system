import { describe, it, expect } from 'vitest';
import { betterSighting, resolveMatches, toTick, type RosterLearner, type Seen } from './register';
import type { FaceMatch } from './faceApi';

const roster = new Map<string, RosterLearner>([
  ['docA', { id: 'docA', studentId: 'F2A_007', name: 'Mwila Banda' }],
  ['docB', { id: 'docB', studentId: 'F2A_008', name: 'Chipo Phiri', status: 'present' }],
]);
const face = (learnerId: string | null, verdict: FaceMatch['verdict'], similarity: number | null = 0.5): FaceMatch =>
  ({ box: [0, 0, 80, 80], learnerId, verdict, similarity });

describe('face matches → register suggestions (identity by learner document id)', () => {
  it('only learners on this register are suggested; others count as not known', () => {
    const r = resolveMatches([face('docA', 'match'), face('someoneElse', 'match'), face(null, 'unknown')], roster);
    expect(r.proposals.map(p => p.learnerId)).toEqual(['docA']);
    expect(r.unknown).toBe(2);
  });

  it('a clear match is never downgraded to "check", and weaker sightings are ignored', () => {
    const at = 0;
    const match: Seen = { learnerId: 'docA', similarity: 0.6, verdict: 'match', at };
    expect(betterSighting(undefined, match)).toBe(true);
    expect(betterSighting(match, { ...match, verdict: 'review', similarity: 0.9 })).toBe(false);
    expect(betterSighting({ ...match, verdict: 'review', similarity: 0.4 }, match)).toBe(true);
    expect(betterSighting(match, { ...match, similarity: 0.5 })).toBe(false);
    expect(betterSighting(match, { ...match, similarity: 0.7 })).toBe(true);
  });

  it('learners already present are not ticked again', () => {
    const seen: Seen[] = [
      { learnerId: 'docA', similarity: 0.6, verdict: 'match', at: 0 },
      { learnerId: 'docB', similarity: 0.6, verdict: 'match', at: 0 },
    ];
    expect(toTick(seen, new Set(['docA', 'docB']), roster).map(s => s.learnerId)).toEqual(['docA']);
    expect(toTick(seen, new Set(), roster)).toEqual([]);
  });
});
