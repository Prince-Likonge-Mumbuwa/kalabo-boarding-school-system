import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useResultsAnalytics } from '@/hooks/useResults';
import {
  Filter,
  TrendingUp,
  TrendingDown,
  Minus,
  Download,
  BarChart3,
  PieChart as PieChartIcon,
  LineChart as LineChartIcon,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  RefreshCw,
  Info,
  Maximize2,
  Smartphone,
  Tablet,
  Monitor,
  Loader2
} from 'lucide-react';

// Dynamically import chart components for code splitting
const ResponsiveContainer = lazy(() => 
  import('recharts').then(mod => ({ default: mod.ResponsiveContainer }))
);
const BarChart = lazy(() => 
  import('recharts').then(mod => ({ default: mod.BarChart }))
);
const LineChart = lazy(() => 
  import('recharts').then(mod => ({ default: mod.LineChart }))
);
const PieChart = lazy(() => 
  import('recharts').then(mod => ({ default: mod.PieChart }))
);
const Pie = lazy(() => 
  import('recharts').then(mod => ({ default: mod.Pie }))
);
const Cell = lazy(() => 
  import('recharts').then(mod => ({ default: mod.Cell }))
);
const XAxis = lazy(() => 
  import('recharts').then(mod => ({ default: mod.XAxis }))
);
const YAxis = lazy(() => 
  import('recharts').then(mod => ({ default: mod.YAxis }))
);
const CartesianGrid = lazy(() => 
  import('recharts').then(mod => ({ default: mod.CartesianGrid }))
);
const Tooltip = lazy(() => 
  import('recharts').then(mod => ({ default: mod.Tooltip }))
);
const Legend = lazy(() => 
  import('recharts').then(mod => ({ default: mod.Legend }))
);
const Bar = lazy(() => 
  import('recharts').then(mod => ({ default: mod.Bar }))
);
const Line = lazy(() => 
  import('recharts').then(mod => ({ default: mod.Line }))
);

// ==================== TYPES & INTERFACES ====================
interface GradeDistribution {
  grade: number;
  count: number;
  percentage: number;
  description: string;
}

interface PerformanceTrend {
  month: string;
  passRate: number;
  avgMarks: number;
  improvement: 'up' | 'down' | 'stable';
}

interface ClassPerformance {
  class: string;
  form: string;
  passRate: number;
  avgMarks: number;
  totalStudents: number;
  improvement: number;
}

interface SubjectAnalysis {
  subject: string;
  passRate: number;
  avgScore: number;
  topGrade: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

// ==================== SKELETON COMPONENTS ====================
const ChartSkeleton = () => (
  <div className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse">
    <div className="flex items-center justify-between mb-6">
      <div className="space-y-2">
        <div className="h-5 bg-gray-200 rounded w-32"></div>
        <div className="h-3 bg-gray-100 rounded w-48"></div>
      </div>
      <div className="h-8 bg-gray-200 rounded w-24"></div>
    </div>
    <div className="h-64 bg-gray-100 rounded-lg"></div>
  </div>
);

const StatsSkeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-24 mb-4"></div>
        <div className="h-8 bg-gray-300 rounded w-20 mb-2"></div>
        <div className="h-3 bg-gray-100 rounded w-32"></div>
      </div>
    ))}
  </div>
);

// ==================== CHART WRAPPER COMPONENTS ====================
interface ChartContainerProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  isLoading?: boolean;
  onRefresh?: () => void;
  className?: string;
}

