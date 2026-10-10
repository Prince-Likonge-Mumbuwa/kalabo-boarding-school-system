// @/pages/teacher/TeacherResultsAnalysis.tsx
import { activeExamsFor, pickTermConfig, gradeForPercentage } from '@/services/resultsGrid';
import { getCurrentAcademicTerm, type TermName } from '@/utils/academicTerm';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';
import { useResults } from '@/hooks/useResults';
import { useExamConfig } from '@/hooks/useExamConfig';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { normalizeSubjectName, calculateGrade, StudentResult } from '@/services/resultsService';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  Filter,
  Loader2,
  RefreshCw,
  Download,
  Target,
  Users,
  Award,
  AlertCircle,
  ChevronDown,
  BarChart3,
  PieChart,
  Eye,
  Calendar,
  BookOpen,
  GraduationCap,
} from 'lucide-react';

// ==================== TYPES ====================

interface GradeDistributionItem {
  grade: number;
  count: number;
  percentage: number;
  description: string;
  boys: number;
  girls: number;
}

interface ClassPerformance {
  classId: string;
  className: string;
  totalStudents: number;
  averagePercentage: number;
  passRate: number;
  qualityRate: number;
  quantityRate: number;
  failRate: number;
  gradeDistribution: GradeDistributionItem[];
  boysCount: number;
  girlsCount: number;
}

// ==================== HELPER FUNCTIONS ====================

// Active exams: app-wide rule (box ticked AND total marks > 0).
const getConfiguredExamTypes = (examConfig: any): string[] => activeExamsFor(examConfig);

const calculateStudentSubjectAverageGrade = (
  studentId: string,
  subjectId: string,
  allResults: StudentResult[],
  configuredExamTypes: string[]
): number | null => {
  const subjectResults = allResults.filter(r =>
    r.studentId === studentId &&
    r.subjectId === subjectId &&
    r.percentage >= 0 &&
    configuredExamTypes.includes(r.examType)
  );
  if (subjectResults.length === 0) return null;
  const avgPercentage = subjectResults.reduce((sum, r) => sum + r.percentage, 0) / subjectResults.length;
  return gradeForPercentage(avgPercentage);
};

// ==================== GRADE COLOUR MAP ====================

const GRADE_COLORS: Record<number, string> = {
  1: '#059669',
  2: '#10b981',
  3: '#2563eb',
  4: '#60a5fa',
  5: '#d97706',
  6: '#fbbf24',
  7: '#ea580c',
  8: '#dc2626',
  9: '#f87171',
};

const GRADE_LABELS: Record<number, string> = {
  1: 'Distinction', 2: 'Distinction',
  3: 'Merit',       4: 'Merit',
  5: 'Credit',      6: 'Credit',
  7: 'Satisfactory',
  8: 'Fail',        9: 'Fail',
};

// ==================== STAT CARD ====================

const StatCard = ({
  label,
  value,
  subValue,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ElementType;
  color: 'green' | 'blue' | 'red' | 'purple';
}) => {
  const colors = {
    green:  { bg: 'bg-green-50',  text: 'text-green-700',  icon: 'text-green-600'  },
    blue:   { bg: 'bg-blue-50',   text: 'text-blue-700',   icon: 'text-blue-600'   },
    red:    { bg: 'bg-red-50',    text: 'text-red-700',    icon: 'text-red-600'    },
    purple: { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-600' },
  };
  const style = colors[color];
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{label}</p>
          <p className={`text-2xl font-bold ${style.text}`}>{value}</p>
          {subValue && <p className="text-xs text-gray-500 mt-1">{subValue}</p>}
        </div>
        <div className={`p-3 rounded-lg ${style.bg}`}>
          <Icon size={20} className={style.icon} />
        </div>
      </div>
    </div>
  );
};

// ==================== GRADE BADGE ====================

const GradeBadge = ({ grade }: { grade: number }) => (
  <div className="flex flex-col items-center">
    <span
      className="px-2.5 py-1 rounded-md text-xs font-bold text-white"
      style={{ background: GRADE_COLORS[grade] || '#6b7280' }}
    >
      {grade}
    </span>
    <span className="text-[10px] text-gray-500 mt-0.5">{GRADE_LABELS[grade]?.slice(0, 4) ?? '—'}</span>
  </div>
);

