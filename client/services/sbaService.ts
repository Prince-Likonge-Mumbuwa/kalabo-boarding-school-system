// @/services/sbaService.ts
// SBA (School Based Assessment) service — ECSEOL 2026
// Follows the same patterns as resultsService.ts:
//   - Firestore writes via writeBatch
//   - Deterministic doc IDs to prevent duplicates
//   - Dual-ID resolution (custom ID ↔ document ID)
//   - Pure computation functions separated from I/O
//
// v2 — Per-task mark entry
//   - Teachers enter marks per task; system aggregates to form totals
//   - Form totals then aggregate to SBA raw, weighted, and level

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { normalizeSubjectName } from './resultsService';
import {
  SBA_CONFIG_SEED,
  getFallbackConfig,
  resolveSubjectCode,
} from './sbaConfig';
import type {
  SbaConfig,
  SbaResult,
  SbaComputed,
  SbaMarksInput,
  SaveSbaInput,
  SaveSbaResult,
  DeleteSbaInput,
  SbaSubjectCompletion,
  SbaClassCompletion,
  SbaSchoolOverview,
  SbaSchoolOverviewRow,
  SbaForm,
} from '@/types/sba';

// ==================== COLLECTIONS ====================

const COLLECTIONS = {
  SBA_RESULTS: 'sba_results',
  SBA_CONFIG: 'sba_config',
  LEARNERS: 'learners',
  CLASSES: 'classes',
  TEACHER_ASSIGNMENTS: 'teacher_assignments',
  USERS: 'users',
} as const;

// ==================== PURE COMPUTATION ====================

const LEVEL_LABELS: Record<number, string> = {
  1: 'Outstanding',
  2: 'Advanced',
  3: 'Basic',
  4: 'Satisfactory',
  5: 'Unsatisfactory',
  [-1]: 'Incomplete',
};

/**
 * Map a percentage to a competency level (1–5).
 * Cut scores per ECZ Assessment Schemes p.313 and CPD p.35.
 */
export function levelFromPercent(percentage: number): number {
  if (percentage < 0) return -1;
  if (percentage >= 70) return 1;
  if (percentage >= 60) return 2;
  if (percentage >= 50) return 3;
  if (percentage >= 40) return 4;
  return 5;
}

/**
 * Default per-task full marks: split formTotal equally across tasks.
 * Last task absorbs rounding remainder so the sum is exactly formTotal.
 *
 * Example: formTotal=100, taskCount=6
 *   → [16.66, 16.66, 16.66, 16.66, 16.66, 16.70]
 */
export function defaultPerTaskMarks(formTotal: number, taskCount: number): number[] {
  if (taskCount <= 0) return [];
  const share = Math.floor((formTotal / taskCount) * 100) / 100;
  const arr = Array(taskCount).fill(share) as number[];
  const sum = share * (taskCount - 1);
  arr[taskCount - 1] = Math.round((formTotal - sum) * 100) / 100;
  return arr;
}

export type FormTaskStatus =
  | 'complete'
  | 'partial'
  | 'absent'
  | 'not_conducted'
  | 'empty';

export interface FormTaskResult {
  total: number;
  max: number;
  status: FormTaskStatus;
  enteredCount: number;
  absentCount: number;
  notConductedCount: number;
}

/**
 * Pure: aggregate a student's task marks for a single form into a form total.
 *
 * Rules:
 *   - taskMarks[i] === null  → task not entered (form becomes 'partial' or 'empty')
 *   - taskMarks[i] === -1    → task absent (form flagged 'absent')
 *   - taskMarks[i] === -2    → task not conducted (form flagged 'not_conducted')
 *   - taskMarks[i] >= 0      → actual mark, contributes to total
 *
 * The 'total' is the sum of valid task marks. For absent/not_conducted forms,
 * the total still sums the entered marks but the status flags the exception.
 */
