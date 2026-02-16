import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useMemo, useEffect } from 'react';
import { useResultsAnalytics } from '@/hooks/useResults';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useAuth } from '@/hooks/useAuth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  Filter,
  TrendingUp,
  TrendingDown,
  Download,
  BarChart3,
  PieChart,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  GraduationCap,
  Users,
  Target,
  School,
  BookOpen,
  Eye,
  FileText
} from 'lucide-react';

// ==================== TYPES ====================
interface GradeDistribution {
  grade: number;
  boys: number;
  girls: number;
  total: number;
  percentage: number;
  passStatus: 'distinction' | 'merit' | 'credit' | 'satisfactory' | 'fail';
}

interface ClassPerformance {
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
  gradeDistribution: GradeDistribution[];
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
  subjectPerformance?: Array<{
    subject: string;
    teacher: string;
    quality: number;
    quantity: number;
    fail: number;
  }>;
}

interface SubjectPerformance {
  subject: string;
  teacher: string;
  classCount: number;
  studentCount: number;
  averageGrade: number;
  qualityRate: number;
  quantityRate: number;
  failRate: number;
}

// ==================== NOTIFICATION COMPONENT ====================
const Notification = ({ 
  type, 
  message, 
  description, 
  onClose 
}: { 
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  description?: string;
  onClose: () => void;
}) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-green-500" />,
    error: <XCircle className="w-5 h-5 text-red-500" />,
    info: <AlertCircle className="w-5 h-5 text-blue-500" />,
    warning: <AlertCircle className="w-5 h-5 text-yellow-500" />
  };

  const bgColors = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    info: 'bg-blue-50 border-blue-200',
    warning: 'bg-yellow-50 border-yellow-200'
  };

  return (
    <div className={`fixed top-4 right-4 z-50 max-w-md w-full rounded-xl border p-4 shadow-lg animate-in slide-in-from-top-2 duration-300 ${bgColors[type]}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {icons[type]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{message}</p>
          {description && (
            <p className="text-xs text-gray-600 mt-1">{description}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 ml-2 p-1 hover:bg-white/50 rounded-lg transition-colors"
        >
          <XCircle size={16} className="text-gray-400 hover:text-gray-600" />
        </button>
      </div>
    </div>
  );
};

// ==================== STAT CARD COMPONENT ====================
const StatCard = ({ 
  title, 
  value, 
  subValue, 
  icon: Icon, 
  trend,
  color = 'blue'
}: { 
  title: string;
  value: string;
  subValue: string;
  icon: React.ElementType;
  trend?: { value: string; direction: 'up' | 'down' | 'stable' };
  color?: 'blue' | 'green' | 'amber' | 'rose' | 'purple';
}) => {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200'
  };

  const trendColors = {
    up: 'text-green-600',
    down: 'text-rose-600',
    stable: 'text-gray-600'
  };

  return (
    <div className={`rounded-xl border p-5 ${colors[color]} transition-all hover:shadow-md`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium opacity-80">{title}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          <p className="text-xs mt-1 opacity-70">{subValue}</p>
        </div>
        <div className="p-3 bg-white/50 rounded-lg">
          <Icon size={24} className="opacity-80" />
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          {trend.direction === 'up' && <TrendingUp size={14} className={trendColors.up} />}
          {trend.direction === 'down' && <TrendingDown size={14} className={trendColors.down} />}
          {trend.direction === 'stable' && <span className="w-3 h-3 rounded-full bg-gray-400"></span>}
          <span className={trendColors[trend.direction]}>{trend.value}</span>
          <span className="opacity-60">vs last term</span>
        </div>
      )}
    </div>
  );
};

// ==================== GRADE BADGE ====================
const GradeBadge = ({ grade, size = 'md', showLabel = false }: { grade: number; size?: 'sm' | 'md' | 'lg'; showLabel?: boolean }) => {
  const getGradeInfo = (grade: number) => {
    if (grade <= 2) return { color: 'bg-emerald-500', label: 'Distinction' };
    if (grade <= 4) return { color: 'bg-blue-500', label: 'Merit' };
    if (grade <= 6) return { color: 'bg-amber-500', label: 'Credit' };
    if (grade <= 8) return { color: 'bg-orange-500', label: 'Satisfactory' };
    return { color: 'bg-rose-500', label: 'Fail' };
  };

  const { color, label } = getGradeInfo(grade);
  
  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-2 text-base'
  };

  return (
    <div className="flex items-center gap-2">
      <span className={`${sizes[size]} ${color} text-white font-bold rounded-lg shadow-sm inline-block`}>
        {grade}
      </span>
      {showLabel && <span className="text-xs text-gray-600">{label}</span>}
    </div>
  );
};

// ==================== CLASS COMPARISON CHART ====================
const ClassComparisonChart = ({ data }: { data: ClassPerformance[] }) => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Class Performance Comparison</h3>
      
      <div className="space-y-4">
        {data.map((cls) => (
          <div key={cls.classId} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">{cls.className}</span>
              <span className="text-xs text-gray-500">{cls.candidates.total} students</span>
            </div>
            
            {/* Stacked Bar */}
            <div className="flex h-8 rounded-lg overflow-hidden">
              {/* Quality Pass (1-6) */}
              <div 
                className="bg-emerald-500 flex items-center justify-center text-xs text-white font-medium"
                style={{ width: `${cls.performance.quality.percentage}%` }}
              >
                {cls.performance.quality.percentage > 8 && `${cls.performance.quality.percentage}%`}
              </div>
              
              {/* Quantity Only (7-8) */}
              <div 
                className="bg-orange-400 flex items-center justify-center text-xs text-white font-medium"
                style={{ width: `${cls.performance.quantity.percentage - cls.performance.quality.percentage}%` }}
              >
                {cls.performance.quantity.percentage - cls.performance.quality.percentage > 8 && 
                  `${cls.performance.quantity.percentage - cls.performance.quality.percentage}%`}
              </div>
              
              {/* Fail (9) */}
              <div 
                className="bg-rose-500 flex items-center justify-center text-xs text-white font-medium"
                style={{ width: `${cls.performance.fail.percentage}%` }}
              >
                {cls.performance.fail.percentage > 5 && `${cls.performance.fail.percentage}%`}
              </div>
            </div>
            
            {/* Legend for this row */}
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-emerald-500 rounded"></span>
                <span>Quality: {cls.performance.quality.percentage}%</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-orange-400 rounded"></span>
                <span>Pass: {cls.performance.quantity.percentage - cls.performance.quality.percentage}%</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-rose-500 rounded"></span>
                <span>Fail: {cls.performance.fail.percentage}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==================== SUBJECT PERFORMANCE CHART ====================
const SubjectPerformanceChart = ({ data }: { data: SubjectPerformance[] }) => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Subject Performance Matrix</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {data.slice(0, 6).map((subject) => (
          <div key={subject.subject} className="border border-gray-100 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="font-semibold text-gray-900">{subject.subject}</span>
                <span className="text-xs text-gray-500 ml-2">({subject.teacher})</span>
              </div>
              <span className="text-xs bg-gray-100 px-2 py-1 rounded-full">
                {subject.classCount} classes
              </span>
            </div>
            
            {/* Three metrics in a row */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="text-center p-2 bg-emerald-50 rounded-lg">
                <div className="text-xs text-gray-600">Quality</div>
                <div className="text-lg font-bold text-emerald-600">{subject.qualityRate}%</div>
              </div>
              <div className="text-center p-2 bg-blue-50 rounded-lg">
                <div className="text-xs text-gray-600">Quantity</div>
                <div className="text-lg font-bold text-blue-600">{subject.quantityRate}%</div>
              </div>
              <div className="text-center p-2 bg-rose-50 rounded-lg">
                <div className="text-xs text-gray-600">Fail</div>
                <div className="text-lg font-bold text-rose-600">{subject.failRate}%</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==================== SKELETON COMPONENTS ====================
const MetricSkeleton = () => (
  <div className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse">
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
        <div className="h-8 bg-gray-300 rounded w-16"></div>
      </div>
      <div className="p-3 bg-gray-100 rounded-xl">
        <div className="w-6 h-6 bg-gray-300 rounded"></div>
      </div>
    </div>
    <div className="h-2 bg-gray-200 rounded w-32 mt-4"></div>
  </div>
);

const ChartSkeleton = () => (
  <div className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse">
    <div className="flex items-center justify-between mb-6">
      <div>
        <div className="h-5 bg-gray-200 rounded w-48 mb-2"></div>
        <div className="h-3 bg-gray-100 rounded w-64"></div>
      </div>
      <div className="h-9 bg-gray-200 rounded w-28"></div>
    </div>
    <div className="h-80 bg-gray-100 rounded-xl"></div>
  </div>
);

// ==================== MAIN COMPONENT ====================
export default function AdminResultsAnalysis() {
  const { user } = useAuth();
  const isUserAdmin = user?.userType === 'admin';
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  // State for notifications
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
    description?: string;
  }>>([]);

  // State for filters
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedTerm, setSelectedTerm] = useState<string>('Term 1');
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Get classes for filter
  const { classes, isLoading: classesLoading } = useSchoolClasses({ isActive: true });

  // Get all learners for gender data
  const { learners, isLoading: learnersLoading } = useSchoolLearners();

  // Use the analytics hook with real data
  const { 
    analytics, 
    results, 
    isLoading, 
    isFetching, 
    refetch 
  } = useResultsAnalytics({
    classId: selectedClass !== 'all' ? selectedClass : undefined,
    term: selectedTerm,
    year: selectedYear,
  });

  // Create a map of studentId -> gender for quick lookup
  const studentGenderMap = useMemo(() => {
    const map = new Map<string, 'M' | 'F'>();
    learners.forEach(learner => {
      if (learner.gender) {
        map.set(learner.studentId, learner.gender === 'male' ? 'M' : 'F');
      }
    });
    return map;
  }, [learners]);

  // Notification helper
  const showNotification = (
    type: 'success' | 'error' | 'info' | 'warning',
    message: string,
    description?: string
  ) => {
    const id = Math.random().toString(36).substring(7);
    setNotifications(prev => [...prev, { id, type, message, description }]);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Calculate grade distribution with gender breakdown
  const gradeDistribution = useMemo((): GradeDistribution[] => {
    if (!results || results.length === 0) return [];

    const endOfTermResults = results.filter(r => 
      r.examType === 'endOfTerm' && r.grade > 0
    );

    if (endOfTermResults.length === 0) return [];

    const gradeMap = new Map<number, { boys: number; girls: number }>();
    
    // Initialize grades 1-9
    for (let i = 1; i <= 9; i++) {
      gradeMap.set(i, { boys: 0, girls: 0 });
    }

    // Count boys and girls per grade using the studentGenderMap
    endOfTermResults.forEach(result => {
      const current = gradeMap.get(result.grade) || { boys: 0, girls: 0 };
      const gender = studentGenderMap.get(result.studentId);
      
      if (gender === 'M') {
        gradeMap.set(result.grade, { ...current, boys: current.boys + 1 });
      } else if (gender === 'F') {
        gradeMap.set(result.grade, { ...current, girls: current.girls + 1 });
      }
      // If gender is undefined, we don't count it in boys/girls
    });

    const total = endOfTermResults.length;

    const getPassStatus = (grade: number): 'distinction' | 'merit' | 'credit' | 'satisfactory' | 'fail' => {
      if (grade <= 2) return 'distinction';
      if (grade <= 4) return 'merit';
      if (grade <= 6) return 'credit';
      if (grade <= 8) return 'satisfactory';
      return 'fail';
    };

    return Array.from(gradeMap.entries())
      .map(([grade, counts]) => ({
        grade,
        boys: counts.boys,
        girls: counts.girls,
        total: counts.boys + counts.girls,
        percentage: total > 0 ? Math.round(((counts.boys + counts.girls) / total) * 100) : 0,
        passStatus: getPassStatus(grade)
      }))
      .filter(g => g.total > 0);
  }, [results, studentGenderMap]);

  // Calculate school-wide metrics
  const schoolMetrics = useMemo(() => {
    if (!analytics || !results) {
      return {
        totalStudents: 0,
        totalAssessments: 0,
        averageScore: 0,
        passRate: 0,
        failRate: 0,
        distinctionRate: 0,
        classesCount: classes?.length || 0,
        subjectsCount: 0
      };
    }

    const endOfTermResults = results.filter(r => r.examType === 'endOfTerm');
    const totalAssessments = endOfTermResults.length;
    
    const distinctionCount = endOfTermResults.filter(r => r.grade <= 2).length;
    const passCount = endOfTermResults.filter(r => r.grade <= 6).length;
    const failCount = endOfTermResults.filter(r => r.grade >= 7).length;
    
    const uniqueStudents = new Set(endOfTermResults.map(r => r.studentId)).size;
    const uniqueSubjects = new Set(endOfTermResults.map(r => r.subjectId)).size;

    return {
      totalStudents: uniqueStudents,
      totalAssessments,
      averageScore: analytics.averagePercentage || 0,
      passRate: totalAssessments > 0 ? Math.round((passCount / totalAssessments) * 100) : 0,
      failRate: totalAssessments > 0 ? Math.round((failCount / totalAssessments) * 100) : 0,
      distinctionRate: totalAssessments > 0 ? Math.round((distinctionCount / totalAssessments) * 100) : 0,
      classesCount: classes?.length || 0,
      subjectsCount: uniqueSubjects
    };
  }, [analytics, results, classes]);

  // Calculate class-level performance
  const classPerformance = useMemo((): ClassPerformance[] => {
    if (!results || results.length === 0 || !classes) return [];

    // Group results by class
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

      // Grade distribution for this class
      const gradeMap = new Map<number, { boys: number; girls: number }>();
      for (let i = 1; i <= 9; i++) gradeMap.set(i, { boys: 0, girls: 0 });
      
      endOfTermResults.forEach(result => {
        const current = gradeMap.get(result.grade)!;
        const gender = studentGenderMap.get(result.studentId);
        
        if (gender === 'M') {
          gradeMap.set(result.grade, { ...current, boys: current.boys + 1 });
        } else if (gender === 'F') {
          gradeMap.set(result.grade, { ...current, girls: current.girls + 1 });
        }
      });

      const gradeDistribution = Array.from(gradeMap.entries())
        .map(([grade, counts]) => {
          let passStatus: 'distinction' | 'merit' | 'credit' | 'satisfactory' | 'fail';
          if (grade <= 2) passStatus = 'distinction';
          else if (grade <= 4) passStatus = 'merit';
          else if (grade <= 6) passStatus = 'credit';
          else if (grade <= 8) passStatus = 'satisfactory';
          else passStatus = 'fail';
          
          return {
            grade,
            boys: counts.boys,
            girls: counts.girls,
            total: counts.boys + counts.girls,
            percentage: total > 0 ? Math.round(((counts.boys + counts.girls) / total) * 100) : 0,
            passStatus
          };
        })
        .filter(g => g.total > 0);

      // Performance metrics with gender breakdown
      const qualityBoys = endOfTermResults.filter(r => 
        r.grade <= 6 && studentGenderMap.get(r.studentId) === 'M'
      ).length;
      
      const qualityGirls = endOfTermResults.filter(r => 
        r.grade <= 6 && studentGenderMap.get(r.studentId) === 'F'
      ).length;
      
      const quantityBoys = endOfTermResults.filter(r => 
        r.grade <= 8 && studentGenderMap.get(r.studentId) === 'M'
      ).length;
      
      const quantityGirls = endOfTermResults.filter(r => 
        r.grade <= 8 && studentGenderMap.get(r.studentId) === 'F'
      ).length;
      
      const failBoys = endOfTermResults.filter(r => 
        r.grade === 9 && studentGenderMap.get(r.studentId) === 'M'
      ).length;
      
      const failGirls = endOfTermResults.filter(r => 
        r.grade === 9 && studentGenderMap.get(r.studentId) === 'F'
      ).length;

      const qualityCount = endOfTermResults.filter(r => r.grade <= 6).length;
      const quantityCount = endOfTermResults.filter(r => r.grade <= 8).length;
      const failCount = endOfTermResults.filter(r => r.grade === 9).length;

      // Subject performance for this class
      const subjectMap = new Map<string, { teacher: string; grades: number[] }>();
      endOfTermResults.forEach(r => {
        const subjectKey = r.subjectId || 'Unknown';
        if (!subjectMap.has(subjectKey)) {
          subjectMap.set(subjectKey, { teacher: r.teacherName || 'Unknown', grades: [] });
        }
        subjectMap.get(subjectKey)!.grades.push(r.grade);
      });

      const subjectPerformance = Array.from(subjectMap.entries()).map(([subject, data]) => {
        const total = data.grades.length;
        const quality = data.grades.filter(g => g <= 6).length;
        const quantity = data.grades.filter(g => g <= 8).length;
        const fail = data.grades.filter(g => g === 9).length;

        return {
          subject,
          teacher: data.teacher,
          quality: Math.round((quality / total) * 100),
          quantity: Math.round((quantity / total) * 100),
          fail: Math.round((fail / total) * 100)
        };
      });

      const className = classes.find(c => c.id === classId)?.name || classId;

      return {
        classId,
        className,
        candidates: {
          boys: qualityBoys + quantityBoys + failBoys,
          girls: qualityGirls + quantityGirls + failGirls,
          total: endOfTermResults.length
        },
        sat: {
          boys: endOfTermResults.filter(r => studentGenderMap.get(r.studentId) === 'M').length,
          girls: endOfTermResults.filter(r => studentGenderMap.get(r.studentId) === 'F').length,
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
        },
        subjectPerformance
      };
    });
  }, [results, classes, studentGenderMap]);

  // Calculate subject performance across school
  const subjectPerformance = useMemo((): SubjectPerformance[] => {
    if (!results || results.length === 0) return [];

    const subjectMap = new Map<string, {
      teacher: string;
      classes: Set<string>;
      students: Set<string>;
      grades: number[];
    }>();

    results.filter(r => r.examType === 'endOfTerm' && r.grade > 0).forEach(result => {
      const subjectKey = result.subjectId || 'Unknown';
      if (!subjectMap.has(subjectKey)) {
        subjectMap.set(subjectKey, {
          teacher: result.teacherName || 'Unknown',
          classes: new Set(),
          students: new Set(),
          grades: []
        });
      }
      const data = subjectMap.get(subjectKey)!;
      data.classes.add(result.classId);
      data.students.add(result.studentId);
      data.grades.push(result.grade);
    });

    return Array.from(subjectMap.entries()).map(([subject, data]) => {
      const total = data.grades.length;
      const quality = data.grades.filter(g => g <= 6).length;
      const quantity = data.grades.filter(g => g <= 8).length;
      const fail = data.grades.filter(g => g === 9).length;
      const averageGrade = data.grades.reduce((sum, g) => sum + g, 0) / total;

      return {
        subject,
        teacher: data.teacher,
        classCount: data.classes.size,
        studentCount: data.students.size,
        averageGrade: Math.round(averageGrade * 10) / 10,
        qualityRate: Math.round((quality / total) * 100),
        quantityRate: Math.round((quantity / total) * 100),
        failRate: Math.round((fail / total) * 100)
      };
    }).sort((a, b) => a.failRate - b.failRate);
  }, [results]);

  // Handle PDF export - DYNAMIC IMPORT TO AVOID ISSUES
  const handlePDFExport = async () => {
    try {
      if (!results || results.length === 0) {
        showNotification(
          'warning',
          'No data to export',
          'There are no results available for the selected filters.'
        );
        return;
      }

      showNotification(
        'info',
        'Generating PDF...',
        'Your report is being prepared.'
      );

      // Prepare data for PDF
      const pdfData = {
        schoolName: 'Kalabo Boarding Secondary School',
        term: selectedTerm,
        year: selectedYear,
        generatedDate: new Date().toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        metrics: schoolMetrics,
        gradeDistribution,
        classPerformance: classPerformance.slice(0, 10),
        subjectPerformance: subjectPerformance.slice(0, 15),
        selectedClass: selectedClass !== 'all' 
          ? classes?.find(c => c.id === selectedClass)?.name || selectedClass
          : 'All Classes'
      };

      // Dynamically import pdfMake and the generator
      const pdfMake = (await import('pdfmake/build/pdfmake')).default;
      const pdfFonts = (await import('pdfmake/build/vfs_fonts')).default;
      
      // Set up fonts with error handling
      if (pdfFonts && pdfFonts.pdfMake && pdfFonts.pdfMake.vfs) {
        pdfMake.vfs = pdfFonts.pdfMake.vfs;
      } else {
        console.warn('pdfMake fonts not loaded properly, using fallback');
        // Fallback - create empty vfs
        pdfMake.vfs = { 'Roboto-Regular.ttf': '' };
      }

      // Dynamically import the generator
      const { generateAdminResultsPDF } = await import('@/services/pdf/adminResultsPDF');
      
      // Generate PDF
      const docDefinition = generateAdminResultsPDF(pdfData);
      
      // Create and download PDF
      const fileName = `School_Results_${selectedTerm}_${selectedYear}_${new Date().toISOString().split('T')[0]}.pdf`;
      
      pdfMake.createPdf(docDefinition).download(fileName);

      showNotification(
        'success',
        'PDF Generated Successfully',
        `File: ${fileName}`
      );
      
    } catch (error) {
      console.error('PDF Generation Error:', error);
      showNotification(
        'error',
        'PDF Generation Failed',
        'An error occurred while generating the report.'
      );
    }
  };

  // Handle filter change
  const handleFilterChange = (type: 'class' | 'term' | 'year', value: string | number) => {
    if (type === 'class') setSelectedClass(value as string);
    if (type === 'term') setSelectedTerm(value as string);
    if (type === 'year') setSelectedYear(value as number);
    
    showNotification(
      'info',
      'Updating results...',
      `Showing data for ${type === 'class' ? (value === 'all' ? 'all classes' : value) : selectedTerm}`
    );
  };

  // Handle refresh
  const handleRefresh = async () => {
    showNotification(
      'info',
      'Refreshing data...',
      'Fetching the latest results.'
    );
    await refetch();
    showNotification(
      'success',
      'Data updated',
      'Results are now current.'
    );
  };

  // Years for filter (2026 onwards)
  const currentYear = new Date().getFullYear();
  const years = [2026, 2027, 2028, 2029, 2030];

  // Loading states
  if (isLoading || classesLoading || learnersLoading) {
    return (
      <DashboardLayout activeTab="results">
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-64"></div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-32 bg-gray-100 rounded-xl"></div>
              ))}
            </div>
            <div className="h-96 bg-gray-100 rounded-xl"></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="results">
      <div className="min-h-screen bg-gray-50 p-3 sm:p-6 lg:p-8 transition-all duration-200">
        
        {/* Notifications */}
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {notifications.map(notification => (
            <Notification
              key={notification.id}
              type={notification.type}
              message={notification.message}
              description={notification.description}
              onClose={() => removeNotification(notification.id)}
            />
          ))}
        </div>

        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
                School Results Analysis
              </h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1 sm:mt-2 flex items-center gap-2 flex-wrap">
                <School size={16} className="text-gray-400" />
                <span>End of Term Performance • {selectedTerm} {selectedYear}</span>
                {isFetching && (
                  <span className="inline-flex items-center gap-1.5 text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full text-xs">
                    <Loader2 size={12} className="animate-spin" />
                    updating
                  </span>
                )}
              </p>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePDFExport}
                disabled={results.length === 0 || isFetching}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={18} />
                <span className={isMobile ? 'hidden sm:inline' : ''}>Export PDF</span>
              </button>
              
              <button
                onClick={handleRefresh}
                disabled={isFetching}
                className="p-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
                title="Refresh"
              >
                <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>

        {/* School Overview Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
          <StatCard
            title="Total Students"
            value={schoolMetrics.totalStudents.toString()}
            subValue={`Across ${schoolMetrics.classesCount} classes`}
            icon={Users}
            color="blue"
          />
          <StatCard
            title="Pass Rate"
            value={`${schoolMetrics.passRate}%`}
            subValue={`${schoolMetrics.distinctionRate}% distinction`}
            icon={Target}
            color="green"
          />
          <StatCard
            title="Average Score"
            value={`${schoolMetrics.averageScore}%`}
            subValue="Mean performance"
            icon={GraduationCap}
            color="amber"
          />
          <StatCard
            title="Fail Rate"
            value={`${schoolMetrics.failRate}%`}
            subValue="Grade 9 students"
            icon={AlertCircle}
            color="rose"
          />
        </div>

        {/* Filters */}
        <div className="mb-8">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            
            {/* Mobile Filter Toggle */}
            {isMobile && (
              <button
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                className="w-full flex items-center justify-between p-4 bg-white"
              >
                <div className="flex items-center gap-2">
                  <Filter size={18} className="text-gray-400" />
                  <span className="font-medium text-gray-700">
                    {selectedClass !== 'all' ? `Class: ${selectedClass}` : 'Filter by class'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedClass !== 'all' && (
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  )}
                  <ChevronDown 
                    size={18} 
                    className={`text-gray-500 transition-transform duration-200 ${showMobileFilters ? 'rotate-180' : ''}`} 
                  />
                </div>
              </button>
            )}

            {/* Filter Content */}
            <div className={`p-4 sm:p-6 ${isMobile && !showMobileFilters ? 'hidden' : 'block'}`}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Filter size={16} className="text-blue-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-700">Filter by:</span>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 flex-1">
                  {/* Class Filter */}
                  <div className="relative flex-1">
                    <select
                      value={selectedClass}
                      onChange={(e) => handleFilterChange('class', e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl
                               focus:ring-2 focus:ring-blue-500 focus:border-transparent
                               appearance-none bg-white cursor-pointer text-sm
                               hover:border-gray-400 transition-colors"
                    >
                      <option value="all">All Classes</option>
                      {classes.map(cls => (
                        <option key={cls.id} value={cls.id}>
                          {cls.name} • Year {cls.year} • {cls.students} students
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                      <ChevronDown size={16} className="text-gray-400" />
                    </div>
                  </div>

                  {/* Term Filter */}
                  <div className="relative sm:w-40">
                    <select
                      value={selectedTerm}
                      onChange={(e) => handleFilterChange('term', e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl
                               focus:ring-2 focus:ring-blue-500 focus:border-transparent
                               appearance-none bg-white cursor-pointer text-sm"
                    >
                      <option value="Term 1">Term 1</option>
                      <option value="Term 2">Term 2</option>
                      <option value="Term 3">Term 3</option>
                    </select>
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                      <ChevronDown size={16} className="text-gray-400" />
                    </div>
                  </div>

                  {/* Year Filter */}
                  <div className="relative sm:w-32">
                    <select
                      value={selectedYear}
                      onChange={(e) => handleFilterChange('year', Number(e.target.value))}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl
                               focus:ring-2 focus:ring-blue-500 focus:border-transparent
                               appearance-none bg-white cursor-pointer text-sm"
                    >
                      {years.map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                      <ChevronDown size={16} className="text-gray-400" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Filter Indicator */}
              {selectedClass !== 'all' && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-600">Currently showing:</span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">
                      <Filter size={12} />
                      {classes.find(c => c.id === selectedClass)?.name || selectedClass}
                    </span>
                    <button
                      onClick={() => handleFilterChange('class', 'all')}
                      className="text-xs text-gray-500 hover:text-gray-700 hover:underline ml-1"
                    >
                      Clear filter
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        {results.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
              <FileText className="text-gray-400" size={32} />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Results Available</h3>
            <p className="text-gray-600 max-w-md mx-auto">
              {selectedClass !== 'all' 
                ? `No end of term results found for ${classes.find(c => c.id === selectedClass)?.name}.`
                : 'No end of term results have been entered yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            
            {/* Grade Distribution Chart */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <BarChart3 size={18} className="text-blue-600" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">
                      School Grade Distribution
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Overall performance across all grades (1-9) with gender breakdown
                  </p>
                </div>
                
                {/* Legend */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-blue-500 rounded"></span>
                    <span className="text-xs">Boys</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-rose-500 rounded"></span>
                    <span className="text-xs">Girls</span>
                  </div>
                </div>
              </div>

              {/* Bar Chart */}
              <div className="h-80 relative">
                {/* Y-axis labels */}
                <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col justify-between text-xs text-gray-500">
                  <span>{Math.max(...gradeDistribution.map(g => g.total))}</span>
                  <span>{Math.round(Math.max(...gradeDistribution.map(g => g.total)) * 0.75)}</span>
                  <span>{Math.round(Math.max(...gradeDistribution.map(g => g.total)) * 0.5)}</span>
                  <span>{Math.round(Math.max(...gradeDistribution.map(g => g.total)) * 0.25)}</span>
                  <span>0</span>
                </div>

                {/* Bars container */}
                <div className="absolute left-16 right-0 top-0 bottom-0">
                  <div className="flex items-end justify-around h-full">
                    {gradeDistribution.map((grade) => (
                      <div key={grade.grade} className="flex flex-col items-center w-16">
                        {/* Bars */}
                        <div className="flex gap-1 w-full justify-center mb-2">
                          {/* Boys Bar */}
                          {grade.boys > 0 && (
                            <div className="flex flex-col items-center group">
                              <div className="relative">
                                <div 
                                  className="w-6 bg-blue-500 rounded-t transition-all duration-500 hover:bg-blue-600"
                                  style={{ height: `${(grade.boys / Math.max(...gradeDistribution.map(g => g.total))) * 200}px`, minHeight: '4px' }}
                                />
                                <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                                  Boys: {grade.boys}
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Girls Bar */}
                          {grade.girls > 0 && (
                            <div className="flex flex-col items-center group">
                              <div className="relative">
                                <div 
                                  className="w-6 bg-rose-500 rounded-t transition-all duration-500 hover:bg-rose-600"
                                  style={{ height: `${(grade.girls / Math.max(...gradeDistribution.map(g => g.total))) * 200}px`, minHeight: '4px' }}
                                />
                                <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                                  Girls: {grade.girls}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Grade Label */}
                        <GradeBadge grade={grade.grade} size="sm" />
                        
                        {/* Percentage */}
                        <span className="text-xs text-gray-500 mt-1">
                          {grade.percentage}%
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Grid lines */}
                  <div className="absolute inset-0 pointer-events-none">
                    {[0, 25, 50, 75, 100].map((val, i) => (
                      <div 
                        key={i}
                        className="absolute left-0 right-0 border-t border-gray-100"
                        style={{ bottom: `${val}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Chart Footer */}
              <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">Total Students:</span>
                    <span className="text-lg font-bold text-gray-900">
                      {gradeDistribution.reduce((sum, g) => sum + g.total, 0)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">Boys:</span>
                    <span className="text-lg font-bold text-blue-600">
                      {gradeDistribution.reduce((sum, g) => sum + g.boys, 0)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">Girls:</span>
                    <span className="text-lg font-bold text-rose-600">
                      {gradeDistribution.reduce((sum, g) => sum + g.girls, 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Class Comparison Chart */}
            {classPerformance.length > 0 && (
              <ClassComparisonChart data={classPerformance} />
            )}

            {/* Subject Performance */}
            {subjectPerformance.length > 0 && (
              <SubjectPerformanceChart data={subjectPerformance} />
            )}

            {/* Quick Stats Table */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
                <h3 className="font-semibold text-gray-900">Class Performance Summary</h3>
                <p className="text-sm text-gray-500 mt-0.5">Quick overview of all classes</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Class</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Students</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Boys/Girls</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Quality</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Quantity</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Fail</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Top Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {classPerformance.slice(0, 5).map((cls) => {
                      const topGrade = cls.gradeDistribution.length > 0 
                        ? cls.gradeDistribution.reduce((min, g) => g.grade < min.grade ? g : min).grade
                        : 9;
                      
                      return (
                        <tr key={cls.classId} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">{cls.className}</td>
                          <td className="px-6 py-4 text-sm text-gray-700">{cls.candidates.total}</td>
                          <td className="px-6 py-4 text-sm">
                            <span className="text-blue-600 font-medium">{cls.candidates.boys}</span>
                            <span className="text-gray-400 mx-1">/</span>
                            <span className="text-rose-600 font-medium">{cls.candidates.girls}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-sm font-semibold ${
                              cls.performance.quality.percentage >= 70 ? 'text-green-600' :
                              cls.performance.quality.percentage >= 50 ? 'text-amber-600' : 'text-rose-600'
                            }`}>
                              {cls.performance.quality.percentage}%
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-semibold text-blue-600">
                              {cls.performance.quantity.percentage}%
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-sm font-semibold ${
                              cls.performance.fail.percentage <= 5 ? 'text-green-600' :
                              cls.performance.fail.percentage <= 10 ? 'text-amber-600' : 'text-rose-600'
                            }`}>
                              {cls.performance.fail.percentage}%
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <GradeBadge grade={topGrade} size="sm" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-xs sm:text-sm text-gray-500">
              {results.length > 0 ? (
                <>
                  <span className="font-medium">Data source:</span> End of Term Results • 
                  <span className="font-medium ml-1">Last updated:</span> Just now •
                  <span className="font-medium ml-1">Total assessments:</span> {schoolMetrics.totalAssessments}
                </>
              ) : (
                'No results data available for the current selection'
              )}
            </p>
            <button 
              onClick={() => refetch()}
              className="text-xs sm:text-sm text-gray-600 hover:text-gray-900 font-medium"
            >
              Refresh data
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}