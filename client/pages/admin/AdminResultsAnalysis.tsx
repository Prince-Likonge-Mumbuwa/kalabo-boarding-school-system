import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
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
  Monitor
} from 'lucide-react';

// Dynamically import chart components for code splitting (React.lazy instead of Next.js dynamic)
const ResponsiveContainer = lazy(() => 
  import('recharts').then(mod => ({ default: mod.ResponsiveContainer }))
);
const BarChart = lazy(() => 
  import('recharts').then(mod => ({ default: mod.BarChart }))
);
const LineChart = lazy(() => 
  import('recharts').then(mod => ({ default: mod.LineChart }))
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

// Or alternatively, import all at once for better performance
const ChartFallback = () => (
  <div className="flex items-center justify-center h-full">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
);

// ==================== TYPES & INTERFACES ====================
interface GradeDistribution {
  grade: string;
  count: number;
  percentage: number;
  color: string;
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
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {[1, 2, 3, 4].map((i) => (
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

// ==================== MOBILE-FRIENDLY CHART COMPONENTS ====================
interface MobileChartProps {
  data: any[];
  type: 'bar' | 'line' | 'pie';
  dataKey: string;
  height?: number;
  colors?: string[];
}

const MobileBarChart = ({ data, dataKey, height = 200, colors = ['#3b82f6'] }: MobileChartProps) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        No data available
      </div>
    );
  }

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
                  backgroundColor: colors[index % colors.length],
                  minHeight: '4px'
                }}
                title={`${item[dataKey]}`}
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
};

const MobileLineChart = ({ data, dataKey, height = 200 }: MobileChartProps) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        No data available
      </div>
    );
  }

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
          {/* Grid lines */}
          <line x1="0" y1="25" x2="100" y2="25" stroke="#e5e7eb" strokeWidth="0.5" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="#e5e7eb" strokeWidth="0.5" />
          <line x1="0" y1="75" x2="100" y2="75" stroke="#e5e7eb" strokeWidth="0.5" />
          
          {/* Line */}
          <polyline
            points={points}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          
          {/* Points */}
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
};