export function computeFormTotalFromTasks(
  taskMarks: Array<number | null>,
  perTaskMarks: number[]
): FormTaskResult {
  const max = perTaskMarks.reduce((a, b) => a + b, 0);

  if (taskMarks.length === 0) {
    return {
      total: 0,
      max,
      status: 'empty',
      enteredCount: 0,
      absentCount: 0,
      notConductedCount: 0,
    };
  }

  let entered = 0;
  let absent = 0;
  let notConducted = 0;
  let sum = 0;

  for (const v of taskMarks) {
    if (v === null || v === undefined) continue;
    entered++;
    if (v === -1) { absent++; continue; }
    if (v === -2) { notConducted++; continue; }
    sum += v;
  }

  let status: FormTaskStatus;
  if (entered === 0) status = 'empty';
  else if (absent > 0) status = 'absent';
  else if (notConducted > 0) status = 'not_conducted';
  else if (entered < taskMarks.length) status = 'partial';
  else status = 'complete';

  return { total: sum, max, status, enteredCount: entered, absentCount: absent, notConductedCount: notConducted };
}

/**
 * Convert a FormTaskResult into the sentinel value stored in `formNMark`:
 *   - complete          → the numeric total
 *   - absent            → -1
 *   - not_conducted     → -2
 *   - partial / empty   → null (not yet a valid form total)
 */
export function formTotalToMarkValue(r: FormTaskResult): number | null {
  if (r.status === 'complete') return r.total;
  if (r.status === 'absent') return -1;
  if (r.status === 'not_conducted') return -2;
  return null;
}

/**
 * Pure: compute SBA totals from form marks + config.
 *
 * v2 changes:
 *   - sbaRawMax uses the SUM of configured form maxima (from config.marksPerForm),
 *     not hardcoded 100 × forms. This matters for D&T (45/45/45) and Art (100 each).
 *   - If a form has marks but the total forms run short, still computes over
 *     what's available.
 */
export function computeSbaTotals(
  marks: SbaMarksInput,
  config: Pick<SbaConfig, 'sbaWeightPercent' | 'sbaForms' | 'marksPerForm'>
): SbaComputed {
  const required = config.sbaForms;

  // Collect (mark value, form max) pairs for forms the subject uses
  const pairs: Array<{ mark: number; max: number; form: SbaForm }> = [];

  for (const form of required) {
    const key = `${form}Mark` as keyof SbaMarksInput;
    const v = marks[key];
    if (v === null || v === undefined) continue;
    const formMax = config.marksPerForm[form] ?? 100;
    pairs.push({ mark: v, max: formMax, form });
  }

  const hasAnyMissing = pairs.length < required.length;
  const hasAnyAbsent = pairs.some(p => p.mark < 0);

  if (hasAnyAbsent || pairs.length === 0) {
    return {
      sbaRawTotal: 0,
      sbaRawMax: pairs.reduce((s, p) => s + p.max, 0),
      sbaRawPercentage: -1,
      weightedSbaScore: -1,
      sbaOnlyCompetencyLevel: -1,
      sbaOnlyCompetencyLabel: LEVEL_LABELS[-1],
      hasAnyMissing,
      hasAnyAbsent,
    };
  }

  const sbaRawTotal = pairs.reduce((s, p) => s + p.mark, 0);
  const sbaRawMax = pairs.reduce((s, p) => s + p.max, 0);
  const sbaRawPercentage =
    sbaRawMax > 0 ? Math.round((sbaRawTotal / sbaRawMax) * 100) : -1;
  const weightedSbaScore =
    sbaRawPercentage >= 0
      ? Math.round(sbaRawPercentage * config.sbaWeightPercent) / 100
      : -1;
  const sbaOnlyCompetencyLevel =
    sbaRawPercentage >= 0 ? levelFromPercent(sbaRawPercentage) : -1;

  return {
    sbaRawTotal,
    sbaRawMax,
    sbaRawPercentage,
    weightedSbaScore,
    sbaOnlyCompetencyLevel,
    sbaOnlyCompetencyLabel: LEVEL_LABELS[sbaOnlyCompetencyLevel] || LEVEL_LABELS[-1],
    hasAnyMissing,
    hasAnyAbsent,
  };
}

// ==================== RESULT ID ====================

function buildResultId(
  studentDocumentId: string,
  subjectId: string,
  examYear: number
): string {
  const safeSubject = subjectId.replace(/[^A-Za-z0-9]/g, '_');
  return `${studentDocumentId}_${safeSubject}_${examYear}`;
}

// ==================== SERVICE ====================

