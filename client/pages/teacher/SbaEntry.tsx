// @/pages/teacher/SbaEntry.tsx
// SBA mark entry — task-at-a-time gradebook with dropdown selectors
// ECSEOL 2026

import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Save,
  Loader2,
  Users,
  AlertCircle,
  XCircle,
  Download,
  Trash2,
  RefreshCw,
  GraduationCap,
  FileText,
  UserX,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { learnerService } from '@/services/schoolService';
import {
  useSbaAssignmentsForTeacher,
  useSbaResults,
  useSaveSbaMarks,
  useDeleteSbaMarks,
} from '@/hooks/useSba';
import type { SbaConfig, SbaForm, FormTaskStatus } from '@/types/sba';

// ==================== TYPES ====================

interface StudentRowState {
  id: string;
  customStudentId: string;
  name: string;
  form1Tasks: string[];
  form2Tasks: string[];
  form3Tasks: string[];
}

interface ModalState {
  type: 'confirmDelete' | 'confirmOverwrite' | 'confirmDiscard';
  title: string;
  description: string;
  onConfirm: () => void;
}

interface ToastState {
  id: number;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

// ==================== HELPERS ====================

function deriveExamYear(currentForm: number, currentYear = new Date().getFullYear()): number {
  if (currentForm >= 1 && currentForm <= 4) {
    return currentYear + (4 - currentForm);
  }
  return currentYear;
}

function parseTaskMark(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === '') return null;
  if (trimmed === 'x') return -1;
  if (trimmed === 'nc' || trimmed === 'n/c') return -2;
  const num = parseInt(trimmed, 10);
  if (isNaN(num)) return null;
  return num;
}

function taskMarkToInput(mark: number | null | undefined): string {
  if (mark === null || mark === undefined) return '';
  if (mark === -1) return 'X';
  if (mark === -2) return 'NC';
  return mark.toString();
}

function defaultPerTaskMarks(formTotal: number, taskCount: number): number[] {
  if (taskCount <= 0) return [];
  const share = Math.floor((formTotal / taskCount) * 100) / 100;
  const arr = Array(taskCount).fill(share) as number[];
  const sum = share * (taskCount - 1);
  arr[taskCount - 1] = Math.round((formTotal - sum) * 100) / 100;
  return arr;
}

interface FormTaskComputation {
  total: number;
  max: number;
  status: FormTaskStatus;
  enteredCount: number;
  absentCount: number;
  notConductedCount: number;
  perTaskValues: Array<number | null>;
}

function computeFormFromInputs(
  taskInputs: string[],
  perTaskMarks: number[]
): FormTaskComputation {
  const max = perTaskMarks.reduce((a, b) => a + b, 0);
  const perTaskValues = taskInputs.map(parseTaskMark);

  let entered = 0;
  let absent = 0;
  let notConducted = 0;
  let sum = 0;

  for (const v of perTaskValues) {
    if (v === null) continue;
    entered++;
    if (v === -1) { absent++; continue; }
    if (v === -2) { notConducted++; continue; }
    sum += v;
  }

  let status: FormTaskStatus;
  if (taskInputs.length === 0) status = 'empty';
  else if (entered === 0) status = 'empty';
  else if (absent > 0) status = 'absent';
  else if (notConducted > 0) status = 'not_conducted';
  else if (entered < taskInputs.length) status = 'partial';
  else status = 'complete';

  return { total: sum, max, status, enteredCount: entered, absentCount: absent, notConductedCount: notConducted, perTaskValues };
}

function levelFromPercent(p: number): number {
  if (p < 0) return -1;
  if (p >= 70) return 1;
  if (p >= 60) return 2;
  if (p >= 50) return 3;
  if (p >= 40) return 4;
  return 5;
}

interface StudentLiveCompute {
  forms: Record<SbaForm, FormTaskComputation>;
  rawTotal: number;
  rawMax: number;
  percentage: number;
  weighted: number;
  level: number;
}

function liveComputeForStudent(
  student: StudentRowState,
  config: SbaConfig
): StudentLiveCompute {
  const perTask: Record<SbaForm, number[]> = {
    form1: defaultPerTaskMarks(config.marksPerForm.form1 ?? 100, config.tasksPerForm.form1 ?? 0),
    form2: defaultPerTaskMarks(config.marksPerForm.form2 ?? 100, config.tasksPerForm.form2 ?? 0),
    form3: defaultPerTaskMarks(config.marksPerForm.form3 ?? 100, config.tasksPerForm.form3 ?? 0),
  };

  const forms: Record<SbaForm, FormTaskComputation> = {
    form1: computeFormFromInputs(student.form1Tasks, perTask.form1),
    form2: computeFormFromInputs(student.form2Tasks, perTask.form2),
    form3: computeFormFromInputs(student.form3Tasks, perTask.form3),
  };

  let rawTotal = 0;
  let rawMax = 0;
  let usableForms = 0;

  for (const f of config.sbaForms) {
    const s = forms[f];
    rawMax += s.max;
    if (s.status === 'complete') {
      rawTotal += s.total;
      usableForms++;
    } else if (s.status === 'partial') {
      rawTotal += s.total;
    }
  }

  const hasBlocker = config.sbaForms.some(f => {
    const s = forms[f];
    return s.status === 'absent' || s.status === 'not_conducted';
  });

  if (hasBlocker || usableForms === 0 || rawMax === 0) {
    return { forms, rawTotal: 0, rawMax, percentage: -1, weighted: -1, level: -1 };
  }

  const percentage = Math.round((rawTotal / rawMax) * 100);
  const weighted = Math.round(percentage * config.sbaWeightPercent) / 100;
  const level = levelFromPercent(percentage);

  return { forms, rawTotal, rawMax, percentage, weighted, level };
}

