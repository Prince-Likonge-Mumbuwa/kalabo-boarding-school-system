// @/pages/teacher/MyTimetable.tsx
//
// ============================================================================
//  TEACHER — MY TIMETABLE
// ============================================================================
//
//  The teacher's weekly grid for the current term, one section per class
//  they operate a slot in. Covers are automatic: a cover teacher sees the
//  same cells as the owner because authority is resolved at read time.
//
//  Edit flow:
//    1. Click any cell in the grid → PeriodCellEditor opens
//       OR
//       Click "Quick add" in a class header → inline form to place a slot
//    2. Pick a subject (slot) + optional double toggle
//    3. Repeats across the week
//    4. Submits per class OR submits all classes
//       → rows become 'pending'; the previous 'active' timetable stays live
//       → admin approves → rows become 'active'
//
//  CLASS-SUBJECT SOURCE OF TRUTH
//  ─────────────────────────────
//  The slots offered per class come from `useTeacherClasses()` — the
//  authoritative list of every slot the teacher currently operates (owner
//  or live delegate). This means:
//    • A brand-new teacher sees all their assigned subjects, even with
//      zero timetable entries.
//    • A cover teacher inherits the owner's subjects automatically.
//    • A subject added mid-term by the admin appears immediately.
//
//  Conflicts are shown live (before submit) so the teacher can fix them.
//  Holiday warnings are shown too — lessons on holiday dates are skipped,
//  but the pattern itself is still valid for the term.
// ============================================================================

