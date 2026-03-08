// @/pages/teacher/TeacherResultsAnalysis.tsx - UPDATED WITH EXAM CONFIGURATION SUPPORT
// Quality: Grades 1-2 only (Distinction)
// Quantity: Grades 3-7 (Merit through Satisfactory)
// Fail: Grades 8-9 (Satisfactory Low and Unsatisfactory)
// Uses AVERAGES of all CONFIGURED exams (week4, week8, endOfTerm) per student per subject

import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useResultsAnalytics } from '@/hooks/useResults';
import { useExamConfig } from '@/hooks/useExamConfig';
import { useAuth } from '@/hooks/useAuth';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { 
  Filter, Loader2, RefreshCw, TrendingUp, TrendingDown, 
  Download, Target, Users, Award, AlertCircle, ChevronDown,
  BarChart3, PieChart, Eye, Calendar
} from 'lucide-react';
import { StudentResult } from '@/services/resultsService';
import { Learner } from '@/types/school';

// ==================== LOCAL TYPES ====================
interface LocalGradeDistribution {
  grade: number;
  boys: number;
  girls: number;
  total: number;
  percentage: number;
  description: string;
}

interface LocalClassPerformance {
  classId: string;
  className: string;
  candidates: {
    boys: number;
    girls: number;
    total: number;
  };
  sat: {
    boys: number;
    girls: number;
    total: number;
  };
  gradeDistribution: LocalGradeDistribution[];
  performance: {
    quality: {
      boys: number;
      girls: number;
      total: number;
      percentage: number;
    };
    quantity: {
      boys: number;
      girls: number;
      total: number;
      percentage: number;
    };
    fail: {
      boys: number;
      girls: number;
      total: number;
      percentage: number;
    };
  };
}

// Types for PDF data
interface SubjectMetrics {
  registered: number;
  sat: number;
  absent: number;
  dist: number;      // grades 1-2
  merit: number;     // grades 3-4
  credit: number;    // grades 5-6
  pass: number;      // grade 7 only
  fail: number;      // grades 8-9
  quality: number;   // grades 1-2
  quantity: number;  // grades 3-7
}

interface TeacherPDFData {
  schoolName: string;
  address: string;
  className: string;
  subject: string;
  term: string;
  year: number;
  boys: SubjectMetrics;
  girls: SubjectMetrics;
  generatedDate: string;
  examConfigSummary?: string; // NEW: Show which exams were included
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
 * Calculate average grade for a student in a subject across all configured exams
 */
const calculateStudentSubjectAverageGrade = (
  studentId: string,
  subjectId: string,
  allResults: StudentResult[],
  configuredExamTypes: string[] // Only include configured exams
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
  
  // Convert to grade using the grade calculation function
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

// ==================== CLEAN SQUARE STAT CARD ====================
interface StatCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  color: 'green' | 'blue' | 'red';
  subtext?: string;
}

const StatCard = ({ label, value, icon: Icon, color, subtext }: StatCardProps) => {
  const colors = {
    green: {
      bg: 'bg-green-50',
      text: 'text-green-700',
      icon: 'text-green-600',
      border: 'border-green-200'
    },
    blue: {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      icon: 'text-blue-600',
      border: 'border-blue-200'
    },
    red: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      icon: 'text-red-600',
      border: 'border-red-200'
    }
  };

  const style = colors[color];

  return (
    <div className={`
      aspect-square bg-white rounded-xl border ${style.border} p-3
      flex flex-col items-center justify-center text-center
      hover:shadow-md transition-all
    `}>
      <div className={`p-2 rounded-lg ${style.bg} mb-1`}>
        <Icon size={20} className={style.icon} />
      </div>
      <p className="text-xs font-medium text-gray-600 mb-0.5">
        {label}
      </p>
      <p className={`text-xl font-bold ${style.text}`}>
        {value}
      </p>
      {subtext && (
        <p className="text-[10px] text-gray-500 mt-1">{subtext}</p>
      )}
    </div>
  );
};

// ==================== GRADE BADGE ====================
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