function hydrateTaskInputs(stored: number[] | undefined, taskCount: number): string[] {
  const arr = (stored ?? []).map(v => taskMarkToInput(v));
  while (arr.length < taskCount) arr.push('');
  return arr.slice(0, taskCount);
}

function parseTaskArray(inputs: string[]): Array<number | null> {
  return inputs.map(parseTaskMark);
}

// ==================== LEVEL BADGE ====================

function LevelBadge({ level }: { level: number }) {
  if (level === -1) return <span className="text-gray-300 text-xs">—</span>;

  const styles: Record<number, string> = {
    1: 'bg-green-100 text-green-700',
    2: 'bg-blue-100 text-blue-700',
    3: 'bg-teal-100 text-teal-700',
    4: 'bg-yellow-100 text-yellow-700',
    5: 'bg-red-100 text-red-700',
  };

  const labels: Record<number, string> = {
    1: 'Outstanding',
    2: 'Advanced',
    3: 'Basic',
    4: 'Satisfactory',
    5: 'Unsatisfactory',
  };

  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap ${styles[level]}`}>
      {labels[level]}
    </span>
  );
}

// ==================== STUDENT ROW ====================

interface StudentRowProps {
  student: StudentRowState;
  index: number;
  config: SbaConfig;
  activeForm: SbaForm;
  activeTaskIndex: number;
  activeTaskValue: string;
  onTaskValueChange: (studentId: string, value: string) => void;
  onMarkTaskAbsent: (studentId: string) => void;
  isMobile: boolean;
}

function StudentRow({
  student,
  index,
  config,
  activeForm,
  activeTaskIndex,
  activeTaskValue,
  onTaskValueChange,
  onMarkTaskAbsent,
  isMobile,
}: StudentRowProps) {
  const live = liveComputeForStudent(student, config);
  const usesF1 = config.sbaForms.includes('form1');
  const usesF2 = config.sbaForms.includes('form2');
  const usesF3 = config.sbaForms.includes('form3');

  const parsed = parseTaskMark(activeTaskValue);
  const perTaskMarks = useMemo(
    () => defaultPerTaskMarks(
      config.marksPerForm[activeForm] ?? 100,
      config.tasksPerForm[activeForm] ?? 0
    ),
    [config, activeForm]
  );
  const activeTaskMax = perTaskMarks[activeTaskIndex] ?? 0;

  const isAbsent = parsed === -1;
  const isNotConducted = parsed === -2;
  const num = parsed !== null && parsed >= 0 ? parsed : null;
  const isOutOfRange = num !== null && num > activeTaskMax;

  const handleChange = (value: string) => {
    if (value !== '') {
      const v = value.toLowerCase();
      if (v !== 'x' && v !== 'nc' && v !== 'n/c' && !/^\d*$/.test(value)) return;
    }
    onTaskValueChange(student.id, value);
  };

  const TotalCell = ({ form }: { form: SbaForm }) => {
    const s = live.forms[form];
    const statusColor =
      s.status === 'complete' ? 'text-green-700'
      : s.status === 'partial' ? 'text-amber-700'
      : s.status === 'absent' || s.status === 'not_conducted' ? 'text-gray-500'
      : 'text-gray-300';
    const label =
      s.status === 'complete' ? `${s.total}/${s.max}`
      : s.status === 'partial' ? `${s.total}/${s.max}*`
      : s.status === 'absent' ? 'ABS'
      : s.status === 'not_conducted' ? 'N/C'
      : '—';
    return <span className={`text-sm font-medium ${statusColor}`}>{label}</span>;
  };

  if (isMobile) {
    return (
      <div className="bg-white border-b border-gray-100 p-3 last:border-b-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-xs font-medium text-gray-400 w-5">{index + 1}</span>
            <div className="min-w-0">
              <div className="font-medium text-gray-900 text-sm truncate">{student.name}</div>
              <div className="text-[10px] text-gray-400 font-mono">{student.customStudentId}</div>
            </div>
          </div>
          <LevelBadge level={live.level} />
        </div>

        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            value={activeTaskValue}
            onChange={e => handleChange(e.target.value)}
            placeholder={`Task ${activeTaskIndex + 1} —`}
            inputMode="numeric"
            className={`
              flex-1 px-3 py-2 border rounded-lg text-base font-medium text-center
              focus:ring-2 focus:ring-blue-500 focus:border-transparent
              ${isOutOfRange ? 'border-red-400 bg-red-50' :
                isAbsent ? 'border-gray-400 bg-gray-100 text-gray-600' :
                isNotConducted ? 'border-amber-300 bg-amber-50 text-amber-700' :
                num !== null ? 'border-green-300 bg-green-50' :
                'border-gray-300'
              }
            `}
          />
          <button
            onClick={() => onMarkTaskAbsent(student.id)}
            className={`p-2 rounded-lg transition-colors ${isAbsent ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            title="Mark this task absent"
          >
            <UserX size={14} />
          </button>
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-3 text-gray-500">
            {usesF1 && <span>F1 <strong className="text-gray-700">{live.forms.form1.status === 'complete' ? `${live.forms.form1.total}/${live.forms.form1.max}` : '—'}</strong></span>}
            {usesF2 && <span>F2 <strong className="text-gray-700">{live.forms.form2.status === 'complete' ? `${live.forms.form2.total}/${live.forms.form2.max}` : '—'}</strong></span>}
            {usesF3 && <span>F3 <strong className="text-gray-700">{live.forms.form3.status === 'complete' ? `${live.forms.form3.total}/${live.forms.form3.max}` : '—'}</strong></span>}
          </div>
          <span className="text-gray-700">
            {live.weighted >= 0 ? `${live.weighted.toFixed(2)}/${config.sbaWeightPercent}` : '—'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <tr className="hover:bg-gray-50/50 transition-colors">
      <td className="px-3 py-2.5 text-xs text-gray-500 font-mono">{index + 1}</td>
      <td className="px-3 py-2.5">
        <div className="font-medium text-gray-900 text-sm truncate max-w-[200px]" title={student.name}>
          {student.name}
        </div>
        <div className="text-xs text-gray-400 font-mono">{student.customStudentId}</div>
      </td>
      {usesF1 && (
        <td className={`px-3 py-2.5 ${activeForm === 'form1' ? 'bg-blue-50/40' : ''}`}>
          {activeForm === 'form1' ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={activeTaskValue}
                onChange={e => handleChange(e.target.value)}
                placeholder={`/${activeTaskMax}`}
                inputMode="numeric"
                className={`
                  w-20 px-2 py-1.5 border rounded-lg text-sm font-medium text-center
                  focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  ${isOutOfRange ? 'border-red-400 bg-red-50' :
                    isAbsent ? 'border-gray-400 bg-gray-100 text-gray-600' :
                    isNotConducted ? 'border-amber-300 bg-amber-50 text-amber-700' :
                    num !== null ? 'border-green-300 bg-green-50' :
                    'border-gray-300'
                  }
                `}
              />
              <button
                onClick={() => onMarkTaskAbsent(student.id)}
                className={`p-1 rounded transition-colors ${isAbsent ? 'text-red-600' : 'text-gray-300 hover:text-gray-600'}`}
                title="Mark task absent"
              >
                <UserX size={12} />
              </button>
            </div>
          ) : (
            <TotalCell form="form1" />
          )}
        </td>
      )}
      {usesF2 && (
        <td className={`px-3 py-2.5 ${activeForm === 'form2' ? 'bg-blue-50/40' : ''}`}>
          {activeForm === 'form2' ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={activeTaskValue}
                onChange={e => handleChange(e.target.value)}
                placeholder={`/${activeTaskMax}`}
                inputMode="numeric"
                className={`
                  w-20 px-2 py-1.5 border rounded-lg text-sm font-medium text-center
                  focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  ${isOutOfRange ? 'border-red-400 bg-red-50' :
                    isAbsent ? 'border-gray-400 bg-gray-100 text-gray-600' :
                    isNotConducted ? 'border-amber-300 bg-amber-50 text-amber-700' :
                    num !== null ? 'border-green-300 bg-green-50' :
                    'border-gray-300'
                  }
                `}
              />
              <button
                onClick={() => onMarkTaskAbsent(student.id)}
                className={`p-1 rounded transition-colors ${isAbsent ? 'text-red-600' : 'text-gray-300 hover:text-gray-600'}`}
              >
                <UserX size={12} />
              </button>
            </div>
          ) : (
            <TotalCell form="form2" />
          )}
        </td>
      )}
      {usesF3 && (
        <td className={`px-3 py-2.5 ${activeForm === 'form3' ? 'bg-blue-50/40' : ''}`}>
          {activeForm === 'form3' ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={activeTaskValue}
                onChange={e => handleChange(e.target.value)}
                placeholder={`/${activeTaskMax}`}
                inputMode="numeric"
                className={`
                  w-20 px-2 py-1.5 border rounded-lg text-sm font-medium text-center
                  focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  ${isOutOfRange ? 'border-red-400 bg-red-50' :
                    isAbsent ? 'border-gray-400 bg-gray-100 text-gray-600' :
                    isNotConducted ? 'border-amber-300 bg-amber-50 text-amber-700' :
                    num !== null ? 'border-green-300 bg-green-50' :
                    'border-gray-300'
                  }
                `}
              />
              <button
                onClick={() => onMarkTaskAbsent(student.id)}
                className={`p-1 rounded transition-colors ${isAbsent ? 'text-red-600' : 'text-gray-300 hover:text-gray-600'}`}
              >
                <UserX size={12} />
              </button>
            </div>
          ) : (
            <TotalCell form="form3" />
          )}
        </td>
      )}
      <td className="px-3 py-2.5 text-center text-sm font-medium text-gray-700">
        {live.rawTotal}<span className="text-gray-400 text-xs">/{live.rawMax}</span>
      </td>
      <td className="px-3 py-2.5 text-center text-sm font-semibold text-blue-700">
        {live.weighted >= 0 ? live.weighted.toFixed(2) : '—'}
        <span className="text-gray-400 text-xs font-normal">/{config.sbaWeightPercent}</span>
      </td>
      <td className="px-3 py-2.5 text-center text-sm">
        {live.percentage >= 0 ? `${live.percentage}%` : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-3 py-2.5 text-center"><LevelBadge level={live.level} /></td>
    </tr>
  );
}