class SbaService {
  private resultsCollection = collection(db, COLLECTIONS.SBA_RESULTS);
  private configCollection = collection(db, COLLECTIONS.SBA_CONFIG);
  private learnersCollection = collection(db, COLLECTIONS.LEARNERS);
  private classesCollection = collection(db, COLLECTIONS.CLASSES);
  private assignmentsCollection = collection(db, COLLECTIONS.TEACHER_ASSIGNMENTS);

  // ---------- CONFIG ----------

  async getAllConfigs(): Promise<SbaConfig[]> {
    try {
      const snapshot = await getDocs(this.configCollection);
      if (snapshot.empty) {
        console.warn('⚠️ sba_config empty — returning seed. Run seedSbaConfigs() once.');
        return SBA_CONFIG_SEED.map(c => ({ ...c }));
      }
      return snapshot.docs.map(d => d.data() as SbaConfig);
    } catch (error) {
      console.error('Error fetching sba_config, falling back to seed:', error);
      return SBA_CONFIG_SEED.map(c => ({ ...c }));
    }
  }

  async getConfig(subjectCode: string): Promise<SbaConfig | null> {
    const trimmed = (subjectCode || '').trim();
    if (!trimmed) return null;

    try {
      const ref = doc(this.configCollection, trimmed);
      const snap = await getDoc(ref);
      if (snap.exists()) return snap.data() as SbaConfig;
    } catch (error) {
      console.error(`Error fetching sba_config/${trimmed}:`, error);
    }

    return getFallbackConfig(trimmed);
  }

  async resolveConfig(subjectOrCode: string): Promise<SbaConfig | null> {
    if (!subjectOrCode) return null;
    if (/^\d+$/.test(subjectOrCode.trim())) {
      return this.getConfig(subjectOrCode.trim());
    }
    const fallback = getFallbackConfig(subjectOrCode);
    if (fallback) return this.getConfig(fallback.subjectCode);
    return null;
  }

  async seedSbaConfigs(force = false): Promise<{ written: number; skipped: number }> {
    let written = 0;
    let skipped = 0;

    for (const cfg of SBA_CONFIG_SEED) {
      const ref = doc(this.configCollection, cfg.id);
      const snap = await getDoc(ref);

      if (snap.exists() && !force) {
        skipped++;
        continue;
      }

      const data: SbaConfig = {
        ...cfg,
        seeded: true,
        updatedAt: new Date().toISOString(),
        createdAt: snap.exists()
          ? (snap.data() as SbaConfig).createdAt
          : cfg.createdAt,
      };

      await setDoc(ref, data, { merge: false });
      written++;
    }

    console.log(`✅ SBA config seed: ${written} written, ${skipped} skipped`);
    return { written, skipped };
  }

  // ---------- TEACHER ASSIGNMENTS ----------

