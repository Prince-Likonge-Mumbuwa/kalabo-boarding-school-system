import { DashboardLayout } from '@/components/DashboardLayout';
import { useState } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Filter } from 'lucide-react';

export default function AdminResultsAnalysis() {
  const [selectedClass, setSelectedClass] = useState('all');

  const gradeDistribution = [
    { grade: 'A', count: 145, percentage: 18 },
    { grade: 'B', count: 210, percentage: 28 },
    { grade: 'C', count: 280, percentage: 35 },
    { grade: 'D', count: 95, percentage: 12 },
    { grade: 'F', count: 45, percentage: 6 },
  ];

  const performanceTrend = [
    { month: 'Jan', passRate: 72, avgMarks: 58 },
    { month: 'Feb', passRate: 75, avgMarks: 61 },
    { month: 'Mar', passRate: 78, avgMarks: 64 },
    { month: 'Apr', passRate: 80, avgMarks: 66 },
    { month: 'May', passRate: 82, avgMarks: 68 },
    { month: 'Jun', passRate: 85, avgMarks: 71 },
  ];

  const classComparison = [
    { class: 'Form 4A', passRate: 88, avgMarks: 72 },
    { class: 'Form 4B', passRate: 82, avgMarks: 68 },
    { class: 'Form 3A', passRate: 85, avgMarks: 70 },
    { class: 'Form 3B', passRate: 80, avgMarks: 66 },
    { class: 'Form 2A', passRate: 78, avgMarks: 64 },
    { class: 'Form 1A', passRate: 75, avgMarks: 61 },
  ];

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

  const classes = ['Form 4A', 'Form 4B', 'Form 3A', 'Form 3B', 'Form 2A', 'Form 1A'];

  return (
    <DashboardLayout activeTab="results">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Results Analysis</h1>
          <p className="text-gray-600 mt-1">Comprehensive analysis of school performance</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <Filter size={20} className="text-gray-500" />
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Class</label>
              <select
                value={selectedClass}
                onChange={e => setSelectedClass(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Classes</option>
                {classes.map(cls => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-gray-600 font-medium text-sm">Total Students Analyzed</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">775</p>
            <p className="text-xs text-gray-500 mt-2">Across all forms</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-gray-600 font-medium text-sm">Average Pass Rate</p>
            <p className="text-3xl font-bold text-green-600 mt-2">81.4%</p>
            <p className="text-xs text-gray-500 mt-2">School-wide average</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-gray-600 font-medium text-sm">Average Score</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">67.8%</p>
            <p className="text-xs text-gray-500 mt-2">Mean performance</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-gray-600 font-medium text-sm">Top Grade (A)</p>
            <p className="text-3xl font-bold text-purple-600 mt-2">145</p>
            <p className="text-xs text-gray-500 mt-2">Students with A grade</p>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Grade Distribution */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Grade Distribution</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={gradeDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ grade, percentage }) => `${grade} (${percentage}%)`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {gradeDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Class Comparison */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Class Comparison</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={classComparison}
                margin={{ top: 20, right: 30, left: 0, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="class" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="passRate" fill="#10b981" name="Pass Rate (%)" />
                <Bar dataKey="avgMarks" fill="#3b82f6" name="Avg Marks (%)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Performance Trend */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm lg:col-span-2">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Performance Trend Over Time</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={performanceTrend}
                margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="passRate" stroke="#10b981" name="Pass Rate (%)" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="avgMarks" stroke="#3b82f6" name="Avg Marks (%)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Grade Statistics Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">Detailed Statistics</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Grade</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Count</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Percentage</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Distribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {gradeDistribution.map((row) => (
                  <tr key={row.grade} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        row.grade === 'A' ? 'bg-green-100 text-green-700' :
                        row.grade === 'B' ? 'bg-blue-100 text-blue-700' :
                        row.grade === 'C' ? 'bg-yellow-100 text-yellow-700' :
                        row.grade === 'D' ? 'bg-orange-100 text-orange-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {row.grade}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-900">{row.count}</td>
                    <td className="px-6 py-4 text-gray-600">{row.percentage}%</td>
                    <td className="px-6 py-4">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${row.percentage * 2}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
