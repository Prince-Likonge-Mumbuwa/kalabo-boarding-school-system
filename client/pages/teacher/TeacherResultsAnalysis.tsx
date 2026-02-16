import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useMemo } from 'react';
import { useResultsAnalytics } from '@/hooks/useResults';
import { useAuth } from '@/hooks/useAuth';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { 
  Filter, Loader2, RefreshCw, TrendingUp, TrendingDown, 
  Download, Target, Users, Award, AlertCircle, ChevronDown,
  BarChart3, PieChart
} from 'lucide-react';

// ==================== IMPORT TYPES FROM SCHOOL ====================
import { 
  GradeDistribution as SchoolGradeDistribution,
  ClassPerformance as SchoolClassPerformance,
  SubjectPerformance as SchoolSubjectPerformance
} from '@/types/school';

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

// ==================== STAT CARD ====================
interface StatCardProps {
  label: string;
  value: string;
  sublabel: string;
  icon: React.ElementType;
  color: 'green' | 'blue' | 'red';
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  genderBreakdown?: { boys: number; girls: number; total: number };
  isMobile: boolean; // ADDED: Pass isMobile as prop
}

const StatCard = ({ 
  label, 
  value, 
  sublabel, 
  icon: Icon, 
  color, 
  trend, 
  trendValue, 
  genderBreakdown,
  isMobile // FIXED: Use prop instead of hook inside component
}: StatCardProps) => {
  
  const colors = {
    green: {
      bg: 'bg-gradient-to-br from-green-50 to-emerald-50',
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      value: 'text-green-600',
      border: 'border-green-200'
    },
    blue: {
      bg: 'bg-gradient-to-br from-blue-50 to-indigo-50',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      value: 'text-blue-600',
      border: 'border-blue-200'
    },
    red: {
      bg: 'bg-gradient-to-br from-red-50 to-orange-50',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      value: 'text-red-600',
      border: 'border-red-200'
    }
  };

  const style = colors[color];

  return (
    <div className={`
      bg-white rounded-xl border ${style.border} p-4 sm:p-5
      hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5
    `}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">
            {label}
          </p>
          <div className="flex items-baseline gap-1">
            <p className={`text-2xl sm:text-3xl lg:text-4xl font-bold ${style.value}`}>
              {value}
            </p>
            {trend && trendValue && (
              <div className="flex items-center gap-0.5 ml-1">
                {trend === 'up' && <TrendingUp size={12} className="text-green-500" />}
                {trend === 'down' && <TrendingDown size={12} className="text-red-500" />}
                <span className="text-[10px] sm:text-xs text-gray-500">{trendValue}</span>
              </div>
            )}
          </div>
          
          {genderBreakdown && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] sm:text-xs text-blue-600">♂ {genderBreakdown.boys}</span>
              <span className="text-[10px] sm:text-xs text-pink-600">♀ {genderBreakdown.girls}</span>
              <span className="text-[10px] sm:text-xs text-gray-500">∑ {genderBreakdown.total}</span>
            </div>
          )}
          
          <p className="text-[10px] sm:text-xs text-gray-500 mt-1 truncate">
            {sublabel}
          </p>
        </div>
        <div className={`p-2 sm:p-2.5 rounded-lg flex-shrink-0 ${style.iconBg}`}>
          <Icon size={isMobile ? 18 : 20} className={style.iconColor} />
        </div>
      </div>
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
const GradeDistributionChart = ({ data, viewMode, onToggleView }: { 
  data: LocalGradeDistribution[]; 
  viewMode: 'detailed' | 'simple';
  onToggleView: () => void;
}) => {
  const maxValue = Math.max(...data.map(d => viewMode === 'detailed' 
    ? Math.max(d.boys, d.girls) 
    : d.total
  ));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Grade Distribution</h3>
          <p className="text-sm text-gray-600 mt-1">
            {viewMode === 'detailed' 
              ? 'Boys vs Girls by Grade' 
              : 'Total Students by Grade'}
          </p>
        </div>
        <button
          onClick={onToggleView}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          {viewMode === 'detailed' ? (
            <>
              <BarChart3 size={16} />
              <span>Show Totals</span>
            </>
          ) : (
            <>
              <PieChart size={16} />
              <span>Show Gender Split</span>
            </>
          )}
        </button>
      </div>

      <div className="relative h-80">
        <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col justify-between text-xs text-gray-500">
          <span>{maxValue}</span>
          <span>{Math.round(maxValue * 0.75)}</span>
          <span>{Math.round(maxValue * 0.5)}</span>
          <span>{Math.round(maxValue * 0.25)}</span>
          <span>0</span>
        </div>

        <div className="absolute left-16 right-0 top-0 bottom-0">
          <div className="flex items-end justify-around h-full">
            {data.map((item) => (
              <div key={item.grade} className="flex flex-col items-center w-16">
                <div className="flex gap-1 w-full justify-center mb-2">
                  {viewMode === 'detailed' ? (
                    <>
                      {item.boys > 0 && (
                        <div className="flex flex-col items-center group">
                          <div className="relative">
                            <div 
                              className="w-6 bg-blue-500 rounded-t transition-all duration-500 hover:bg-blue-600"
                              style={{ height: `${(item.boys / maxValue) * 200}px`, minHeight: '4px' }}
                            />
                            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                              Boys: {item.boys}
                            </div>
                          </div>
                          <span className="text-xs text-blue-600 mt-1">B</span>
                        </div>
                      )}
                      
                      {item.girls > 0 && (
                        <div className="flex flex-col items-center group">
                          <div className="relative">
                            <div 
                              className="w-6 bg-rose-500 rounded-t transition-all duration-500 hover:bg-rose-600"
                              style={{ height: `${(item.girls / maxValue) * 200}px`, minHeight: '4px' }}
                            />
                            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                              Girls: {item.girls}
                            </div>
                          </div>
                          <span className="text-xs text-rose-600 mt-1">G</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center group w-full">
                      <div className="relative w-full">
                        <div 
                          className="w-full bg-indigo-500 rounded-t transition-all duration-500 hover:bg-indigo-600"
                          style={{ height: `${(item.total / maxValue) * 200}px`, minHeight: '4px' }}
                        >
                          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs rounded px-2 py-1">
                            Total: {item.total}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <GradeBadge grade={item.grade} />
                <span className="text-xs text-gray-500 mt-1">
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

      <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-blue-500 rounded"></span>
            <span className="text-gray-600">Boys</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-rose-500 rounded"></span>
            <span className="text-gray-600">Girls</span>
          </div>
        </div>
        <p className="text-gray-500">
          Total Students: {data.reduce((sum, d) => sum + d.total, 0)}
        </p>
      </div>
    </div>
  );
};

// ==================== EMPTY STATE ====================
const EmptyState = ({ hasAssignments }: { hasAssignments: boolean }) => {
  if (!hasAssignments) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 sm:p-12 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-full mb-5">
          <Users className="text-yellow-600" size={32} />
        </div>
        <h3 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">
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
      <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-full mb-5">
        <Target className="text-blue-500" size={32} />
      </div>
      <h3 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">
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
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="h-3 bg-gray-200 rounded w-16 mb-2"></div>
              <div className="h-6 sm:h-7 bg-gray-300 rounded w-12"></div>
            </div>
            <div className="p-2 bg-gray-100 rounded-lg">
              <div className="w-4 h-4 sm:w-5 sm:h-5 bg-gray-300 rounded"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
    <div className="bg-white rounded-xl border border-gray-200 p-6">
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
  
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedTerm, setSelectedTerm] = useState('Term 1');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const { assignments, isLoading: assignmentsLoading } = useTeacherAssignments(user?.id || '');
  const { learners, isLoading: learnersLoading } = useSchoolLearners();

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

  const studentGenderMap = useMemo(() => {
    const map = new Map<string, 'male' | 'female'>();
    learners.forEach(learner => {
      if (learner.gender) {
        map.set(learner.studentId, learner.gender);
      }
    });
    return map;
  }, [learners]);

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

  const gradeDistribution = useMemo((): LocalGradeDistribution[] => {
    if (!results || results.length === 0) return [];

    const endOfTermResults = results.filter(r => r.examType === 'endOfTerm' && r.grade > 0);
    
    const gradeMap = new Map<number, { boys: number; girls: number }>();
    
    for (let i = 1; i <= 9; i++) {
      gradeMap.set(i, { boys: 0, girls: 0 });
    }

    endOfTermResults.forEach(result => {
      const current = gradeMap.get(result.grade) || { boys: 0, girls: 0 };
      const gender = studentGenderMap.get(result.studentId);
      
      if (gender === 'male') {
        gradeMap.set(result.grade, { ...current, boys: current.boys + 1 });
      } else if (gender === 'female') {
        gradeMap.set(result.grade, { ...current, girls: current.girls + 1 });
      }
    });

    const total = endOfTermResults.length;

    const getShortDescription = (grade: number): string => {
      if (grade <= 2) return 'Dist';
      if (grade <= 4) return 'Merit';
      if (grade <= 6) return 'Credit';
      if (grade <= 8) return 'Satis';
      return 'Fail';
    };

    return Array.from(gradeMap.entries())
      .map(([grade, counts]) => ({
        grade,
        boys: counts.boys,
        girls: counts.girls,
        total: counts.boys + counts.girls,
        percentage: total > 0 ? Math.round(((counts.boys + counts.girls) / total) * 100) : 0,
        description: getShortDescription(grade)
      }))
      .filter(g => g.total > 0)
      .sort((a, b) => a.grade - b.grade);
  }, [results, studentGenderMap]);

  const classPerformance = useMemo((): LocalClassPerformance[] => {
    if (!results || results.length === 0 || !assignments) return [];

    const classMap = new Map<string, typeof results>();
    
    results.forEach(result => {
      if (!classMap.has(result.classId)) {
        classMap.set(result.classId, []);
      }
      classMap.get(result.classId)!.push(result);
    });

    return Array.from(classMap.entries()).map(([classId, classResults]) => {
      const endOfTermResults = classResults.filter(r => r.examType === 'endOfTerm' && r.grade > 0);
      const total = endOfTermResults.length;
      const className = assignments.find(a => a.classId === classId)?.className || classId;

      const gradeMap = new Map<number, { boys: number; girls: number }>();
      for (let i = 1; i <= 9; i++) gradeMap.set(i, { boys: 0, girls: 0 });
      
      endOfTermResults.forEach(result => {
        const current = gradeMap.get(result.grade)!;
        const gender = studentGenderMap.get(result.studentId);
        
        if (gender === 'male') {
          gradeMap.set(result.grade, { ...current, boys: current.boys + 1 });
        } else if (gender === 'female') {
          gradeMap.set(result.grade, { ...current, girls: current.girls + 1 });
        }
      });

      const gradeDistribution = Array.from(gradeMap.entries())
        .map(([grade, counts]) => ({
          grade,
          boys: counts.boys,
          girls: counts.girls,
          total: counts.boys + counts.girls,
          percentage: total > 0 ? Math.round(((counts.boys + counts.girls) / total) * 100) : 0,
          description: grade <= 2 ? 'Dist' : grade <= 4 ? 'Merit' : grade <= 6 ? 'Credit' : grade <= 8 ? 'Satis' : 'Fail'
        }))
        .filter(g => g.total > 0);

      const qualityBoys = endOfTermResults.filter(r => r.grade <= 6 && studentGenderMap.get(r.studentId) === 'male').length;
      const qualityGirls = endOfTermResults.filter(r => r.grade <= 6 && studentGenderMap.get(r.studentId) === 'female').length;
      const quantityBoys = endOfTermResults.filter(r => r.grade <= 8 && studentGenderMap.get(r.studentId) === 'male').length;
      const quantityGirls = endOfTermResults.filter(r => r.grade <= 8 && studentGenderMap.get(r.studentId) === 'female').length;
      const failBoys = endOfTermResults.filter(r => r.grade === 9 && studentGenderMap.get(r.studentId) === 'male').length;
      const failGirls = endOfTermResults.filter(r => r.grade === 9 && studentGenderMap.get(r.studentId) === 'female').length;

      const qualityCount = qualityBoys + qualityGirls;
      const quantityCount = quantityBoys + quantityGirls;
      const failCount = failBoys + failGirls;

      return {
        classId,
        className,
        candidates: {
          boys: qualityBoys + quantityBoys + failBoys,
          girls: qualityGirls + quantityGirls + failGirls,
          total: endOfTermResults.length
        },
        sat: {
          boys: endOfTermResults.filter(r => studentGenderMap.get(r.studentId) === 'male').length,
          girls: endOfTermResults.filter(r => studentGenderMap.get(r.studentId) === 'female').length,
          total: endOfTermResults.length
        },
        gradeDistribution,
        performance: {
          quality: {
            boys: qualityBoys,
            girls: qualityGirls,
            total: qualityCount,
            percentage: total > 0 ? Math.round((qualityCount / total) * 100) : 0
          },
          quantity: {
            boys: quantityBoys,
            girls: quantityGirls,
            total: quantityCount,
            percentage: total > 0 ? Math.round((quantityCount / total) * 100) : 0
          },
          fail: {
            boys: failBoys,
            girls: failGirls,
            total: failCount,
            percentage: total > 0 ? Math.round((failCount / total) * 100) : 0
          }
        }
      };
    });
  }, [results, assignments, studentGenderMap]);

  const coreMetrics = useMemo(() => {
    if (!results || results.length === 0) {
      return {
        qualityPass: { percentage: 0, count: 0, total: 0, boys: 0, girls: 0 },
        quantityPass: { percentage: 0, count: 0, total: 0, boys: 0, girls: 0 },
        fail: { percentage: 0, count: 0, total: 0, boys: 0, girls: 0 }
      };
    }

    const endOfTermResults = results.filter(r => r.examType === 'endOfTerm' && r.grade > 0);
    const total = endOfTermResults.length;

    const qualityPass = endOfTermResults.filter(r => r.grade <= 6);
    const quantityPass = endOfTermResults.filter(r => r.grade <= 8);
    const fail = endOfTermResults.filter(r => r.grade === 9);

    const qualityBoys = qualityPass.filter(r => studentGenderMap.get(r.studentId) === 'male').length;
    const qualityGirls = qualityPass.filter(r => studentGenderMap.get(r.studentId) === 'female').length;
    const quantityBoys = quantityPass.filter(r => studentGenderMap.get(r.studentId) === 'male').length;
    const quantityGirls = quantityPass.filter(r => studentGenderMap.get(r.studentId) === 'female').length;
    const failBoys = fail.filter(r => studentGenderMap.get(r.studentId) === 'male').length;
    const failGirls = fail.filter(r => studentGenderMap.get(r.studentId) === 'female').length;

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
  }, [results, studentGenderMap]);

  const trends = useMemo(() => {
    return {
      qualityPass: 'up' as const,
      quantityPass: 'up' as const,
      fail: 'down' as const
    };
  }, []);

  // ==================== PDF EXPORT - FIXED WITH DYNAMIC IMPORTS ====================
  const handlePDFExport = async () => {
    try {
      if (!results || results.length === 0) {
        alert('No data to export');
        return;
      }

      // Helper function to get proper passStatus type
      const getPassStatus = (grade: number): 'distinction' | 'merit' | 'credit' | 'satisfactory' | 'fail' => {
        if (grade <= 2) return 'distinction';
        if (grade <= 4) return 'merit';
        if (grade <= 6) return 'credit';
        if (grade <= 8) return 'satisfactory';
        return 'fail';
      };

      // Transform to match SchoolClassPerformance type exactly
      const pdfClassPerformance: SchoolClassPerformance[] = classPerformance.map(cls => ({
        classId: cls.classId,
        className: cls.className,
        candidates: {
          boys: cls.candidates.boys,
          girls: cls.candidates.girls,
          total: cls.candidates.total
        },
        sat: {
          boys: cls.sat.boys,
          girls: cls.sat.girls,
          total: cls.sat.total
        },
        gradeDistribution: cls.gradeDistribution.map(g => ({
          grade: g.grade,
          boys: g.boys,
          girls: g.girls,
          total: g.total,
          percentage: g.percentage,
          passStatus: getPassStatus(g.grade)
        })),
        performance: {
          quality: {
            boys: cls.performance.quality.boys,
            girls: cls.performance.quality.girls,
            total: cls.performance.quality.total,
            percentage: cls.performance.quality.percentage
          },
          quantity: {
            boys: cls.performance.quantity.boys,
            girls: cls.performance.quantity.girls,
            total: cls.performance.quantity.total,
            percentage: cls.performance.quantity.percentage
          },
          fail: {
            boys: cls.performance.fail.boys,
            girls: cls.performance.fail.girls,
            total: cls.performance.fail.total,
            percentage: cls.performance.fail.percentage
          }
        },
        subjectPerformance: [] // Optional field
      }));

      const pdfData = {
        teacherName: user?.name || 'Teacher',
        subjects: selectedSubject !== 'all' ? [selectedSubject] : assignedSubjects.map(s => s.name),
        classes: pdfClassPerformance,
        term: selectedTerm,
        year: selectedYear,
        generatedDate: new Date().toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      };

      // FIXED: Dynamically import the PDF generator and await the result
      const { generateTeacherResultsPDF } = await import('@/services/pdf/teacherResultsPDF');
      
      // FIXED: Await the PDF generation (now async)
      const docDefinition = await generateTeacherResultsPDF(pdfData);
      
      // FIXED: Dynamically import pdfMake for download
      const pdfMake = (await import('pdfmake/build/pdfmake')).default;
      
      // Create filename and download
      const fileName = `Teacher_${user?.name?.replace(/\s+/g, '_')}_${selectedTerm}_${selectedYear}.pdf`;
      pdfMake.createPdf(docDefinition).download(fileName);

    } catch (error) {
      console.error('PDF Generation Error:', error);
      alert('Failed to generate PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const hasAssignments = assignedClasses.length > 0;
  const hasData = results && results.length > 0;

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1, currentYear + 2];

  const clearFilters = () => {
    setSelectedClass('all');
    setSelectedSubject('all');
    setSelectedTerm('Term 1');
    setSelectedYear(new Date().getFullYear());
  };

  if (assignmentsLoading || isLoading || learnersLoading) {
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
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              Results Analysis
            </h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">
              {selectedClass === 'all' ? 'All classes' : assignedClasses.find(c => c.id === selectedClass)?.name}
              {selectedSubject !== 'all' && ` • ${selectedSubject}`}
              {isFetching && (
                <span className="inline-flex items-center gap-1.5 text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full text-xs ml-2">
                  <Loader2 size={12} className="animate-spin" />
                  updating
                </span>
              )}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handlePDFExport}
              disabled={!hasData}
              className={`
                inline-flex items-center justify-center
                bg-blue-600 text-white rounded-xl hover:bg-blue-700
                transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
                ${isMobile ? 'p-2.5' : 'px-4 py-2.5 gap-2'}
              `}
              title="Export PDF"
            >
              <Download size={isMobile ? 18 : 16} />
              {!isMobile && 'Export PDF'}
            </button>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className={`
                inline-flex items-center justify-center
                border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50
                transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
                ${isMobile ? 'p-2.5' : 'px-4 py-2.5 gap-2'}
              `}
              title="Refresh data"
            >
              <RefreshCw size={isMobile ? 18 : 16} className={isFetching ? 'animate-spin' : ''} />
              {!isMobile && 'Refresh'}
            </button>
          </div>
        </div>

        {!hasAssignments && <EmptyState hasAssignments={false} />}

        {hasAssignments && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            
            {isMobile && (
              <button
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                className="w-full flex items-center justify-between p-4 bg-white"
              >
                <div className="flex items-center gap-2">
                  <Filter size={18} className="text-gray-400" />
                  <span className="font-medium text-gray-700">
                    {selectedClass !== 'all' || selectedSubject !== 'all' ? 'Filters active' : 'Filter results'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {(selectedClass !== 'all' || selectedSubject !== 'all') && (
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  )}
                  <ChevronDown 
                    size={18} 
                    className={`text-gray-500 transition-transform ${showMobileFilters ? 'rotate-180' : ''}`} 
                  />
                </div>
              </button>
            )}

            <div className={`
              p-4 sm:p-5
              ${isMobile && !showMobileFilters ? 'hidden' : 'block'}
            `}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Class
                  </label>
                  <select
                    value={selectedClass}
                    onChange={e => {
                      setSelectedClass(e.target.value);
                      setSelectedSubject('all');
                    }}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             text-sm bg-white hover:border-gray-400 transition-colors"
                  >
                    <option value="all">All Classes</option>
                    {assignedClasses.map(cls => (
                      <option key={cls.id} value={cls.id}>{cls.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Subject
                  </label>
                  <select
                    value={selectedSubject}
                    onChange={e => setSelectedSubject(e.target.value)}
                    disabled={assignedSubjects.length === 0}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             text-sm bg-white hover:border-gray-400 transition-colors
                             disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="all">All Subjects</option>
                    {assignedSubjects.map(subject => (
                      <option key={subject.id} value={subject.id}>{subject.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Term
                  </label>
                  <select
                    value={selectedTerm}
                    onChange={e => setSelectedTerm(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             text-sm bg-white hover:border-gray-400 transition-colors"
                  >
                    <option value="Term 1">Term 1</option>
                    <option value="Term 2">Term 2</option>
                    <option value="Term 3">Term 3</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Year
                  </label>
                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             text-sm bg-white hover:border-gray-400 transition-colors"
                  >
                    {years.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {(selectedClass !== 'all' || selectedSubject !== 'all' || selectedTerm !== 'Term 1' || selectedYear !== currentYear) && (
                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
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

        {hasAssignments && hasData && (
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <StatCard
              label="Quality Pass"
              value={`${coreMetrics.qualityPass.percentage}%`}
              sublabel={`Grades 1-6`}
              icon={Target}
              color="green"
              trend={trends.qualityPass}
              trendValue="+3%"
              genderBreakdown={{
                boys: coreMetrics.qualityPass.boys,
                girls: coreMetrics.qualityPass.girls,
                total: coreMetrics.qualityPass.count
              }}
              isMobile={isMobile} // FIXED: Pass isMobile prop
            />
            <StatCard
              label="Quantity Pass"
              value={`${coreMetrics.quantityPass.percentage}%`}
              sublabel={`Grades 1-8`}
              icon={Award}
              color="blue"
              trend={trends.quantityPass}
              trendValue="+2%"
              genderBreakdown={{
                boys: coreMetrics.quantityPass.boys,
                girls: coreMetrics.quantityPass.girls,
                total: coreMetrics.quantityPass.count
              }}
              isMobile={isMobile} // FIXED: Pass isMobile prop
            />
            <StatCard
              label="Fail"
              value={`${coreMetrics.fail.percentage}%`}
              sublabel={`Grade 9`}
              icon={AlertCircle}
              color="red"
              trend={trends.fail}
              trendValue="-5%"
              genderBreakdown={{
                boys: coreMetrics.fail.boys,
                girls: coreMetrics.fail.girls,
                total: coreMetrics.fail.count
              }}
              isMobile={isMobile} // FIXED: Pass isMobile prop
            />
          </div>
        )}

        {hasAssignments && hasData && gradeDistribution.length > 0 && (
          <GradeDistributionChart
            data={gradeDistribution}
            viewMode={chartViewMode}
            onToggleView={() => setChartViewMode(prev => prev === 'detailed' ? 'simple' : 'detailed')}
          />
        )}

        {hasAssignments && hasData && gradeDistribution.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            
            <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm sm:text-base">
                    Grade Distribution Details
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                    End of Term • {gradeDistribution.reduce((sum, g) => sum + g.total, 0)} assessments
                  </p>
                </div>
              </div>
            </div>

            {isMobile ? (
              <div className="divide-y divide-gray-100">
                {gradeDistribution.map((row) => (
                  <div key={row.grade} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <GradeBadge grade={row.grade} />
                        <span className="text-sm font-medium text-gray-700">
                          {row.description}
                        </span>
                      </div>
                      <span className="text-lg font-bold text-gray-900">{row.total}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                        <span className="text-gray-600">Boys: {row.boys}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-rose-500 rounded-full"></span>
                        <span className="text-gray-600">Girls: {row.girls}</span>
                      </div>
                      <span className="text-gray-500">{row.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
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

        {hasAssignments && !hasData && <EmptyState hasAssignments={true} />}

        {hasAssignments && hasData && (
          <div className="text-xs text-gray-500 text-center sm:text-left pt-4 border-t border-gray-200">
            <span className="font-medium">End of Term Results</span>
            <span className="mx-2">•</span>
            {selectedTerm} {selectedYear}
            <span className="mx-2">•</span>
            {gradeDistribution.reduce((sum, g) => sum + g.total, 0)} assessments
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