// ==================== GRADE DISTRIBUTION CHART (Recharts) ====================

interface GradeDistributionChartProps {
  data: GradeDistributionItem[];
  viewMode: 'detailed' | 'simple';
  onToggleView: () => void;
  examCount?: number;
}

const GradeDistributionChart = ({
  data,
  viewMode,
  onToggleView,
  examCount,
}: GradeDistributionChartProps) => {
  // Shape data for recharts
  const chartData = data.map(item => ({
    name: `G${item.grade}`,
    grade: item.grade,
    description: GRADE_LABELS[item.grade] ?? '',
    Boys: item.boys,
    Girls: item.girls,
    Total: item.count,
    percentage: item.percentage,
  }));

  // ---- custom tooltip ----
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const item = chartData.find(d => d.name === label);
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-xs min-w-[140px]">
        <p className="font-bold text-gray-800 mb-2 border-b pb-1">
          Grade {item?.grade} · {item?.description}
        </p>
        {payload.map((entry: any) => (
          <div
            key={entry.name}
            className="flex justify-between gap-6 font-semibold py-0.5"
            style={{ color: entry.color }}
          >
            <span>{entry.name}</span>
            <span>{entry.value}</span>
          </div>
        ))}
        {item && (
          <p className="text-gray-400 mt-2 pt-1 border-t">
            {item.percentage}% of total
          </p>
        )}
      </div>
    );
  };

  // ---- custom x-axis tick with grade colour ----
  const CustomXAxisTick = ({ x, y, payload }: any) => {
    const item = chartData.find(d => d.name === payload.value);
    const color = item ? GRADE_COLORS[item.grade] : '#6b7280';
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0} y={0} dy={14}
          textAnchor="middle"
          fill={color}
          fontSize={12}
          fontWeight="700"
        >
          {payload.value}
        </text>
      </g>
    );
  };

  // ---- custom legend for "simple" (total) mode ----
  const SimpleLegend = () => (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-3 text-xs">
      {[
        { label: 'Distinction (1–2)', color: GRADE_COLORS[1] },
        { label: 'Merit (3–4)',       color: GRADE_COLORS[3] },
        { label: 'Credit (5–6)',      color: GRADE_COLORS[5] },
        { label: 'Satisfactory (7)',  color: GRADE_COLORS[7] },
        { label: 'Fail (8–9)',        color: GRADE_COLORS[8] },
      ].map(({ label, color }) => (
        <span key={label} className="flex items-center gap-1.5 text-gray-600">
          <span className="w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );

  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-6">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-gray-900">Grade Distribution</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {viewMode === 'detailed' ? 'Boys vs Girls per grade' : 'All students per grade'}
            {examCount != null && examCount > 0 && (
              <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                avg of {examCount} exam{examCount !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={onToggleView}
          className="flex items-center justify-center gap-2 px-3 py-2 text-xs sm:text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors w-full sm:w-auto flex-shrink-0"
        >
          {viewMode === 'detailed' ? (
            <><BarChart3 size={14} /><span>Show Totals</span></>
          ) : (
            <><PieChart size={14} /><span>Show Gender Split</span></>
          )}
        </button>
      </div>

      {/* Chart */}
      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 8, left: -10, bottom: 4 }}
            barCategoryGap="28%"
            barGap={4}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis
              dataKey="name"
              tick={<CustomXAxisTick />}
              axisLine={{ stroke: '#e5e7eb' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={28}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: 'rgba(0,0,0,0.03)' }}
            />

            {viewMode === 'detailed' ? (
              <>
                <Legend
                  iconType="square"
                  iconSize={10}
                  wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                />
                <Bar
                  dataKey="Boys"
                  name="Boys"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={38}
                />
                <Bar
                  dataKey="Girls"
                  name="Girls"
                  fill="#f43f5e"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={38}
                />
              </>
            ) : (
              <>
                <Legend content={<SimpleLegend />} />
                <Bar
                  dataKey="Total"
                  name="Total"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={52}
                >
                  {chartData.map((entry, i) => (
                    <Cell
                      key={`cell-${i}`}
                      fill={GRADE_COLORS[entry.grade] ?? '#6366f1'}
                    />
                  ))}
                </Bar>
              </>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Footer */}
      <p className="text-xs text-gray-400 text-right mt-3 pt-3 border-t border-gray-100">
        {total} total assessment{total !== 1 ? 's' : ''}
      </p>
    </div>
  );
};

// ==================== EMPTY STATE ====================

const EmptyState = ({
  hasAssignments,
  noExamsConfigured,
  term,
  year,
}: {
  hasAssignments: boolean;
  noExamsConfigured?: boolean;
  term?: string;
  year?: number;
}) => {
  if (noExamsConfigured) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 sm:p-12 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-yellow-50 rounded-full mb-4">
          <Calendar className="text-yellow-600" size={24} />
        </div>
        <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">No Exams Configured</h3>
        <p className="text-sm text-gray-600 max-w-md mx-auto">
          No exams have been configured for {term} {year}. Contact the administrator.
        </p>
      </div>
    );
  }
  if (!hasAssignments) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 sm:p-12 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-yellow-50 rounded-full mb-4">
          <BookOpen className="text-yellow-600" size={24} />
        </div>
        <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">No Teaching Assignments</h3>
        <p className="text-sm text-gray-600 max-w-md mx-auto">
          You haven't been assigned to any classes yet. Contact your administrator.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 sm:p-12 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-blue-50 rounded-full mb-4">
        <Target className="text-blue-500" size={24} />
      </div>
      <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">No Results Available</h3>
      <p className="text-sm text-gray-600 max-w-md mx-auto">
        No results have been entered for the selected filters. Enter results in the Results Entry page.
      </p>
    </div>
  );
};

// ==================== SKELETON ====================

const Skeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="h-4 bg-gray-200 rounded w-20 mb-2"></div>
          <div className="h-8 bg-gray-300 rounded w-16"></div>
        </div>
      ))}
    </div>
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="h-5 bg-gray-200 rounded w-40 mb-4"></div>
      <div className="h-64 bg-gray-100 rounded"></div>
    </div>
  </div>
);

