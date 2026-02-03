import { DashboardLayout } from '@/components/DashboardLayout';
import { useState } from 'react';
import { Download, Mail, Filter, MoreVertical } from 'lucide-react';

interface StudentRecord {
  id: string;
  studentName: string;
  studentId: string;
  className: string;
  totalMarks: number;
  percentage: number;
  grade: string;
  status: 'pass' | 'fail';
}

export default function ReportCards() {
  const [records] = useState<StudentRecord[]>([
    { id: '1', studentName: 'Alice Mumba', studentId: 'STU001', className: 'Form 4A', totalMarks: 425, percentage: 85, grade: 'A', status: 'pass' },
    { id: '2', studentName: 'Benson Chanda', studentId: 'STU002', className: 'Form 4A', totalMarks: 380, percentage: 76, grade: 'B', status: 'pass' },
    { id: '3', studentName: 'Cecilia Nkosi', studentId: 'STU003', className: 'Form 4A', totalMarks: 350, percentage: 70, grade: 'B', status: 'pass' },
    { id: '4', studentName: 'David Mwale', studentId: 'STU004', className: 'Form 4A', totalMarks: 320, percentage: 64, grade: 'C', status: 'pass' },
    { id: '5', studentName: 'Emeline Tembo', studentId: 'STU005', className: 'Form 4B', totalMarks: 410, percentage: 82, grade: 'A', status: 'pass' },
    { id: '6', studentName: 'Frank Simatende', studentId: 'STU006', className: 'Form 4B', totalMarks: 295, percentage: 59, grade: 'D', status: 'fail' },
    { id: '7', studentName: 'Grace Mbewe', studentId: 'STU007', className: 'Form 4B', totalMarks: 370, percentage: 74, grade: 'B', status: 'pass' },
    { id: '8', studentName: 'Henry Kamwi', studentId: 'STU008', className: 'Form 3A', totalMarks: 440, percentage: 88, grade: 'A', status: 'pass' },
  ]);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  const filteredRecords = selectedClass === 'all' 
    ? records 
    : records.filter(r => r.className === selectedClass);

  const classes = ['Form 4A', 'Form 4B', 'Form 3A', 'Form 3B', 'Form 2A', 'Form 1A'];

  const getGradeColor = (grade: string) => {
    const colors: { [key: string]: string } = {
      'A': 'bg-green-100 text-green-700',
      'B': 'bg-blue-100 text-blue-700',
      'C': 'bg-yellow-100 text-yellow-700',
      'D': 'bg-orange-100 text-orange-700',
      'F': 'bg-red-100 text-red-700',
    };
    return colors[grade] || 'bg-gray-100 text-gray-700';
  };

  return (
    <DashboardLayout activeTab="reports">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Report Cards</h1>
            <p className="text-gray-600 mt-1">Generate and manage student report cards</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">
              <Download size={20} />
              Download All
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
              <Mail size={20} />
              Send Reports
            </button>
          </div>
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

        {/* Report Cards Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Student Name</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Student ID</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Class</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Total Marks</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Percentage</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Grade</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{record.studentName}</td>
                    <td className="px-6 py-4 text-gray-600">{record.studentId}</td>
                    <td className="px-6 py-4 text-gray-600">{record.className}</td>
                    <td className="px-6 py-4 font-semibold text-gray-900">{record.totalMarks}/500</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${record.percentage}%` }}
                          />
                        </div>
                        <span className="font-semibold text-gray-900">{record.percentage}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getGradeColor(record.grade)}`}>
                        {record.grade}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${record.status === 'pass' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {record.status === 'pass' ? 'Pass' : 'Fail'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Download size={18} />
                        </button>
                        <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                          <MoreVertical size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 border-t border-gray-200 text-sm text-gray-600">
            Showing {filteredRecords.length} report cards
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
