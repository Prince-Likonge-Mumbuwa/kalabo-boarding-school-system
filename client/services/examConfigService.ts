// @/services/examConfigService.ts
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  DocumentData,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  ExamConfig,
  ExamConfigFilters,
  ExamConfigInput,
  ExamConfigUpdate,
  ResolvedExamConfig,
  TermName,
} from '@/types/exam';
import {
  getCurrentAcademicTerm,
  getTermByName,
  isCurrentTerm,
  formatTermLabel,
  type AcademicTermInfo,
} from '@/utils/academicTerm';

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a Firestore timestamp (or Date, or { seconds }) to a Date.
 */
const toDate = (timestamp: any): Date | undefined => {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp.toDate === 'function') return timestamp.toDate();
  if (typeof timestamp.seconds === 'number') {
    return new Date(timestamp.seconds * 1000);
  }
  return undefined;
};

/**
 * Resolve term metadata (start/end dates, labels, isCurrent flag) for a
 * given term/year pair. Falls back to a computed default if the term is
 * outside the current academic year range.
 */
function resolveTermMetadata(
  term: TermName,
  year: number
): {
  termStartDate: Date;
  termEndDate: Date;
  termLabel: string;
  termShortLabel: string;
  isCurrentTerm: boolean;
} {
  // Try to find the term within its academic year first
  const info: AcademicTermInfo | null = getTermByName(term, year);

  if (info) {
    return {
      termStartDate: info.startDate,
      termEndDate: info.endDate,
      termLabel: info.label,
      termShortLabel: info.shortLabel,
      isCurrentTerm: isCurrentTerm(term, year),
    };
  }

  // Fallback: build a best-effort window from term name + year.
  // This shouldn't normally happen because getTermByName validates the term.
  const fallbackStart = new Date(year, 0, 1);
  const fallbackEnd = new Date(year, 3, 30);

  return {
    termStartDate: fallbackStart,
    termEndDate: fallbackEnd,
    termLabel: formatTermLabel(term, year),
    termShortLabel: `${term.replace('Term ', 'T')} ${year}`,
    isCurrentTerm: false,
  };
}

/**
 * Enrich a raw Firestore config document with derived term metadata.
 * This is the single place where term window info gets attached.
 */
