// @/pages/teacher/TeacherResultsAnalysis.tsx - COMPLETE FIXED VERSION WITH LOGO SUPPORT
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
  TrendingUp,
  TrendingDown,
  Minus
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

interface SubjectPerformance {
  subjectId: string;
  subjectName: string;
  teacherName: string;
  averagePercentage: number;
  passRate: number;
  qualityRate: number;
  quantityRate: number;
  failRate: number;
  gradeDistribution: GradeDistributionItem[];
}

interface ClassPerformance {
  classId: string;
  className: string;
  totalStudents: number;
  averagePercentage: number;
  passRate: number;
  qualityRate: number;  // Grades 1-2
  quantityRate: number; // Grades 3-7
  failRate: number;     // Grades 8-9
  subjects: SubjectPerformance[];
  gradeDistribution: GradeDistributionItem[];
  boysCount: number;
  girlsCount: number;
}

// Extended StudentResult type to include gender
interface ExtendedStudentResult extends StudentResult {
  gender?: 'M' | 'F';
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Get list of configured exam types for a term/year
 */
const getConfiguredExamTypes = (examConfig: any): string[] => {
  if (!examConfig?.examTypes) return [];
  
  const types = [];
  if (examConfig.examTypes.week4) types.push('week4');
  if (examConfig.examTypes.week8) types.push('week8');
  if (examConfig.examTypes.endOfTerm) types.push('endOfTerm');
  
  return types;
};

/**
 * Calculate average grade for a student in a subject across configured exams
 */
const calculateStudentSubjectAverageGrade = (
  studentId: string,
  subjectId: string,
  allResults: StudentResult[],
  configuredExamTypes: string[]
): number | null => {
  // Get all results for this student and subject that match configured exam types
  const subjectResults = allResults.filter(r => 
    r.studentId === studentId && 
    r.subjectId === subjectId &&
    r.percentage >= 0 && // Only include valid scores
    configuredExamTypes.includes(r.examType) // Only include configured exams
  );
  
  if (subjectResults.length === 0) return null;
  
  // Calculate average percentage across all configured exams
  const avgPercentage = subjectResults.reduce((sum, r) => sum + r.percentage, 0) / subjectResults.length;
  
  // Convert to grade using the grade scale
  if (avgPercentage >= 75) return 1;
  if (avgPercentage >= 70) return 2;
  if (avgPercentage >= 65) return 3;
  if (avgPercentage >= 60) return 4;
  if (avgPercentage >= 55) return 5;
  if (avgPercentage >= 50) return 6;
  if (avgPercentage >= 45) return 7;
  if (avgPercentage >= 40) return 8;
  return 9;
};

// ==================== COMPONENTS ====================

const StatCard = ({ 
  label, 
  value, 
  subValue,
  icon: Icon, 
  color 
}: { 
  label: string; 
  value: string; 
  subValue?: string;
  icon: React.ElementType; 
  color: 'green' | 'blue' | 'red' | 'purple' 
}) => {
  const colors = {
    green: { bg: 'bg-green-50', text: 'text-green-700', icon: 'text-green-600' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'text-blue-600' },
    red: { bg: 'bg-red-50', text: 'text-red-700', icon: 'text-red-600' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-600' }
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

const GradeBadge = ({ grade }: { grade: number }) => {
  const colors: { [key: number]: string } = {
    1: 'bg-emerald-600',
    2: 'bg-emerald-500',
    3: 'bg-blue-600',
    4: 'bg-blue-500',
    5: 'bg-amber-600',
    6: 'bg-amber-500',
    7: 'bg-orange-500',
    8: 'bg-orange-400',
    9: 'bg-rose-500'
  };
  
  const labels: { [key: number]: string } = {
    1: 'Dist',
    2: 'Dist',
    3: 'Merit',
    4: 'Merit',
    5: 'Credit',
    6: 'Credit',
    7: 'Satis',
    8: 'Satis',
    9: 'Fail'
  };
  
  return (
    <div className="flex flex-col items-center">
      <span className={`px-2.5 py-1 rounded-md text-xs font-bold text-white ${colors[grade] || 'bg-gray-500'}`}>
        {grade}
      </span>
      <span className="text-[10px] text-gray-500 mt-0.5">{labels[grade]}</span>
    </div>
  );
};

const GradeDistributionChart = ({ 
  data, 
  viewMode, 
  onToggleView,
  examCount 
}: { 
  data: GradeDistributionItem[]; 
  viewMode: 'detailed' | 'simple';
  onToggleView: () => void;
  examCount?: number;
}) => {
  const maxValue = Math.max(...data.map(d => viewMode === 'detailed' 
    ? Math.max(d.boys, d.girls) 
    : d.count
  ));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-gray-900">Grade Distribution</h3>
          <p className="text-xs sm:text-sm text-gray-600 mt-1">
            {viewMode === 'detailed' ? 'Boys vs Girls by Grade' : 'Total Students by Grade'}
            {examCount && (
              <span className="ml-2 text-xs text-blue-600">
                (Based on {examCount} exam{examCount !== 1 ? 's' : ''})
              </span>
            )}
          </p>
        </div>
        <button
          onClick={onToggleView}
          className="flex items-center justify-center gap-2 px-3 py-2 text-xs sm:text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors w-full sm:w-auto"
        >
          {viewMode === 'detailed' ? (
            <>
              <BarChart3 size={14} />
              <span>Show Totals</span>
            </>
          ) : (
            <>
              <PieChart size={14} />
              <span>Show Gender Split</span>
            </>
          )}
        </button>
      </div>

      <div className="relative h-60 sm:h-80">
        <div className="absolute left-0 top-0 bottom-0 w-8 sm:w-12 flex flex-col justify-between text-[10px] sm:text-xs text-gray-500">
          <span>{maxValue}</span>
          <span>{Math.round(maxValue * 0.75)}</span>
          <span>{Math.round(maxValue * 0.5)}</span>
          <span>{Math.round(maxValue * 0.25)}</span>
          <span>0</span>
        </div>

        <div className="absolute left-10 sm:left-16 right-0 top-0 bottom-0">
          <div className="flex items-end justify-around h-full">
            {data.map((item) => (
              <div key={item.grade} className="flex flex-col items-center w-12 sm:w-16">
                <div className="flex gap-1 w-full justify-center mb-2">
                  {viewMode === 'detailed' ? (
                    <>
                      {item.boys > 0 && (
                        <div className="flex flex-col items-center group">
                          <div className="relative">
                            <div 
                              className="w-4 sm:w-6 bg-blue-500 rounded-t transition-all duration-500 hover:bg-blue-600"
                              style={{ height: `${(item.boys / maxValue) * 150}px`, minHeight: '4px' }}
                            />
                            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-10">
                              Boys: {item.boys}
                            </div>
                          </div>
                          <span className="text-[10px] text-blue-600 mt-1">B</span>
                        </div>
                      )}
                      
                      {item.girls > 0 && (
                        <div className="flex flex-col items-center group">
                          <div className="relative">
                            <div 
                              className="w-4 sm:w-6 bg-rose-500 rounded-t transition-all duration-500 hover:bg-rose-600"
                              style={{ height: `${(item.girls / maxValue) * 150}px`, minHeight: '4px' }}
                            />
                            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-10">
                              Girls: {item.girls}
                            </div>
                          </div>
                          <span className="text-[10px] text-rose-600 mt-1">G</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center group w-full">
                      <div className="relative w-full">
                        <div 
                          className="w-full bg-indigo-500 rounded-t transition-all duration-500 hover:bg-indigo-600"
                          style={{ height: `${(item.count / maxValue) * 150}px`, minHeight: '4px' }}
                        >
                          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-10">
                            Total: {item.count}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <GradeBadge grade={item.grade} />
                <span className="text-[10px] text-gray-500 mt-1">
                  {item.percentage}%
                </span>
              </div>
            ))}
          </div>

          <div className="absolute inset-0 pointer-events-none">
            {[0, 1, 2, 3, 4].map((i) => (
              <div 
                key={i}
                className="absolute left-0 right-0 border-t border-gray-100"
                style={{ bottom: `${i * 25}%` }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 sm:mt-6 pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs sm:text-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 sm:w-3 sm:h-3 bg-blue-500 rounded"></span>
            <span className="text-gray-600">Boys</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 sm:w-3 sm:h-3 bg-rose-500 rounded"></span>
            <span className="text-gray-600">Girls</span>
          </div>
        </div>
        <p className="text-gray-500 text-xs">
          Total: {data.reduce((sum, d) => sum + d.count, 0)} assessments
        </p>
      </div>
    </div>
  );
};

const EmptyState = ({ 
  hasAssignments, 
  noExamsConfigured,
  term,
  year 
}: { 
  hasAssignments: boolean;
  noExamsConfigured?: boolean;
  term?: string;
  year?: number;
}) => {
  if (noExamsConfigured) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 sm:p-12 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-full mb-4 sm:mb-5">
          <Calendar className="text-yellow-600" size={24} />
        </div>
        <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
          No Exams Configured
        </h3>
        <p className="text-sm sm:text-base text-gray-600 max-w-md mx-auto">
          No exams have been configured for {term} {year}. 
          Please contact the administrator to set up exam configurations.
        </p>
      </div>
    );
  }

  if (!hasAssignments) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 sm:p-12 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-full mb-4 sm:mb-5">
          <BookOpen className="text-yellow-600" size={24} />
        </div>
        <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
          No Teaching Assignments
        </h3>
        <p className="text-sm sm:text-base text-gray-600 max-w-md mx-auto">
          You haven't been assigned to any classes yet. Contact your administrator to get teaching assignments.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 sm:p-12 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-full mb-4 sm:mb-5">
        <Target className="text-blue-500" size={24} />
      </div>
      <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
        No Results Available
      </h3>
      <p className="text-sm sm:text-base text-gray-600 max-w-md mx-auto">
        No results have been entered for the selected filters. Enter results in the Results Entry page.
      </p>
    </div>
  );
};

const Skeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-col gap-2">
            <div className="h-4 bg-gray-200 rounded w-20"></div>
            <div className="h-8 bg-gray-300 rounded w-16"></div>
          </div>
        </div>
      ))}
    </div>
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
      <div className="h-5 bg-gray-200 rounded w-40 mb-4"></div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex items-center gap-4">
            <div className="w-10 h-8 bg-gray-200 rounded"></div>
            <div className="flex-1 h-4 bg-gray-200 rounded"></div>
            <div className="w-16 h-6 bg-gray-200 rounded"></div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ==================== MAIN COMPONENT ====================
export default function TeacherResultsAnalysis() {
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  // State
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedTerm, setSelectedTerm] = useState('Term 1');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [chartViewMode, setChartViewMode] = useState<'detailed' | 'simple'>('detailed');
  const [isDownloading, setIsDownloading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  
  // ==================== HOOKS ====================

  // Get teacher's assignments
  const { 
    assignments, 
    isLoading: assignmentsLoading,
    error: assignmentsError,
    refetch: refetchAssignments,
    getClassesWithSubjects,
    getSubjectsForClass
  } = useTeacherAssignments(user?.uid || '');

  // Get learners for gender data
  const { 
    learners, 
    isLoading: loadingLearners 
  } = useSchoolLearners(selectedClass !== 'all' ? selectedClass : undefined);

  // Get exam configuration
  const { 
    configs: examConfigs, 
    isLoading: loadingExamConfig 
  } = useExamConfig({ year: selectedYear, term: selectedTerm });
  
  const currentExamConfig = examConfigs?.[0];
  
  // Get configured exam types
  const configuredExamTypes = useMemo(() => {
    return getConfiguredExamTypes(currentExamConfig);
  }, [currentExamConfig]);

  // Get ALL results for the selected term/year
  const { 
    results: allResults, 
    isLoading: resultsLoading,
    isFetching,
    refetch: refetchResults
  } = useResults({
    term: selectedTerm,
    year: selectedYear,
    classId: selectedClass !== 'all' ? selectedClass : undefined
  });

  // Filter results to only show this teacher's subjects
  const filteredResults = useMemo(() => {
    if (!allResults || allResults.length === 0 || !assignments || assignments.length === 0) {
      return [];
    }

    // Create a set of subject IDs this teacher teaches
    const teacherSubjectIds = new Set<string>();
    
    if (selectedClass === 'all') {
      // For all classes, get all subjects this teacher teaches
      assignments.forEach(assignment => {
        // Normalize subject name to match against subjectId
        const normalizedSubject = normalizeSubjectName(assignment.subject);
        teacherSubjectIds.add(normalizedSubject);
      });
    } else {
      // For a specific class, only include subjects for that class
      assignments
        .filter(a => a.classId === selectedClass)
        .forEach(assignment => {
          const normalizedSubject = normalizeSubjectName(assignment.subject);
          teacherSubjectIds.add(normalizedSubject);
        });
    }

    // Filter results to only include this teacher's subjects
    return allResults.filter(result => {
      const normalizedResultSubject = normalizeSubjectName(result.subjectId || result.subjectName || '');
      return teacherSubjectIds.has(normalizedResultSubject);
    });
  }, [allResults, assignments, selectedClass]);

  // ==================== DEBUG EFFECT ====================
  
  useEffect(() => {
    if (showDebug && user?.uid) {
      console.log('👤 Teacher UID:', user.uid);
      console.log('📚 Teacher assignments:', assignments);
      console.log('📊 Configured exam types:', configuredExamTypes);
      console.log('📋 All results count:', allResults?.length || 0);
      console.log('🔍 Filtered results count:', filteredResults.length);
      console.log('🧑‍🎓 Learners with gender data:', learners?.length || 0);
      
      if (filteredResults.length === 0 && allResults?.length > 0) {
        console.warn('⚠️ Results exist but none match your subjects. Check subject name normalization.');
      }
    }
  }, [showDebug, user, assignments, configuredExamTypes, allResults, filteredResults, learners]);

  // ==================== STUDENT DATA MAPPING ====================
  
  // Map both document IDs and custom student IDs to gender
  const studentDataMap = useMemo(() => {
    const docIdToGender = new Map<string, 'M' | 'F'>();
    const customIdToGender = new Map<string, 'M' | 'F'>();
    
    if (learners && learners.length > 0) {
      learners.forEach(learner => {
        if (learner.id && learner.gender) {
          docIdToGender.set(learner.id, learner.gender === 'male' ? 'M' : 'F');
        }
        if (learner.studentId && learner.gender) {
          customIdToGender.set(learner.studentId, learner.gender === 'male' ? 'M' : 'F');
        }
      });
    }
    
    return { docIdToGender, customIdToGender };
  }, [learners]);

  // Helper function to get gender from a student ID
  const getStudentGender = useCallback((studentId: string): 'M' | 'F' | undefined => {
    // Try as document ID
    let gender = studentDataMap.docIdToGender.get(studentId);
    
    // Try as custom ID
    if (!gender) {
      gender = studentDataMap.customIdToGender.get(studentId);
    }
    
    return gender;
  }, [studentDataMap]);

  // ==================== PROCESS RESULTS USING AVERAGES OF CONFIGURED EXAMS ====================
  
  // Calculate student-subject averages using only configured exams
  const studentSubjectAverages = useMemo(() => {
    if (configuredExamTypes.length === 0 || filteredResults.length === 0) return new Map();
    
    const averages = new Map<string, Map<string, { avgGrade: number; gender?: 'M' | 'F' }>>();
    
    // Get unique student-subject combinations
    const uniqueCombinations = new Set<string>();
    filteredResults.forEach((r: StudentResult) => {
      // Only include results from configured exam types
      if (configuredExamTypes.includes(r.examType)) {
        uniqueCombinations.add(`${r.studentId}|${r.subjectId || r.subjectName}`);
      }
    });
    
    // Calculate average grade for each student-subject combination
    uniqueCombinations.forEach(combo => {
      const [studentId, subjectId] = combo.split('|');
      
      const avgGrade = calculateStudentSubjectAverageGrade(
        studentId, 
        subjectId, 
        filteredResults,
        configuredExamTypes
      );
      
      if (avgGrade !== null) {
        // Get gender
        const gender = getStudentGender(studentId);
        
        // Store in map
        if (!averages.has(studentId)) {
          averages.set(studentId, new Map());
        }
        averages.get(studentId)!.set(subjectId, { avgGrade, gender });
      }
    });
    
    return averages;
  }, [filteredResults, getStudentGender, configuredExamTypes]);

  // ==================== DERIVED DATA ====================

  // Get classes the teacher is assigned to
  const classesWithSubjects = useMemo(() => {
    return getClassesWithSubjects();
  }, [assignments, getClassesWithSubjects]);

  // Class dropdown options
  const classOptions = useMemo(() => {
    return classesWithSubjects.map(c => ({
      id: c.classId,
      name: c.className,
      subjects: c.subjects
    }));
  }, [classesWithSubjects]);

  // Subject options based on selected class
  const subjectOptions = useMemo(() => {
    if (selectedClass === 'all') {
      // Get all unique subjects from assignments
      const subjectSet = new Set();
      assignments?.forEach(a => {
        if (a.subject && a.subject !== 'Form Teacher') {
          subjectSet.add(a.subject);
        }
      });
      return Array.from(subjectSet).map(s => ({
        id: s as string,
        name: s as string
      }));
    } else {
      // Get subjects for selected class
      const classData = classesWithSubjects.find(c => c.classId === selectedClass);
      return classData?.subjects
        .filter(s => s !== 'Form Teacher')
        .map(s => ({
          id: s,
          name: s
        })) || [];
    }
  }, [assignments, classesWithSubjects, selectedClass]);

  // ==================== CALCULATE GRADE DISTRIBUTION ====================
  
  const gradeDistribution = useMemo((): GradeDistributionItem[] => {
    if (studentSubjectAverages.size === 0 || configuredExamTypes.length === 0) return [];

    const gradeMap = new Map<number, { boys: number; girls: number; unknown: number }>();
    
    // Initialize grades 1-9
    for (let i = 1; i <= 9; i++) {
      gradeMap.set(i, { boys: 0, girls: 0, unknown: 0 });
    }

    let matchedCount = 0;
    let unmatchedCount = 0;

    // Count each student-subject average
    studentSubjectAverages.forEach((subjectMap) => {
      subjectMap.forEach(({ avgGrade, gender }) => {
        const current = gradeMap.get(avgGrade) || { boys: 0, girls: 0, unknown: 0 };
        
        if (gender === 'M') {
          gradeMap.set(avgGrade, { ...current, boys: current.boys + 1 });
          matchedCount++;
        } else if (gender === 'F') {
          gradeMap.set(avgGrade, { ...current, girls: current.girls + 1 });
          matchedCount++;
        } else {
          gradeMap.set(avgGrade, { ...current, unknown: current.unknown + 1 });
          unmatchedCount++;
        }
      });
    });

    const total = matchedCount + unmatchedCount;

    const getDescription = (grade: number): string => {
      if (grade <= 2) return 'Dist';
      if (grade <= 4) return 'Merit';
      if (grade <= 6) return 'Credit';
      if (grade <= 7) return 'Satis';
      return 'Fail';
    };

    return Array.from(gradeMap.entries())
      .map(([grade, counts]) => ({
        grade,
        count: counts.boys + counts.girls + counts.unknown,
        percentage: total > 0 ? Math.round(((counts.boys + counts.girls + counts.unknown) / total) * 100) : 0,
        description: getDescription(grade),
        boys: counts.boys,
        girls: counts.girls
      }))
      .filter(g => g.count > 0);
  }, [studentSubjectAverages, configuredExamTypes]);

  // ==================== CALCULATE TEACHER METRICS ====================
  
  const teacherMetrics = useMemo(() => {
    if (studentSubjectAverages.size === 0 || configuredExamTypes.length === 0) {
      return {
        totalStudents: 0,
        totalAssessments: 0,
        averageScore: 0,
        qualityRate: 0,
        quantityRate: 0,
        failRate: 0,
        subjectsCount: 0,
        configuredExamsCount: 0
      };
    }

    // Collect all student-subject average grades
    const allGrades: { grade: number; gender?: 'M' | 'F' }[] = [];
    
    studentSubjectAverages.forEach((subjectMap) => {
      subjectMap.forEach(({ avgGrade, gender }) => {
        allGrades.push({ grade: avgGrade, gender });
      });
    });

    const totalAssessments = allGrades.length;
    
    const qualityCount = allGrades.filter(g => g.grade <= 2).length;
    const quantityCount = allGrades.filter(g => g.grade >= 3 && g.grade <= 7).length;
    const failCount = allGrades.filter(g => g.grade >= 8).length;
    
    const uniqueStudents = studentSubjectAverages.size;
    const uniqueSubjects = new Set(
      Array.from(studentSubjectAverages.values())
        .flatMap(subjectMap => Array.from(subjectMap.keys()))
    ).size;

    // Calculate average score from all valid results
    const avgScore = filteredResults.length > 0
      ? Math.round(filteredResults.reduce((sum, r) => sum + r.percentage, 0) / filteredResults.length)
      : 0;

    return {
      totalStudents: uniqueStudents,
      totalAssessments,
      averageScore: avgScore,
      qualityRate: totalAssessments > 0 ? Math.round((qualityCount / totalAssessments) * 100) : 0,
      quantityRate: totalAssessments > 0 ? Math.round((quantityCount / totalAssessments) * 100) : 0,
      failRate: totalAssessments > 0 ? Math.round((failCount / totalAssessments) * 100) : 0,
      subjectsCount: uniqueSubjects,
      configuredExamsCount: configuredExamTypes.length
    };
  }, [studentSubjectAverages, filteredResults, configuredExamTypes]);

  // ==================== CALCULATE CLASS PERFORMANCE ====================
  
  const classPerformance = useMemo((): ClassPerformance | null => {
    if (studentSubjectAverages.size === 0 || !configuredExamTypes.length) {
      return null;
    }

    const className = selectedClass !== 'all' 
      ? classOptions.find(c => c.id === selectedClass)?.name || 'Selected Class'
      : 'All Classes';

    // Group grades by student to get student-level data
    const studentGrades: { [key: string]: { grades: number[]; gender?: 'M' | 'F' } } = {};
    
    studentSubjectAverages.forEach((subjectMap, studentId) => {
      subjectMap.forEach(({ avgGrade, gender }) => {
        if (!studentGrades[studentId]) {
          studentGrades[studentId] = { grades: [], gender };
        }
        studentGrades[studentId].grades.push(avgGrade);
      });
    });

    const totalStudents = Object.keys(studentGrades).length;
    let totalPercentage = 0;
    let totalStudentsWithData = 0;
    let qualityCount = 0;
    let quantityCount = 0;
    let failCount = 0;
    let boysCount = 0;
    let girlsCount = 0;

    // Calculate overall metrics
    Object.values(studentGrades).forEach(student => {
      if (student.gender === 'M') boysCount++;
      if (student.gender === 'F') girlsCount++;
      
      student.grades.forEach(grade => {
        if (grade <= 2) qualityCount++;
        else if (grade >= 3 && grade <= 7) quantityCount++;
        else if (grade >= 8) failCount++;
      });
      
      totalStudentsWithData += student.grades.length;
    });

    const totalAssessments = qualityCount + quantityCount + failCount;
    const qualityRate = totalAssessments > 0 ? Math.round((qualityCount / totalAssessments) * 100) : 0;
    const quantityRate = totalAssessments > 0 ? Math.round((quantityCount / totalAssessments) * 100) : 0;
    const failRate = totalAssessments > 0 ? Math.round((failCount / totalAssessments) * 100) : 0;

    return {
      classId: selectedClass !== 'all' ? selectedClass : 'all',
      className,
      totalStudents,
      averagePercentage: teacherMetrics.averageScore,
      passRate: 100 - failRate,
      qualityRate,
      quantityRate,
      failRate,
      subjects: [],
      gradeDistribution,
      boysCount,
      girlsCount
    };
  }, [studentSubjectAverages, configuredExamTypes, selectedClass, classOptions, teacherMetrics, gradeDistribution]);

  // ==================== PDF DOWNLOAD WITH LOGO SUPPORT ====================
  
  const handleDownloadPDF = async () => {
    if (studentSubjectAverages.size === 0 || !configuredExamTypes.length) {
      alert('No data to export');
      return;
    }

    setIsDownloading(true);
    try {
      const { generateResultsAnalysisPDF } = await import('@/services/pdf/resultsAnalysisPDFLib');
      
      const examTypeLabels = {
        week4: 'Week 4',
        week8: 'Week 8',
        endOfTerm: 'End of Term'
      };
      
      const examConfigSummary = configuredExamTypes
        .map(type => examTypeLabels[type as keyof typeof examTypeLabels])
        .join(' + ');

      const boysGrades: number[] = [];
      const girlsGrades: number[] = [];
      
      studentSubjectAverages.forEach((subjectMap) => {
        subjectMap.forEach(({ avgGrade, gender }) => {
          if (gender === 'M') boysGrades.push(avgGrade);
          if (gender === 'F') girlsGrades.push(avgGrade);
        });
      });

      const calculateMetrics = (grades: number[]) => ({
        registered: grades.length,
        sat: grades.length,
        absent: 0,
        dist: grades.filter(g => g <= 2).length,
        merit: grades.filter(g => g >= 3 && g <= 4).length,
        credit: grades.filter(g => g >= 5 && g <= 6).length,
        pass: grades.filter(g => g === 7).length,
        fail: grades.filter(g => g >= 8).length,
        quality: grades.filter(g => g <= 2).length,
        quantity: grades.filter(g => g >= 3 && g <= 7).length
      });

      // Prepare PDF data - The PDF generator will automatically add the logo from /public/images/school-logo.png
      const pdfData = {
        schoolName: 'KALABO BOARDING SECONDARY SCHOOL',
        address: 'P.O BOX 930096',
        className: selectedClass !== 'all' 
          ? classOptions.find(c => c.id === selectedClass)?.name || 'Selected Class'
          : 'All Classes',
        subject: selectedSubject !== 'all' ? selectedSubject : 'All Subjects',
        term: selectedTerm,
        year: selectedYear,
        boys: calculateMetrics(boysGrades),
        girls: calculateMetrics(girlsGrades),
        generatedDate: new Date().toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        examConfigSummary: `Based on: ${examConfigSummary}`
      };

      // Generate PDF - The logo will be automatically embedded
      const pdfBytes = await generateResultsAnalysisPDF(pdfData);

      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const filename = [
        'results',
        pdfData.className.replace(/\s+/g, '-'),
        pdfData.subject.replace(/\s+/g, '-'),
        pdfData.term.replace(/\s+/g, '-'),
        pdfData.year
      ].filter(Boolean).join('-') + '.pdf';
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF Generation Error:', error);
      alert('Failed to generate PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  const clearFilters = () => {
    setSelectedClass('all');
    setSelectedSubject('all');
    setSelectedTerm('Term 1');
    setSelectedYear(new Date().getFullYear());
  };

  const hasAssignments = assignments && assignments.length > 0;
  const hasExamsConfigured = configuredExamTypes.length > 0;
  const hasData = studentSubjectAverages.size > 0;
  const noExamsConfigured = hasAssignments && !hasExamsConfigured;

  if (assignmentsLoading || loadingLearners || resultsLoading || loadingExamConfig) {
    return (
      <DashboardLayout activeTab="analysis">
        <div className="p-4 sm:p-6 lg:p-8">
          <Skeleton />
        </div>
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

  return (
    <DashboardLayout activeTab="analysis">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
        
        {/* Debug Panel */}
        {showDebug && process.env.NODE_ENV === 'development' && (
          <div className="bg-gray-900 text-white p-4 rounded-xl overflow-auto text-xs">
            <h3 className="font-bold mb-2">🔍 Debug Info</h3>
            <p>User UID: {user?.uid || 'Not found'}</p>
            <p>Assignments: {assignments?.length || 0}</p>
            <p>Classes: {classOptions.length}</p>
            <p>Selected Class: {selectedClass}</p>
            <p>Selected Subject: {selectedSubject}</p>
            <p>Configured Exams: {configuredExamTypes.join(', ') || 'None'}</p>
            <p>Total Results: {allResults?.length || 0}</p>
            <p>Filtered Results: {filteredResults.length}</p>
            <p>Student-Subject Averages: {studentSubjectAverages.size}</p>
            <p>Learners with gender: {learners?.length || 0}</p>
            <p>Has Performance Data: {hasData ? 'Yes' : 'No'}</p>
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
                    <>
                      <span className="text-gray-300">•</span>
                      <span>{classOptions.find(c => c.id === selectedClass)?.name}</span>
                    </>
                  )}
                  {selectedSubject !== 'all' && (
                    <>
                      <span className="text-gray-300">•</span>
                      <span>{selectedSubject}</span>
                    </>
                  )}
                </>
              ) : (
                <span className="text-amber-600">No teaching assignments found</span>
              )}
              {isFetching && (
                <span className="inline-flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full text-xs">
                  <Loader2 size={10} className="animate-spin" />
                  updating
                </span>
              )}
              {hasExamsConfigured && (
                <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  {configuredExamTypes.length} exam{configuredExamTypes.length !== 1 ? 's' : ''} configured
                </span>
              )}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
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
              {isDownloading ? (
                <Loader2 size={isMobile ? 18 : 16} className="animate-spin" />
              ) : (
                <Download size={isMobile ? 18 : 16} />
              )}
              {!isMobile && (isDownloading ? 'Generating...' : 'Download PDF')}
            </button>
            <button
              onClick={() => {
                refetchResults();
                refetchAssignments();
              }}
              disabled={isFetching}
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
                className={`p-2.5 border rounded-xl transition-colors ${
                  showDebug 
                    ? 'bg-blue-100 border-blue-300 text-blue-700' 
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Eye size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Empty States */}
        {!hasAssignments && <EmptyState hasAssignments={false} />}
        {hasAssignments && noExamsConfigured && (
          <EmptyState 
            hasAssignments={true} 
            noExamsConfigured={true}
            term={selectedTerm}
            year={selectedYear}
          />
        )}

        {/* Filters Section */}
        {hasAssignments && (
          <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            
            {isMobile && (
              <button
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                className="w-full flex items-center justify-between p-3 bg-white"
              >
                <div className="flex items-center gap-2">
                  <Filter size={16} className="text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">
                    {selectedClass !== 'all' || selectedSubject !== 'all' ? 'Filters active' : 'Filter results'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {(selectedClass !== 'all' || selectedSubject !== 'all') && (
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                  )}
                  <ChevronDown 
                    size={16} 
                    className={`text-gray-500 transition-transform ${showMobileFilters ? 'rotate-180' : ''}`} 
                  />
                </div>
              </button>
            )}

            <div className={`
              p-3 sm:p-4
              ${isMobile && !showMobileFilters ? 'hidden' : 'block'}
            `}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Class
                  </label>
                  <select
                    value={selectedClass}
                    onChange={e => {
                      setSelectedClass(e.target.value);
                      setSelectedSubject('all');
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             text-sm bg-white"
                  >
                    <option value="all">All Classes</option>
                    {classOptions.map(cls => (
                      <option key={cls.id} value={cls.id}>{cls.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Subject
                  </label>
                  <select
                    value={selectedSubject}
                    onChange={e => setSelectedSubject(e.target.value)}
                    disabled={subjectOptions.length === 0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="all">All Subjects</option>
                    {subjectOptions.map(subject => (
                      <option key={subject.id} value={subject.id}>{subject.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Term
                  </label>
                  <select
                    value={selectedTerm}
                    onChange={e => setSelectedTerm(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             text-sm bg-white"
                  >
                    <option value="Term 1">Term 1</option>
                    <option value="Term 2">Term 2</option>
                    <option value="Term 3">Term 3</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Year
                  </label>
                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             text-sm bg-white"
                  >
                    {[2024, 2025, 2026].map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {hasExamsConfigured && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 px-3 py-2 rounded-lg">
                    <Calendar size={14} className="text-blue-600" />
                    <span>
                      Exams included: {configuredExamTypes.map(t => 
                        t === 'week4' ? 'Week 4' : t === 'week8' ? 'Week 8' : 'End of Term'
                      ).join(' • ')}
                    </span>
                  </div>
                </div>
              )}
              
              {(selectedClass !== 'all' || selectedSubject !== 'all' || selectedTerm !== 'Term 1' || selectedYear !== new Date().getFullYear()) && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
                  <button
                    onClick={clearFilters}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stats Cards */}
        {hasAssignments && hasData && hasExamsConfigured && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
            <StatCard
              label="Average"
              value={`${teacherMetrics.averageScore}%`}
              subValue={`${teacherMetrics.totalStudents} students`}
              icon={Target}
              color="blue"
            />
            <StatCard
              label="Quality"
              value={`${teacherMetrics.qualityRate}%`}
              subValue="Grades 1-2"
              icon={Award}
              color="green"
            />
            <StatCard
              label="Quantity"
              value={`${teacherMetrics.quantityRate}%`}
              subValue="Grades 3-7"
              icon={Users}
              color="purple"
            />
            <StatCard
              label="Fail Rate"
              value={`${teacherMetrics.failRate}%`}
              subValue="Grades 8-9"
              icon={AlertCircle}
              color="red"
            />
          </div>
        )}

        {/* Grade Distribution Chart */}
        {hasAssignments && hasData && hasExamsConfigured && gradeDistribution.length > 0 && (
          <GradeDistributionChart
            data={gradeDistribution}
            viewMode={chartViewMode}
            onToggleView={() => setChartViewMode(prev => prev === 'detailed' ? 'simple' : 'detailed')}
            examCount={configuredExamTypes.length}
          />
        )}

        {/* Grade Distribution Table */}
        {hasAssignments && hasData && hasExamsConfigured && gradeDistribution.length > 0 && (
          <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            
            <div className="px-4 sm:px-6 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm sm:text-base">
                    Grade Distribution Details
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Average of All Configured Tests • {gradeDistribution.reduce((sum, g) => sum + g.count, 0)} assessments
                    {configuredExamTypes.length > 0 && (
                      <span className="ml-2 text-blue-600">
                        (Based on {configuredExamTypes.length} exam{configuredExamTypes.length !== 1 ? 's' : ''})
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-xs text-gray-500">
                  <span className="text-blue-600">♂ {teacherMetrics.totalStudents > 0 ? gradeDistribution.reduce((sum, g) => sum + g.boys, 0) : 0}</span>
                  <span className="mx-1">/</span>
                  <span className="text-rose-600">♀ {teacherMetrics.totalStudents > 0 ? gradeDistribution.reduce((sum, g) => sum + g.girls, 0) : 0}</span>
                </div>
              </div>
            </div>

            {isMobile ? (
              <div className="divide-y divide-gray-100">
                {gradeDistribution.map((row) => (
                  <div key={row.grade} className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <GradeBadge grade={row.grade} />
                        <span className="text-xs font-medium text-gray-700">
                          {row.description}
                        </span>
                      </div>
                      <span className="text-base font-bold text-gray-900">{row.count}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                        <span className="text-gray-600">{row.boys}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-rose-500 rounded-full"></span>
                        <span className="text-gray-600">{row.girls}</span>
                      </div>
                      <span className="text-gray-400 text-xs">{row.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Grade</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Description</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Boys</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Girls</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">Total</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {gradeDistribution.map((row) => (
                      <tr key={row.grade} className="hover:bg-gray-50/50">
                        <td className="px-6 py-4">
                          <GradeBadge grade={row.grade} />
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">{row.description}</td>
                        <td className="px-6 py-4 text-sm font-medium text-blue-600">{row.boys}</td>
                        <td className="px-6 py-4 text-sm font-medium text-rose-600">{row.girls}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-gray-900">{row.count}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{row.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900" colSpan={2}>Total</td>
                      <td className="px-6 py-4 text-sm font-bold text-blue-600">{gradeDistribution.reduce((sum, g) => sum + g.boys, 0)}</td>
                      <td className="px-6 py-4 text-sm font-bold text-rose-600">{gradeDistribution.reduce((sum, g) => sum + g.girls, 0)}</td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">{gradeDistribution.reduce((sum, g) => sum + g.count, 0)}</td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Empty State - No Results */}
        {hasAssignments && !hasData && hasExamsConfigured && (
          <EmptyState hasAssignments={true} />
        )}

        {/* Footer Stats */}
        {hasAssignments && hasData && hasExamsConfigured && (
          <div className="text-xs text-gray-500 text-center sm:text-left pt-4 border-t border-gray-200">
            <span className="font-medium">Average of All Configured Tests</span>
            <span className="mx-2">•</span>
            {selectedTerm} {selectedYear}
            <span className="mx-2">•</span>
            {teacherMetrics.totalAssessments} assessments
            <span className="mx-2">•</span>
            <span className="text-green-600">Quality: {teacherMetrics.qualityRate}%</span>
            <span className="mx-2">•</span>
            <span className="text-purple-600">Quantity: {teacherMetrics.quantityRate}%</span>
            <span className="mx-2">•</span>
            <span className="text-red-600">Fail: {teacherMetrics.failRate}%</span>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}