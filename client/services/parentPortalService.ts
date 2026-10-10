// @/services/parentPortalService.ts
// PARENT PORTAL SERVICE
// Resolves guardian phone number -> linked children -> their report cards.
// Composes learnerService (schoolService) and resultsService.

import { learnerService } from './schoolService';
import { resultsService, ReportCardData } from './resultsService';
import type { Learner } from '@/types/school';

// ==================== TYPES ====================

export interface ParentChild {
  /** Firestore document id (used internally to fetch results) */
  documentId: string;
  /** Human-readable student id, e.g. "G10B_001" */
  studentId: string;
  fullName: string;
  className: string;
  classId: string;
  form: string;
  gender?: string;
  guardian: string;
  guardianPhone: string;
  status: string;
}

export interface ChildResultBundle {
  child: ParentChild;
  /** null when there are no results for the requested term/year */
  reportCard: ReportCardData | null;
  /** Populated when the report could not be generated (e.g. no results) */
  message?: string;
}

export interface ParentLookupResult {
  phone: string;
  children: ParentChild[];
  /** Populated when the phone matched no active learner */
  notFoundMessage?: string;
}

// ==================== HELPERS ====================

const extractForm = (learner: Learner): string => {
  // Try explicit form/level fields first, then fall back to parsing the class name
  const anyLearner = learner as any;
  if (anyLearner.classLevel) return String(anyLearner.classLevel);

  const name = learner.className || '';
  const gradeMatch = name.match(/Grade\s*(\d+)/i);
  if (gradeMatch) return gradeMatch[1];
  const formMatch = name.match(/Form\s*(\d+)/i);
  if (formMatch) return formMatch[1];
  return '1';
};

const toParentChild = (learner: Learner): ParentChild => ({
  documentId: learner.id,             // Firestore doc id — needed for results lookup
  studentId: learner.studentId || '', // display id
  fullName: learner.fullName || learner.name || 'Unknown',
  className: learner.className || '',
  classId: learner.classId || '',
  form: extractForm(learner),
  gender: learner.gender,
  guardian: learner.guardian || '',
  guardianPhone: learner.guardianPhone || learner.parentPhone || '',
  status: learner.status || 'active',
});

// ==================== SERVICE ====================

class ParentPortalService {
  /**
   * Look up all children linked to a guardian phone number.
   * Delegates to learnerService.getLearnersByGuardianPhone() which already
   * handles exact + legacy + normalized-digit matching.
   */
  async getChildrenByPhone(phone: string): Promise<ParentLookupResult> {
    const clean = (phone || '').trim();

    if (!clean) {
      return {
        phone: clean,
        children: [],
        notFoundMessage: 'Please enter a guardian phone number.',
      };
    }

    const learners = await learnerService.getLearnersByGuardianPhone(clean);

    if (learners.length === 0) {
      return {
        phone: clean,
        children: [],
        notFoundMessage:
          "We couldn't find any learners linked to that phone number. " +
          'Please confirm the number with the school office.',
      };
    }

    return {
      phone: clean,
      children: learners.map(toParentChild),
    };
  }

  /**
   * Fetch one child's report card for a specific term/year.
   * Returns null reportCard (with a message) if there are no results yet.
   */
  async getChildReportCard(
    child: ParentChild,
    term: string,
    year: number
  ): Promise<ChildResultBundle> {
    // Prefer the document id (unique); the service also accepts custom ids.
    const lookupId = child.documentId || child.studentId;

    try {
      // Same shared-grid report card the admin sees (publicView: parents are
      // signed out).
      const reportCard = await resultsService.generateReportCard(
        lookupId,
        term,
        year,
        { includeIncomplete: true, markMissing: true, publicView: true }
      );

      if (!reportCard) {
        return {
          child,
          reportCard: null,
          message: `No results found for ${child.fullName} for ${term} ${year}.`,
        };
      }

      return { child, reportCard };
    } catch (error: any) {
      return {
        child,
        reportCard: null,
        message:
          error?.message ||
          `Failed to load results for ${child.fullName}. Please try again.`,
      };
    }
  }

  /**
   * Fetch the report cards for ALL children linked to a phone number.
   * Runs the per-child lookups in parallel.
   */
  async getChildrenWithResults(
    phone: string,
    term: string,
    year: number
  ): Promise<{
    lookup: ParentLookupResult;
    results: ChildResultBundle[];
  }> {
    const lookup = await this.getChildrenByPhone(phone);

    if (lookup.children.length === 0) {
      return { lookup, results: [] };
    }

    const results = await Promise.all(
      lookup.children.map((child) => this.getChildReportCard(child, term, year))
    );

    return { lookup, results };
  }
}

// Export singleton
export const parentPortalService = new ParentPortalService();