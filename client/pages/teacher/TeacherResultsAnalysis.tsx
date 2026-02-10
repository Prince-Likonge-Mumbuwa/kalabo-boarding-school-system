import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useMemo } from 'react';
import { useResultsAnalytics } from '@/hooks/useResults';
import { useAuth } from '@/hooks/useAuth';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Filter, Loader2, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getGradeDescription } from '@/services/resultsService';

// ==================== TYPES ====================
interface GradeDistribution {
  grade: number;
  count: number;
  percentage: number;
  description: string;
}

interface PerformanceTrendData {
  test: string;
  avgMarks: number;
  passRate: number;
  improvement?: 'up' | 'down' | 'stable';
}

const COLORS = ['#10b981', '#059669', '#3b82f6', '#2563eb', '#06b6d4', '#0891b2', '#f59e0b', '#ea580c', '#ef4444'];

// ==================== MAIN COMPONENT ====================
export default function TeacherResultsAnalysis() {
  const { user } = useAuth();
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedTerm, setSelectedTerm] = useState('Term 2');
  const [selectedYear, setSelectedYear] = useState(2024);

  // Get teacher's assigned classes and subjects
  const { assignments, isLoading: assignmentsLoading } = useTeacherAssignments(user?.id || '');

  // Get analytics data
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

  // Extract unique classes and subjects from assignments
  const assignedClasses = useMemo(() => {
    if (!assignments) return [];
    return Array.from(new Set(assignments.map(a => ({
      id: a.classId,
      name: a.className,
    }))));
  }, [assignments]);

  const assignedSubjects = useMemo(() => {
    if (!assignments) return [];
    
    // If a class is selected, filter subjects for that class
    if (selectedClass !== 'all') {
      return Array.from(new Set(
        assignments
          .filter(a => a.classId === selectedClass)
          .map(a => ({
            id: a.subject,
            name: a.subject,
          }))
      ));
    }
    
    // Otherwise, show all assigned subjects
    return Array.from(new Set(assignments.map(a => ({
      id: a.subject,
      name: a.subject,
    }))));
  }, [assignments, selectedClass]);

  // Calculate grade distribution
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

    return Array.from(gradeCounts.entries()).map(([grade, count]) => ({
      grade,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      description: getGradeDescription(grade),
    }));
  }, [results]);

  // Calculate performance trend
  const performanceTrend = useMemo(() => {
    if (!results || results.length === 0) return [];

    const examTypes = ['week4', 'week8', 'endOfTerm'] as const;
    const examLabels = {
      week4: 'Week 4',
      week8: 'Week 8',
      endOfTerm: 'End of Term',
    };

    const trendData: PerformanceTrendData[] = examTypes.map(examType => {
      const examResults = results.filter(r => r.examType === examType && r.percentage >= 0);
      const totalPercentage = examResults.reduce((sum, r) => sum + r.percentage, 0);
      const avgMarks = examResults.length > 0 ? Math.round(totalPercentage / examResults.length) : 0;
      const passRate = examResults.length > 0 
        ? Math.round((examResults.filter(r => r.percentage >= 50).length / examResults.length) * 100)
        : 0;

      return {
        test: examLabels[examType],
        avgMarks,
        passRate,
      };
    });

    // Add improvement indicators
    return trendData.map((data, index) => {
      if (index === 0) return { ...data, improvement: 'stable' as const };
      
      const prevData = trendData[index - 1];
      const avgDiff = data.avgMarks - prevData.avgMarks;
      const passDiff = data.passRate - prevData.passRate;
      
      let improvement: 'up' | 'down' | 'stable' = 'stable';
      if (avgDiff > 2 || passDiff > 3) improvement = 'up';
      else if (avgDiff < -2 || passDiff < -3) improvement = 'down';
      
      return { ...data, improvement };
    });
  }, [results]);

  // Calculate class comparison (only for teacher's classes)
  const classComparison = useMemo(() => {
    if (!results || results.length === 0) return [];

    const classMap = new Map<string, {
      classId: string;
      className: string;
      total: number;
      count: number;
      passed: number;
    }>();

    results
      .filter(r => r.examType === 'endOfTerm' && r.percentage >= 0)
      .forEach(result => {
        if (!classMap.has(result.classId)) {
          classMap.set(result.classId, {
            classId: result.classId,
            className: result.className,
            total: 0,
            count: 0,
            passed: 0,
          });
        }

        const classData = classMap.get(result.classId)!;
        classData.total += result.percentage;
        classData.count += 1;
        if (result.percentage >= 50) classData.passed += 1;
      });

    return Array.from(classMap.values()).map(data => ({
      class: data.className,
      avgMarks: data.count > 0 ? Math.round(data.total / data.count) : 0,
      passRate: data.count > 0 ? Math.round((data.passed / data.count) * 100) : 0,
      totalStudents: data.count,
    }));
  }, [results]);

  // Summary statistics
  const summaryStats = useMemo(() => {
    if (!analytics) return {
      totalStudents: 0,
      averagePercentage: 0,
      passRate: 0,
      topGrade: 'N/A',
      averageGrade: 0,
    };

    // Calculate average grade from results
    const endOfTermResults = results?.filter(r => r.examType === 'endOfTerm' && r.grade > 0) || [];
    const averageGrade = endOfTermResults.length > 0 
      ? Math.round(endOfTermResults.reduce((sum, r) => sum + r.grade, 0) / endOfTermResults.length * 10) / 10
      : 0;

    return {
      ...analytics,
      averageGrade,
    };
  }, [analytics, results]);

  const getImprovementIcon = (improvement?: 'up' | 'down' | 'stable') => {
    switch (improvement) {
      case 'up': return <TrendingUp size={14} className="text-green-500" />;
      case 'down': return <TrendingDown size={14} className="text-red-500" />;
      default: return <Minus size={14} className="text-yellow-500" />;
    }
  };

  const getGradeColor = (grade: number): string => {
    if (grade <= 2) return 'bg-green-100 text-green-700';
    if (grade <= 4) return 'bg-blue-100 text-blue-700';
    if (grade <= 6) return 'bg-cyan-100 text-cyan-700';
    if (grade <= 8) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  if (assignmentsLoading || isLoading) {
    return (
      <DashboardLayout activeTab="analysis">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading analytics data...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="analysis">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Results Analysis</h1>
            <p className="text-gray-600 mt-1">Analyze your class performance and student progress</p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} />
            Refresh Data
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Filter size={16} className="inline mr-2" />
                Select Class
              </label>
              <select
                value={selectedClass}
                onChange={e => {
                  setSelectedClass(e.target.value);
                  setSelectedSubject('all'); // Reset subject when class changes
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All My Classes</option>
                {assignedClasses.map(cls => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Filter size={16} className="inline mr-2" />
                Select Subject
              </label>
              <select
                value={selectedSubject}
                onChange={e => setSelectedSubject(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={assignedSubjects.length === 0}
              >
                <option value="all">All My Subjects</option>
                {assignedSubjects.map(subject => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={2024}>2024</option>
                <option value={2025}>2025</option>
                <option value={2026}>2026</option>
              </select>
            </div>
          </div>
          
          {/* Active Filters Info */}
          <div className="mt-4 text-sm text-gray-600">
            <p>
              Showing: {selectedClass === 'all' ? 'All Classes' : assignedClasses.find(c => c.id === selectedClass)?.name} • 
              {selectedSubject === 'all' ? ' All Subjects' : ` ${selectedSubject}`} • 
              {` ${selectedTerm}, ${selectedYear}`}
            </p>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-gray-600 font-medium text-sm">Total Students</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{summaryStats.totalStudents}</p>
            <p className="text-xs text-gray-500 mt-2">
              In {selectedClass === 'all' ? 'all classes' : assignedClasses.find(c => c.id === selectedClass)?.name}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-gray-600 font-medium text-sm">Average Score</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">{summaryStats.averagePercentage}%</p>
            <p className="text-xs text-gray-500 mt-2">Class average</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-gray-600 font-medium text-sm">Average Grade</p>
            <p className="text-3xl font-bold text-purple-600 mt-2">{summaryStats.averageGrade.toFixed(1)}</p>
            <p className="text-xs text-gray-500 mt-2">1-9 scale</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-gray-600 font-medium text-sm">Pass Rate</p>
            <p className="text-3xl font-bold text-green-600 mt-2">{summaryStats.passRate}%</p>
            <p className="text-xs text-gray-500 mt-2">Students passing (≥50%)</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-gray-600 font-medium text-sm">Top Grade</p>
            <p className="text-3xl font-bold text-amber-600 mt-2">{summaryStats.topGrade}</p>
            <p className="text-xs text-gray-500 mt-2">Highest grade achieved</p>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Grade Distribution */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Grade Distribution (1-9 Scale)</h2>
            <p className="text-sm text-gray-600 mb-4">End of Term results only</p>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={gradeDistribution.filter(g => g.count > 0)}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ grade, percentage }: { grade: number; percentage: number }) => `${grade} (${percentage}%)`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {gradeDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number, name: string, props: any) => [
                    `${value} students (${props.payload.percentage}%)`,
                    `Grade ${props.payload.grade} - ${props.payload.description}`
                  ]}
                  contentStyle={{ borderRadius: '8px', padding: '12px' }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Class Comparison (if multiple classes) */}
          {classComparison.length > 1 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">My Class Comparison</h2>
              <p className="text-sm text-gray-600 mb-4">End of Term results comparison</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={classComparison}
                  margin={{ top: 20, right: 30, left: 0, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="class" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: number, name: string) => [
                      `${value}${typeof name === 'string' && name.includes('Rate') ? '%' : ''}`, 
                      name
                    ]}
                    labelFormatter={(label: string) => `Class: ${label}`}
                    contentStyle={{ borderRadius: '8px', padding: '12px' }}
                  />
                  <Legend />
                  <Bar dataKey="avgMarks" fill="#3b82f6" name="Avg Marks (%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="passRate" fill="#10b981" name="Pass Rate (%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Performance Trend */}
          <div className={`bg-white rounded-xl border border-gray-200 p-6 shadow-sm ${classComparison.length <= 1 ? 'lg:col-span-2' : ''}`}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Performance Improvement Trend</h2>
            <p className="text-sm text-gray-600 mb-4">Across all assessments (Week 4, Week 8, End of Term)</p>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={performanceTrend}
                margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="test" />
                <YAxis yAxisId="left" domain={[0, 100]} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
                <Tooltip 
                  formatter={(value: number, name: string) => [
                    `${value}${typeof name === 'string' && (name.includes('Rate') || name.includes('Marks')) ? '%' : ''}`, 
                    name
                  ]}
                  contentStyle={{ borderRadius: '8px', padding: '12px' }}
                />
                <Legend />
                <Line 
                  yAxisId="left" 
                  type="monotone" 
                  dataKey="avgMarks" 
                  stroke="#3b82f6" 
                  name="Avg Marks (%)" 
                  strokeWidth={2}
                  dot={{ r: 5 }}
                  activeDot={{ r: 8 }}
                />
                <Line 
                  yAxisId="right" 
                  type="monotone" 
                  dataKey="passRate" 
                  stroke="#10b981" 
                  name="Pass Rate (%)" 
                  strokeWidth={2}
                  dot={{ r: 5 }}
                  activeDot={{ r: 8 }}
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-4 flex items-center gap-4 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <TrendingUp size={14} className="text-green-500" /> Improving
              </span>
              <span className="flex items-center gap-1">
                <TrendingDown size={14} className="text-red-500" /> Declining
              </span>
              <span className="flex items-center gap-1">
                <Minus size={14} className="text-yellow-500" /> Stable
              </span>
            </div>
          </div>
        </div>

        {/* Detailed Statistics */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-bold text-gray-900">Grade Statistics (End of Term Only)</h2>
            <p className="text-sm text-gray-600 mt-1">Detailed breakdown of student performance by grade</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Grade</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Description</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Count</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Percentage</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Distribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {gradeDistribution.map((row) => (
                  <tr key={row.grade} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getGradeColor(row.grade)}`}>
                        {row.grade}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-700">{row.description}</td>
                    <td className="px-6 py-4 font-semibold text-gray-900">{row.count}</td>
                    <td className="px-6 py-4 text-gray-600">{row.percentage}%</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-xs">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all"
                            style={{ width: `${row.percentage}%` }}
                          />
                        </div>
                        {row.count > 0 && (
                          <span className="text-sm text-gray-500">
                            {row.count} student{row.count !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {gradeDistribution.length > 0 && (
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td className="px-6 py-4 font-semibold text-gray-900" colSpan={2}>Total</td>
                    <td className="px-6 py-4 font-semibold text-gray-900">
                      {gradeDistribution.reduce((sum, row) => sum + row.count, 0)}
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-900">100%</td>
                    <td className="px-6 py-4"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Empty State */}
        {results.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="text-gray-400 mb-4">
              <BarChart className="w-16 h-16 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Data</h3>
            <p className="text-gray-600 mb-6">
              No results have been entered for the selected filters. Start by entering results in the Results Entry page.
            </p>
            <div className="text-sm text-gray-500">
              <p>Make sure you have:</p>
              <ul className="mt-2 space-y-1">
                <li>• Selected the correct term and year</li>
                <li>• Entered results for your assigned classes</li>
                <li>• Saved results using the correct exam types (Week 4, Week 8, End of Term)</li>
              </ul>
            </div>
          </div>
        )}

        {/* Help Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="font-bold text-blue-900 mb-3">Understanding Your Analytics</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium text-blue-800 mb-2">1-9 Grading System</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• <span className="font-semibold">1-2:</span> Distinction (70-100%)</li>
                <li>• <span className="font-semibold">3-4:</span> Merit (60-69%)</li>
                <li>• <span className="font-semibold">5-6:</span> Credit (50-59%)</li>
                <li>• <span className="font-semibold">7-8:</span> Satisfactory (40-49%)</li>
                <li>• <span className="font-semibold">9:</span> Fail (0-39%)</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-blue-800 mb-2">Exam Types</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• <span className="font-semibold">Week 4:</span> First monthly assessment</li>
                <li>• <span className="font-semibold">Week 8:</span> Mid-term assessment</li>
                <li>• <span className="font-semibold">End of Term:</span> Final examination</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}