// @/services/markScheduleProgressLoader.ts
//
// Loads the grids for a subject's progress report: every term of the
// academic year from Term 1 up to (and including) the term shown. A term
// that cannot be loaded is reported, never shown as zero.

import { loadClassGrid } from '@/services/resultsGridLoader';
import {
  buildSubjectProgressReport,
  type SubjectProgressReport,
  type TermGridInput,
} from '@/services/markScheduleProgress';

const TERMS = ['Term 1', 'Term 2', 'Term 3'] as const;

/** Term 1 … `term` of the same academic year. */
export const termsUpTo = (term: string): string[] => {
  const i = TERMS.indexOf(term as (typeof TERMS)[number]);
  return i < 0 ? [term] : TERMS.slice(0, i + 1) as unknown as string[];
};

export async function loadSubjectProgressReport(opts: {
  classId: string;
  subject: string;
  subjectCandidates?: Array<string | null | undefined>;
  term: string;
  year: number;
}): Promise<SubjectProgressReport> {
  const inputs: TermGridInput[] = await Promise.all(
    termsUpTo(opts.term).map(async (term): Promise<TermGridInput> => {
      try {
        const g = await loadClassGrid(opts.classId, term, opts.year);
        return { term, year: opts.year, grid: g.grid, config: g.config ?? null };
      } catch (e: any) {
        // The term shown must load; earlier terms are best effort.
        if (term === opts.term) throw e;
        return { term, year: opts.year, grid: null, error: e?.message || String(e) };
      }
    })
  );
  return buildSubjectProgressReport({ subject: opts.subject, subjectCandidates: opts.subjectCandidates, terms: inputs });
}