  async getSbaAssignmentsForTeacher(
    teacherId: string,
    examYear: number
  ): Promise<Array<{
    classId: string;
    className: string;
    subjectId: string;
    subjectName: string;
    subjectCode: string;
    config: SbaConfig;
  }>> {
    try {
      const q = query(this.assignmentsCollection, where('teacherId', '==', teacherId));
      const snap = await getDocs(q);

      const allConfigs = await this.getAllConfigs();
      const configByNormalized = new Map<string, SbaConfig>();
      allConfigs.forEach(c => {
        configByNormalized.set(normalizeSubjectName(c.subjectName), c);
        c.aliases.forEach(a => configByNormalized.set(normalizeSubjectName(a), c));
      });

      const rows: Array<{
        classId: string;
        className: string;
        subjectId: string;
        subjectName: string;
        subjectCode: string;
        config: SbaConfig;
      }> = [];

      for (const d of snap.docs) {
        const data = d.data();
        const rawSubject = data.subject || '';
        if (!rawSubject || rawSubject === 'Form Teacher') continue;
        const normalized = normalizeSubjectName(rawSubject);
        const cfg =
          configByNormalized.get(normalized) ||
          (await this.resolveConfig(rawSubject));
        if (!cfg) continue;

        rows.push({
          classId: data.classId,
          className: data.className || '',
          subjectId: normalized,
          subjectName: cfg.subjectName,
          subjectCode: cfg.subjectCode,
          config: cfg,
        });
      }

      const seen = new Set<string>();
      const unique = rows.filter(r => {
        const key = `${r.classId}::${r.subjectId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return unique;
    } catch (error) {
      console.error('Error fetching SBA assignments for teacher:', error);
      return [];
    }
  }

  // ---------- STUDENT RESOLUTION ----------

  private async resolveStudentDocument(inputId: string): Promise<{
    documentId: string;
    customId: string;
    data: any;
  } | null> {
    try {
      const customQ = query(this.learnersCollection, where('studentId', '==', inputId));
      const customSnap = await getDocs(customQ);

      if (!customSnap.empty) {
        const d = customSnap.docs[0];
        const data = d.data();
        return {
          documentId: d.id,
          customId: data.studentId || inputId,
          data,
        };
      }

      const ref = doc(this.learnersCollection, inputId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        return {
          documentId: inputId,
          customId: data.studentId || data.id || inputId,
          data,
        };
      }

      return null;
    } catch (error) {
      console.error('Error resolving student document:', error);
      return null;
    }
  }

  // ---------- READ ----------

  async getSbaResultsForClassSubject(
    classId: string,
    subjectId: string,
    examYear: number
  ): Promise<SbaResult[]> {
    try {
      const normalizedSubject = normalizeSubjectName(subjectId);
      const q = query(
        this.resultsCollection,
        where('classId', '==', classId),
        where('subjectId', '==', normalizedSubject),
        where('examYear', '==', examYear)
      );
      const snap = await getDocs(q);
      return snap.docs
        .map(d => d.data() as SbaResult)
        .sort((a, b) => a.studentName.localeCompare(b.studentName));
    } catch (error) {
      console.error('Error fetching SBA results:', error);
      return [];
    }
  }

  async getSbaResultsForClass(
    classId: string,
    examYear: number
  ): Promise<SbaResult[]> {
    try {
      const q = query(
        this.resultsCollection,
        where('classId', '==', classId),
        where('examYear', '==', examYear)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data() as SbaResult);
    } catch (error) {
      console.error('Error fetching SBA results for class:', error);
      return [];
    }
  }

  // ---------- SAVE ----------

  async saveSbaMarks(input: SaveSbaInput): Promise<SaveSbaResult> {
    const normalizedSubject = normalizeSubjectName(input.subjectId);

    const config = await this.getConfig(input.subjectCode);
    if (!config) {
      throw new Error(`No SBA config for subject ${input.subjectCode}`);
    }

    const existing = await this.getSbaResultsForClassSubject(
      input.classId,
      normalizedSubject,
      input.examYear
    );
    const existingByDocId = new Map<string, SbaResult>();
    existing.forEach(r => existingByDocId.set(r.studentId, r));

    if (existing.length > 0 && !input.overwrite) {
      throw new Error(
        `SBA results already exist for ${config.subjectName}. ` +
        `Pass overwrite: true to replace them.`
      );
    }

    // Pre-compute per-task maxima for each form the subject uses
    const perTaskByForm: Record<SbaForm, number[]> = {
      form1: defaultPerTaskMarks(
        config.marksPerForm.form1 ?? 100,
        config.tasksPerForm.form1 ?? 0
      ),
      form2: defaultPerTaskMarks(
        config.marksPerForm.form2 ?? 100,
        config.tasksPerForm.form2 ?? 0
      ),
      form3: defaultPerTaskMarks(
        config.marksPerForm.form3 ?? 100,
        config.tasksPerForm.form3 ?? 0
      ),
    };

    const resolved = await Promise.all(
      input.students.map(async s => ({
        input: s,
        doc: await this.resolveStudentDocument(s.studentId),
      }))
    );

    const classSnap = await getDoc(doc(this.classesCollection, input.classId));
    const classData = classSnap.exists() ? classSnap.data() : {};
    const form = (classData?.level ?? 0).toString() || '?';

    const now = new Date().toISOString();
    const batch = writeBatch(db);
    const written: SbaResult[] = [];

    for (const { input: s, doc: studentDoc } of resolved) {
      if (!studentDoc) {
        console.warn(`⚠️ Could not resolve student ${s.studentId}, skipping.`);
        continue;
      }

      // ---- Resolve form totals ----
      // Prefer task arrays when present; fall back to legacy formNMark fields.

      const resolveForm = (
        formKey: SbaForm,
        tasks: Array<number | null> | undefined,
        legacyMark: number | null | undefined
      ): { formMark: number | null; tasks: Array<number | null>; formResult: FormTaskResult } => {
        const perTask = perTaskByForm[formKey];
        const expectedTaskCount = config.tasksPerForm[formKey] ?? 0;

        if (tasks && tasks.length > 0) {
          const r = computeFormTotalFromTasks(tasks, perTask);
          return {
            formMark: formTotalToMarkValue(r),
            tasks,
            formResult: r,
          };
        }

        // Legacy path: only a form total was sent
        if (legacyMark !== null && legacyMark !== undefined) {
          // Synthesize a "complete" form result from the total
          const max = perTask.reduce((a, b) => a + b, 0) || 100;
          const r: FormTaskResult = {
            total: legacyMark >= 0 ? legacyMark : 0,
            max,
            status:
              legacyMark === -1 ? 'absent'
              : legacyMark === -2 ? 'not_conducted'
              : 'complete',
            enteredCount: expectedTaskCount,
            absentCount: legacyMark === -1 ? 1 : 0,
            notConductedCount: legacyMark === -2 ? 1 : 0,
          };
          return { formMark: legacyMark, tasks: [], formResult: r };
        }

        // Nothing sent
        return {
          formMark: null,
          tasks: [],
          formResult: {
            total: 0,
            max: perTask.reduce((a, b) => a + b, 0) || 100,
            status: 'empty',
            enteredCount: 0,
            absentCount: 0,
            notConductedCount: 0,
          },
        };
      };

      const f1 = resolveForm('form1', s.form1Tasks, s.form1Mark);
      const f2 = resolveForm('form2', s.form2Tasks, s.form2Mark);
      const f3 = resolveForm('form3', s.form3Tasks, s.form3Mark);

      const computed = computeSbaTotals(
        {
          form1Mark: f1.formMark,
          form2Mark: f2.formMark,
          form3Mark: f3.formMark,
        },
        {
          sbaWeightPercent: config.sbaWeightPercent,
          sbaForms: config.sbaForms,
          marksPerForm: config.marksPerForm,
        }
      );

      const id = buildResultId(studentDoc.documentId, normalizedSubject, input.examYear);

      const result: SbaResult = {
        id,
        studentId: studentDoc.documentId,
        customStudentId: studentDoc.customId,
        studentName:
          studentDoc.data?.name || studentDoc.data?.fullName || s.studentName,
        classId: input.classId,
        className: input.className,
        form,

        subjectId: normalizedSubject,
        subjectName: config.subjectName,
        subjectCode: config.subjectCode,
        teacherId: input.teacherId,
        teacherName: input.teacherName,

        // Raw form totals (derived from tasks)
        form1Mark: f1.formMark,
        form2Mark: f2.formMark,
        form3Mark: f3.formMark,

        // Task arrays (for audit + UI rehydration)
        form1Tasks: f1.tasks,
        form2Tasks: f2.tasks,
        form3Tasks: f3.tasks,

        // Computed
        sbaRawTotal: computed.sbaRawTotal,
        sbaRawMax: computed.sbaRawMax,
        sbaRawPercentage: computed.sbaRawPercentage,
        sbaWeightPercent: config.sbaWeightPercent,
        weightedSbaScore: computed.weightedSbaScore,
        sbaOnlyCompetencyLevel: computed.sbaOnlyCompetencyLevel,
        sbaOnlyCompetencyLabel: computed.sbaOnlyCompetencyLabel,

        examYear: input.examYear,
        status: existing.length > 0 ? 'submitted' : 'draft',
        createdAt: existingByDocId.get(studentDoc.documentId)?.createdAt || now,
        updatedAt: now,
      };

      batch.set(doc(this.resultsCollection, id), result, { merge: true });
      written.push(result);
    }

    await batch.commit();
    console.log(`✅ SBA saved: ${written.length} records`);

    return {
      success: true,
      count: written.length,
      overwritten: existing.length > 0,
      results: written,
    };
  }

  // ---------- DELETE ----------

  async deleteSbaMarks(input: DeleteSbaInput): Promise<{ deletedCount: number }> {
    const normalizedSubject = normalizeSubjectName(input.subjectId);
    const existing = await this.getSbaResultsForClassSubject(
      input.classId,
      normalizedSubject,
      input.examYear
    );

    if (existing.length === 0) {
      return { deletedCount: 0 };
    }

    const batch = writeBatch(db);
    existing.forEach(r => {
      batch.delete(doc(this.resultsCollection, r.id));
    });
    await batch.commit();

    console.log(`🗑️ SBA deleted: ${existing.length} records`);
    return { deletedCount: existing.length };
  }

  // ---------- COMPLETION ----------

  async getSbaCompletionForClass(
    classId: string,
    examYear: number
  ): Promise<SbaClassCompletion | null> {
    try {
      const classSnap = await getDoc(doc(this.classesCollection, classId));
      if (!classSnap.exists()) return null;
      const classData = classSnap.data();

      const assignQ = query(
        this.assignmentsCollection,
        where('classId', '==', classId)
      );
      const assignSnap = await getDocs(assignQ);
      const allConfigs = await this.getAllConfigs();

      const configByNormalized = new Map<string, SbaConfig>();
      allConfigs.forEach(c => {
        configByNormalized.set(normalizeSubjectName(c.subjectName), c);
        c.aliases.forEach(a => configByNormalized.set(normalizeSubjectName(a), c));
      });

      type Expected = {
        subjectId: string;
        subjectName: string;
        subjectCode: string;
        teacherId: string;
        teacherName: string;
        config: SbaConfig;
      };

      const expectedMap = new Map<string, Expected>();
      for (const d of assignSnap.docs) {
        const data = d.data();
        const raw = data.subject || '';
        if (!raw || raw === 'Form Teacher') continue;
        const normalized = normalizeSubjectName(raw);
        const cfg =
          configByNormalized.get(normalized) ||
          (await this.resolveConfig(raw));
        if (!cfg) continue;
        if (expectedMap.has(normalized)) continue;

        expectedMap.set(normalized, {
          subjectId: normalized,
          subjectName: cfg.subjectName,
          subjectCode: cfg.subjectCode,
          teacherId: data.teacherId,
          teacherName: data.teacherName || 'Not Assigned',
          config: cfg,
        });
      }

      const results = await this.getSbaResultsForClass(classId, examYear);

      const learnerQ = query(
        this.learnersCollection,
        where('classId', '==', classId),
        where('classType', '==', 'form')
      );
      const learnerSnap = await getDocs(learnerQ);
      const totalStudents = learnerSnap.size;

      const subjects: SbaSubjectCompletion[] = [];

      for (const [subjectId, meta] of expectedMap.entries()) {
        const subjectResults = results.filter(r => r.subjectId === subjectId);

        // "Entered" = student has at least one form mark saved
        const enteredByForm = {
          form1: subjectResults.filter(r => r.form1Mark !== null).length,
          form2: subjectResults.filter(r => r.form2Mark !== null).length,
          form3: subjectResults.filter(r => r.form3Mark !== null).length,
        };

        // "Complete" = every form the subject uses has a non-null formMark
        const completeStudents = subjectResults.filter(r => {
          const required = meta.config.sbaForms;
          return required.every(f => {
            const v = r[`${f}Mark` as 'form1Mark' | 'form2Mark' | 'form3Mark'];
            return v !== null && v !== undefined;
          });
        }).length;

        const validPercentages = subjectResults
          .map(r => r.sbaRawPercentage)
          .filter(p => p >= 0);
        const avgSbaRawPercentage =
          validPercentages.length > 0
            ? Math.round(
                validPercentages.reduce((a, b) => a + b, 0) / validPercentages.length
              )
            : -1;

        const levelDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        subjectResults.forEach(r => {
          if (r.sbaOnlyCompetencyLevel >= 1 && r.sbaOnlyCompetencyLevel <= 5) {
            levelDistribution[r.sbaOnlyCompetencyLevel]++;
          }
        });

        const percentComplete =
          totalStudents > 0
            ? Math.round((completeStudents / totalStudents) * 100)
            : 0;

        subjects.push({
          subjectId,
          subjectName: meta.subjectName,
          subjectCode: meta.subjectCode,
          teacherId: meta.teacherId,
          teacherName: meta.teacherName,
          classId,
          className: classData.name,
          examYear,
          totalStudents,
          enteredStudents: subjectResults.length,
          completeStudents,
          enteredByForm,
          percentComplete,
          avgSbaRawPercentage,
          levelDistribution,
          enteredStudentIds: subjectResults.map(r => r.studentId),
        });
      }

      const overallPercentComplete =
        subjects.length > 0
          ? Math.round(
              subjects.reduce((s, x) => s + x.percentComplete, 0) / subjects.length
            )
          : 0;

      return {
        classId,
        className: classData.name,
        totalStudents,
        subjects: subjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
        overallPercentComplete,
      };
    } catch (error) {
      console.error('Error building class completion:', error);
      return null;
    }
  }

  // ---------- SCHOOL OVERVIEW ----------

  async getSchoolOverview(examYear: number): Promise<SbaSchoolOverview | null> {
    try {
      const classQ = query(
        this.classesCollection,
        where('type', '==', 'form'),
        where('isActive', '==', true)
      );
      const classSnap = await getDocs(classQ);

      const classCompletions: SbaClassCompletion[] = [];
      for (const c of classSnap.docs) {
        const completion = await this.getSbaCompletionForClass(c.id, examYear);
        if (completion) classCompletions.push(completion);
      }

      const perClass: SbaSchoolOverviewRow[] = classCompletions.map(c => {
        const subjectsComplete = c.subjects.filter(s => s.percentComplete === 100).length;

        const validAvgs = c.subjects
          .map(s => s.avgSbaRawPercentage)
          .filter(a => a >= 0);
        const avgSbaRawPercentage =
          validAvgs.length > 0
            ? Math.round(validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length)
            : -1;

        const levelDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        c.subjects.forEach(s => {
          Object.entries(s.levelDistribution).forEach(([k, v]) => {
            levelDistribution[Number(k)] += v;
          });
        });

        return {
          classId: c.classId,
          className: c.className,
          totalStudents: c.totalStudents,
          subjectsTracked: c.subjects.length,
          subjectsComplete,
          overallPercentComplete: c.overallPercentComplete,
          avgSbaRawPercentage,
          levelDistribution,
        };
      });

      const totalStudents = perClass.reduce((s, c) => s + c.totalStudents, 0);

      let totalSbaRecords = 0;
      let totalWeightedPercent = 0;

      const overallLevelDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      const validAvgList: number[] = [];
      const subjectsWithZeroEntries: SbaSchoolOverview['subjectsWithZeroEntries'] = [];

      classCompletions.forEach(c => {
        c.subjects.forEach(s => {
          totalSbaRecords += s.enteredStudents;
          totalWeightedPercent += s.percentComplete;

          if (s.enteredStudents === 0) {
            subjectsWithZeroEntries.push({
              classId: c.classId,
              className: c.className,
              subjectId: s.subjectId,
              subjectName: s.subjectName,
              teacherName: s.teacherName,
            });
          } else {
            if (s.avgSbaRawPercentage >= 0) validAvgList.push(s.avgSbaRawPercentage);
          }

          Object.entries(s.levelDistribution).forEach(([k, v]) => {
            overallLevelDistribution[Number(k)] += v;
          });
        });
      });

      const totalSubjects = classCompletions.reduce((s, c) => s + c.subjects.length, 0);

      const overallPercentComplete =
        totalSubjects > 0
          ? Math.round(totalWeightedPercent / totalSubjects)
          : 0;

      const avgSbaRawPercentage =
        validAvgList.length > 0
          ? Math.round(validAvgList.reduce((a, b) => a + b, 0) / validAvgList.length)
          : -1;

      return {
        examYear,
        totalClasses: classSnap.size,
        totalStudents,
        totalSbaRecords,
        overallPercentComplete,
        avgSbaRawPercentage,
        levelDistribution: overallLevelDistribution,
        perClass: perClass.sort((a, b) => a.className.localeCompare(b.className)),
        subjectsWithZeroEntries,
      };
    } catch (error) {
      console.error('Error building school overview:', error);
      return null;
    }
  }
}

export const sbaService = new SbaService();

// Re-export utils for convenience
export { normalizeSubjectName, resolveSubjectCode };