import { useMemo, useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { useTeacherClasses } from '@/hooks/useTeacherClasses';
import {
  usePeriods,
  useMyTimetable,
  useMyTimetableClasses,
  useTodayTimetable,
  useCurrentPeriod,
  useSchoolHolidays,
  useSubmitTimetable,
  usePendingSubmissions,
  invalidateTimetableCaches,
} from '@/hooks/useTimetable';
import { useQueryClient } from '@tanstack/react-query';
import { getCurrentAcademicTerm } from '@/utils/academicTerm';
import { detectAllConflicts } from '@/services/timetableService';

import {
  TimetableGrid,
  PeriodCellEditor,
  CurrentPeriodBanner,
  PendingApprovalBanner,
  ConflictWarning,
} from '@/components/timetable/TimetableShared';

import type {
  ResolvedTimetableEntry,
  TimetableEntryInput,
  TimetableConflict,
  TimetableEntry,
} from '@/types/timetable';
import type { TermName } from '@/utils/academicTerm';

import {
  Loader2, AlertCircle, Save, Send,
  RefreshCw, Calendar as CalendarIcon, Layers,
  Plus, X as XIcon,
} from 'lucide-react';

// ==================== TYPES ====================

type CellKey = string; // `${day}:${periodIndex}`

interface CellEdit {
  slotId: string;
  isDouble: boolean;
}
type EditMap = Record<CellKey, CellEdit | null>;

interface ClassSlotInfo {
  slotId: string;
  subject: string;
  classId: string;
  className: string;
  /** Only owners can be Form Teacher of the class. */
  isFormTeacher: boolean;
  /** 'owner' if this teacher holds the slot; 'delegate' if they cover it. */
  relation: 'owner' | 'delegate';
  /** True when the teacher can operate the slot right now (owner or live delegate). */
  canOperate: boolean;
}

interface ClassSection {
  classId: string;
  className: string;
  slots: ClassSlotInfo[];
  entries: ResolvedTimetableEntry[];
  pendingEntries: TimetableEntry[];
  rejectedEntries: TimetableEntry[];
  activeEntries: TimetableEntry[];
}

// ==================== MAIN COMPONENT ====================

export default function MyTimetable() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const currentTerm = getCurrentAcademicTerm();
  const [term, setTerm] = useState<TermName>(currentTerm.term);
  const [year, setYear] = useState<number>(currentTerm.year);

  // ── Data ──────────────────────────────────────────────────────────
  const periodsQ = usePeriods(year);
  const myTimetableQ = useMyTimetable({ term, year });
  const myClassesQ = useMyTimetableClasses({ term, year });
  const todayQ = useTodayTimetable();
  const currentPeriodQ = useCurrentPeriod();
  const holidaysQ = useSchoolHolidays({ year });
  const pendingQ = usePendingSubmissions();
  const submitMutation = useSubmitTimetable();

  // ── Authoritative class+slot list for THIS teacher ────────────────
  //
  // `useTeacherClasses` reads the operational view from class_slots and
  // returns every slot the teacher is attached to — owner OR delegate —
  // with `canOperate` set to true when the teacher has live authority.
  //
  // This is what makes the Quick-Add panel show a fresh teacher all their
  // subjects, a cover teacher the owner's subjects, and any admin
  // mid-term additions, without depending on existing timetable entries.
  const teacherClassesQ = useTeacherClasses();

  const loading =
    periodsQ.isLoading ||
    myTimetableQ.isLoading ||
    myClassesQ.isLoading ||
    teacherClassesQ.isLoading;

  // ── Class sections ────────────────────────────────────────────────
  //
  // The shape of the class blocks: for each class the teacher operates a
  // slot in, we build the subject list from `useTeacherClasses` and the
  // resolved entries from `useMyTimetable`.
  const sections: ClassSection[] = useMemo(() => {
    const teacherClasses = teacherClassesQ.data ?? [];
    const entries = myTimetableQ.data ?? [];

    return teacherClasses
      .map(tc => {
        // Build the class's subject list from the authoritative view.
        const slots: ClassSlotInfo[] = tc.subjects.map(s => ({
          slotId: s.slotId ?? `${tc.classId}__${s.normalizedSubjectId}`,
          subject: s.subject,
          classId: tc.classId,
          className: tc.className,
          isFormTeacher: s.isFormTeacher,
          relation: s.relation,
          canOperate: s.canOperate,
        }));

        // Resolved entries for this class (used to draw the grid).
        const classEntries = entries.filter(e => e.entry.classId === tc.classId);

        return {
          classId: tc.classId,
          className: tc.className,
          slots,
          entries: classEntries,
          pendingEntries: [],
          rejectedEntries: [],
          activeEntries: classEntries.map(e => e.entry),
        };
      })
      .sort((a, b) => a.className.localeCompare(b.className));
  }, [teacherClassesQ.data, myTimetableQ.data]);

  // ── Pending / rejected by class ──────────────────────────────────
  const pendingByClass = useMemo(() => {
    const map = new Map<string, TimetableEntry[]>();
    for (const sub of pendingQ.data ?? []) {
      if (sub.submittedByUid !== user?.uid) continue;
      if (sub.term !== term || sub.year !== year) continue;
      for (const e of sub.entries) {
        const arr = map.get(e.classId) ?? [];
        arr.push(e);
        map.set(e.classId, arr);
      }
    }
    return map;
  }, [pendingQ.data, user?.uid, term, year]);

  // ── Editing state ─────────────────────────────────────────────────
  const [editsByClass, setEditsByClass] = useState<Record<string, EditMap>>({});
  const [activeEditCell, setActiveEditCell] = useState<{
    classId: string;
    day: 1 | 2 | 3 | 4 | 5;
    periodIndex: number;
  } | null>(null);

  const [quickAddClassId, setQuickAddClassId] = useState<string | null>(null);

  // Reset edits when the term/year changes.
  useEffect(() => {
    setEditsByClass({});
    setActiveEditCell(null);
    setQuickAddClassId(null);
  }, [term, year]);

  // Build the lesson periods to render as rows.
  const lessonPeriods = useMemo(
    () => (periodsQ.data ?? []).filter(p => p.kind === 'lesson'),
    [periodsQ.data],
  );

  // For the editor: the next period must be a lesson and adjacent to allow double.
  const canBeDouble = useCallback(
    (periodIndex: number) => {
      const all = periodsQ.data ?? [];
      const here = all.find(p => p.order === periodIndex);
      const next = all.find(p => p.order === periodIndex + 1);
      return !!here && !!next && here.kind === 'lesson' && next.kind === 'lesson';
    },
    [periodsQ.data],
  );

  // ── Handlers ──────────────────────────────────────────────────────

  const openEditor = (classId: string, day: 1 | 2 | 3 | 4 | 5, periodIndex: number) => {
    setActiveEditCell({ classId, day, periodIndex });
  };

  const closeEditor = () => setActiveEditCell(null);

  const handleSelectSlot = (slotId: string | null) => {
    if (!activeEditCell) return;
    const { classId, day, periodIndex } = activeEditCell;
    setEditsByClass(prev => {
      const cls = { ...(prev[classId] ?? {}) };
      const key = cellKey(day, periodIndex);
      if (slotId === null) {
        cls[key] = null;
      } else {
        const existing = cls[key];
        cls[key] = {
          slotId,
          isDouble: existing?.isDouble && existing.slotId === slotId ? existing.isDouble : false,
        };
      }
      return { ...prev, [classId]: cls };
    });
  };

  const handleToggleDouble = (isDouble: boolean) => {
    if (!activeEditCell) return;
    const { classId, day, periodIndex } = activeEditCell;
    setEditsByClass(prev => {
      const cls = { ...(prev[classId] ?? {}) };
      const key = cellKey(day, periodIndex);
      const existing = cls[key];
      if (!existing) return prev;
      cls[key] = { ...existing, isDouble };
      return { ...prev, [classId]: cls };
    });
  };

  const handleClearCell = () => {
    handleSelectSlot(null);
  };

  // Direct-add from the quick-add panel.
  const handleQuickAdd = useCallback(
    (classId: string, slotId: string, day: 1 | 2 | 3 | 4 | 5, periodIndex: number, isDouble: boolean) => {
      setEditsByClass(prev => {
        const cls = { ...(prev[classId] ?? {}) };
        const key = cellKey(day, periodIndex);
        cls[key] = { slotId, isDouble };
        if (isDouble) {
          const tailKey = cellKey(day, periodIndex + 1);
          if (cls[tailKey] === undefined || cls[tailKey] !== null) {
            cls[tailKey] = null;
          }
        }
        return { ...prev, [classId]: cls };
      });
    },
    [],
  );

  // ── Proposed rows (edits merged into active) ─────────────────────
  const proposedByClass = useMemo(() => {
    const out = new Map<string, Array<TimetableEntryInput & { subject: string; className: string }>>();

    for (const s of sections) {
      const edits = editsByClass[s.classId] ?? {};

      const byCell = new Map<CellKey, TimetableEntryInput & { subject: string; className: string }>();
      for (const a of s.activeEntries) {
        byCell.set(cellKey(a.dayOfWeek, a.periodIndex), {
          slotId: a.slotId,
          dayOfWeek: a.dayOfWeek,
          periodIndex: a.periodIndex,
          isDouble: a.isDouble,
          subject: a.subject,
          className: a.className,
        });
      }

      for (const [key, edit] of Object.entries(edits)) {
        const [dStr, pStr] = key.split(':');
        const day = Number(dStr) as 1 | 2 | 3 | 4 | 5;
        const periodIndex = Number(pStr);

        if (edit === null) {
          byCell.delete(key);
          continue;
        }

        const slot = s.slots.find(x => x.slotId === edit.slotId);
        if (!slot) continue;

        byCell.set(key, {
          slotId: edit.slotId,
          dayOfWeek: day,
          periodIndex,
          isDouble: edit.isDouble,
          subject: slot.subject,
          className: slot.className,
        });
      }

      const rows: Array<TimetableEntryInput & { subject: string; className: string }> = [];
      const tailKeys = new Set<CellKey>();
      for (const r of byCell.values()) {
        if (r.isDouble) tailKeys.add(cellKey(r.dayOfWeek, r.periodIndex + 1));
      }
      for (const [key, r] of byCell) {
        if (tailKeys.has(key)) continue;
        rows.push(r);
      }

      out.set(s.classId, rows);
    }

    return out;
  }, [sections, editsByClass]);

  // ── Live conflicts per class ─────────────────────────────────────
  const conflictsByClass = useMemo(() => {
    const out = new Map<string, TimetableConflict[]>();
    for (const s of sections) {
      const rows = proposedByClass.get(s.classId) ?? [];
      const conflictInputs = rows.map((r, i) => {
        const matched = s.entries.find(
          e => e.entry.slotId === r.slotId,
        );
        return {
          id: `proposed-${i}-${s.classId}-${r.slotId}-${r.dayOfWeek}-${r.periodIndex}`,
          slotId: r.slotId,
          classId: s.classId,
          className: s.className,
          subject: r.subject,
          dayOfWeek: r.dayOfWeek,
          periodIndex: r.periodIndex,
          isDouble: r.isDouble,
          ownerTeacherId: matched?.ownerTeacherId ?? user?.uid ?? null,
          ownerTeacherName: matched?.ownerTeacherName ?? user?.fullName ?? null,
        };
      });
      out.set(s.classId, detectAllConflicts(conflictInputs));
    }
    return out;
  }, [sections, proposedByClass, user?.uid, user?.fullName]);

  const hasAnyConflicts = useMemo(
    () =>
      Array.from(conflictsByClass.values()).some(list =>
        list.some(c => c.kind !== 'holiday'),
      ),
    [conflictsByClass],
  );

  // ── Holiday warnings ─────────────────────────────────────────────
  const holidayWarnings = useMemo(() => {
    const list = holidaysQ.data ?? [];
    const today = new Date();
    const todayYMD = ymd(today);
    return list
      .filter(h => h.endDate >= todayYMD)
      .slice(0, 4);
  }, [holidaysQ.data]);

  // ── Submit handlers ──────────────────────────────────────────────

  const submitClass = useCallback(
    async (classId: string) => {
      if (!user) return;
      const rows = proposedByClass.get(classId) ?? [];
      const inputs: TimetableEntryInput[] = rows.map(r => ({
        slotId: r.slotId,
        dayOfWeek: r.dayOfWeek,
        periodIndex: r.periodIndex,
        isDouble: r.isDouble,
      }));

      await submitMutation.mutateAsync({
        classIdsFilter: [classId],
        term,
        year,
        entries: inputs,
      });

      setEditsByClass(prev => ({ ...prev, [classId]: {} }));
    },
    [user, proposedByClass, submitMutation, term, year],
  );

  const submitAll = useCallback(async () => {
    if (!user) return;
    const allInputs: TimetableEntryInput[] = [];
    for (const rows of proposedByClass.values()) {
      for (const r of rows) {
        allInputs.push({
          slotId: r.slotId,
          dayOfWeek: r.dayOfWeek,
          periodIndex: r.periodIndex,
          isDouble: r.isDouble,
        });
      }
    }

    await submitMutation.mutateAsync({
      classIdsFilter: null,
      term,
      year,
      entries: allInputs,
    });

    setEditsByClass({});
  }, [user, proposedByClass, submitMutation, term, year]);

  const handleRefresh = () => {
    // Refresh both caches — the teacher's slot list AND the entries.
    teacherClassesQ.refetch();
    invalidateTimetableCaches(qc);
  };

  // ── Render ────────────────────────────────────────────────────────
  const totalPending = Array.from(pendingByClass.values()).reduce(
    (n, list) => n + list.length,
    0,
  );

  const rejectedCount = sections.reduce(
    (n, s) => n + s.rejectedEntries.length,
    0,
  );

  if (loading) {
    return (
      <DashboardLayout activeTab="my-timetable">
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="bg-white rounded-2xl p-8 shadow-lg text-center">
            <Loader2 className="animate-spin text-blue-600 mx-auto mb-3" size={40} />
            <p className="text-gray-600">Loading your timetable…</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if ((periodsQ.data ?? []).length === 0) {
    return (
      <DashboardLayout activeTab="my-timetable">
        <div className="max-w-lg mx-auto mt-10 bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <AlertCircle className="text-amber-600 mx-auto mb-3" size={32} />
          <h2 className="font-semibold text-amber-900 mb-1">No periods configured</h2>
          <p className="text-sm text-amber-800">
            Ask your administrator to set up the school's bell schedule first.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="my-timetable">
      <div className="min-h-screen bg-gray-50/80 p-3 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-4">

          {/* ── Header ────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                My Timetable
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {term} {year} · {sections.length} class
                {sections.length === 1 ? '' : 'es'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={`${term}|${year}`}
                onChange={e => {
                  const [t, y] = e.target.value.split('|');
                  setTerm(t as TermName);
                  setYear(Number(y));
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                {['Term 1', 'Term 2', 'Term 3'].map(t => (
                  <option key={`${t}|${year}`} value={`${t}|${year}`}>
                    {t} {year}
                  </option>
                ))}
              </select>

              <button
                onClick={handleRefresh}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                title="Refresh"
              >
                <RefreshCw size={16} />
              </button>

              <button
                onClick={submitAll}
                disabled={submitMutation.isPending || hasAnyConflicts}
                title={hasAnyConflicts ? 'Fix conflicts first' : 'Submit all classes'}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {submitMutation.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                Submit all
              </button>
            </div>
          </div>

          {/* ── Banners ──────────────────────────────────────────── */}
          <PendingApprovalBanner count={totalPending} />

          {rejectedCount > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
              <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
              <div>
                <p className="font-semibold text-red-900 text-sm">
                  {rejectedCount} timetable row{rejectedCount === 1 ? '' : 's'} were rejected
                </p>
                <p className="text-xs text-red-800 mt-0.5">
                  Review the admin's note on the affected classes, adjust, and resubmit.
                </p>
              </div>
            </div>
          )}

          <CurrentPeriodBanner
            current={currentPeriodQ.data ?? null}
            next={computeNext(todayQ.data ?? [], new Date())}
          />

          {holidayWarnings.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-2.5 flex items-start gap-3">
              <CalendarIcon size={16} className="text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-rose-900">
                <span className="font-semibold">
                  {holidayWarnings.length} upcoming holiday
                  {holidayWarnings.length === 1 ? '' : 's'}:
                </span>{' '}
                {holidayWarnings.map(h => `${h.name} (${h.startDate})`).join(' · ')}
              </div>
            </div>
          )}

          {sections.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <Layers className="text-gray-400 mx-auto mb-3" size={32} />
              <h3 className="font-semibold text-gray-900 mb-1">
                No classes for {term} {year}
              </h3>
              <p className="text-sm text-gray-500">
                You're not currently assigned to any class for this term.
                Contact your administrator if this looks wrong.
              </p>
            </div>
          )}

          {/* ── Class sections ──────────────────────────────────── */}
          {sections.map(section => {
            const edits = editsByClass[section.classId] ?? {};
            const conflicts = conflictsByClass.get(section.classId) ?? [];
            const hardConflicts = conflicts.filter(c => c.kind !== 'holiday');
            const pendingRows = pendingByClass.get(section.classId) ?? [];
            const hasEdits = Object.keys(edits).length > 0;

            const placedSlotIds = new Set(
              (proposedByClass.get(section.classId) ?? []).map(r => r.slotId),
            );
            const unplacedCount = section.slots.filter(
              s => !placedSlotIds.has(s.slotId),
            ).length;

            const quickAddOpen = quickAddClassId === section.classId;

            return (
              <section
                key={section.classId}
                className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
              >
                <header className="px-4 sm:px-6 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gradient-to-r from-gray-50 to-white">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-gray-900 text-base sm:text-lg truncate">
                      {section.className}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {section.slots.length} subject
                      {section.slots.length === 1 ? '' : 's'}
                      {unplacedCount > 0 && (
                        <>
                          {' · '}
                          <span className="text-rose-700 font-medium">
                            {unplacedCount} unplaced
                          </span>
                        </>
                      )}
                      {pendingRows.length > 0 && (
                        <>
                          {' · '}
                          <span className="text-amber-700 font-medium">
                            {pendingRows.length} pending
                          </span>
                        </>
                      )}
                      {hasEdits && (
                        <>
                          {' · '}
                          <span className="text-blue-700 font-medium">
                            unsaved changes
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() =>
                        setQuickAddClassId(quickAddOpen ? null : section.classId)
                      }
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors ${
                        quickAddOpen
                          ? 'bg-gray-100 text-gray-700'
                          : 'text-blue-700 bg-blue-50 hover:bg-blue-100'
                      }`}
                      title="Quickly add a subject to a day/period"
                    >
                      {quickAddOpen ? <XIcon size={12} /> : <Plus size={12} />}
                      {quickAddOpen ? 'Close' : 'Quick add'}
                    </button>
                    {hasEdits && (
                      <button
                        onClick={() =>
                          setEditsByClass(prev => ({ ...prev, [section.classId]: {} }))
                        }
                        className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1"
                      >
                        Discard
                      </button>
                    )}
                    <button
                      onClick={() => submitClass(section.classId)}
                      disabled={
                        !hasEdits ||
                        submitMutation.isPending ||
                        hardConflicts.length > 0
                      }
                      title={
                        hardConflicts.length > 0
                          ? 'Fix conflicts first'
                          : !hasEdits
                          ? 'No changes to submit'
                          : 'Submit this class'
                      }
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      {submitMutation.isPending ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Save size={12} />
                      )}
                      Submit this class
                    </button>
                  </div>
                </header>

                {quickAddOpen && (
                  <QuickAddPanel
                    slots={section.slots}
                    lessonPeriods={lessonPeriods}
                    canBeDouble={canBeDouble}
                    onAdd={(slotId, day, periodIndex, isDouble) =>
                      handleQuickAdd(section.classId, slotId, day, periodIndex, isDouble)
                    }
                  />
                )}

                <div className="p-3 sm:p-4 space-y-3">
                  {hardConflicts.length > 0 && (
                    <ConflictWarning conflicts={hardConflicts} />
                  )}

                  <TimetableGrid
                    periods={lessonPeriods}
                    entries={section.entries}
                    editorSlots={section.slots}
                    edits={edits}
                    onEditCell={(day, periodIndex) =>
                      openEditor(section.classId, day, periodIndex)
                    }
                    highlightPeriodIndex={currentPeriodQ.data?.entry.periodIndex ?? null}
                    highlightDay={currentPeriodQ.data?.entry.dayOfWeek ?? null}
                  />
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* ── Editor dialog ──────────────────────────────────────── */}
      {activeEditCell && (() => {
        const { classId, day, periodIndex } = activeEditCell;
        const section = sections.find(s => s.classId === classId);
        if (!section) return null;
        const period = (periodsQ.data ?? []).find(p => p.order === periodIndex) ?? null;
        if (!period) return null;
        const key = cellKey(day, periodIndex);
        const edit = editsByClass[classId]?.[key] ?? null;

        return (
          <PeriodCellEditor
            open={true}
            day={day}
            period={period}
            selectedSlotId={edit?.slotId ?? null}
            isDouble={edit?.isDouble ?? false}
            slots={section.slots}
            canBeDouble={canBeDouble(periodIndex)}
            onSelect={handleSelectSlot}
            onToggleDouble={handleToggleDouble}
            onSave={closeEditor}
            onClear={() => {
              handleClearCell();
              closeEditor();
            }}
            onClose={closeEditor}
          />
        );
      })()}
    </DashboardLayout>
  );
}

// ==================== QUICK-ADD PANEL ====================

function QuickAddPanel({
  slots,
  lessonPeriods,
  canBeDouble,
  onAdd,
}: {
  slots: Array<{ slotId: string; subject: string; relation?: 'owner' | 'delegate'; canOperate?: boolean }>;
  lessonPeriods: Array<{ id: string; order: number; name: string; startTime: string; endTime: string; kind: string }>;
  canBeDouble: (periodIndex: number) => boolean;
  onAdd: (
    slotId: string,
    day: 1 | 2 | 3 | 4 | 5,
    periodIndex: number,
    isDouble: boolean,
  ) => void;
}) {
  const [slotId, setSlotId] = useState(slots[0]?.slotId ?? '');
  const [day, setDay] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [periodIndex, setPeriodIndex] = useState<number>(
    lessonPeriods[0]?.order ?? 1,
  );
  const [isDouble, setIsDouble] = useState(false);

  useEffect(() => {
    if (!slots.some(s => s.slotId === slotId)) {
      setSlotId(slots[0]?.slotId ?? '');
    }
  }, [slots, slotId]);

  useEffect(() => {
    if (!lessonPeriods.some(p => p.order === periodIndex)) {
      setPeriodIndex(lessonPeriods[0]?.order ?? 1);
    }
  }, [lessonPeriods, periodIndex]);

  useEffect(() => {
    if (isDouble && !canBeDouble(periodIndex)) setIsDouble(false);
  }, [isDouble, periodIndex, canBeDouble]);

  const disabled = !slotId || !periodIndex;

  const handleAdd = () => {
    if (disabled) return;
    onAdd(slotId, day, periodIndex, isDouble);
  };

  return (
    <div className="border-b border-blue-100 bg-blue-50/40 px-4 sm:px-6 py-3">
      <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-3">
        <label className="block flex-1 min-w-0">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            Subject
          </span>
          <select
            value={slotId}
            onChange={e => setSlotId(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            {slots.length === 0 ? (
              <option value="">No subjects</option>
            ) : (
              slots.map(s => (
                <option key={s.slotId} value={s.slotId}>
                  {s.subject}
                  {s.relation === 'delegate' ? ' [cover]' : ''}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="block w-full sm:w-28">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            Day
          </span>
          <select
            value={day}
            onChange={e => setDay(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            {(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const).map((name, i) => (
              <option key={name} value={i + 1}>{name}</option>
            ))}
          </select>
        </label>

        <label className="block w-full sm:w-44">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            Period
          </span>
          <select
            value={periodIndex}
            onChange={e => setPeriodIndex(Number(e.target.value))}
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            {lessonPeriods.length === 0 ? (
              <option value={1}>No periods</option>
            ) : (
              lessonPeriods.map(p => (
                <option key={p.id} value={p.order}>
                  {p.name} ({p.startTime}–{p.endTime})
                </option>
              ))
            )}
          </select>
        </label>

        <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg bg-white">
          <input
            type="checkbox"
            checked={isDouble}
            disabled={!canBeDouble(periodIndex)}
            onChange={e => setIsDouble(e.target.checked)}
            className="rounded border-gray-300 text-purple-600"
          />
          <span className="text-xs text-gray-700 whitespace-nowrap">Double</span>
        </label>

        <button
          onClick={handleAdd}
          disabled={disabled}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
        >
          <Plus size={14} /> Add
        </button>
      </div>
      <p className="text-[10px] text-gray-500 mt-2">
        Added cells appear on the grid below as unsaved changes. Use the class's
        Submit button when done.
      </p>
    </div>
  );
}

// ==================== HELPERS ====================

function cellKey(day: 1 | 2 | 3 | 4 | 5, periodIndex: number): CellKey {
  return `${day}:${periodIndex}`;
}

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function computeNext(
  today: ResolvedTimetableEntry[],
  now: Date,
): ResolvedTimetableEntry | null {
  const minutes = now.getHours() * 60 + now.getMinutes();
  for (const row of today) {
    if (!row.period) continue;
    const [h, m] = row.period.startTime.split(':').map(Number);
    if (h * 60 + m > minutes) return row;
  }
  return null;
}