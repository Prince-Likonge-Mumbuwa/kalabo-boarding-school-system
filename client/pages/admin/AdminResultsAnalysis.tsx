// @/pages/admin/AdminResultsAnalysis.tsx - FULLY CORRECTED VERSION

import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useMemo, useEffect, useCallback } from 'react';
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
import { StudentResult } from '@/services/resultsService';
import { Learner } from '@/types/school';

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

// Types for PDF data (matches pdf-lib expected structure)
interface SubjectMetrics {
  registered: number;
  sat: number;
  absent: number;
  dist: number; // grades 1-2
  merit: number; // grades 3-4
  credit: number; // grades 5-6
  pass: number; // grades 7-8
  fail: number; // grade 9
  quality: number; // grades 1-4
  quantity: number; // grades 1-8
}

interface SubjectData {
  name: string;
  boys: SubjectMetrics;
  girls: SubjectMetrics;
}

interface AdminResultsData {
  schoolName: string;
  address: string;
  className: string;
  term: string;
  year: number;
  subjects: SubjectData[];
  generatedDate: string;
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
  const [isDownloading, setIsDownloading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

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

  // ==================== HELPER FUNCTIONS ====================
  
  const showNotification = useCallback((
    type: 'success' | 'error' | 'info' | 'warning',
    message: string,
    description?: string
  ) => {
    const id = Math.random().toString(36).substring(7);
    setNotifications(prev => [...prev, { id, type, message, description }]);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // ==================== FILTER VALID RESULTS (MUST BE BEFORE USAGE) ====================
  
  // Filter valid end of term results
  const validEndOfTermResults = useMemo(() => {
    return results.filter((r: StudentResult) => 
      r.examType === 'endOfTerm' && 
      r.grade > 0 && 
      r.grade <= 9 &&
      r.percentage >= 0
    );
  }, [results]);

  // ==================== CORRECTED STUDENT DATA MAPPING ====================
  
  // Map both document IDs and custom student IDs to gender
  const studentDataMap = useMemo(() => {
    const docIdToGender = new Map<string, 'M' | 'F'>();
    const customIdToGender = new Map<string, 'M' | 'F'>();
    const docIdToCustomId = new Map<string, string>();
    const customIdToDocId = new Map<string, string>();
    
    console.log('Building studentDataMap from', learners.length, 'learners');
    
    learners.forEach((learner: Learner) => {
      // Document ID (Firestore internal ID)
      if (learner.id) {
        if (learner.gender) {
          docIdToGender.set(learner.id, learner.gender === 'male' ? 'M' : 'F');
        }
        
        // Map to custom ID if available
        if (learner.studentId) {
          docIdToCustomId.set(learner.id, learner.studentId);
        }
      }
      
      // Custom ID (display ID like "G10B_001")
      if (learner.studentId) {
        if (learner.gender) {
          customIdToGender.set(learner.studentId, learner.gender === 'male' ? 'M' : 'F');
        }
        
        // Map to document ID
        if (learner.id) {
          customIdToDocId.set(learner.studentId, learner.id);
        }
      }
    });
    
    console.log('studentDataMap built:', {
      docIdToGender: docIdToGender.size,
      customIdToGender: customIdToGender.size,
      docIdToCustomId: docIdToCustomId.size,
      customIdToDocId: customIdToDocId.size
    });
    
    return { docIdToGender, customIdToGender, docIdToCustomId, customIdToDocId };
  }, [learners]);

  // Helper function to get gender from a student ID (could be document ID or custom ID)
  const getStudentGender = useCallback((studentId: string): 'M' | 'F' | undefined => {
    // Method 1: Try as document ID
    let gender = studentDataMap.docIdToGender.get(studentId);
    
    // Method 2: Try as custom ID
    if (!gender) {
      gender = studentDataMap.customIdToGender.get(studentId);
    }
    
    // Method 3: Try to find learner by direct comparison (fallback)
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

  // Debug function to check mappings
  const checkMappings = useCallback(() => {
    console.log('===== CHECKING STUDENT MAPPINGS =====');
    console.log('Total learners:', learners.length);
    console.log('Total results:', results.length);
    console.log('Valid end of term results:', validEndOfTermResults.length);
    
    // Take first 5 results and try to find their gender
    const sampleResults = validEndOfTermResults.slice(0, 5);
    
    sampleResults.forEach((result, index) => {
      console.log(`\nResult ${index + 1}:`);
      console.log('  Student ID in result:', result.studentId);
      console.log('  Student name:', result.studentName);
      
      // Try to find by document ID
      const gender1 = studentDataMap.docIdToGender.get(result.studentId);
      console.log('  Gender by docId:', gender1 || 'Not found');
      
      // Try to find by custom ID
      const gender2 = studentDataMap.customIdToGender.get(result.studentId);
      console.log('  Gender by customId:', gender2 || 'Not found');
      
      // Get final gender using helper
      const finalGender = getStudentGender(result.studentId);
      console.log('  Final gender:', finalGender || 'Not found');
      
      // Try to find learner directly
      const learner = learners.find(l => 
        l.id === result.studentId || 
        l.studentId === result.studentId
      );
      
      if (learner) {
        console.log('  Found learner:', {
          id: learner.id,
          studentId: learner.studentId,
          name: learner.fullName,
          gender: learner.gender
        });
      } else {
        console.log('  No matching learner found in learners array');
      }
    });
    
    console.log('\nMap sizes:');
    console.log('  docIdToGender:', studentDataMap.docIdToGender.size);
    console.log('  customIdToGender:', studentDataMap.customIdToGender.size);
    console.log('  Total learners with gender:', learners.filter(l => l.gender).length);
  }, [learners, results, validEndOfTermResults, studentDataMap, getStudentGender]);

  // Run debug on mount if showDebug is true
  useEffect(() => {
    if (showDebug && results.length > 0 && learners.length > 0) {
      checkMappings();
    }
  }, [showDebug, results, learners, checkMappings]);

  // Group results by subject for quick access
  const subjectGroups = useMemo(() => {
    const groups = new Map<string, StudentResult[]>();
    validEndOfTermResults.forEach((result: StudentResult) => {
      const key = result.subjectId || 'Unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(result);
    });
    return groups;
  }, [validEndOfTermResults]);

  // Get subject name map from teacher assignments when a specific class is selected
  const subjectNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (selectedClass !== 'all') {
      const classData = classes.find(c => c.id === selectedClass);
      classData?.teacherAssignments?.forEach(assignment => {
        map.set(assignment.subjectId, assignment.subject);
      });
    }
    return map;
  }, [classes, selectedClass]);

  // Calculate grade distribution with gender breakdown
  const gradeDistribution = useMemo((): GradeDistribution[] => {
    if (validEndOfTermResults.length === 0) return [];

    const gradeMap = new Map<number, { boys: number; girls: number; unknown: number }>();
    
    // Initialize grades 1-9
    for (let i = 1; i <= 9; i++) {
      gradeMap.set(i, { boys: 0, girls: 0, unknown: 0 });
    }

    let matchedCount = 0;
    let unmatchedCount = 0;

    // Count boys and girls per grade
    validEndOfTermResults.forEach((result: StudentResult) => {
      const current = gradeMap.get(result.grade) || { boys: 0, girls: 0, unknown: 0 };
      const gender = getStudentGender(result.studentId);
      
      if (gender === 'M') {
        gradeMap.set(result.grade, { ...current, boys: current.boys + 1 });
        matchedCount++;
      } else if (gender === 'F') {
        gradeMap.set(result.grade, { ...current, girls: current.girls + 1 });
        matchedCount++;
      } else {
        gradeMap.set(result.grade, { ...current, unknown: current.unknown + 1 });
        unmatchedCount++;
      }
    });

    // Log matching rate if there are unmatched students
    if (unmatchedCount > 0) {
      console.log('Grade distribution matching:', { 
        matchedCount, 
        unmatchedCount, 
        total: validEndOfTermResults.length,
        matchRate: Math.round((matchedCount / validEndOfTermResults.length) * 100) + '%'
      });
    }

    const total = validEndOfTermResults.length;

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
        total: counts.boys + counts.girls + counts.unknown,
        percentage: total > 0 ? Math.round(((counts.boys + counts.girls + counts.unknown) / total) * 100) : 0,
        passStatus: getPassStatus(grade)
      }))
      .filter(g => g.total > 0);
  }, [validEndOfTermResults, getStudentGender]);