// ==================== MAIN COMPONENT ====================

export default function TeacherResultsAnalysis() {
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');

  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  // Opens on the current academic term (was always Term 1).
  const [selectedTerm, setSelectedTerm] = useState<TermName>(() => getCurrentAcademicTerm().term);
  const [selectedYear, setSelectedYear] = useState<number>(() => getCurrentAcademicTerm().year);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [chartViewMode, setChartViewMode] = useState<'detailed' | 'simple'>('detailed');
  const [isDownloading, setIsDownloading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // ==================== HOOKS ====================

  const {
    assignments,
    isLoading: assignmentsLoading,
    error: assignmentsError,
    refetch: refetchAssignments,
    getClassesWithSubjects,
  } = useTeacherAssignments(user?.uid || '');

  const { learners, isLoading: loadingLearners } = useSchoolLearners(
    selectedClass !== 'all' ? selectedClass : undefined
  );

  const { configs: examConfigs, isLoading: loadingExamConfig } = useExamConfig({
    year: selectedYear,
    term: selectedTerm,
  });

  const currentExamConfig = pickTermConfig(examConfigs as any[], selectedTerm, selectedYear);

  const configuredExamTypes = useMemo(
    () => getConfiguredExamTypes(currentExamConfig),
    [currentExamConfig]
  );

  // staleTime:0 on allResultsQuery (set in useResults.ts) ensures this always
  // reflects the latest Firestore state after any save or delete.
  const {
    results: allResults,
    isLoading: resultsLoading,
    isFetching,
    refetch: refetchResults,
  } = useResults({
    term: selectedTerm,
    year: selectedYear,
    classId: selectedClass !== 'all' ? selectedClass : undefined,
  });

  // ==================== FILTER TO TEACHER'S SUBJECTS ====================

  const filteredResults = useMemo(() => {
    if (!allResults?.length || !assignments?.length) return [];

    // Keyed by class AND subject: teaching Maths in 1A must not pull in
    // Maths results from 2B. Form Teacher is not a subject.
    const teacherSlots = new Set<string>();
    const scope = selectedClass === 'all' ? assignments : assignments.filter(a => a.classId === selectedClass);
    scope
      .filter(a => a.normalizedSubjectId !== 'form-teacher')
      .forEach(a => teacherSlots.add(`${a.classId}|${normalizeSubjectName(a.subject)}`));

    // Only learners who are currently active count (same as the monitor).
    const active = new Set<string>();
    learners?.forEach((l: any) => {
      if (l.id) active.add(l.id);
      if (l.studentId) active.add(l.studentId);
    });

    return allResults.filter(r =>
      teacherSlots.has(`${r.classId}|${normalizeSubjectName(r.subjectId || r.subjectName || '')}`) &&
      (active.size === 0 || active.has(r.studentId))
    );
  }, [allResults, assignments, selectedClass, learners]);

  // ==================== GENDER MAP ====================

  const studentDataMap = useMemo(() => {
    const docIdToGender = new Map<string, 'M' | 'F'>();
    const customIdToGender = new Map<string, 'M' | 'F'>();
    learners?.forEach(l => {
      const g: 'M' | 'F' = l.gender === 'male' ? 'M' : 'F';
      if (l.id) docIdToGender.set(l.id, g);
      if (l.studentId) customIdToGender.set(l.studentId, g);
    });
    return { docIdToGender, customIdToGender };
  }, [learners]);

  const getStudentGender = useCallback(
    (studentId: string): 'M' | 'F' | undefined =>
      studentDataMap.docIdToGender.get(studentId) ??
      studentDataMap.customIdToGender.get(studentId),
    [studentDataMap]
  );

  // ==================== STUDENT-SUBJECT AVERAGES ====================

  const studentSubjectAverages = useMemo(() => {
    if (!configuredExamTypes.length || !filteredResults.length) return new Map();

    const averages = new Map<string, Map<string, { avgGrade: number; gender?: 'M' | 'F' }>>();

    const uniqueCombos = new Set<string>();
    filteredResults.forEach((r: StudentResult) => {
      if (configuredExamTypes.includes(r.examType)) {
        uniqueCombos.add(`${r.studentId}|${r.subjectId || r.subjectName}`);
      }
    });

    uniqueCombos.forEach(combo => {
      const [studentId, subjectId] = combo.split('|');
      const avgGrade = calculateStudentSubjectAverageGrade(
        studentId, subjectId, filteredResults, configuredExamTypes
      );
      if (avgGrade === null) return;
      const gender = getStudentGender(studentId);
      if (!averages.has(studentId)) averages.set(studentId, new Map());
      averages.get(studentId)!.set(subjectId, { avgGrade, gender });
    });

    return averages;
  }, [filteredResults, getStudentGender, configuredExamTypes]);

  // ==================== DERIVED OPTIONS ====================

  const classesWithSubjects = useMemo(() => getClassesWithSubjects(), [assignments, getClassesWithSubjects]);

  const classOptions = useMemo(
    () => classesWithSubjects.map(c => ({ id: c.classId, name: c.className, subjects: c.subjects })),
    [classesWithSubjects]
  );

  const subjectOptions = useMemo(() => {
    if (selectedClass === 'all') {
      const set = new Set<string>();
      assignments?.forEach(a => { if (a.subject && a.subject !== 'Form Teacher') set.add(a.subject); });
      return Array.from(set).map(s => ({ id: s, name: s }));
    }
    const cls = classesWithSubjects.find(c => c.classId === selectedClass);
    return (cls?.subjects.filter(s => s !== 'Form Teacher') ?? []).map(s => ({ id: s, name: s }));
  }, [assignments, classesWithSubjects, selectedClass]);

  // ==================== GRADE DISTRIBUTION ====================

  const gradeDistribution = useMemo((): GradeDistributionItem[] => {
    if (!studentSubjectAverages.size || !configuredExamTypes.length) return [];

    const gradeMap = new Map<number, { boys: number; girls: number; unknown: number }>();
    for (let i = 1; i <= 9; i++) gradeMap.set(i, { boys: 0, girls: 0, unknown: 0 });

    studentSubjectAverages.forEach(subjectMap => {
      subjectMap.forEach(({ avgGrade, gender }) => {
        const cur = gradeMap.get(avgGrade)!;
        if (gender === 'M')      gradeMap.set(avgGrade, { ...cur, boys: cur.boys + 1 });
        else if (gender === 'F') gradeMap.set(avgGrade, { ...cur, girls: cur.girls + 1 });
        else                     gradeMap.set(avgGrade, { ...cur, unknown: cur.unknown + 1 });
      });
    });

    const total = Array.from(gradeMap.values()).reduce((s, c) => s + c.boys + c.girls + c.unknown, 0);

    return Array.from(gradeMap.entries())
      .map(([grade, c]) => ({
        grade,
        count: c.boys + c.girls + c.unknown,
        percentage: total > 0 ? Math.round(((c.boys + c.girls + c.unknown) / total) * 100) : 0,
        description: GRADE_LABELS[grade] ?? '',
        boys: c.boys,
        girls: c.girls,
      }))
      .filter(g => g.count > 0);
  }, [studentSubjectAverages, configuredExamTypes]);

  // ==================== TEACHER METRICS ====================

  const teacherMetrics = useMemo(() => {
    if (!studentSubjectAverages.size || !configuredExamTypes.length) {
      return { totalStudents: 0, totalAssessments: 0, averageScore: 0, qualityRate: 0, quantityRate: 0, failRate: 0 };
    }

    const allGrades: number[] = [];
    studentSubjectAverages.forEach(subjectMap => {
      subjectMap.forEach(({ avgGrade }) => allGrades.push(avgGrade));
    });

    const total = allGrades.length;
    const quality  = allGrades.filter(g => g <= 2).length;
    const quantity = allGrades.filter(g => g >= 3 && g <= 7).length;
    const fail     = allGrades.filter(g => g >= 8).length;

    const avgScore = filteredResults.length > 0
      ? Math.round(filteredResults.filter(r => r.percentage >= 0).reduce((s, r) => s + r.percentage, 0) / filteredResults.filter(r => r.percentage >= 0).length)
      : 0;

    return {
      totalStudents:    studentSubjectAverages.size,
      totalAssessments: total,
      averageScore:     avgScore,
      qualityRate:  total > 0 ? Math.round((quality  / total) * 100) : 0,
      quantityRate: total > 0 ? Math.round((quantity / total) * 100) : 0,
      failRate:     total > 0 ? Math.round((fail     / total) * 100) : 0,
    };
  }, [studentSubjectAverages, filteredResults, configuredExamTypes]);

  // ==================== DEBUG ====================

  useEffect(() => {
    if (showDebug && user?.uid) {
      console.log('👤 Teacher UID:', user.uid);
      console.log('📚 Assignments:', assignments?.length);
      console.log('📊 Configured exams:', configuredExamTypes);
      console.log('📋 All results:', allResults?.length);
      console.log('🔍 Filtered results:', filteredResults.length);
      console.log('🧑‍🎓 Learners:', learners?.length);
    }
  }, [showDebug, user, assignments, configuredExamTypes, allResults, filteredResults, learners]);

  // ==================== PDF ====================

  const handleDownloadPDF = async () => {
    if (!studentSubjectAverages.size || !configuredExamTypes.length) return;
    setIsDownloading(true);
    setPdfError(null);
    try {
      const { generateResultsAnalysisPDF } = await import('@/services/pdf/resultsAnalysisPDFLib');

      const examLabels: Record<string, string> = { week4: 'Week 4', week8: 'Week 8', endOfTerm: 'End of Term' };
      const examConfigSummary = configuredExamTypes.map(t => examLabels[t]).join(' + ');

      const boysGrades: number[] = [];
      const girlsGrades: number[] = [];
      studentSubjectAverages.forEach(sm => {
        sm.forEach(({ avgGrade, gender }) => {
          if (gender === 'M') boysGrades.push(avgGrade);
          if (gender === 'F') girlsGrades.push(avgGrade);
        });
      });

      const calcMetrics = (grades: number[]) => ({
        registered: grades.length, sat: grades.length, absent: 0,
        dist:     grades.filter(g => g <= 2).length,
        merit:    grades.filter(g => g >= 3 && g <= 4).length,
        credit:   grades.filter(g => g >= 5 && g <= 6).length,
        pass:     grades.filter(g => g === 7).length,
        fail:     grades.filter(g => g >= 8).length,
        quality:  grades.filter(g => g <= 2).length,
        quantity: grades.filter(g => g >= 3 && g <= 7).length,
      });

      const pdfData = {
        schoolName: 'KALABO BOARDING SECONDARY SCHOOL',
        address: 'P.O BOX 930096',
        className: selectedClass !== 'all'
          ? classOptions.find(c => c.id === selectedClass)?.name ?? 'Selected Class'
          : 'All Classes',
        subject: selectedSubject !== 'all' ? selectedSubject : 'All Subjects',
        term: selectedTerm,
        year: selectedYear,
        boys: calcMetrics(boysGrades),
        girls: calcMetrics(girlsGrades),
        generatedDate: new Date().toLocaleString('en-GB'),
        examConfigSummary: `Based on: ${examConfigSummary}`,
      };

      const pdfBytes = await generateResultsAnalysisPDF(pdfData);
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = [
        'results', pdfData.className, pdfData.subject, pdfData.term, pdfData.year
      ].map(s => String(s).replace(/\s+/g, '-')).join('-') + '.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('PDF error:', err);
      setPdfError('Failed to generate PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const clearFilters = () => {
    setSelectedClass('all');
    setSelectedSubject('all');
    setSelectedTerm(getCurrentAcademicTerm().term);
    setSelectedYear(getCurrentAcademicTerm().year);
  };

  const hasAssignments   = !!assignments?.length;
  const hasExamsConfigured = configuredExamTypes.length > 0;
  const hasData          = studentSubjectAverages.size > 0;
  const noExamsConfigured = hasAssignments && !hasExamsConfigured;
  const filtersActive    = selectedClass !== 'all' || selectedSubject !== 'all' ||
                           selectedTerm !== 'Term 1' || selectedYear !== new Date().getFullYear();

  // ==================== LOADING ====================

  if (assignmentsLoading || loadingLearners || resultsLoading || loadingExamConfig) {
    return (
      <DashboardLayout activeTab="analysis">
        <div className="p-4 sm:p-6 lg:p-8"><Skeleton /></div>
      </DashboardLayout>
    );
  }

  if (assignmentsError) {
    return (
      <DashboardLayout activeTab="analysis">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center max-w-2xl mx-auto">
            <AlertCircle className="text-red-500 mx-auto mb-4" size={48} />
            <h3 className="text-lg font-semibold text-red-800 mb-2">Failed to Load Assignments</h3>
            <p className="text-red-600 mb-4">There was an error loading your teaching assignments.</p>
            <button
              onClick={() => refetchAssignments()}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ==================== RENDER ====================

  return (
    <DashboardLayout activeTab="analysis">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">

        {/* Debug panel */}
        {showDebug && process.env.NODE_ENV === 'development' && (
          <div className="bg-gray-900 text-white p-4 rounded-xl overflow-auto text-xs space-y-1">
            <p className="font-bold mb-2">🔍 Debug</p>
            <p>Assignments: {assignments?.length}</p>
            <p>Classes: {classOptions.length}</p>
            <p>Configured exams: {configuredExamTypes.join(', ') || 'None'}</p>
            <p>Total results: {allResults?.length}</p>
            <p>Filtered results: {filteredResults.length}</p>
            <p>Student-subject averages: {studentSubjectAverages.size}</p>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">
              My Results Analysis
            </h1>
            <p className="text-sm text-gray-600 mt-1 flex items-center gap-2 flex-wrap">
              {hasAssignments ? (
                <>
                  <GraduationCap size={14} className="text-blue-500" />
                  <span>{classOptions.length} class{classOptions.length !== 1 ? 'es' : ''} assigned</span>
                  {selectedClass !== 'all' && (
                    <><span className="text-gray-300">•</span><span>{classOptions.find(c => c.id === selectedClass)?.name}</span></>
                  )}
                  {selectedSubject !== 'all' && (
                    <><span className="text-gray-300">•</span><span>{selectedSubject}</span></>
                  )}
                </>
              ) : (
                <span className="text-amber-600">No teaching assignments found</span>
              )}
              {isFetching && (
                <span className="inline-flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full text-xs">
                  <Loader2 size={10} className="animate-spin" /> updating
                </span>
              )}
              {hasExamsConfigured && (
                <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  {configuredExamTypes.length} exam{configuredExamTypes.length !== 1 ? 's' : ''} configured
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* PDF error inline */}
            {pdfError && (
              <span className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-1">
                <AlertCircle size={12} /> {pdfError}
              </span>
            )}
            <button
              onClick={handleDownloadPDF}
              disabled={!hasData || isDownloading || !hasExamsConfigured}
              className={`
                inline-flex items-center justify-center
                bg-blue-600 text-white rounded-lg sm:rounded-xl hover:bg-blue-700
                transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
                ${isMobile ? 'p-2.5' : 'px-4 py-2.5 gap-2'}
              `}
            >
              {isDownloading ? <Loader2 size={isMobile ? 18 : 16} className="animate-spin" /> : <Download size={isMobile ? 18 : 16} />}
              {!isMobile && (isDownloading ? 'Generating…' : 'Download PDF')}
            </button>
            <button
              onClick={() => { refetchResults(); refetchAssignments(); }}
              disabled={isFetching}
              title="Refresh data from Firestore"
              className={`
                inline-flex items-center justify-center
                border border-gray-300 text-gray-700 rounded-lg sm:rounded-xl hover:bg-gray-50
                transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
                ${isMobile ? 'p-2.5' : 'px-4 py-2.5 gap-2'}
              `}
            >
              <RefreshCw size={isMobile ? 18 : 16} className={isFetching ? 'animate-spin' : ''} />
              {!isMobile && 'Refresh'}
            </button>
            {process.env.NODE_ENV === 'development' && (
              <button
                onClick={() => setShowDebug(!showDebug)}
                className={`p-2.5 border rounded-xl transition-colors ${showDebug ? 'bg-blue-100 border-blue-300 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
              >
                <Eye size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Empty states */}
        {!hasAssignments && <EmptyState hasAssignments={false} />}
        {hasAssignments && noExamsConfigured && (
          <EmptyState hasAssignments noExamsConfigured term={selectedTerm} year={selectedYear} />
        )}

        {/* Filters */}
        {hasAssignments && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {isMobile && (
              <button
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                className="w-full flex items-center justify-between p-3"
              >
                <div className="flex items-center gap-2">
                  <Filter size={16} className="text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">
                    {filtersActive ? 'Filters active' : 'Filter results'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {filtersActive && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />}
                  <ChevronDown size={16} className={`text-gray-500 transition-transform ${showMobileFilters ? 'rotate-180' : ''}`} />
                </div>
              </button>
            )}

            <div className={`p-3 sm:p-4 ${isMobile && !showMobileFilters ? 'hidden' : 'block'}`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Class</label>
                  <select
                    value={selectedClass}
                    onChange={e => { setSelectedClass(e.target.value); setSelectedSubject('all'); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                  >
                    <option value="all">All Classes</option>
                    {classOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
                  <select
                    value={selectedSubject}
                    onChange={e => setSelectedSubject(e.target.value)}
                    disabled={!subjectOptions.length}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="all">All Subjects</option>
                    {subjectOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Term</label>
                  <select
                    value={selectedTerm}
                    onChange={e => setSelectedTerm(e.target.value as TermName)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                  >
                    {['Term 1', 'Term 2', 'Term 3'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                  >
                    {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              {hasExamsConfigured && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 px-3 py-2 rounded-lg">
                    <Calendar size={14} className="text-blue-600 flex-shrink-0" />
                    <span>
                      Exams included:{' '}
                      {configuredExamTypes.map(t =>
                        t === 'week4' ? 'Week 4' : t === 'week8' ? 'Week 8' : 'End of Term'
                      ).join(' · ')}
                    </span>
                  </div>
                </div>
              )}

              {filtersActive && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
                  <button onClick={clearFilters} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stat cards */}
        {hasAssignments && hasData && hasExamsConfigured && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
            <StatCard label="Average"   value={`${teacherMetrics.averageScore}%`}  subValue={`${teacherMetrics.totalStudents} students`} icon={Target}       color="blue"   />
            <StatCard label="Quality"   value={`${teacherMetrics.qualityRate}%`}   subValue="Grades 1–2"                                  icon={Award}        color="green"  />
            <StatCard label="Quantity"  value={`${teacherMetrics.quantityRate}%`}  subValue="Grades 3–7"                                  icon={Users}        color="purple" />
            <StatCard label="Fail Rate" value={`${teacherMetrics.failRate}%`}      subValue="Grades 8–9"                                  icon={AlertCircle}  color="red"    />
          </div>
        )}

        {/* Chart */}
        {hasAssignments && hasData && hasExamsConfigured && gradeDistribution.length > 0 && (
          <GradeDistributionChart
            data={gradeDistribution}
            viewMode={chartViewMode}
            onToggleView={() => setChartViewMode(prev => prev === 'detailed' ? 'simple' : 'detailed')}
            examCount={configuredExamTypes.length}
          />
        )}

        {/* Grade table */}
        {hasAssignments && hasData && hasExamsConfigured && gradeDistribution.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 sm:px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Grade Distribution Details</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Average of {configuredExamTypes.length} configured exam{configuredExamTypes.length !== 1 ? 's' : ''} ·{' '}
                  {gradeDistribution.reduce((s, g) => s + g.count, 0)} assessments
                </p>
              </div>
              <div className="text-xs text-gray-500">
                <span className="text-blue-600">♂ {gradeDistribution.reduce((s, g) => s + g.boys, 0)}</span>
                {' / '}
                <span className="text-rose-600">♀ {gradeDistribution.reduce((s, g) => s + g.girls, 0)}</span>
              </div>
            </div>

            {isMobile ? (
              <div className="divide-y divide-gray-100">
                {gradeDistribution.map(row => (
                  <div key={row.grade} className="p-3 flex items-center gap-3">
                    <GradeBadge grade={row.grade} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700">{row.description}</p>
                      <div className="flex items-center gap-3 text-xs mt-0.5">
                        <span className="text-blue-600">♂ {row.boys}</span>
                        <span className="text-rose-600">♀ {row.girls}</span>
                        <span className="text-gray-400">{row.percentage}%</span>
                      </div>
                    </div>
                    <span className="text-base font-bold text-gray-900">{row.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Grade', 'Description', 'Boys', 'Girls', 'Total', '%'].map(h => (
                        <th key={h} className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {gradeDistribution.map(row => (
                      <tr key={row.grade} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4"><GradeBadge grade={row.grade} /></td>
                        <td className="px-6 py-4 text-sm text-gray-700">{row.description}</td>
                        <td className="px-6 py-4 text-sm font-medium text-blue-600">{row.boys}</td>
                        <td className="px-6 py-4 text-sm font-medium text-rose-600">{row.girls}</td>
                        <td className="px-6 py-4 text-sm font-bold text-gray-900">{row.count}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{row.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900" colSpan={2}>Total</td>
                      <td className="px-6 py-4 text-sm font-bold text-blue-600">{gradeDistribution.reduce((s, g) => s + g.boys, 0)}</td>
                      <td className="px-6 py-4 text-sm font-bold text-rose-600">{gradeDistribution.reduce((s, g) => s + g.girls, 0)}</td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">{gradeDistribution.reduce((s, g) => s + g.count, 0)}</td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Empty — no results */}
        {hasAssignments && !hasData && hasExamsConfigured && (
          <EmptyState hasAssignments />
        )}

        {/* Footer */}
        {hasAssignments && hasData && hasExamsConfigured && (
          <div className="text-xs text-gray-500 text-center sm:text-left pt-4 border-t border-gray-200 flex flex-wrap gap-x-3 gap-y-1 justify-center sm:justify-start">
            <span className="font-medium">Average of All Configured Tests</span>
            <span>·</span>
            <span>{selectedTerm} {selectedYear}</span>
            <span>·</span>
            <span>{teacherMetrics.totalAssessments} assessments</span>
            <span>·</span>
            <span className="text-green-600">Quality: {teacherMetrics.qualityRate}%</span>
            <span>·</span>
            <span className="text-purple-600">Quantity: {teacherMetrics.quantityRate}%</span>
            <span>·</span>
            <span className="text-red-600">Fail: {teacherMetrics.failRate}%</span>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}