const ChartContainer = ({ 
  title, 
  description, 
  children, 
  isLoading = false,
  onRefresh,
  className = ''
}: ChartContainerProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (isLoading) {
    return <ChartSkeleton />;
  }

  return (
    <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 ${className}`}>
      <div className="p-6 border-b border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-gray-900">{title}</h3>
              <button className="text-gray-400 hover:text-gray-600">
                <Info size={16} />
              </button>
            </div>
            {description && (
              <p className="text-sm text-gray-600 mt-1">{description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Refresh chart"
            >
              <RefreshCw size={18} />
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title={isExpanded ? 'Minimize' : 'Expand'}
            >
              <Maximize2 size={18} />
            </button>
          </div>
        </div>
      </div>
      <div className={`p-4 sm:p-6 ${isExpanded ? 'h-96' : 'h-64 sm:h-72'}`}>
        {children}
      </div>
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
export default function AdminResultsAnalysis() {
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedTerm, setSelectedTerm] = useState<string>('Term 2');
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile' | 'tablet'>('desktop');
  const [showDetails, setShowDetails] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [chartsLoaded, setChartsLoaded] = useState(false);

  // Use the analytics hook with real data
  const { 
    analytics, 
    results, 
    classComparison: realClassComparison,
    isLoading, 
    isFetching, 
    refetch 
  } = useResultsAnalytics({
    classId: selectedClass !== 'all' ? selectedClass : undefined,
    subjectId: selectedSubject !== 'all' ? selectedSubject : undefined,
    term: selectedTerm,
    year: selectedYear,
  });

  // Check mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setViewMode('mobile');
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Simulate chart loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setChartsLoaded(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Calculate grade distribution from real results
  const gradeDistribution = useMemo((): GradeDistribution[] => {
    if (!results || results.length === 0) return [];

    const gradeCounts = new Map<number, number>();
    
    // Initialize all grades 1-9
    for (let i = 1; i <= 9; i++) {
      gradeCounts.set(i, 0);
    }

    // Count each grade (only end of term results)
    results
      .filter(r => r.examType === 'endOfTerm' && r.grade > 0)
      .forEach(result => {
        gradeCounts.set(result.grade, (gradeCounts.get(result.grade) || 0) + 1);
      });

    const total = results.filter(r => r.examType === 'endOfTerm' && r.grade > 0).length;

    return Array.from(gradeCounts.entries())
      .map(([grade, count]) => ({
        grade,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        description: getGradeDescription(grade),
      }))
      .filter(g => g.count > 0);
  }, [results]);

  // Calculate performance trend from real results
  const performanceTrend = useMemo((): PerformanceTrend[] => {
    if (!results || results.length === 0) return [];

    const examTypes = ['week4', 'week8', 'endOfTerm'] as const;
    const examLabels = {
      week4: 'Week 4',
      week8: 'Week 8',
      endOfTerm: 'End of Term',
    };

    const trendData = examTypes.map(examType => {
      const examResults = results.filter(r => r.examType === examType && r.percentage >= 0);
      const totalPercentage = examResults.reduce((sum, r) => sum + r.percentage, 0);
      const avgMarks = examResults.length > 0 ? Math.round(totalPercentage / examResults.length) : 0;
      const passRate = examResults.length > 0 
        ? Math.round((examResults.filter(r => r.percentage >= 50).length / examResults.length) * 100)
        : 0;

      return {
        month: examLabels[examType],
        avgMarks,
        passRate,
        improvement: 'stable' as const,
      };
    });

    // Add improvement indicators
    return trendData.map((data, index) => {
      if (index === 0) return data;
      
      const prevData = trendData[index - 1];
      const avgDiff = data.avgMarks - prevData.avgMarks;
      const passDiff = data.passRate - prevData.passRate;
      
      let improvement: 'up' | 'down' | 'stable' = 'stable';
      if (avgDiff > 2 || passDiff > 3) improvement = 'up';
      else if (avgDiff < -2 || passDiff < -3) improvement = 'down';
      
      return { ...data, improvement };
    });
  }, [results]);

  // Use real class comparison data with proper type casting
  const classComparison = useMemo((): ClassPerformance[] => {
    if (!realClassComparison || realClassComparison.length === 0) return [];

    return realClassComparison.map(cls => ({
      class: cls.className,
      form: cls.form,
      passRate: cls.passRate,
      avgMarks: cls.avgMarks,
      totalStudents: cls.totalStudents,
      improvement: cls.improvement || 0,
    }));
  }, [realClassComparison]);

  // Calculate subject analysis from results
  const subjectAnalysis = useMemo((): SubjectAnalysis[] => {
    if (!results || results.length === 0) return [];

    const subjectMap = new Map<string, {
      subject: string;
      percentages: number[];
      grades: number[];
    }>();

    // Group results by subject
    results
      .filter(r => r.examType === 'endOfTerm' && r.percentage >= 0)
      .forEach(result => {
        if (!subjectMap.has(result.subjectName)) {
          subjectMap.set(result.subjectName, {
            subject: result.subjectName,
            percentages: [],
            grades: [],
          });
        }
        
        const subject = subjectMap.get(result.subjectName)!;
        subject.percentages.push(result.percentage);
        subject.grades.push(result.grade);
      });

    return Array.from(subjectMap.values()).map(subject => {
      const avgScore = subject.percentages.length > 0 
        ? Math.round(subject.percentages.reduce((a, b) => a + b, 0) / subject.percentages.length)
        : 0;
      
      const passRate = subject.percentages.length > 0
        ? Math.round((subject.percentages.filter(p => p >= 50).length / subject.percentages.length) * 100)
        : 0;
      
      // Get most frequent grade
      const gradeCounts = new Map<number, number>();
      subject.grades.forEach(grade => {
        gradeCounts.set(grade, (gradeCounts.get(grade) || 0) + 1);
      });
      
      let topGrade = 'N/A';
      let maxCount = 0;
      gradeCounts.forEach((count, grade) => {
        if (count > maxCount) {
          maxCount = count;
          topGrade = grade.toString();
        }
      });

      // Determine difficulty based on average score
      let difficulty: 'easy' | 'medium' | 'hard' = 'medium';
      if (avgScore >= 70) difficulty = 'easy';
      else if (avgScore <= 40) difficulty = 'hard';

      return {
        subject: subject.subject,
        passRate,
        avgScore,
        topGrade,
        difficulty,
      };
    }).sort((a, b) => b.passRate - a.passRate); // Sort by pass rate descending
  }, [results]);

  // Summary statistics from real analytics
  const summaryStats = useMemo(() => {
    if (!analytics) return {
      totalStudents: 0,
      averagePassRate: 0,
      averageScore: 0,
      topGrades: 0,
      overallTrend: 'stable' as const,
      averagePercentage: 0,
      passRate: 0,
      topGrade: 'N/A',
    };

    // Calculate top grades count (grades 1-2)
    const topGradesCount = gradeDistribution
      .filter(g => g.grade <= 2)
      .reduce((sum, g) => sum + g.count, 0);

    // Determine overall trend
    let overallTrend: 'up' | 'down' | 'stable' = 'stable';
    if (performanceTrend.length >= 2) {
      const last = performanceTrend[performanceTrend.length - 1];
      const first = performanceTrend[0];
      const avgDiff = last.avgMarks - first.avgMarks;
      const passDiff = last.passRate - first.passRate;
      
      if (avgDiff > 5 || passDiff > 5) overallTrend = 'up';
      else if (avgDiff < -5 || passDiff < -5) overallTrend = 'down';
    }

    return {
      totalStudents: analytics.totalStudents || 0,
      averagePassRate: Math.round(classComparison.reduce((sum, cls) => sum + cls.passRate, 0) / Math.max(classComparison.length, 1)),
      averageScore: analytics.averagePercentage || 0,
      topGrades: topGradesCount,
      overallTrend,
      averagePercentage: analytics.averagePercentage || 0,
      passRate: analytics.passRate || 0,
      topGrade: analytics.topGrade || 'N/A',
    };
  }, [analytics, gradeDistribution, performanceTrend, classComparison]);

  const getImprovementIcon = (improvement: string) => {
    switch (improvement) {
      case 'up': return <TrendingUp size={16} className="text-green-500" />;
      case 'down': return <TrendingDown size={16} className="text-red-500" />;
      default: return <Minus size={16} className="text-yellow-500" />;
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'hard': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getGradeColor = (grade: number): string => {
    if (grade <= 2) return 'bg-green-100 text-green-700';
    if (grade <= 4) return 'bg-blue-100 text-blue-700';
    if (grade <= 6) return 'bg-cyan-100 text-cyan-700';
    if (grade <= 8) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  // Get unique classes and subjects for filters - FIXED: Properly typed now
  const classes = useMemo((): string[] => {
    if (!realClassComparison || !Array.isArray(realClassComparison) || realClassComparison.length === 0) {
      return [];
    }
    return Array.from(new Set(realClassComparison.map(c => c.className))).sort();
  }, [realClassComparison]);

  const subjects = useMemo((): string[] => {
    if (!subjectAnalysis || subjectAnalysis.length === 0) return [];
    return Array.from(new Set(subjectAnalysis.map(s => s.subject))).sort();
  }, [subjectAnalysis]);

  const ChartFallback = () => (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );

  // Render chart by view mode
  const renderChartByViewMode = (type: 'bar' | 'line' | 'pie', data: any[], dataKey: string, colors?: string[]) => {
    if (isMobile || viewMode === 'mobile') {
      // Simple mobile charts (same as before but using real data)
      if (!data || data.length === 0) {
        return (
          <div className="flex items-center justify-center h-full text-gray-400">
            No data available
          </div>
        );
      }

      if (type === 'bar') {
        const maxValue = Math.max(...data.map(item => item[dataKey]));
        
        return (
          <div className="h-full flex flex-col">
            <div className="flex-1 flex items-end gap-1 sm:gap-2 px-2">
              {data.map((item, index) => {
                const heightPercentage = (item[dataKey] / maxValue) * 90;
                return (
                  <div key={index} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full rounded-t-lg transition-all duration-300 hover:opacity-90"
                      style={{
                        height: `${heightPercentage}%`,
                        backgroundColor: colors?.[index] || '#3b82f6',
                        minHeight: '4px'
                      }}
                      title={`${item[dataKey]}${dataKey.includes('Rate') || dataKey.includes('Marks') ? '%' : ''}`}
                    />
                    <div className="mt-2 text-xs text-gray-500 truncate max-w-full px-1 text-center">
                      {item.month || item.class || item.grade || item.subject}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-xs text-gray-400 text-center mt-4">
              Tap bars for details
            </div>
          </div>
        );
      }

      if (type === 'line') {
        const values = data.map(item => item[dataKey]);
        const maxValue = Math.max(...values);
        const minValue = Math.min(...values);
        const range = maxValue - minValue;

        const points = data.map((item, index) => {
          const x = (index / (data.length - 1)) * 100;
          const y = 100 - ((item[dataKey] - minValue) / range) * 100;
          return `${x}% ${y}%`;
        }).join(', ');

        return (
          <div className="h-full relative">
            <div className="absolute inset-4">
              <svg viewBox="0 0 100 100" className="w-full h-full">
                <line x1="0" y1="25" x2="100" y2="25" stroke="#e5e7eb" strokeWidth="0.5" />
                <line x1="0" y1="50" x2="100" y2="50" stroke="#e5e7eb" strokeWidth="0.5" />
                <line x1="0" y1="75" x2="100" y2="75" stroke="#e5e7eb" strokeWidth="0.5" />
                
                <polyline
                  points={points}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                
                {data.map((item, index) => {
                  const x = (index / (data.length - 1)) * 100;
                  const y = 100 - ((item[dataKey] - minValue) / range) * 100;
                  return (
                    <circle
                      key={index}
                      cx={x}
                      cy={y}
                      r="2"
                      fill="#3b82f6"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  );
                })}
              </svg>
            </div>
            <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-gray-500 px-2">
              {data.map((item, index) => (
                <span key={index} className="truncate max-w-[60px] sm:max-w-[80px] text-center">
                  {item.month || item.class || item.grade || item.subject}
                </span>
              ))}
            </div>
          </div>
        );
      }

      if (type === 'pie') {
        return (
          <div className="space-y-4">
            {data.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: colors?.[index] || '#3b82f6' }}
                  />
                  <span className="font-medium text-gray-900">{item.grade || item.subject}</span>
                </div>
                <div className="text-right">
                  <div className="font-bold text-gray-900">{item.percentage || item.passRate}%</div>
                  <div className="text-sm text-gray-500">{item.count || item.avgScore} {item.count ? 'students' : 'avg score'}</div>
                </div>
              </div>
            ))}
          </div>
        );
      }
    }

    // Desktop/Tablet view with Recharts
    if (!chartsLoaded || isLoading) {
      return <ChartFallback />;
    }

    return (
      <Suspense fallback={<ChartFallback />}>
        <ResponsiveContainer width="100%" height="100%">
          {type === 'bar' && dataKey === 'passRate' ? (
            <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="class" 
                angle={data.length > 4 ? -45 : 0}
                textAnchor={data.length > 4 ? "end" : "middle"}
                height={data.length > 4 ? 80 : 40}
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                domain={[0, 100]}
                label={{ value: 'Percentage (%)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                formatter={(value: number) => [`${value}%`, 'Pass Rate']}
                labelFormatter={(label) => `Class: ${label}`}
                contentStyle={{ 
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              />
              <Legend />
              <Bar 
                dataKey="passRate" 
                fill="#3b82f6" 
                name="Pass Rate (%)" 
                radius={[4, 4, 0, 0]}
                maxBarSize={data.length > 4 ? 40 : 60}
              />
            </BarChart>
          ) : type === 'line' ? (
            <LineChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis 
                yAxisId="left"
                tick={{ fontSize: 12 }}
                domain={[0, 100]}
              />
              <YAxis 
                yAxisId="right" 
                orientation="right"
                tick={{ fontSize: 12 }}
                domain={[0, 100]}
              />
              <Tooltip 
                formatter={(value: number, name: string) => {
                  const label = name === 'passRate' ? 'Pass Rate' : 'Avg Marks';
                  return [`${value}%`, label];
                }}
                contentStyle={{ 
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              />
              <Legend />
              <Line 
                yAxisId="left" 
                type="monotone" 
                dataKey="passRate" 
                stroke="#10b981" 
                name="Pass Rate (%)" 
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line 
                yAxisId="right" 
                type="monotone" 
                dataKey="avgMarks" 
                stroke="#3b82f6" 
                name="Avg Marks (%)" 
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          ) : type === 'pie' ? (
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ grade, percentage }: any) => `${grade} (${percentage}%)`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="count"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colors?.[index] || '#3b82f6'} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: number, name: string, props: any) => [
                  `${value} students (${props.payload.percentage}%)`,
                  `Grade ${props.payload.grade} - ${props.payload.description}`
                ]}
                contentStyle={{ 
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              />
              <Legend />
            </PieChart>
          ) : null}
        </ResponsiveContainer>
      </Suspense>
    );
  };

  // Helper function to get grade description
  const getGradeDescription = (grade: number): string => {
    if (grade === 1 || grade === 2) return 'Distinction';
    if (grade === 3 || grade === 4) return 'Merit';
    if (grade === 5 || grade === 6) return 'Credit';
    if (grade === 7 || grade === 8) return 'Satisfactory';
    return 'Fail';
  };

  if (isLoading) {
    return (
      <DashboardLayout activeTab="results">
        <div className="p-4 sm:p-6 lg:p-8 space-y-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-pulse">
            <div>
              <div className="h-8 bg-gray-200 rounded w-48 mb-2"></div>
              <div className="h-4 bg-gray-100 rounded w-64"></div>
            </div>
            <div className="h-10 bg-gray-200 rounded w-40"></div>
          </div>
          <StatsSkeleton />
          <div className="space-y-6">
            <ChartSkeleton />
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="results">
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl lg:text-4xl">
                Admin Results Analysis
              </h1>
              <p className="text-gray-600 mt-2 text-sm sm:text-base">
                Comprehensive performance analytics and insights across all classes
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-white border border-gray-300 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('mobile')}
                  className={`p-2 ${viewMode === 'mobile' ? 'bg-blue-50 text-blue-600' : 'text-gray-600'}`}
                  title="Mobile view"
                >
                  <Smartphone size={18} />
                </button>
                <button
                  onClick={() => setViewMode('tablet')}
                  className={`p-2 ${viewMode === 'tablet' ? 'bg-blue-50 text-blue-600' : 'text-gray-600'}`}
                  title="Tablet view"
                >
                  <Tablet size={18} />
                </button>
                <button
                  onClick={() => setViewMode('desktop')}
                  className={`p-2 ${viewMode === 'desktop' ? 'bg-blue-50 text-blue-600' : 'text-gray-600'}`}
                  title="Desktop view"
                >
                  <Monitor size={18} />
                </button>
              </div>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                {showDetails ? <EyeOff size={18} /> : <Eye size={18} />}
                <span className="hidden sm:inline">
                  {showDetails ? 'Hide Details' : 'Show Details'}
                </span>
              </button>
              <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
                <Download size={18} />
                <span className="hidden sm:inline">Export</span>
              </button>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
            <p className="text-gray-600 font-medium text-sm">Total Students</p>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-2xl sm:text-3xl font-bold text-gray-900">{summaryStats.totalStudents}</p>
              <span className="text-sm text-gray-500">students</span>
            </div>
            <div className="flex items-center gap-1 mt-2">
              <TrendingUp size={14} className="text-green-500" />
              <span className="text-xs text-green-600">School-wide</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
            <p className="text-gray-600 font-medium text-sm">Avg Pass Rate</p>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-2xl sm:text-3xl font-bold text-green-600">{summaryStats.averagePassRate}%</p>
              <span className="text-sm text-gray-500">across all classes</span>
            </div>
            <div className="flex items-center gap-1 mt-2">
              {getImprovementIcon(summaryStats.overallTrend)}
              <span className="text-xs text-gray-600">Overall trend</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
            <p className="text-gray-600 font-medium text-sm">Avg Score</p>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-2xl sm:text-3xl font-bold text-blue-600">{summaryStats.averageScore}%</p>
              <span className="text-sm text-gray-500">mean marks</span>
            </div>
            <div className="flex items-center gap-1 mt-2">
              <TrendingUp size={14} className="text-green-500" />
              <span className="text-xs text-green-600">Term {selectedTerm}</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
            <p className="text-gray-600 font-medium text-sm">Top Grades (1-2)</p>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-2xl sm:text-3xl font-bold text-purple-600">{summaryStats.topGrades}</p>
              <span className="text-sm text-gray-500">students</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {summaryStats.totalStudents > 0 
                ? Math.round((summaryStats.topGrades / summaryStats.totalStudents) * 100) 
                : 0}% of total
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
            <p className="text-gray-600 font-medium text-sm">Success Rate</p>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-2xl sm:text-3xl font-bold text-amber-600">{summaryStats.passRate}%</p>
              <span className="text-sm text-gray-500">passing</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className="bg-green-500 h-2 rounded-full" 
                style={{ width: `${summaryStats.passRate}%` }} 
              />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-8 bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center gap-6">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Filter size={16} className="inline mr-2" />
                  Filter by Class
                </label>
                <select
                  value={selectedClass}
                  onChange={e => setSelectedClass(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  <option value="all">All Classes</option>
                  {classes.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Filter size={16} className="inline mr-2" />
                  Filter by Subject
                </label>
                <select
                  value={selectedSubject}
                  onChange={e => setSelectedSubject(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  <option value="all">All Subjects</option>
                  {subjects.map(subject => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Term
                </label>
                <select
                  value={selectedTerm}
                  onChange={e => setSelectedTerm(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  <option value="Term 1">Term 1</option>
                  <option value="Term 2">Term 2</option>
                  <option value="Term 3">Term 3</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Year
                </label>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  <option value={2024}>2024</option>
                  <option value={2025}>2025</option>
                  <option value={2026}>2026</option>
                </select>
              </div>
            </div>
            {showDetails && (
              <div className="lg:w-64">
                <button className="w-full px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                  Advanced Filters
                </button>
              </div>
            )}
          </div>
          <div className="mt-4 text-sm text-gray-600">
            <p>
              Showing: {selectedClass === 'all' ? 'All Classes' : selectedClass} • 
              {selectedSubject === 'all' ? ' All Subjects' : ` ${selectedSubject}`} • 
              {` ${selectedTerm}, ${selectedYear}`}
            </p>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="space-y-6">
          {/* Performance Trend */}
          <ChartContainer
            title="Performance Trend"
            description="Progression of pass rates and average marks across assessments"
            isLoading={isLoading}
            onRefresh={() => refetch()}
          >
            {renderChartByViewMode('line', performanceTrend, 'passRate')}
          </ChartContainer>

          {/* Grade Distribution */}
          <ChartContainer
            title="Grade Distribution (1-9 Scale)"
            description="Spread of student performance across grades"
            isLoading={isLoading}
            onRefresh={() => refetch()}
            className="lg:col-span-2"
          >
            {renderChartByViewMode('pie', gradeDistribution, 'count', [
              '#10b981', '#059669', '#3b82f6', '#2563eb', '#06b6d4', 
              '#0891b2', '#f59e0b', '#ea580c', '#ef4444'
            ])}
          </ChartContainer>

          {/* Class Comparison */}
          <ChartContainer
            title="Class Performance Comparison"
            description="Pass rates across different classes and forms"
            isLoading={isLoading}
            onRefresh={() => refetch()}
          >
            {renderChartByViewMode('bar', classComparison, 'passRate')}
          </ChartContainer>

          {/* Subject Analysis (Only show on desktop/tablet) */}
          {(viewMode !== 'mobile' && subjectAnalysis.length > 0) && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-900">Subject Analysis</h3>
                <p className="text-sm text-gray-600 mt-1">Performance breakdown by subject</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Subject</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Pass Rate</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Avg Score</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Top Grade</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Difficulty</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Trend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {subjectAnalysis.map((subject) => (
                      <tr key={subject.subject} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900">{subject.subject}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="font-semibold text-gray-900">{subject.passRate}%</div>
                            <div className="w-24 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-green-500 h-2 rounded-full" 
                                style={{ width: `${subject.passRate}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-medium text-gray-900">{subject.avgScore}%</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getGradeColor(parseInt(subject.topGrade) || 9)}`}>
                            {subject.topGrade}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getDifficultyColor(subject.difficulty)}`}>
                            {subject.difficulty.charAt(0).toUpperCase() + subject.difficulty.slice(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <TrendingUp size={16} className="text-green-500" />
                            <span className="text-sm text-gray-600">+2.5%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Quick Insights (Mobile-friendly alternative to subject analysis) */}
          {viewMode === 'mobile' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Insights</h3>
              <div className="space-y-4">
                {summaryStats.topGrades > 0 && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                        <TrendingUp size={20} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">Strong Performance</h4>
                        <p className="text-sm text-gray-600">
                          {summaryStats.topGrades} students achieved Distinction grades (1-2)
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {gradeDistribution.length > 0 && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                        <BarChart3 size={20} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">Grade Distribution</h4>
                        <p className="text-sm text-gray-600">
                          {gradeDistribution.reduce((sum, g) => sum + g.count, 0)} students assessed
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {subjectAnalysis.length > 0 && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-600">
                        <Info size={20} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">Top Subject</h4>
                        <p className="text-sm text-gray-600">
                          {subjectAnalysis[0]?.subject}: {subjectAnalysis[0]?.passRate}% pass rate
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Empty State */}
        {results.length === 0 && !isLoading && (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <div className="text-gray-400 mb-4">
              <BarChart3 className="w-16 h-16 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Data</h3>
            <p className="text-gray-600 mb-6">
              No results have been entered for the selected filters. Check back after teachers have entered results.
            </p>
            <div className="text-sm text-gray-500">
              <p>Make sure:</p>
              <ul className="mt-2 space-y-1">
                <li>• Teachers have entered results for the selected term</li>
                <li>• The correct year and term are selected</li>
                <li>• Results use the correct exam types (Week 4, Week 8, End of Term)</li>
              </ul>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="text-sm text-gray-600">
              <span className="font-medium">Last updated:</span> Just now
              <span className="mx-2">•</span>
              <span className="font-medium">View:</span> {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}
              <span className="mx-2">•</span>
              <span className="font-medium">Data:</span> {results.length} records
            </div>
            <div className="flex items-center gap-3">
              <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                Share Report
              </button>
              <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                Schedule Export
              </button>
              <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                Print Summary
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}