function enrichConfig(
  id: string,
  data: DocumentData
): ResolvedExamConfig {
  const term = (data.term ?? 'Term 1') as TermName;
  const year = data.year ?? new Date().getFullYear();
  const meta = resolveTermMetadata(term, year);

  return {
    id,
    term,
    year,
    examTypes: data.examTypes || { week4: true, week8: true, endOfTerm: true },
    week4Date: data.week4Date,
    week8Date: data.week8Date,
    endOfTermDate: data.endOfTermDate,
    week4TotalMarks: data.week4TotalMarks,
    week8TotalMarks: data.week8TotalMarks,
    endOfTermTotalMarks: data.endOfTermTotalMarks,
    isActive: data.isActive !== false,
    createdBy: data.createdBy,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    // ── Derived term metadata ──────────────────────────────────────────
    ...meta,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export const examConfigService = {
  // ═══════════════════════════════════════════════════════════════════════
  // READ
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get exam configurations with optional filters.
   * Every returned config is enriched with its term window metadata.
   */
  getConfigs: async (
    filters?: ExamConfigFilters
  ): Promise<ResolvedExamConfig[]> => {
    try {
      const configsRef = collection(db, 'examConfigs');
      const constraints: any[] = [];

      if (filters?.year !== undefined) {
        constraints.push(where('year', '==', filters.year));
      }
      if (filters?.term) {
        constraints.push(where('term', '==', filters.term));
      }
      if (filters?.isActive !== undefined) {
        constraints.push(where('isActive', '==', filters.isActive));
      }

      let q;
      if (constraints.length > 0) {
        q = query(configsRef, ...constraints, orderBy('createdAt', 'desc'));
      } else {
        q = query(
          configsRef,
          orderBy('year', 'desc'),
          orderBy('term'),
          orderBy('createdAt', 'desc')
        );
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => enrichConfig(d.id, d.data()));
    } catch (error) {
      console.error('Error fetching exam configs:', error);
      throw error;
    }
  },

  /**
   * Get a single exam configuration by ID.
   * Returns `null` if it doesn't exist.
   */
  getConfigById: async (
    configId: string
  ): Promise<ResolvedExamConfig | null> => {
    try {
      const configRef = doc(db, 'examConfigs', configId);
      const configDoc = await getDoc(configRef);

      if (!configDoc.exists()) return null;

      return enrichConfig(configDoc.id, configDoc.data());
    } catch (error) {
      console.error('Error fetching exam config:', error);
      throw error;
    }
  },

  /**
   * Get the ACTIVE configuration for a specific term and year.
   * Returns the most recently created active config, or `null`.
   */
  getActiveConfigForTerm: async (
    term: TermName,
    year: number
  ): Promise<ResolvedExamConfig | null> => {
    try {
      const configsRef = collection(db, 'examConfigs');
      const q = query(
        configsRef,
        where('term', '==', term),
        where('year', '==', year),
        where('isActive', '==', true),
        orderBy('createdAt', 'desc'),
        limit(1)
      );

      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;

      const docSnapshot = snapshot.docs[0];
      return enrichConfig(docSnapshot.id, docSnapshot.data());
    } catch (error) {
      console.error('Error fetching active exam config:', error);
      throw error;
    }
  },

  /**
   * NEW: Get the active configuration for the CURRENT academic term
   * (auto-detected from the real-time calendar).
   *
   * This is the preferred method for dashboards and warnings.
   */
  getCurrentTermConfig: async (): Promise<ResolvedExamConfig | null> => {
    const { term, year } = getCurrentAcademicTerm();
    return examConfigService.getActiveConfigForTerm(term, year);
  },

  // ═══════════════════════════════════════════════════════════════════════
  // WRITE
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create a new exam configuration.
   *
   * Term-window metadata (termStartDate, termEndDate, termLabel, etc.)
   * is derived automatically — callers must NOT supply it.
   */
  createConfig: async (data: ExamConfigInput): Promise<string> => {
    try {
      if (!data.term || data.year === undefined) {
        throw new Error('createConfig requires both `term` and `year`.');
      }

      const configData = {
        term: data.term,
        year: data.year,
        examTypes: data.examTypes || {
          week4: true,
          week8: true,
          endOfTerm: true,
        },
        week4Date: data.week4Date ?? null,
        week8Date: data.week8Date ?? null,
        endOfTermDate: data.endOfTermDate ?? null,
        week4TotalMarks: data.week4TotalMarks ?? 100,
        week8TotalMarks: data.week8TotalMarks ?? 100,
        endOfTermTotalMarks: data.endOfTermTotalMarks ?? 100,
        isActive: true,
        createdBy: data.createdBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const configsRef = collection(db, 'examConfigs');
      const docRef = await addDoc(configsRef, configData);
      return docRef.id;
    } catch (error) {
      console.error('Error creating exam config:', error);
      throw error;
    }
  },

  /**
   * Update an existing exam configuration.
   * Derived term-metadata fields are NOT writable.
   */
  updateConfig: async (
    configId: string,
    updates: ExamConfigUpdate
  ): Promise<void> => {
    try {
      const configRef = doc(db, 'examConfigs', configId);
      await updateDoc(configRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating exam config:', error);
      throw error;
    }
  },

  /**
   * Delete an exam configuration (hard delete).
   */
  deleteConfig: async (configId: string): Promise<void> => {
    try {
      const configRef = doc(db, 'examConfigs', configId);
      await deleteDoc(configRef);
    } catch (error) {
      console.error('Error deleting exam config:', error);
      throw error;
    }
  },

  /**
   * Deactivate a configuration (soft delete).
   * Preserves historical data while hiding it from active views.
   */
  deactivateConfig: async (configId: string): Promise<void> => {
    try {
      const configRef = doc(db, 'examConfigs', configId);
      await updateDoc(configRef, {
        isActive: false,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error deactivating exam config:', error);
      throw error;
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // BULK OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Copy configurations from one term to another.
   * Term-window metadata is NOT copied — it's always derived at read-time.
   */
  copyConfigs: async (
    fromYear: number,
    fromTerm: TermName,
    toYear: number,
    toTerm: TermName
  ): Promise<void> => {
    try {
      const configsRef = collection(db, 'examConfigs');
      const q = query(
        configsRef,
        where('year', '==', fromYear),
        where('term', '==', fromTerm)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        throw new Error(
          `No configurations found for ${fromTerm} ${fromYear}.`
        );
      }

      const batch = writeBatch(db);

      snapshot.docs.forEach(docSnapshot => {
        const data = docSnapshot.data();
        const newConfigRef = doc(collection(db, 'examConfigs'));

        // ── Delete derived fields from the source before copying ──────
        // (They shouldn't be persisted, but be defensive in case an
        // older version of this service wrote them.)
        const {
          termStartDate: _ignoreTermStart,
          termEndDate: _ignoreTermEnd,
          termLabel: _ignoreTermLabel,
          termShortLabel: _ignoreTermShort,
          isCurrentTerm: _ignoreIsCurrent,
          id: _ignoreId,
          createdAt: _ignoreCreatedAt,
          updatedAt: _ignoreUpdatedAt,
          ...copyable
        } = data;

        batch.set(newConfigRef, {
          ...copyable,
          term: toTerm,
          year: toYear,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();

      console.log(
        `✅ Copied ${snapshot.size} config(s) from ` +
          `${fromTerm} ${fromYear} → ${toTerm} ${toYear}`
      );
    } catch (error) {
      console.error('Error copying exam configs:', error);
      throw error;
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Check whether an active config exists for a given term/year.
   */
  hasActiveConfig: async (
    term: TermName,
    year: number
  ): Promise<boolean> => {
    const config = await examConfigService.getActiveConfigForTerm(term, year);
    return config !== null;
  },

  /**
   * Convenience: list all active configs for the current academic term.
   * (Normally there's just one, but this handles edge cases.)
   */
  getCurrentTermConfigs: async (): Promise<ResolvedExamConfig[]> => {
    const { term, year } = getCurrentAcademicTerm();
    return examConfigService.getConfigs({
      term,
      year,
      isActive: true,
    });
  },
};