// ==================== MAIN COMPONENT ====================
export default function AdminResultsAnalysis() {
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState('semester');
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile' | 'tablet'>('desktop');
  const [showDetails, setShowDetails] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [chartsLoaded, setChartsLoaded] = useState(false);

  // Mock data
  const gradeDistribution: GradeDistribution[] = useMemo(() => [
    { grade: 'A', count: 145, percentage: 18, color: '#10b981', description: 'Excellent' },
    { grade: 'B', count: 210, percentage: 28, color: '#3b82f6', description: 'Good' },
    { grade: 'C', count: 280, percentage: 35, color: '#f59e0b', description: 'Average' },
    { grade: 'D', count: 95, percentage: 12, color: '#ef4444', description: 'Below Average' },
    { grade: 'E', count: 45, percentage: 6, color: '#8b5cf6', description: 'Poor' },
  ], []);

  const performanceTrend: PerformanceTrend[] = useMemo(() => [
    { month: 'Jan', passRate: 72, avgMarks: 58, improvement: 'up' },
    { month: 'Feb', passRate: 75, avgMarks: 61, improvement: 'up' },
    { month: 'Mar', passRate: 78, avgMarks: 64, improvement: 'up' },
    { month: 'Apr', passRate: 80, avgMarks: 66, improvement: 'stable' },
    { month: 'May', passRate: 82, avgMarks: 68, improvement: 'up' },
    { month: 'Jun', passRate: 85, avgMarks: 71, improvement: 'up' },
  ], []);

  const classComparison: ClassPerformance[] = useMemo(() => [
    { class: 'Form 4A', form: '4', passRate: 88, avgMarks: 72, totalStudents: 35, improvement: 12 },
    { class: 'Form 4B', form: '4', passRate: 82, avgMarks: 68, totalStudents: 32, improvement: 8 },
    { class: 'Form 3A', form: '3', passRate: 85, avgMarks: 70, totalStudents: 38, improvement: 15 },
    { class: 'Form 3B', form: '3', passRate: 80, avgMarks: 66, totalStudents: 36, improvement: 10 },
    { class: 'Form 2A', form: '2', passRate: 78, avgMarks: 64, totalStudents: 40, improvement: 5 },
    { class: 'Form 1A', form: '1', passRate: 75, avgMarks: 61, totalStudents: 42, improvement: 3 },
  ], []);

  const subjectAnalysis: SubjectAnalysis[] = useMemo(() => [
    { subject: 'Mathematics', passRate: 92, avgScore: 78, topGrade: 'A', difficulty: 'medium' },
    { subject: 'English', passRate: 88, avgScore: 75, topGrade: 'B+', difficulty: 'easy' },
    { subject: 'Science', passRate: 85, avgScore: 72, topGrade: 'B', difficulty: 'hard' },
    { subject: 'History', passRate: 90, avgScore: 76, topGrade: 'A-', difficulty: 'easy' },
    { subject: 'Geography', passRate: 87, avgScore: 74, topGrade: 'B+', difficulty: 'medium' },
  ], []);

  const classes = ['Form 4A', 'Form 4B', 'Form 3A', 'Form 3B', 'Form 2A', 'Form 1A'];
  const periods = ['week', 'month', 'quarter', 'semester', 'year'];

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

  // Simulate loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
      setChartsLoaded(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Summary statistics
  const summaryStats = useMemo(() => ({
    totalStudents: classComparison.reduce((sum, cls) => sum + cls.totalStudents, 0),
    averagePassRate: Math.round(classComparison.reduce((sum, cls) => sum + cls.passRate, 0) / classComparison.length),
    averageScore: Math.round(classComparison.reduce((sum, cls) => sum + cls.avgMarks, 0) / classComparison.length),
    topGrades: gradeDistribution.find(g => g.grade === 'A')?.count || 0,
    overallTrend: performanceTrend[performanceTrend.length - 1].improvement,
  }), [classComparison, gradeDistribution, performanceTrend]);

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

  const renderChartByViewMode = (type: 'bar' | 'line' | 'pie', data: any[], dataKey: string, colors?: string[]) => {
    if (isMobile || viewMode === 'mobile') {
      switch (type) {
        case 'bar':
          return <MobileBarChart data={data} type="bar" dataKey={dataKey} colors={colors} />;
        case 'line':
          return <MobileLineChart data={data} type="line" dataKey={dataKey} />;
        case 'pie':
          // For pie charts on mobile, show simple list with percentages
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
    if (!chartsLoaded) {
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
            <>
              {/* We need to use the Pie component as a child of PieChart */}
              {/* Since we can't create a PieChart component dynamically, we'll use a different approach */}
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-gray-400 mb-2">Pie Chart Loading...</div>
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              </div>
            </>
          ) : null}
        </ResponsiveContainer>
      </Suspense>
    );
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
                Results Analysis
              </h1>
              <p className="text-gray-600 mt-2 text-sm sm:text-base">
                Comprehensive performance analytics and insights
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
              <span className="text-xs text-green-600">+5% from last term</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
            <p className="text-gray-600 font-medium text-sm">Avg Pass Rate</p>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-2xl sm:text-3xl font-bold text-green-600">{summaryStats.averagePassRate}%</p>
              <span className="text-sm text-gray-500">school-wide</span>
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
              <span className="text-xs text-green-600">+3.2% improvement</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
            <p className="text-gray-600 font-medium text-sm">Top Grades (A)</p>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-2xl sm:text-3xl font-bold text-purple-600">{summaryStats.topGrades}</p>
              <span className="text-sm text-gray-500">students</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">{gradeDistribution[0].percentage}% of total</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
            <p className="text-gray-600 font-medium text-sm">Success Rate</p>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-2xl sm:text-3xl font-bold text-amber-600">94%</p>
              <span className="text-sm text-gray-500">passing</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div className="bg-green-500 h-2 rounded-full" style={{ width: '94%' }} />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-8 bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center gap-6">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                  Time Period
                </label>
                <select
                  value={selectedPeriod}
                  onChange={e => setSelectedPeriod(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  {periods.map(period => (
                    <option key={period} value={period}>
                      {period.charAt(0).toUpperCase() + period.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Filter size={16} className="inline mr-2" />
                  View Type
                </label>
                <div className="flex items-center gap-2">
                  <button className="p-2 text-blue-600 bg-blue-50 rounded-lg">
                    <BarChart3 size={18} />
                  </button>
                  <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                    <LineChartIcon size={18} />
                  </button>
                  <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                    <PieChartIcon size={18} />
                  </button>
                </div>
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
        </div>

        {/* Charts Grid */}
        <div className="space-y-6">
          {/* Performance Trend */}
          <ChartContainer
            title="Performance Trend"
            description="Monthly progression of pass rates and average marks"
            isLoading={isLoading}
          >
            {renderChartByViewMode('line', performanceTrend, 'passRate')}
          </ChartContainer>

          {/* Grade Distribution */}
          <ChartContainer
            title="Grade Distribution"
            description="Spread of student performance across grades"
            isLoading={isLoading}
            className="lg:col-span-2"
          >
            {renderChartByViewMode('pie', gradeDistribution, 'count', ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'])}
          </ChartContainer>

          {/* Class Comparison */}
          <ChartContainer
            title="Class Performance Comparison"
            description="Pass rates across different classes and forms"
            isLoading={isLoading}
          >
            {renderChartByViewMode('bar', classComparison, 'passRate')}
          </ChartContainer>

          {/* Subject Analysis (Only show on desktop/tablet) */}
          {(viewMode !== 'mobile') && (
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
                          <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
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
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                      <TrendingUp size={20} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">Strong Performance</h4>
                      <p className="text-sm text-gray-600">Math pass rate at 92% - highest among subjects</p>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                      <BarChart3 size={20} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">Grade Distribution</h4>
                      <p className="text-sm text-gray-600">35% of students achieved C grade - largest group</p>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-600">
                      <Info size={20} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">Attention Needed</h4>
                      <p className="text-sm text-gray-600">6% of students (45) received E grade - needs intervention</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="text-sm text-gray-600">
              <span className="font-medium">Last updated:</span> Today, 11:45 AM
              <span className="mx-2">•</span>
              <span className="font-medium">View:</span> {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}
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