import { DashboardLayout } from '@/components/DashboardLayout';
import { useState } from 'react';
import { Save, Filter, Download } from 'lucide-react';

interface Student {
  id: string;
  name: string;
  studentId: string;
  present: boolean | null;
}

interface ClassAttendance {
  className: string;
  date: string;
  students: Student[];
}

export default function AttendanceTracking() {
  const [selectedClass, setSelectedClass] = useState('Form 4A');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [classData, setClassData] = useState<ClassAttendance>({
    className: 'Form 4A',
    date: selectedDate,
    students: [
      { id: '1', name: 'Alice Mumba', studentId: 'STU001', present: true },
      { id: '2', name: 'Benson Chanda', studentId: 'STU002', present: true },
      { id: '3', name: 'Cecilia Nkosi', studentId: 'STU003', present: false },
      { id: '4', name: 'David Mwale', studentId: 'STU004', present: true },
      { id: '5', name: 'Emeline Tembo', studentId: 'STU005', present: true },
      { id: '6', name: 'Frank Simatende', studentId: 'STU006', present: null },
      { id: '7', name: 'Grace Mbewe', studentId: 'STU007', present: true },
      { id: '8', name: 'Henry Kamwi', studentId: 'STU008', present: false },
    ],
  });

  const classes = ['Form 4A', 'Form 4B', 'Form 3A', 'Form 3B'];

  const handleTogglePresence = (studentId: string) => {
    setClassData({
      ...classData,
      students: classData.students.map(student =>
        student.id === studentId
          ? { ...student, present: student.present === true ? false : student.present === false ? null : true }
          : student
      ),
    });
  };

  const handleMarkAll = (present: boolean) => {
    setClassData({
      ...classData,
      students: classData.students.map(student => ({ ...student, present })),
    });
  };

  const presentCount = classData.students.filter(s => s.present === true).length;
  const absentCount = classData.students.filter(s => s.present === false).length;
  const unreportedCount = classData.students.filter(s => s.present === null).length;

  return (
    <DashboardLayout activeTab="attendance">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Attendance Tracking</h1>
          <p className="text-gray-600 mt-1">Record and manage student attendance</p>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-6">
            <p className="text-green-700 font-medium text-sm">Present</p>
            <p className="text-3xl font-bold text-green-600 mt-2">{presentCount}</p>
            <p className="text-xs text-green-600 mt-1">{((presentCount / classData.students.length) * 100).toFixed(1)}%</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-6">
            <p className="text-red-700 font-medium text-sm">Absent</p>
            <p className="text-3xl font-bold text-red-600 mt-2">{absentCount}</p>
            <p className="text-xs text-red-600 mt-1">{((absentCount / classData.students.length) * 100).toFixed(1)}%</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
            <p className="text-gray-700 font-medium text-sm">Not Reported</p>
            <p className="text-3xl font-bold text-gray-600 mt-2">{unreportedCount}</p>
            <p className="text-xs text-gray-600 mt-1">{((unreportedCount / classData.students.length) * 100).toFixed(1)}%</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => handleMarkAll(true)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
          >
            Mark All Present
          </button>
          <button
            onClick={() => handleMarkAll(false)}
            className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Mark All Absent
          </button>
          <button className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium ml-auto">
            <Download size={20} />
            Download Report
          </button>
        </div>

        {/* Attendance Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Student Name</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Student ID</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">Mark Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {classData.students.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{student.name}</td>
                    <td className="px-6 py-4 text-gray-600">{student.studentId}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        student.present === true ? 'bg-green-100 text-green-700' :
                        student.present === false ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {student.present === true ? 'Present' : student.present === false ? 'Absent' : 'Not Reported'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleTogglePresence(student.id)}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                          student.present === true
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : student.present === false
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {student.present === true ? '✓ Present' : student.present === false ? '✗ Absent' : 'Mark'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-lg">
            <Save size={20} />
            Save Attendance
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