  // Calculate school-wide metrics
  const schoolMetrics = useMemo(() => {
    if (!analytics || validEndOfTermResults.length === 0) {
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

    const totalAssessments = validEndOfTermResults.length;
    
    const distinctionCount = validEndOfTermResults.filter(r => r.grade <= 2).length;
    const passCount = validEndOfTermResults.filter(r => r.grade <= 6).length;
    const failCount = validEndOfTermResults.filter(r => r.grade >= 7).length;
    
    const uniqueStudents = new Set(validEndOfTermResults.map(r => r.studentId)).size;
    const uniqueSubjects = new Set(validEndOfTermResults.map(r => r.subjectId)).size;

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
  }, [analytics, validEndOfTermResults, classes]);

  // Calculate class-level performance
  const classPerformance = useMemo((): ClassPerformance[] => {
    if (validEndOfTermResults.length === 0 || !classes) return [];

    // Group results by class
    const classMap = new Map<string, StudentResult[]>();
    
    validEndOfTermResults.forEach((result: StudentResult) => {
      if (!classMap.has(result.classId)) {
        classMap.set(result.classId, []);
      }
      classMap.get(result.classId)!.push(result);
    });

    return Array.from(classMap.entries()).map(([classId, classResults]) => {
      const total = classResults.length;

      // Grade distribution for this class
      const gradeMap = new Map<number, { boys: number; girls: number; unknown: number }>();
      for (let i = 1; i <= 9; i++) gradeMap.set(i, { boys: 0, girls: 0, unknown: 0 });
      
      classResults.forEach((result: StudentResult) => {
        const current = gradeMap.get(result.grade)!;
        const gender = getStudentGender(result.studentId);
        
        if (gender === 'M') {
          gradeMap.set(result.grade, { ...current, boys: current.boys + 1 });
        } else if (gender === 'F') {
          gradeMap.set(result.grade, { ...current, girls: current.girls + 1 });
        } else {
          gradeMap.set(result.grade, { ...current, unknown: current.unknown + 1 });
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
            total: counts.boys + counts.girls + counts.unknown,
            percentage: total > 0 ? Math.round(((counts.boys + counts.girls + counts.unknown) / total) * 100) : 0,
            passStatus
          };
        })
        .filter(g => g.total > 0);

      // Performance metrics with gender breakdown
      const qualityBoys = classResults.filter(r => 
        r.grade <= 6 && getStudentGender(r.studentId) === 'M'
      ).length;
      
      const qualityGirls = classResults.filter(r => 
        r.grade <= 6 && getStudentGender(r.studentId) === 'F'
      ).length;
      
      const quantityBoys = classResults.filter(r => 
        r.grade <= 8 && getStudentGender(r.studentId) === 'M'
      ).length;
      
      const quantityGirls = classResults.filter(r => 
        r.grade <= 8 && getStudentGender(r.studentId) === 'F'
      ).length;
      
      const failBoys = classResults.filter(r => 
        r.grade === 9 && getStudentGender(r.studentId) === 'M'
      ).length;
      
      const failGirls = classResults.filter(r => 
        r.grade === 9 && getStudentGender(r.studentId) === 'F'
      ).length;

      const qualityCount = classResults.filter(r => r.grade <= 6).length;
      const quantityCount = classResults.filter(r => r.grade <= 8).length;
      const failCount = classResults.filter(r => r.grade === 9).length;

      const className = classes.find(c => c.id === classId)?.name || classId;

      return {
        classId,
        className,
        candidates: {
          boys: qualityBoys + quantityBoys + failBoys,
          girls: qualityGirls + quantityGirls + failGirls,
          total: classResults.length
        },
        sat: {
          boys: classResults.filter(r => getStudentGender(r.studentId) === 'M').length,
          girls: classResults.filter(r => getStudentGender(r.studentId) === 'F').length,
          total: classResults.length
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
  }, [validEndOfTermResults, classes, getStudentGender]);

  // Calculate subject performance across school
  const subjectPerformance = useMemo((): SubjectPerformance[] => {
    if (validEndOfTermResults.length === 0) return [];

    const subjectMap = new Map<string, {
      teacher: string;
      classes: Set<string>;
      students: Set<string>;
      grades: number[];
    }>();

    validEndOfTermResults.forEach((result: StudentResult) => {
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
  }, [validEndOfTermResults]);

  // ==================== PDF DOWNLOAD FUNCTION ====================
  const handleDownloadPDF = async () => {
    try {
      if (validEndOfTermResults.length === 0) {
        showNotification(
          'warning',
          'No data to export',
          'There are no valid end of term results for the selected filters.'
        );
        return;
      }

      setIsDownloading(true);
      
      showNotification(
        'info',
        'Generating PDF...',
        'Please wait while we prepare your download.'
      );

      // Calculate metrics for a group of results
      const calculateMetrics = (resultsArray: StudentResult[]): SubjectMetrics => {
        const total = resultsArray.length;
        
        // Grade distribution using PDF legend ranges
        const dist = resultsArray.filter(r => r.grade <= 2).length;      // DIST (1-2)
        const merit = resultsArray.filter(r => r.grade >= 3 && r.grade <= 4).length; // MERIT (3-4)
        const credit = resultsArray.filter(r => r.grade >= 5 && r.grade <= 6).length; // CREDIT (5-6)
        const pass = resultsArray.filter(r => r.grade >= 7 && r.grade <= 8).length;   // PASS (7-8)
        const fail = resultsArray.filter(r => r.grade === 9).length;     // FAIL (9)
        
        // Quality and quantity passes as per PDF legend
        const quality = resultsArray.filter(r => r.grade <= 4).length;   // QLTY (1-4)
        const quantity = resultsArray.filter(r => r.grade <= 8).length;  // QTY (1-8)

        return {
          registered: total,
          sat: total,
          absent: 0,
          dist,
          merit,
          credit,
          pass,
          fail,
          quality,
          quantity
        };
      };

      // Build subject data array
      const subjects: SubjectData[] = [];

      for (const [subjectId, subjectResults] of subjectGroups.entries()) {
        // Get display name
        const displayName = subjectNameMap.get(subjectId) || 
                            subjectResults[0]?.subjectName || 
                            subjectId;
        
        // Split by gender using the helper function
        const boysResults: StudentResult[] = [];
        const girlsResults: StudentResult[] = [];
        const unknownResults: StudentResult[] = [];
        
        subjectResults.forEach(result => {
          const gender = getStudentGender(result.studentId);
          
          if (gender === 'M') {
            boysResults.push(result);
          } else if (gender === 'F') {
            girlsResults.push(result);
          } else {
            unknownResults.push(result);
          }
        });

        // Include subjects with results
        if (boysResults.length > 0 || girlsResults.length > 0 || unknownResults.length > 0) {
          subjects.push({
            name: displayName,
            boys: calculateMetrics([...boysResults, ...unknownResults]), // Put unknown in boys as fallback
            girls: calculateMetrics(girlsResults)
          });
        }
      }

      // Sort subjects alphabetically
      subjects.sort((a, b) => a.name.localeCompare(b.name));

      // Prepare PDF data
      const pdfData: AdminResultsData = {
        schoolName: 'KALABO BOARDING SECONDARY SCHOOL',
        address: 'P.O BOX 930096',
        className: selectedClass !== 'all' 
          ? classes?.find(c => c.id === selectedClass)?.name || 'All Classes'
          : 'All Classes',
        term: selectedTerm,
        year: selectedYear,
        subjects,
        generatedDate: new Date().toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      };

      // Generate PDF
      const { generateResultsAnalysisPDF } = await import('@/services/pdf/resultsAnalysisPDFLib');
      const pdfBytes = await generateResultsAnalysisPDF(pdfData);

      // FIXED: Convert Uint8Array to Blob using ArrayBuffer approach
      // This is the most reliable method across all browsers
      const arrayBuffer = pdfBytes.buffer.slice(
        pdfBytes.byteOffset,
        pdfBytes.byteOffset + pdfBytes.byteLength
      );
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const filename = [
        'school-results',
        pdfData.className.replace(/\s+/g, '-'),
        pdfData.term.replace(/\s+/g, '-'),
        pdfData.year
      ].join('-') + '.pdf';
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      showNotification(
        'success',
        'PDF Downloaded',
        `Successfully generated PDF with ${subjects.length} subjects.`
      );

    } catch (error) {
      console.error('PDF Generation Error:', error);
      showNotification(
        'error',
        'PDF Generation Failed',
        error instanceof Error ? error.message : 'An error occurred while generating the PDF.'
      );
    } finally {
      setIsDownloading(false);
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

  // Years for filter
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
                onClick={handleDownloadPDF}
                disabled={validEndOfTermResults.length === 0 || isFetching || isDownloading}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDownloading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Download size={18} />
                )}
                <span className={isMobile ? 'hidden sm:inline' : ''}>
                  {isDownloading ? 'Generating...' : 'Download PDF'}
                </span>
              </button>
              
              <button
                onClick={handleRefresh}
                disabled={isFetching}
                className="p-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
                title="Refresh"
              >
                <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} />
              </button>

              {/* Debug toggle button */}
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

        {/* Main Content - Tables Only */}
        {validEndOfTermResults.length === 0 ? (
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
            
            {/* Grade Distribution TABLE */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">Grade Distribution</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Overall performance across all grades with gender breakdown</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                      <span>Boys: {gradeDistribution.reduce((sum, g) => sum + g.boys, 0)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 bg-rose-500 rounded-full"></span>
                      <span>Girls: {gradeDistribution.reduce((sum, g) => sum + g.girls, 0)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Grade</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Boys</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Girls</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Total</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Percentage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {gradeDistribution.map((grade) => (
                      <tr key={grade.grade} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <GradeBadge grade={grade.grade} size="sm" showLabel={false} />
                        </td>
                        <td className="px-6 py-4 text-sm capitalize text-gray-700">
                          {grade.passStatus}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-blue-600">
                          {grade.boys}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-rose-600">
                          {grade.girls}
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                          {grade.total}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-700">{grade.percentage}%</span>
                            <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${grade.percentage}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td colSpan={2} className="px-6 py-3 text-sm font-semibold text-gray-900">Total Students</td>
                      <td className="px-6 py-3 text-sm font-semibold text-blue-600">
                        {gradeDistribution.reduce((sum, g) => sum + g.boys, 0)}
                      </td>
                      <td className="px-6 py-3 text-sm font-semibold text-rose-600">
                        {gradeDistribution.reduce((sum, g) => sum + g.girls, 0)}
                      </td>
                      <td className="px-6 py-3 text-sm font-semibold text-gray-900">
                        {gradeDistribution.reduce((sum, g) => sum + g.total, 0)}
                      </td>
                      <td className="px-6 py-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Class Performance Summary Table */}
            {classPerformance.length > 0 && (
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
                      {classPerformance.map((cls) => {
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
            )}

            {/* Subject Performance Table */}
            {subjectPerformance.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900">Subject Performance</h3>
                  <p className="text-sm text-gray-500 mt-0.5">Performance metrics by subject</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Subject</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Teacher</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Classes</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Students</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Avg Grade</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Quality</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Quantity</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Fail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {subjectPerformance.map((subject) => (
                        <tr key={subject.subject} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">{subject.subject}</td>
                          <td className="px-6 py-4 text-sm text-gray-700">{subject.teacher}</td>
                          <td className="px-6 py-4 text-sm text-gray-700">{subject.classCount}</td>
                          <td className="px-6 py-4 text-sm text-gray-700">{subject.studentCount}</td>
                          <td className="px-6 py-4">
                            <GradeBadge grade={Math.round(subject.averageGrade)} size="sm" />
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-sm font-semibold ${
                              subject.qualityRate >= 70 ? 'text-green-600' :
                              subject.qualityRate >= 50 ? 'text-amber-600' : 'text-rose-600'
                            }`}>
                              {subject.qualityRate}%
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-semibold text-blue-600">
                              {subject.quantityRate}%
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-sm font-semibold ${
                              subject.failRate <= 5 ? 'text-green-600' :
                              subject.failRate <= 10 ? 'text-amber-600' : 'text-rose-600'
                            }`}>
                              {subject.failRate}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-xs sm:text-sm text-gray-500">
              {validEndOfTermResults.length > 0 ? (
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