// ==================== TOAST ====================

function ToastContainer({ toasts, onDismiss }: { toasts: ToastState[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => {
        const bg = {
          success: 'bg-green-600',
          warning: 'bg-yellow-600',
          info: 'bg-blue-600',
          error: 'bg-red-600',
        }[t.type];
        useEffect(() => {
          const timer = setTimeout(() => onDismiss(t.id), 3500);
          return () => clearTimeout(timer);
        }, [t.id, onDismiss]);

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium max-w-xs ${bg}`}
          >
            <span className="flex-1">{t.message}</span>
            <button onClick={() => onDismiss(t.id)} className="text-white/70 hover:text-white">
              <XCircle size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ==================== MAIN PAGE ====================

export default function SbaEntry() {
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');

  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [examYearOverride, setExamYearOverride] = useState<number | null>(null);

  // Active form + task — top-level state, drives which input is editable
  const [activeForm, setActiveForm] = useState<SbaForm>('form1');
  const [activeTaskIndex, setActiveTaskIndex] = useState(0);

  const [rows, setRows] = useState<StudentRowState[]>([]);
  const [loadingLearners, setLoadingLearners] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toasts, setToasts] = useState<ToastState[]>([]);

  const lastSubjectRef = useRef<string>('');

  const { classes } = useSchoolClasses({ isActive: true });
  const currentYear = new Date().getFullYear();

  const selectedClassForm = useMemo(() => {
    const cls = classes.find(c => c.id === selectedClassId);
    return cls?.level ?? 0;
  }, [classes, selectedClassId]);

  const derivedExamYear = useMemo(
    () => (selectedClassForm ? deriveExamYear(selectedClassForm, currentYear) : currentYear),
    [selectedClassForm, currentYear]
  );

  const examYear = examYearOverride ?? derivedExamYear;

  const { data: assignments = [], isLoading: loadingAssignments } =
    useSbaAssignmentsForTeacher(user?.uid, examYear);

  const availableClasses = useMemo(() => {
    const seen = new Set<string>();
    return assignments
      .filter(a => {
        if (seen.has(a.classId)) return false;
        seen.add(a.classId);
        return true;
      })
      .map(a => ({ id: a.classId, name: a.className }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments]);

  const availableSubjects = useMemo(() => {
    if (!selectedClassId) return [];
    return assignments
      .filter(a => a.classId === selectedClassId)
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  }, [assignments, selectedClassId]);

  const selectedAssignment = useMemo(
    () => availableSubjects.find(a => a.subjectId === selectedSubjectId) || null,
    [availableSubjects, selectedSubjectId]
  );

  const config = selectedAssignment?.config ?? null;

  const { data: existingResults = [], isLoading: loadingResults } = useSbaResults({
    classId: selectedClassId || undefined,
    subjectId: selectedSubjectId || undefined,
    examYear,
  });

  const saveMutation = useSaveSbaMarks();
  const deleteMutation = useDeleteSbaMarks();

  const showToast = useCallback((type: ToastState['type'], message: string) => {
    setToasts(prev => [...prev, { id: Date.now(), type, message }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Auto-select first subject
  useEffect(() => {
    if (availableSubjects.length === 1 && !selectedSubjectId) {
      setSelectedSubjectId(availableSubjects[0].subjectId);
    }
  }, [availableSubjects, selectedSubjectId]);

  // Subject change: reset active form + task
  useEffect(() => {
    if (selectedSubjectId && selectedSubjectId !== lastSubjectRef.current) {
      lastSubjectRef.current = selectedSubjectId;
      setHasUnsavedChanges(false);
      setRows([]);
      setActiveTaskIndex(0);
    }
  }, [selectedSubjectId]);

  // When config changes, ensure activeForm is valid for this subject
  useEffect(() => {
    if (!config) return;
    if (!config.sbaForms.includes(activeForm)) {
      setActiveForm(config.sbaForms[0]);
    }
  }, [config, activeForm]);

  // Clamp activeTaskIndex when form/config changes
  useEffect(() => {
    if (!config) return;
    const taskCount = config.tasksPerForm[activeForm] ?? 0;
    if (activeTaskIndex >= taskCount) setActiveTaskIndex(0);
  }, [config, activeForm, activeTaskIndex]);

  // Load learners + hydrate task arrays
  useEffect(() => {
    const load = async () => {
      if (!selectedClassId || !selectedSubjectId || !config) {
        setRows([]);
        return;
      }

      setLoadingLearners(true);
      try {
        const learners = await learnerService.getLearnersByClass(selectedClassId);
        const formLearners = learners
          .filter((l: any) => l.classType === 'form' || !l.classType)
          .sort((a, b) => a.name.localeCompare(b.name));

        const resultsByDocId = new Map(existingResults.map(r => [r.studentId, r]));

        const taskCount1 = config.tasksPerForm.form1 ?? 0;
        const taskCount2 = config.tasksPerForm.form2 ?? 0;
        const taskCount3 = config.tasksPerForm.form3 ?? 0;

        const nextRows: StudentRowState[] = formLearners.map(l => {
          const existing = resultsByDocId.get(l.id);
          return {
            id: l.id,
            customStudentId: l.studentId,
            name: l.name,
            form1Tasks: hydrateTaskInputs(existing?.form1Tasks, taskCount1),
            form2Tasks: hydrateTaskInputs(existing?.form2Tasks, taskCount2),
            form3Tasks: hydrateTaskInputs(existing?.form3Tasks, taskCount3),
          };
        });

        setRows(nextRows);
        setHasUnsavedChanges(false);
      } catch (err) {
        console.error('Error loading learners:', err);
        showToast('error', 'Failed to load learners');
        setRows([]);
      } finally {
        setLoadingLearners(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId, selectedSubjectId, config?.subjectCode, existingResults.length]);

  // ---- Active form/task derived values ----

  const activeKey = `${activeForm}Tasks` as 'form1Tasks' | 'form2Tasks' | 'form3Tasks';
  const activeTaskCount = config?.tasksPerForm[activeForm] ?? 0;
  const activeFormTotal = config?.marksPerForm[activeForm] ?? 100;
  const activePerTaskMarks = useMemo(
    () => defaultPerTaskMarks(activeFormTotal, activeTaskCount),
    [activeFormTotal, activeTaskCount]
  );

  const activeTaskAggregate = useMemo(() => {
    let entered = 0;
    let absent = 0;
    let nc = 0;
    for (const r of rows) {
      const v = r[activeKey][activeTaskIndex];
      const parsed = parseTaskMark(v ?? '');
      if (parsed === null) continue;
      entered++;
      if (parsed === -1) absent++;
      else if (parsed === -2) nc++;
    }
    return { entered, absent, nc, total: rows.length };
  }, [rows, activeKey, activeTaskIndex]);

  // ---- Row handlers ----

  const handleActiveTaskValueChange = useCallback(
    (studentId: string, value: string) => {
      setRows(prev =>
        prev.map(r => {
          if (r.id !== studentId) return r;
          const next = [...r[activeKey]];
          next[activeTaskIndex] = value;
          return { ...r, [activeKey]: next };
        })
      );
      setHasUnsavedChanges(true);
    },
    [activeKey, activeTaskIndex]
  );

  const handleMarkTaskAbsent = useCallback(
    (studentId: string) => {
      setRows(prev =>
        prev.map(r => {
          if (r.id !== studentId) return r;
          const next = [...r[activeKey]];
          const current = next[activeTaskIndex] ?? '';
          next[activeTaskIndex] = current.toLowerCase() === 'x' ? '' : 'X';
          return { ...r, [activeKey]: next };
        })
      );
      setHasUnsavedChanges(true);
    },
    [activeKey, activeTaskIndex]
  );

  const handleBulkMarkRemainingAbsent = useCallback(() => {
    setModal({
      type: 'confirmDiscard',
      title: `Mark remaining students absent?`,
      description: `Any student without a mark for Task ${activeTaskIndex + 1} will be marked absent. Students with an existing mark will be left unchanged.`,
      onConfirm: () => {
        setModal(null);
        setRows(prev =>
          prev.map(r => {
            const current = r[activeKey][activeTaskIndex] ?? '';
            if (current !== '') return r;
            const next = [...r[activeKey]];
            next[activeTaskIndex] = 'X';
            return { ...r, [activeKey]: next };
          })
        );
        setHasUnsavedChanges(true);
      },
    });
  }, [activeKey, activeTaskIndex]);

  // ---- Save ----

  const doSave = useCallback(async () => {
    if (!selectedClassId || !selectedSubjectId || !selectedAssignment || !config || !user) return;

    const students = rows
      .filter(r => {
        const all = [...r.form1Tasks, ...r.form2Tasks, ...r.form3Tasks];
        return all.some(v => v !== '');
      })
      .map(r => ({
        studentId: r.id,
        studentName: r.name,
        form1Tasks: parseTaskArray(r.form1Tasks),
        form2Tasks: parseTaskArray(r.form2Tasks),
        form3Tasks: parseTaskArray(r.form3Tasks),
      }));

    if (students.length === 0) {
      showToast('warning', 'No marks entered yet.');
      return;
    }

    try {
      const result = await saveMutation.mutateAsync({
        classId: selectedClassId,
        className: selectedAssignment.className,
        subjectId: selectedSubjectId,
        subjectName: config.subjectName,
        subjectCode: config.subjectCode,
        teacherId: user.uid,
        teacherName: user.fullName || user.email || 'Teacher',
        examYear,
        students,
        overwrite: existingResults.length > 0,
      });

      showToast('success', `Saved ${result.count} records${result.overwritten ? ' (overwritten)' : ''}`);
      setHasUnsavedChanges(false);
    } catch (err: any) {
      console.error('Save error:', err);
      showToast('error', err?.message || 'Failed to save SBA marks');
    }
  }, [
    selectedClassId,
    selectedSubjectId,
    selectedAssignment,
    config,
    user,
    rows,
    examYear,
    existingResults.length,
    saveMutation,
    showToast,
  ]);

  const handleSave = useCallback(() => {
    if (!config) return;
    if (existingResults.length > 0) {
      setModal({
        type: 'confirmOverwrite',
        title: 'Overwrite existing SBA?',
        description: `Existing SBA marks for ${config.subjectName} (${examYear}) will be replaced. This cannot be undone.`,
        onConfirm: async () => {
          setModal(null);
          await doSave();
        },
      });
    } else {
      doSave();
    }
  }, [config, existingResults.length, examYear, doSave]);

  // ---- Delete ----

  const handleDelete = useCallback(() => {
    if (!selectedClassId || !selectedSubjectId || !config) return;
    setModal({
      type: 'confirmDelete',
      title: 'Delete all SBA marks?',
      description: `All SBA marks for ${config.subjectName} in ${selectedAssignment?.className} (${examYear}) will be permanently deleted.`,
      onConfirm: async () => {
        setModal(null);
        try {
          const r = await deleteMutation.mutateAsync({
            classId: selectedClassId,
            subjectId: selectedSubjectId,
            examYear,
          });
          showToast('success', `Deleted ${r.deletedCount} records`);
          setRows(prev =>
            prev.map(row => ({
              ...row,
              form1Tasks: row.form1Tasks.map(() => ''),
              form2Tasks: row.form2Tasks.map(() => ''),
              form3Tasks: row.form3Tasks.map(() => ''),
            }))
          );
          setHasUnsavedChanges(false);
        } catch (err) {
          console.error(err);
          showToast('error', 'Failed to delete');
        }
      },
    });
  }, [
    selectedClassId,
    selectedSubjectId,
    config,
    selectedAssignment,
    examYear,
    deleteMutation,
    showToast,
  ]);

  // ---- PDFs ----

  const handleEczPdf = useCallback(async () => {
    if (!config || !selectedAssignment) return;
    try {
      const { generateEczSbaScoreSheet } = await import('@/services/pdf/sbaPDF');

      const students = rows.map(r => {
        const perTask1 = defaultPerTaskMarks(config.marksPerForm.form1 ?? 100, config.tasksPerForm.form1 ?? 0);
        const perTask2 = defaultPerTaskMarks(config.marksPerForm.form2 ?? 100, config.tasksPerForm.form2 ?? 0);
        const perTask3 = defaultPerTaskMarks(config.marksPerForm.form3 ?? 100, config.tasksPerForm.form3 ?? 0);
        const c1 = computeFormFromInputs(r.form1Tasks, perTask1);
        const c2 = computeFormFromInputs(r.form2Tasks, perTask2);
        const c3 = computeFormFromInputs(r.form3Tasks, perTask3);
        const toMark = (c: FormTaskComputation): number | null =>
          c.status === 'complete' ? c.total
          : c.status === 'absent' ? -1
          : c.status === 'not_conducted' ? -2
          : null;
        return {
          name: r.name,
          studentId: r.customStudentId,
          form1Mark: toMark(c1),
          form2Mark: toMark(c2),
          form3Mark: toMark(c3),
        };
      });

      await generateEczSbaScoreSheet({
        className: selectedAssignment.className,
        subject: config,
        examYear,
        teacherName: user?.fullName || user?.email || 'Teacher',
        students,
      });
      showToast('success', 'ECZ score sheet generated');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to generate PDF');
    }
  }, [config, selectedAssignment, examYear, user, rows, showToast]);

  const handleInternalPdf = useCallback(async () => {
    if (!config || !selectedAssignment) return;
    if (existingResults.length === 0) {
      showToast('warning', 'Save SBA marks before generating the internal overview.');
      return;
    }
    try {
      const { generateInternalSbaOverview } = await import('@/services/pdf/sbaPDF');
      await generateInternalSbaOverview({
        className: selectedAssignment.className,
        subject: config,
        examYear,
        teacherName: user?.fullName || user?.email || 'Teacher',
        students: existingResults,
      });
      showToast('success', 'Internal overview generated');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to generate PDF');
    }
  }, [config, selectedAssignment, examYear, user, existingResults, showToast]);

  // ---- Derived UI ----

  const filledCount = rows.filter(r => {
    const all = [...r.form1Tasks, ...r.form2Tasks, ...r.form3Tasks];
    return all.some(v => v !== '');
  }).length;

  const completionPct =
    rows.length > 0 ? Math.round((filledCount / rows.length) * 100) : 0;

  const hasExistingResults = existingResults.length > 0;

  const activeFormLabel = activeForm.replace('form', 'Form ');

  return (
    <DashboardLayout activeTab="sba">
      <div className="p-3 sm:p-4 lg:p-6 space-y-4">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 tracking-tight">
              SBA Entry
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
              {selectedAssignment?.className || 'Select a class'} • Exam Year {examYear}
              {!examYearOverride && (
                <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  auto
                </span>
              )}
            </p>
          </div>

          {selectedClassId && selectedSubjectId && config && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleEczPdf}
                disabled={rows.length === 0}
                className="inline-flex items-center gap-1.5 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                <FileText size={15} /> ECZ Sheet
              </button>
              <button
                onClick={handleInternalPdf}
                disabled={!hasExistingResults}
                className="inline-flex items-center gap-1.5 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                <Download size={15} /> Internal
              </button>
              <button
                onClick={handleDelete}
                disabled={!hasExistingResults || deleteMutation.isPending}
                className="inline-flex items-center gap-1.5 bg-white border border-gray-300 text-red-600 rounded-xl hover:bg-red-50 px-3 py-2 text-sm font-medium disabled:opacity-40"
              >
                {deleteMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                Delete
              </button>
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending || filledCount === 0 || !config}
                className={`
                  inline-flex items-center gap-1.5 text-white rounded-xl px-4 py-2 text-sm font-medium
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${hasExistingResults ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}
                `}
              >
                {saveMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {hasExistingResults ? 'Overwrite' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {/* Status banner */}
        {hasUnsavedChanges && (
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle size={18} className="text-yellow-600" />
              <span className="text-sm text-yellow-800">You have unsaved changes.</span>
            </div>
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="px-3 py-1 bg-yellow-500 text-white rounded-lg text-sm hover:bg-yellow-600"
            >
              Save Now
            </button>
          </div>
        )}

        {/* Filter bar — all selectors in one row */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Class */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Class <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedClassId}
                onChange={e => {
                  if (hasUnsavedChanges) {
                    setModal({
                      type: 'confirmDiscard',
                      title: 'Discard changes?',
                      description: 'You have unsaved SBA marks. Switching class will discard them.',
                      onConfirm: () => {
                        setModal(null);
                        setSelectedClassId(e.target.value);
                        setSelectedSubjectId('');
                        setHasUnsavedChanges(false);
                      },
                    });
                  } else {
                    setSelectedClassId(e.target.value);
                    setSelectedSubjectId('');
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                disabled={availableClasses.length === 0}
              >
                <option value="">Select class...</option>
                {availableClasses.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Subject <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedSubjectId}
                onChange={e => {
                  if (hasUnsavedChanges) {
                    setModal({
                      type: 'confirmDiscard',
                      title: 'Discard changes?',
                      description: 'You have unsaved SBA marks. Switching subject will discard them.',
                      onConfirm: () => {
                        setModal(null);
                        setSelectedSubjectId(e.target.value);
                        setHasUnsavedChanges(false);
                      },
                    });
                  } else {
                    setSelectedSubjectId(e.target.value);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                disabled={!selectedClassId || availableSubjects.length === 0}
              >
                <option value="">
                  {!selectedClassId ? 'Select class first' :
                    availableSubjects.length === 0 ? 'No SBA subjects for you in this class' :
                    'Select subject...'}
                </option>
                {availableSubjects.map(s => (
                  <option key={s.subjectId} value={s.subjectId}>
                    {s.subjectName} ({s.subjectCode})
                  </option>
                ))}
              </select>
            </div>

            {/* Exam Year */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Exam Year
              </label>
              <input
                type="number"
                value={examYear}
                onChange={e => setExamYearOverride(parseInt(e.target.value) || currentYear)}
                min={currentYear}
                max={currentYear + 5}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>

            {/* Form — only enabled when a config is loaded */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Form
              </label>
              <select
                value={activeForm}
                onChange={e => {
                  setActiveForm(e.target.value as SbaForm);
                  setActiveTaskIndex(0);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                disabled={!config}
              >
                {!config ? (
                  <option value="form1">Select subject first</option>
                ) : (
                  config.sbaForms.map(f => {
                    const tasks = config.tasksPerForm[f] ?? 0;
                    const total = config.marksPerForm[f] ?? 100;
                    return (
                      <option key={f} value={f}>
                        {f.replace('form', 'Form ')} — {tasks} tasks /{total}
                      </option>
                    );
                  })
                )}
              </select>
            </div>

            {/* Task — only enabled when a form is active */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Task
              </label>
              <select
                value={activeTaskIndex}
                onChange={e => setActiveTaskIndex(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                disabled={!config || activeTaskCount === 0}
              >
                {!config || activeTaskCount === 0 ? (
                  <option>—</option>
                ) : (
                  Array.from({ length: activeTaskCount }).map((_, i) => {
                    const taskMax = activePerTaskMarks[i] ?? 0;
                    return (
                      <option key={i} value={i}>
                        Task {i + 1} of {activeTaskCount} — /{taskMax}
                      </option>
                    );
                  })
                )}
              </select>
            </div>
          </div>

          {/* Context strip below the selectors */}
          {config && activeTaskCount > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              <span className="text-gray-500">
                Entering:{' '}
                <strong className="text-gray-800">
                  {activeFormLabel} · Task {activeTaskIndex + 1}
                </strong>
              </span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-600">
                <span className={activeTaskAggregate.entered === activeTaskAggregate.total ? 'text-green-600 font-medium' : ''}>
                  {activeTaskAggregate.entered}/{activeTaskAggregate.total}
                </span>{' '}
                entered
              </span>
              {activeTaskAggregate.absent > 0 && (
                <>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-500">{activeTaskAggregate.absent} absent</span>
                </>
              )}
              {activeTaskAggregate.nc > 0 && (
                <>
                  <span className="text-gray-400">·</span>
                  <span className="text-orange-600">{activeTaskAggregate.nc} not conducted</span>
                </>
              )}
              <button
                onClick={handleBulkMarkRemainingAbsent}
                className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200"
              >
                <UserX size={11} />
                Mark remaining absent
              </button>
            </div>
          )}
        </div>

        {/* Progress card */}
        {config && selectedAssignment && (
          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <GraduationCap size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-800">
                {config.subjectName} ({config.subjectCode})
              </span>
              <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                SBA {config.sbaWeightPercent}%
              </span>
              {config.hasProject && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  Project in {config.projectForm} ({config.projectMarks} marks)
                </span>
              )}
              {hasExistingResults && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  Saved
                </span>
              )}
            </div>

            {config.notes && (
              <p className="text-xs text-gray-500 italic mb-3">{config.notes}</p>
            )}

            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-600">
                {filledCount}/{rows.length} students with any entry
              </span>
              <span className="text-xs font-medium text-gray-700">{completionPct}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-500"
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Table */}
        {loadingLearners || loadingResults || loadingAssignments ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 flex justify-center">
            <Loader2 className="animate-spin text-blue-600" size={24} />
          </div>
        ) : !selectedClassId ? (
          <EmptyHint icon={Users} title="Select a class" body="Your SBA subjects will appear here." />
        ) : !selectedSubjectId ? (
          <EmptyHint
            icon={AlertCircle}
            title={availableSubjects.length === 0 ? 'No SBA subjects for you' : 'Select a subject'}
            body={
              availableSubjects.length === 0
                ? 'You are not assigned to any SBA subject in this class.'
                : 'Choose a subject to begin.'
            }
          />
        ) : rows.length === 0 ? (
          <EmptyHint icon={Users} title="No students enrolled" body="This class has no form learners." />
        ) : config && activeTaskCount > 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-3 sm:px-4 py-2 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-gray-700">
                {activeFormLabel} · Task {activeTaskIndex + 1} — {rows.length} students
              </span>
              <span className="text-[10px] text-gray-500">
                X = absent · NC = not conducted · Highlighted column is editable
              </span>
            </div>

            {isMobile ? (
              <div>
                {rows.map((r, i) => (
                  <StudentRow
                    key={r.id}
                    student={r}
                    index={i}
                    config={config}
                    activeForm={activeForm}
                    activeTaskIndex={activeTaskIndex}
                    activeTaskValue={r[activeKey][activeTaskIndex] ?? ''}
                    onTaskValueChange={handleActiveTaskValueChange}
                    onMarkTaskAbsent={handleMarkTaskAbsent}
                    isMobile
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 text-xs">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-medium text-gray-600 w-10">#</th>
                      <th className="px-3 py-2.5 text-left font-medium text-gray-600 min-w-[180px]">Student</th>
                      {config.sbaForms.includes('form1') && (
                        <th className={`px-3 py-2.5 text-left font-medium min-w-[140px] ${activeForm === 'form1' ? 'bg-blue-100 text-blue-800' : 'text-gray-600'}`}>
                          Form 1
                          <div className="text-[10px] font-normal opacity-70">
                            {activeForm === 'form1'
                              ? `Task ${activeTaskIndex + 1} · /${activePerTaskMarks[activeTaskIndex] ?? 0}`
                              : 'Running total'
                            }
                          </div>
                        </th>
                      )}
                      {config.sbaForms.includes('form2') && (
                        <th className={`px-3 py-2.5 text-left font-medium min-w-[140px] ${activeForm === 'form2' ? 'bg-blue-100 text-blue-800' : 'text-gray-600'}`}>
                          Form 2
                          <div className="text-[10px] font-normal opacity-70">
                            {activeForm === 'form2'
                              ? `Task ${activeTaskIndex + 1} · /${activePerTaskMarks[activeTaskIndex] ?? 0}`
                              : 'Running total'
                            }
                          </div>
                        </th>
                      )}
                      {config.sbaForms.includes('form3') && (
                        <th className={`px-3 py-2.5 text-left font-medium min-w-[140px] ${activeForm === 'form3' ? 'bg-blue-100 text-blue-800' : 'text-gray-600'}`}>
                          Form 3
                          <div className="text-[10px] font-normal opacity-70">
                            {activeForm === 'form3'
                              ? `Task ${activeTaskIndex + 1} · /${activePerTaskMarks[activeTaskIndex] ?? 0}`
                              : 'Running total'
                            }
                          </div>
                        </th>
                      )}
                      <th className="px-3 py-2.5 text-center font-medium text-gray-600">Raw</th>
                      <th className="px-3 py-2.5 text-center font-medium text-gray-600">
                        Weighted
                        <div className="text-[10px] font-normal text-gray-400">/{config.sbaWeightPercent}</div>
                      </th>
                      <th className="px-3 py-2.5 text-center font-medium text-gray-600">SBA %</th>
                      <th className="px-3 py-2.5 text-center font-medium text-gray-600">Level</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((r, i) => (
                      <StudentRow
                        key={r.id}
                        student={r}
                        index={i}
                        config={config}
                        activeForm={activeForm}
                        activeTaskIndex={activeTaskIndex}
                        activeTaskValue={r[activeKey][activeTaskIndex] ?? ''}
                        onTaskValueChange={handleActiveTaskValueChange}
                        onMarkTaskAbsent={handleMarkTaskAbsent}
                        isMobile={false}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full mb-3 ${
              modal.type === 'confirmDelete' ? 'bg-red-100' : 'bg-amber-100'
            }`}>
              {modal.type === 'confirmDelete'
                ? <Trash2 size={22} className="text-red-600" />
                : <AlertCircle size={22} className="text-amber-600" />}
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">{modal.title}</h3>
            <p className="text-sm text-gray-500 mb-4">{modal.description}</p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setModal(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={modal.onConfirm}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white ${
                  modal.type === 'confirmDelete'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </DashboardLayout>
  );
}

// ==================== EMPTY HINT ====================

function EmptyHint({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
      <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
        <Icon className="text-gray-400" size={32} />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 max-w-md mx-auto">{body}</p>
    </div>
  );
}