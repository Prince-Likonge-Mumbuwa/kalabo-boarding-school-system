import { DashboardLayout } from '@/components/DashboardLayout';
import { useState } from 'react';
import { Save, Upload, AlertCircle } from 'lucide-react';

interface StudentResult {
  id: string;
  name: string;
  studentId: string;
  marks: string;
}

export default function ResultsEntry() {
  const [selectedClass, setSelectedClass] = useState('Form 4A');
  const [selectedSubject, setSelectedSubject] = useState('Mathematics');
  const [results, setResults] = useState<StudentResult[]>([
    { id: '1', name: 'Alice Mumba', studentId: 'STU001', marks: '85' },
    { id: '2', name: 'Benson Chanda', studentId: 'STU002', marks: '76' },
    { id: '3', name: 'Cecilia Nkosi', studentId: 'STU003', marks: '70' },
    { id: '4', name: 'David Mwale', studentId: 'STU004', marks: '64' },
    { id: '5', name: 'Emeline Tembo', studentId: 'STU005', marks: '' },
    { id: '6', name: 'Frank Simatende', studentId: 'STU006', marks: '' },
    { id: '7', name: 'Grace Mbewe', studentId: 'STU007', marks: '' },
    { id: '8', name: 'Henry Kamwi', studentId: 'STU008', marks: '' },
  ]);

  const classes = ['Form 4A', 'Form 4B', 'Form 3A', 'Form 3B'];
  const subjects = ['Mathematics', 'English', 'Science', 'History', 'Geography', 'Chemistry'];

  const handleMarksChange = (studentId: string, marks: string) => {
    setResults(results.map(r =>
      r.id === studentId ? { ...r, marks } : r
    ));
  };

  const filledCount = results.filter(r => r.marks && r.marks !== '').length;
  const totalStudents = results.length;

  const getGrade = (marks: number): string => {
    if (marks >= 80) return 'A';
    if (marks >= 70) return 'B';
    if (marks >= 60) return 'C';
    if (marks >= 50) return 'D';
    return 'F';
  };

  return (
    <DashboardLayout activeTab="results">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Results Entry</h1>
          <p className="text-gray-600 mt-1">Enter and manage student grades for your classes</p>
        </div>

        {/* Info Alert */}
        <div className="flex gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <AlertCircle className="text-blue-600 flex-shrink-0" size={20} />
          <div>
            <p className="text-blue-900 font-medium">Entry Progress</p>
            <p className="text-blue-700 text-sm mt-1">
              You have entered marks for {filledCount} out of {totalStudents} students ({((filledCount / totalStudents) * 100).toFixed(0)}%)
            </p>
          </div>
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

        {/* Results Entry Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Student Name</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Student ID</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Marks (out of 100)</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Grade</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {results.map((result) => {
                  const marksNum = result.marks ? parseInt(result.marks) : null;
                  const grade = marksNum !== null ? getGrade(marksNum) : '-';
                  const status = result.marks ? 'Completed' : 'Pending';
                  const isPassing = marksNum !== null && marksNum >= 50;

                  return (
                    <tr key={result.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{result.name}</td>
                      <td className="px-6 py-4 text-gray-600">{result.studentId}</td>
                      <td className="px-6 py-4">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={result.marks}
                          onChange={e => handleMarksChange(result.id, e.target.value)}
                          placeholder="0-100"
                          className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center font-semibold"
                        />
                      </td>
                      <td className="px-6 py-4">
                        {marksNum !== null ? (
                          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            grade === 'A' ? 'bg-green-100 text-green-700' :
                            grade === 'B' ? 'bg-blue-100 text-blue-700' :
                            grade === 'C' ? 'bg-yellow-100 text-yellow-700' :
                            grade === 'D' ? 'bg-orange-100 text-orange-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {grade}
                          </span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                          result.marks
                            ? isPassing ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {result.marks ? (isPassing ? '✓ Pass' : '✗ Fail') : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-end">
          <button className="flex items-center justify-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">
            <Upload size={20} />
            Import from Excel
          </button>
          <button className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-lg">
            <Save size={20} />
            Save Results
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
