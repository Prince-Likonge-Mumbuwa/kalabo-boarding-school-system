// Turning server match results into register suggestions.
//
// Identity: the server answers with learner document ids. A suggestion is
// only ever made for a learner who is on THIS register's roster (same class,
// active), looked up by that id — names and student numbers shown to the
// teacher always come from the roster, never from the face data.
import type { FaceMatch, Verdict } from './faceApi';

export interface RosterLearner {
  id: string;
  studentId: string;
  name: string;
  /** Status in the current draft register, if any. */
  status?: string;
}

export interface Seen {
  learnerId: string;
  similarity: number | null;
  verdict: Exclude<Verdict, 'unknown'>;
  at: number;
}

/** Keep only matches for learners on the roster; everything else counts as unknown. */
export function resolveMatches(faces: FaceMatch[], roster: Map<string, RosterLearner>) {
  const proposals: Seen[] = [];
  let unknown = 0;
  const at = Date.now();
  for (const f of faces) {
    if (f.learnerId && f.verdict !== 'unknown' && roster.has(f.learnerId)) {
      proposals.push({ learnerId: f.learnerId, similarity: f.similarity, verdict: f.verdict, at });
    } else {
      unknown++;
    }
  }
  return { proposals, unknown };
}

/**
 * Should a new sighting replace what we already have for this learner?
 * A clear match is never downgraded to "check", and a weaker sighting of the
 * same kind is ignored.
 */
export function betterSighting(prev: Seen | undefined, next: Seen): boolean {
  if (!prev) return true;
  if (prev.verdict === 'match' && next.verdict === 'review') return false;
  if (prev.verdict === 'review' && next.verdict === 'match') return true;
  return (next.similarity ?? 0) > (prev.similarity ?? 0);
}

/** Learners ready to tick: picked, on the roster and not already present. */
export function toTick(seen: Seen[], picked: Set<string>, roster: Map<string, RosterLearner>) {
  return seen.filter(s => picked.has(s.learnerId) && roster.has(s.learnerId) && roster.get(s.learnerId)!.status !== 'present');
}