// ==================== GRADE DISTRIBUTION CHART ====================
const GradeDistributionChart = ({ data, viewMode, onToggleView, examCount }: { 
  data: LocalGradeDistribution[]; 
  viewMode: 'detailed' | 'simple';
  onToggleView: () => void;
  examCount?: number;
}) => {
  const maxValue = Math.max(...data.map(d => viewMode === 'detailed' 
    ? Math.max(d.boys, d.girls) 
    : d.total
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
                          style={{ height: `${(item.total / maxValue) * 150}px`, minHeight: '4px' }}
                        >
                          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-10">
                            Total: {item.total}
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
          Total: {data.reduce((sum, d) => sum + d.total, 0)} assessments
        </p>
      </div>
    </div>
  );
};

// ==================== EMPTY STATE ====================
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
          <Users className="text-yellow-600" size={24} />
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

// ==================== SKELETON ====================
const Skeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="aspect-square bg-white rounded-xl border border-gray-200 p-3">
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-10 h-10 bg-gray-200 rounded-lg mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-12 mb-1"></div>
            <div className="h-5 bg-gray-300 rounded w-10"></div>
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
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [chartViewMode, setChartViewMode] = useState<'detailed' | 'simple'>('detailed');
  const [isDownloading, setIsDownloading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedTerm, setSelectedTerm] = useState('Term 1');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const { assignments, isLoading: assignmentsLoading } = useTeacherAssignments(user?.id || '');
  const { learners, isLoading: learnersLoading } = useSchoolLearners();

  // Get exam configuration for the selected term and year
  const { 
    configs: examConfigs, 
    isLoading: loadingExamConfig 
  } = useExamConfig({ year: selectedYear, term: selectedTerm });
  
  const currentExamConfig = examConfigs?.[0]; // Get the most recent config for this term/year
  
  // Get list of configured exam types for this term
  const configuredExamTypes = useMemo(() => {
    return getConfiguredExamTypes(currentExamConfig);
  }, [currentExamConfig]);

  const { 
    analytics, 
    results,
    isLoading, 
    isFetching, 
    refetch 
  } = useResultsAnalytics({
    teacherId: user?.id || '',
    classId: selectedClass !== 'all' ? selectedClass : undefined,
    subjectId: selectedSubject !== 'all' ? selectedSubject : undefined,
    term: selectedTerm,
    year: selectedYear,
  });

  // ==================== STUDENT DATA MAPPING ====================
  
  const studentDataMap = useMemo(() => {
    const docIdToGender = new Map<string, 'M' | 'F'>();
    const customIdToGender = new Map<string, 'M' | 'F'>();
    const docIdToCustomId = new Map<string, string>();
    const customIdToDocId = new Map<string, string>();
    
    learners.forEach((learner: Learner) => {
      if (learner.id) {
        if (learner.gender) {
          docIdToGender.set(learner.id, learner.gender === 'male' ? 'M' : 'F');
        }
        if (learner.studentId) {
          docIdToCustomId.set(learner.id, learner.studentId);
        }
      }
      
      if (learner.studentId) {
        if (learner.gender) {
          customIdToGender.set(learner.studentId, learner.gender === 'male' ? 'M' : 'F');
        }
        if (learner.id) {
          customIdToDocId.set(learner.studentId, learner.id);
        }
      }
    });
    
    return { docIdToGender, customIdToGender, docIdToCustomId, customIdToDocId };
  }, [learners]);

  const getStudentGender = useCallback((studentId: string): 'M' | 'F' | undefined => {
    let gender = studentDataMap.docIdToGender.get(studentId);
    
    if (!gender) {
      gender = studentDataMap.customIdToGender.get(studentId);
    }
    
    if (!gender) {
      const learner = learners.find(l => 
        l.id === studentId || 
        l.studentId === studentId
      );
      if (learner?.gender) {
        gender = learner.gender === 'male' ? 'M' : 'F';
      }
    }
    
    return gender;
  }, [learners, studentDataMap]);

  // Debug function
  const checkMappings = useCallback(() => {
    console.log('===== CHECKING STUDENT MAPPINGS =====');
    console.log('Total learners:', learners.length);
    console.log('Total results:', results.length);
    console.log('Configured exam types:', configuredExamTypes);
    
    const sampleResults = results.slice(0, 5);
    
    sampleResults.forEach((result, index) => {
      console.log(`\nResult ${index + 1}:`);
      console.log('  Student ID in result:', result.studentId);
      console.log('  Student name:', result.studentName);
      console.log('  Exam type:', result.examType);
      console.log('  Included in config?', configuredExamTypes.includes(result.examType));
      
      const finalGender = getStudentGender(result.studentId);
      console.log('  Final gender:', finalGender || 'Not found');
    });
  }, [learners, results, getStudentGender, configuredExamTypes]);

  useEffect(() => {
    if (showDebug && results.length > 0 && learners.length > 0) {
      checkMappings();
    }
  }, [showDebug, results, learners, checkMappings]);

  const assignedClasses = useMemo(() => {
    if (!assignments) return [];
    const classMap = new Map();
    assignments.forEach(a => {
      if (!classMap.has(a.classId)) {
        classMap.set(a.classId, {
          id: a.classId,
          name: a.className
        });
      }
    });
    return Array.from(classMap.values());
  }, [assignments]);

  const assignedSubjects = useMemo(() => {
    if (!assignments) return [];
    
    if (selectedClass !== 'all') {
      const subjectMap = new Map();
      assignments
        .filter(a => a.classId === selectedClass)
        .forEach(a => {
          if (!subjectMap.has(a.subject)) {
            subjectMap.set(a.subject, {
              id: a.subject,
              name: a.subject
            });
          }
        });
      return Array.from(subjectMap.values());
    }
    
    const subjectMap = new Map();
    assignments.forEach(a => {
      if (!subjectMap.has(a.subject)) {
        subjectMap.set(a.subject, {
          id: a.subject,
          name: a.subject
        });
      }
    });
    return Array.from(subjectMap.values());
  }, [assignments, selectedClass]);

  // ==================== PROCESS RESULTS USING AVERAGES OF CONFIGURED EXAMS ====================
  
  const studentSubjectAverages = useMemo(() => {
    if (configuredExamTypes.length === 0) return new Map();
    
    const averages = new Map<string, Map<string, { avgGrade: number; gender?: 'M' | 'F' }>>();
    
    // Get unique student-subject combinations
    const uniqueCombinations = new Set<string>();
    results.forEach((r: StudentResult) => {
      // Only include results from configured exam types
      if (configuredExamTypes.includes(r.examType)) {
        uniqueCombinations.add(`${r.studentId}|${r.subjectId}`);
      }
    });
    
    // Calculate average grade for each student-subject combination
    uniqueCombinations.forEach(combo => {
      const [studentId, subjectId] = combo.split('|');
      
      const subjectResults = results.filter((r: StudentResult) => 
        r.studentId === studentId && 
        r.subjectId === subjectId &&
        r.percentage >= 0 &&
        configuredExamTypes.includes(r.examType)
      );
      
      if (subjectResults.length === 0) return;
      
      const avgPercentage = subjectResults.reduce((sum, r) => sum + r.percentage, 0) / subjectResults.length;
      
      let grade: number;
      if (avgPercentage >= 75) grade = 1;
      else if (avgPercentage >= 70) grade = 2;
      else if (avgPercentage >= 65) grade = 3;
      else if (avgPercentage >= 60) grade = 4;
      else if (avgPercentage >= 55) grade = 5;
      else if (avgPercentage >= 50) grade = 6;
      else if (avgPercentage >= 45) grade = 7;
      else if (avgPercentage >= 40) grade = 8;
      else grade = 9;
      
      const gender = getStudentGender(studentId);
      
      if (!averages.has(studentId)) {
        averages.set(studentId, new Map());
      }
      averages.get(studentId)!.set(subjectId, { avgGrade: grade, gender });
    });
    
    return averages;
  }, [results, getStudentGender, configuredExamTypes]);

  // Calculate grade distribution based on averages
  const gradeDistribution = useMemo((): LocalGradeDistribution[] => {
    if (studentSubjectAverages.size === 0 || configuredExamTypes.length === 0) return [];

    const gradeMap = new Map<number, { boys: number; girls: number; unknown: number }>();
    
    for (let i = 1; i <= 9; i++) {
      gradeMap.set(i, { boys: 0, girls: 0, unknown: 0 });
    }

    studentSubjectAverages.forEach((subjectMap) => {
      subjectMap.forEach(({ avgGrade, gender }) => {
        const current = gradeMap.get(avgGrade) || { boys: 0, girls: 0, unknown: 0 };
        
        if (gender === 'M') {
          gradeMap.set(avgGrade, { ...current, boys: current.boys + 1 });
        } else if (gender === 'F') {
          gradeMap.set(avgGrade, { ...current, girls: current.girls + 1 });
        } else {
          gradeMap.set(avgGrade, { ...current, unknown: current.unknown + 1 });
        }
      });
    });

    const total = Array.from(studentSubjectAverages.values())
      .reduce((sum, subjectMap) => sum + subjectMap.size, 0);

    const getShortDescription = (grade: number): string => {
      if (grade <= 2) return 'Dist';
      if (grade <= 4) return 'Merit';
      if (grade <= 6) return 'Credit';
      if (grade <= 7) return 'Satis';
      return 'Fail';
    };

    return Array.from(gradeMap.entries())
      .map(([grade, counts]) => ({
        grade,
        boys: counts.boys,
        girls: counts.girls,
        total: counts.boys + counts.girls + counts.unknown,
        percentage: total > 0 ? Math.round(((counts.boys + counts.girls + counts.unknown) / total) * 100) : 0,
        description: getShortDescription(grade)
      }))
      .filter(g => g.total > 0)
      .sort((a, b) => a.grade - b.grade);
  }, [studentSubjectAverages, configuredExamTypes]);

  // ==================== CORE METRICS USING AVERAGES ====================
  const coreMetrics = useMemo(() => {
    if (studentSubjectAverages.size === 0 || configuredExamTypes.length === 0) {
      return {
        qualityPass: { percentage: 0, count: 0, total: 0, boys: 0, girls: 0 },
        quantityPass: { percentage: 0, count: 0, total: 0, boys: 0, girls: 0 },
        fail: { percentage: 0, count: 0, total: 0, boys: 0, girls: 0 }
      };
    }

    const allGrades: { grade: number; gender?: 'M' | 'F' }[] = [];
    
    studentSubjectAverages.forEach((subjectMap) => {
      subjectMap.forEach(({ avgGrade, gender }) => {
        allGrades.push({ grade: avgGrade, gender });
      });
    });

    const total = allGrades.length;

    const qualityPass = allGrades.filter(g => g.grade <= 2);
    const quantityPass = allGrades.filter(g => g.grade >= 3 && g.grade <= 7);
    const fail = allGrades.filter(g => g.grade >= 8);

    const qualityBoys = qualityPass.filter(g => g.gender === 'M').length;
    const qualityGirls = qualityPass.filter(g => g.gender === 'F').length;
    
    const quantityBoys = quantityPass.filter(g => g.gender === 'M').length;
    const quantityGirls = quantityPass.filter(g => g.gender === 'F').length;
    
    const failBoys = fail.filter(g => g.gender === 'M').length;
    const failGirls = fail.filter(g => g.gender === 'F').length;

    return {
      qualityPass: {
        percentage: total > 0 ? Math.round((qualityPass.length / total) * 100) : 0,
        count: qualityPass.length,
        total,
        boys: qualityBoys,
        girls: qualityGirls
      },
      quantityPass: {
        percentage: total > 0 ? Math.round((quantityPass.length / total) * 100) : 0,
        count: quantityPass.length,
        total,
        boys: quantityBoys,
        girls: quantityGirls
      },
      fail: {
        percentage: total > 0 ? Math.round((fail.length / total) * 100) : 0,
        count: fail.length,
        total,
        boys: failBoys,
        girls: failGirls
      }
    };
  }, [studentSubjectAverages, configuredExamTypes]);

  // ==================== PDF DOWNLOAD FUNCTION ====================
  const handleDownloadPDF = async () => {
    try {
      if (studentSubjectAverages.size === 0 || configuredExamTypes.length === 0) {
        alert('No data to export');
        return;
      }

      setIsDownloading(true);

      const allAverages: { grade: number; gender?: 'M' | 'F' }[] = [];
      
      studentSubjectAverages.forEach((subjectMap) => {
        subjectMap.forEach(({ avgGrade, gender }) => {
          allAverages.push({ grade: avgGrade, gender });
        });
      });

      const boysGrades = allAverages.filter(g => g.gender === 'M').map(g => g.grade);
      const girlsGrades = allAverages.filter(g => g.gender === 'F').map(g => g.grade);
      const unknownGrades = allAverages.filter(g => !g.gender).map(g => g.grade);

      const calculateMetrics = (grades: number[]): SubjectMetrics => {
        const total = grades.length;
        
        return {
          registered: total,
          sat: total,
          absent: 0,
          dist: grades.filter(g => g <= 2).length,
          merit: grades.filter(g => g >= 3 && g <= 4).length,
          credit: grades.filter(g => g >= 5 && g <= 6).length,
          pass: grades.filter(g => g === 7).length,
          fail: grades.filter(g => g >= 8).length,
          quality: grades.filter(g => g <= 2).length,
          quantity: grades.filter(g => g >= 3 && g <= 7).length,
        };
      };

      const subjectName = selectedSubject !== 'all' 
        ? selectedSubject 
        : (assignedSubjects.length === 1 ? assignedSubjects[0].name : 'All Subjects');

      // Create exam config summary text
      const examTypeLabels = {
        week4: 'Week 4',
        week8: 'Week 8',
        endOfTerm: 'End of Term'
      };
      
      const examConfigSummary = configuredExamTypes
        .map(type => examTypeLabels[type as keyof typeof examTypeLabels])
        .join(' + ');

      const pdfData: TeacherPDFData = {
        schoolName: 'KALABO BOARDING SECONDARY SCHOOL',
        address: 'P.O BOX 930096',
        className: selectedClass !== 'all' 
          ? assignedClasses.find(c => c.id === selectedClass)?.name || 'All Classes'
          : 'All Classes',
        subject: subjectName,
        term: selectedTerm,
        year: selectedYear,
        boys: calculateMetrics([...boysGrades, ...unknownGrades]),
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

      const { generateResultsAnalysisPDF } = await import('@/services/pdf/resultsAnalysisPDFLib');
      
      const pdfBytes = await generateResultsAnalysisPDF(pdfData);

      const blob = new Blob([pdfBytes], { type: 'application/pdf' });

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
      alert('Failed to generate PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsDownloading(false);
    }
  };

  const hasAssignments = assignedClasses.length > 0;
  const hasData = studentSubjectAverages.size > 0;
  const hasExamsConfigured = configuredExamTypes.length > 0;
  const noExamsConfigured = hasAssignments && hasData === false && configuredExamTypes.length === 0;

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1, currentYear + 2];

  const clearFilters = () => {
    setSelectedClass('all');
    setSelectedSubject('all');
    setSelectedTerm('Term 1');
    setSelectedYear(new Date().getFullYear());
  };

  if (assignmentsLoading || isLoading || learnersLoading || loadingExamConfig) {
    return (
      <DashboardLayout activeTab="analysis">
        <div className="p-4 sm:p-6 lg:p-8">
          <Skeleton />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="analysis">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 tracking-tight">
              Results Analysis
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              {selectedClass === 'all' ? 'All classes' : assignedClasses.find(c => c.id === selectedClass)?.name}
              {selectedSubject !== 'all' && ` • ${selectedSubject}`}
              {isFetching && (
                <span className="inline-flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full text-xs ml-2">
                  <Loader2 size={10} className="animate-spin" />
                  updating
                </span>
              )}
              {hasExamsConfigured && (
                <span className="ml-2 text-xs text-blue-600">
                  (Based on {configuredExamTypes.length} configured exam{configuredExamTypes.length !== 1 ? 's' : ''})
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
              title="Download Results PDF"
            >
              {isDownloading ? (
                <Loader2 size={isMobile ? 18 : 16} className="animate-spin" />
              ) : (
                <Download size={isMobile ? 18 : 16} />
              )}
              {!isMobile && (isDownloading ? 'Generating...' : 'Download PDF')}
            </button>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className={`
                inline-flex items-center justify-center
                border border-gray-300 text-gray-700 rounded-lg sm:rounded-xl hover:bg-gray-50
                transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
                ${isMobile ? 'p-2.5' : 'px-4 py-2.5 gap-2'}
              `}
              title="Refresh data"
            >
              <RefreshCw size={isMobile ? 18 : 16} className={isFetching ? 'animate-spin' : ''} />
              {!isMobile && 'Refresh'}
            </button>
            
            {/* Debug toggle button */}
            {process.env.NODE_ENV === 'development' && (
              <button
                onClick={() => setShowDebug(!showDebug)}
                className={`p-2.5 border rounded-xl transition-colors ${
                  showDebug 
                    ? 'bg-blue-100 border-blue-300 text-blue-700' 
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
                title="Toggle Debug"
              >
                <Eye size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Empty State - No Assignments */}
        {!hasAssignments && <EmptyState hasAssignments={false} />}

        {/* Empty State - No Exams Configured */}
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
            
            {/* Mobile Filter Toggle */}
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

            {/* Filter Controls */}
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
                    {assignedClasses.map(cls => (
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
                    disabled={assignedSubjects.length === 0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="all">All Subjects</option>
                    {assignedSubjects.map(subject => (
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
                    {years.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {/* Exam Config Summary */}
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
              
              {/* Clear Filters */}
              {(selectedClass !== 'all' || selectedSubject !== 'all' || selectedTerm !== 'Term 1' || selectedYear !== currentYear) && (
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

        {/* Clean Square Stats Cards */}
        {hasAssignments && hasData && hasExamsConfigured && (
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <StatCard
              label="Quality"
              value={`${coreMetrics.qualityPass.percentage}%`}
              icon={Target}
              color="green"
              subtext={`${coreMetrics.qualityPass.count} of ${coreMetrics.qualityPass.total}`}
            />
            <StatCard
              label="Quantity"
              value={`${coreMetrics.quantityPass.percentage}%`}
              icon={Award}
              color="blue"
              subtext={`${coreMetrics.quantityPass.count} of ${coreMetrics.quantityPass.total}`}
            />
            <StatCard
              label="Fail"
              value={`${coreMetrics.fail.percentage}%`}
              icon={AlertCircle}
              color="red"
              subtext={`${coreMetrics.fail.count} of ${coreMetrics.fail.total}`}
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
                    Average of All Configured Tests • {gradeDistribution.reduce((sum, g) => sum + g.total, 0)} assessments
                    {configuredExamTypes.length > 0 && (
                      <span className="ml-2 text-blue-600">
                        (Based on {configuredExamTypes.length} exam{configuredExamTypes.length !== 1 ? 's' : ''})
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Mobile View - Clean Cards */}
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
                      <span className="text-base font-bold text-gray-900">{row.total}</span>
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
              /* Desktop View - Table */
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Grade
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Boys
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Girls
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Total
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        %
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {gradeDistribution.map((row) => (
                      <tr key={row.grade} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <GradeBadge grade={row.grade} />
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {row.description}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-medium text-blue-600">{row.boys}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-medium text-rose-600">{row.girls}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-semibold text-gray-900">{row.total}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600">{row.percentage}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900" colSpan={2}>
                        Total
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-blue-600">
                          {gradeDistribution.reduce((sum, row) => sum + row.boys, 0)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-rose-600">
                          {gradeDistribution.reduce((sum, row) => sum + row.girls, 0)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-gray-900">
                          {gradeDistribution.reduce((sum, row) => sum + row.total, 0)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-gray-900">100%</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Empty State - No Results */}
        {hasAssignments && !hasData && hasExamsConfigured && <EmptyState hasAssignments={true} />}

        {/* Footer Stats */}
        {hasAssignments && hasData && hasExamsConfigured && (
          <div className="text-xs text-gray-500 text-center sm:text-left pt-4 border-t border-gray-200">
            <span className="font-medium">Average of All Configured Tests</span>
            <span className="mx-2">•</span>
            {selectedTerm} {selectedYear}
            <span className="mx-2">•</span>
            {gradeDistribution.reduce((sum, g) => sum + g.total, 0)} assessments
            <span className="mx-2">•</span>
            <span className="text-green-600">Quality (1-2): {coreMetrics.qualityPass.percentage}%</span>
            <span className="mx-2">•</span>
            <span className="text-blue-600">Quantity (3-7): {coreMetrics.quantityPass.percentage}%</span>
            <span className="mx-2">•</span>
            <span className="text-rose-600">Fail (8-9): {coreMetrics.fail.percentage}%</span>
            <span className="mx-2">•</span>
            <span className="text-blue-600">♂ {gradeDistribution.reduce((sum, g) => sum + g.boys, 0)}</span>
            <span className="mx-1">/</span>
            <span className="text-rose-600">♀ {gradeDistribution.reduce((sum, g) => sum + g.girls, 0)}</span>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}