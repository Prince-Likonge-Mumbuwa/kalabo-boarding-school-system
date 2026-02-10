// @/pages/teacher/ResultsEntry.tsx - UPDATED WITH CORRECT EXAM TYPES
import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useEffect, useMemo } from 'react';
import { Save, Upload, AlertCircle, Loader2, Users, BookOpen } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useResults } from '@/hooks/useResults';
import { learnerService } from '@/services/schoolService';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';

interface StudentResultInput {
  id: string;
  studentId: string;
  name: string;
  marks: string;
}

export default function ResultsEntry() {
  const { user } = useAuth();
  const isTeacher = user?.userType === 'teacher';

  // Fetch all active classes
  const { 
    classes: allClasses, 
    isLoading: loadingClasses 
  } = useSchoolClasses({ isActive: true });

  // NEW: Fetch teacher assignments to get subjects
  const {
    assignments,
    getSubjectsForClass,
    isLoading: loadingAssignments
  } = useTeacherAssignments(user?.id);

  // Find classes assigned to this teacher
  const assignedClasses = useMemo(() => {
    if (!user?.id || !allClasses.length) return [];
    
    // Filter classes where this teacher is in the teachers array
    return allClasses.filter(cls => 
      cls.teachers?.includes(user.id) || 
      cls.formTeacherId === user.id
    );
  }, [allClasses, user?.id]);

  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  // UPDATED: Changed exam type to match resultsService.ts
  const [examType, setExamType] = useState<'week4' | 'week8' | 'endOfTerm'>('week4');
  const [examName, setExamName] = useState('');
  const [totalMarks, setTotalMarks] = useState(100);
  const [term, setTerm] = useState('Term 1');
  const [year, setYear] = useState(new Date().getFullYear());
  
  const [students, setStudents] = useState<StudentResultInput[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedClassData, setSelectedClassData] = useState<any>(null);

  // Use the results hook
  const { saveResults, isSaving } = useResults();

  // UPDATED: Exam types to match resultsService.ts (week4, week8, endOfTerm)
  const examTypes = [
    { value: 'week4', label: 'Week 4 Assessment', description: 'First monthly assessment' },
    { value: 'week8', label: 'Week 8 Assessment', description: 'Mid-term assessment' },
    { value: 'endOfTerm', label: 'End of Term Exam', description: 'Final term examination' },
  ];

  // NEW: Get subjects for the selected class
  const availableSubjects = useMemo(() => {
    if (!selectedClass || !user?.id) return [];
    return getSubjectsForClass(selectedClass);
  }, [selectedClass, user?.id, getSubjectsForClass]);

  // NEW: Auto-select subject if only one is available
  useEffect(() => {
    if (availableSubjects.length === 1 && !selectedSubject) {
      setSelectedSubject(availableSubjects[0]);
    } else if (availableSubjects.length > 0 && !availableSubjects.includes(selectedSubject)) {
      // Reset subject if currently selected subject is not in the available list
      setSelectedSubject('');
    }
  }, [availableSubjects]);

  // Load students when class changes
  useEffect(() => {
    const loadStudents = async () => {
      if (!selectedClass) {
        setStudents([]);
        setSelectedClassData(null);
        return;
      }

      setLoadingStudents(true);
      try {
        // Find the selected class data from assignedClasses
        const classInfo = assignedClasses.find(c => c.id === selectedClass);
        setSelectedClassData(classInfo);
        
        if (!classInfo) {
          alert('Class not found or you do not have permission to access it.');
          setSelectedClass('');
          setStudents([]);
          return;
        }
        
        // Load students for this class
        const learners = await learnerService.getLearnersByClass(selectedClass);
        setStudents(
          learners.map(learner => ({
            id: learner.id,
            studentId: learner.studentId,
            name: learner.name,
            marks: '',
          }))
        );
      } catch (error) {
        console.error('Error loading students:', error);
        alert('Failed to load students. Please try again.');
        setStudents([]);
        setSelectedClassData(null);
      } finally {
        setLoadingStudents(false);
      }
    };

    loadStudents();
  }, [selectedClass, assignedClasses]);

  const handleMarksChange = (studentId: string, marks: string) => {
    // Only allow numbers
    if (marks && !/^\d*$/.test(marks)) return;
    
    // Don't allow marks > totalMarks
    const marksNum = parseInt(marks);
    if (marks && marksNum > totalMarks) return;

    setStudents(students.map(s =>
      s.id === studentId ? { ...s, marks } : s
    ));
  };

  const handleSaveResults = async () => {
    // Validation
    if (!selectedClass) {
      alert('Please select a class');
      return;
    }

    if (!selectedSubject) {
      alert('Please select a subject');
      return;
    }

    if (!examName.trim()) {
      alert('Please enter an exam name');
      return;
    }

    if (!user) {
      alert('User not authenticated');
      return;
    }

    if (!selectedClassData) {
      alert('Class information not found');
      return;
    }

    // Prepare results data
    const results = students
      .filter(s => s.marks !== '') // Only include students with marks entered
      .map(s => ({
        studentId: s.studentId,
        studentName: s.name,
        marks: parseInt(s.marks),
      }));

    if (results.length === 0) {
      alert('Please enter marks for at least one student');
      return;
    }

    try {
      // UPDATED: examType is now the correct type that matches resultsService.ts
      await saveResults({
        classId: selectedClass,
        className: selectedClassData.name,
        subjectId: selectedSubject,
        subjectName: selectedSubject,
        teacherId: user.id,
        teacherName: user.name || user.email || 'Unknown',
        examType, // This now matches the expected type
        examName: examName.trim(),
        term,
        year,
        totalMarks,
        results,
      });

      alert(`Results saved successfully for ${results.length} students!`);
      
      // Clear marks but keep students list
      setStudents(students.map(s => ({ ...s, marks: '' })));
      setExamName('');
      
    } catch (error: any) {
      console.error('Error saving results:', error);
      alert(`Failed to save results: ${error.message || 'Please try again.'}`);
    }
  };

  const handleImportFromExcel = () => {
    // TODO: Implement Excel import functionality
    alert('Excel import functionality coming soon!');
  };

  const filledCount = students.filter(s => s.marks && s.marks !== '').length;
  const totalStudents = students.length;

  // UPDATED: This function should match the 1-9 grading system from resultsService.ts
  const getGrade = (marks: number): string => {
    const percentage = (marks / totalMarks) * 100;
    
    // Convert to 1-9 scale like resultsService.ts does
    if (percentage >= 75) return '1 (Distinction)';
    if (percentage >= 70) return '2 (Distinction)';
    if (percentage >= 65) return '3 (Merit)';
    if (percentage >= 60) return '4 (Merit)';
    if (percentage >= 55) return '5 (Credit)';
    if (percentage >= 50) return '6 (Credit)';
    if (percentage >= 45) return '7 (Satisfactory)';
    if (percentage >= 40) return '8 (Satisfactory)';
    return '9 (Fail)';
  };

  if (loadingClasses || loadingAssignments) {
    return (
      <DashboardLayout activeTab="results">
        <div className="p-8 flex flex-col items-center justify-center min-h-[60vh]">
          <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
          <p className="text-gray-600">Loading your assigned classes and subjects...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="results">
      <div className="space-y-8">
        {/* Header with teacher info */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Results Entry</h1>
            <p className="text-gray-600 mt-1">Enter and manage student grades for your classes</p>
          </div>
          <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-lg">
            <BookOpen className="text-blue-600" size={20} />
            <span className="text-blue-700 font-medium">
              {assignedClasses.length} Class{assignedClasses.length !== 1 ? 'es' : ''} Assigned
            </span>
          </div>
        </div>

        {/* Teacher Info Card */}
        {user && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Teacher: {user.name || user.email}</h2>
                <p className="text-gray-600 mt-1">You can enter results for the classes and subjects assigned to you</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-700">{assignedClasses.length}</div>
                  <div className="text-sm text-gray-600">Classes</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-700">
                    {assignedClasses.reduce((sum, cls) => sum + (cls.students || 0), 0)}
                  </div>
                  <div className="text-sm text-gray-600">Total Students</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-700">{assignments.length}</div>
                  <div className="text-sm text-gray-600">Subjects</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info Alert */}
        {totalStudents > 0 && (
          <div className="flex gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <p className="text-blue-900 font-medium">Entry Progress</p>
              <p className="text-blue-700 text-sm mt-1">
                You have entered marks for <span className="font-bold">{filledCount}</span> out of{' '}
                <span className="font-bold">{totalStudents}</span> students{' '}
                ({totalStudents > 0 ? ((filledCount / totalStudents) * 100).toFixed(0) : 0}%)
              </p>
              {selectedClassData && selectedSubject && (
                <p className="text-blue-600 text-xs mt-2">
                  Class: {selectedClassData.name} • Subject: {selectedSubject} • Students: {totalStudents} • Term: {term} • Year: {year}
                </p>
              )}
            </div>
          </div>
        )}

        {/* No Classes Alert */}
        {!loadingClasses && assignedClasses.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <h3 className="font-medium text-yellow-800">No Classes Assigned</h3>
                <p className="text-yellow-700 text-sm mt-1">
                  You don't have any classes assigned to you yet. Please contact the school administrator 
                  to be assigned to classes before you can enter results.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Filters and Class Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 bg-white rounded-xl border border-gray-200 p-6">
          <div className="lg:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <span className="flex items-center gap-1">
                <Users size={16} /> Select Class *
              </span>
            </label>
            <select
              value={selectedClass}
              onChange={e => {
                setSelectedClass(e.target.value);
                setSelectedSubject(''); // Reset subject when class changes
              }}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              disabled={assignedClasses.length === 0}
            >
              <option value="">{assignedClasses.length === 0 ? 'No classes assigned' : 'Choose a class...'}</option>
              {assignedClasses.map(cls => (
                <option key={cls.id} value={cls.id}>
                  {cls.name} ({cls.students || 0} students)
                </option>
              ))}
            </select>
            {assignedClasses.length === 0 && (
              <p className="text-red-500 text-xs mt-1">You need to be assigned to classes first</p>
            )}
          </div>
          
          {/* NEW: Dynamic Subject Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subject *
              {availableSubjects.length === 1 && (
                <span className="text-xs text-green-600 ml-2">(Auto-selected)</span>
              )}
            </label>
            <select
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              disabled={!selectedClass || availableSubjects.length === 0}
            >
              <option value="">
                {!selectedClass 
                  ? 'Select a class first' 
                  : availableSubjects.length === 0 
                    ? 'No subjects assigned for this class'
                    : 'Choose a subject...'}
              </option>
              {availableSubjects.map(subject => (
                <option key={subject} value={subject}>{subject}</option>
              ))}
            </select>
            {selectedClass && availableSubjects.length === 0 && (
              <p className="text-red-500 text-xs mt-1">
                You are not assigned to teach any subject for this class. Contact your administrator.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Exam Type *</label>
            <select
              value={examType}
              onChange={e => setExamType(e.target.value as 'week4' | 'week8' | 'endOfTerm')}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              disabled={!selectedClass}
            >
              {examTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {examTypes.find(t => t.value === examType)?.description}
            </p>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Exam Name *</label>
            <input
              type="text"
              value={examName}
              onChange={e => setExamName(e.target.value)}
              placeholder={`e.g., ${examTypes.find(t => t.value === examType)?.label} - ${selectedSubject || 'Subject'}`}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              disabled={!selectedClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Total Marks *</label>
            <input
              type="number"
              value={totalMarks}
              onChange={e => setTotalMarks(parseInt(e.target.value) || 100)}
              min="1"
              max="500"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              disabled={!selectedClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Term *</label>
            <select
              value={term}
              onChange={e => setTerm(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              disabled={!selectedClass}
            >
              <option value="Term 1">Term 1</option>
              <option value="Term 2">Term 2</option>
              <option value="Term 3">Term 3</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Academic Year *</label>
            <input
              type="number"
              value={year}
              onChange={e => setYear(parseInt(e.target.value) || new Date().getFullYear())}
              min="2000"
              max="2030"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              disabled={!selectedClass}
            />
          </div>
        </div>

        {/* Results Entry Table */}
        {loadingStudents ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <Loader2 className="animate-spin text-blue-600 mx-auto mb-4" size={48} />
            <p className="text-gray-600">Loading students for selected class...</p>
          </div>
        ) : students.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="font-semibold text-gray-900">
                  Students in {selectedClassData?.name || 'Selected Class'}
                  <span className="ml-2 text-sm font-normal text-gray-600">
                    ({students.length} students)
                  </span>
                </h3>
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Marks out of {totalMarks}</span>
                  {selectedSubject && (
                    <span className="ml-2 text-blue-600">• Subject: {selectedSubject}</span>
                  )}
                  <span className="ml-2 text-blue-600">• Exam: {examTypes.find(t => t.value === examType)?.label}</span>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Student Name</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Student ID</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Marks (out of {totalMarks})</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Percentage</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Grade (1-9 Scale)</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {students.map((student) => {
                    const marksNum = student.marks ? parseInt(student.marks) : null;
                    const percentage = marksNum !== null ? ((marksNum / totalMarks) * 100).toFixed(1) : null;
                    const grade = marksNum !== null ? getGrade(marksNum) : '-';
                    const isPassing = marksNum !== null && marksNum >= (totalMarks * 0.5);

                    return (
                      <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900">{student.name}</td>
                        <td className="px-6 py-4 text-gray-600 font-mono">{student.studentId}</td>
                        <td className="px-6 py-4">
                          <input
                            type="number"
                            min="0"
                            max={totalMarks}
                            value={student.marks}
                            onChange={e => handleMarksChange(student.id, e.target.value)}
                            placeholder="0"
                            className="w-28 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center font-semibold transition-colors"
                          />
                        </td>
                        <td className="px-6 py-4">
                          {percentage !== null ? (
                            <span className="font-semibold text-gray-900">{percentage}%</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {marksNum !== null ? (
                            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                              grade.startsWith('1') || grade.startsWith('2') ? 'bg-green-100 text-green-700' :
                              grade.startsWith('3') || grade.startsWith('4') ? 'bg-blue-100 text-blue-700' :
                              grade.startsWith('5') || grade.startsWith('6') ? 'bg-yellow-100 text-yellow-700' :
                              grade.startsWith('7') || grade.startsWith('8') ? 'bg-orange-100 text-orange-700' :
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
                            student.marks
                              ? isPassing ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            {student.marks ? (isPassing ? '✓ Pass' : '✗ Fail') : 'Pending'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : selectedClass ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <Users className="mx-auto text-gray-300 mb-4" size={48} />
            <p className="text-gray-600">No students found in the selected class</p>
            <p className="text-gray-500 text-sm mt-1">
              The class might not have any enrolled students yet.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <AlertCircle className="mx-auto text-gray-300 mb-4" size={48} />
            <p className="text-gray-600">Please select a class to view students</p>
            <p className="text-gray-500 text-sm mt-1">
              Choose a class from the dropdown above to start entering results
            </p>
          </div>
        )}

        {/* Action Buttons */}
        {selectedClass && students.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3 justify-end">
            <button 
              onClick={handleImportFromExcel}
              disabled={isSaving}
              className="flex items-center justify-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload size={20} />
              Import from Excel
            </button>
            <button 
              onClick={handleSaveResults}
              disabled={isSaving || filledCount === 0 || !selectedSubject}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px]"
            >
              {isSaving ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={20} />
                  Save Results ({filledCount})
                </>
              )}
            </button>
          </div>
        )}

        {/* Help Text - UPDATED FOR 1-9 GRADING SYSTEM */}
        <div className="text-sm text-gray-500 mt-4">
          <p>• <strong>1-9 Grading Scale:</strong> 1-2 (Distinction: 70-100%), 3-4 (Merit: 60-69%), 5-6 (Credit: 50-59%), 7-8 (Satisfactory: 40-49%), 9 (Fail: 0-39%)</p>
          <p className="mt-1">• <strong>Passing Mark:</strong> 50% or higher (Grade 6 or better)</p>
          <p className="mt-1">• <strong>Exam Types:</strong> Week 4 (first assessment), Week 8 (mid-term), End of Term (final exam)</p>
          <p className="mt-1">• All fields marked with * are required</p>
          <p className="mt-1">• Subjects shown are based on your class assignments configured by the administrator</p>
        </div>
      </div>
    </DashboardLayout>
  );
}