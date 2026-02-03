import { DashboardLayout } from '@/components/DashboardLayout';
import { useState } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Filter } from 'lucide-react';

export default function TeacherResultsAnalysis() {
  const [selectedClass, setSelectedClass] = useState('Form 4A');
  const [selectedSubject, setSelectedSubject] = useState('Mathematics');

  const classes = ['Form 4A', 'Form 4B', 'Form 3A', 'Form 3B'];
  const subjects = ['Mathematics', 'English', 'Science', 'History'];

  const gradeDistribution = [
    { grade: 'A', count: 8, percentage: 23 },
    { grade: 'B', count: 12, percentage: 34 },
    { grade: 'C', count: 10, percentage: 29 },
    { grade: 'D', count: 4, percentage: 11 },
    { grade: 'F', count: 1, percentage: 3 },
  ];

  const performanceTrend = [
    { test: 'Test 1', avgMarks: 62, passRate: 70 },
    { test: 'Test 2', avgMarks: 65, passRate: 73 },
    { test: 'Test 3', avgMarks: 68, passRate: 76 },
    { test: 'Midterm', avgMarks: 71, passRate: 79 },
    { test: 'Final', avgMarks: 74, passRate: 82 },
  ];

  const classComparison = [
    { class: 'Form 4A', avgMarks: 74, passRate: 85 },
    { class: 'Form 4B', avgMarks: 68, passRate: 78 },
    { class: 'Form 3A', avgMarks: 70, passRate: 82 },
    { class: 'Form 3B', avgMarks: 66, passRate: 75 },
  ];

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <DashboardLayout activeTab="analysis">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Results Analysis</h1>
          <p className="text-gray-600 mt-1">Analyze your class performance and student progress</p>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Class</label>
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {classes.map(cls => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Subject</label>
            <select
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {subjects.map(subject => (
                <option key={subject} value={subject}>{subject}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-gray-600 font-medium text-sm">Total Students</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">35</p>
            <p className="text-xs text-gray-500 mt-2">In {selectedClass}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-gray-600 font-medium text-sm">Average Score</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">74%</p>
            <p className="text-xs text-gray-500 mt-2">Class average</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-gray-600 font-medium text-sm">Pass Rate</p>
            <p className="text-3xl font-bold text-green-600 mt-2">85%</p>
            <p className="text-xs text-gray-500 mt-2">Above 50%</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-gray-600 font-medium text-sm">Top Score</p>
            <p className="text-3xl font-bold text-purple-600 mt-2">95%</p>
            <p className="text-xs text-gray-500 mt-2">Highest mark</p>
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
                <Bar dataKey="avgMarks" fill="#3b82f6" name="Avg Marks (%)" />
                <Bar dataKey="passRate" fill="#10b981" name="Pass Rate (%)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Performance Trend */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm lg:col-span-2">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Performance Improvement Trend</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={performanceTrend}
                margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="test" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="avgMarks" stroke="#3b82f6" name="Avg Marks (%)" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="passRate" stroke="#10b981" name="Pass Rate (%)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Detailed Statistics */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">Grade Statistics</h2>
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
