// @/pages/teacher/ResultsEntry.tsx - FULLY REWRITTEN WITH PROPER INTEGRATION
import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useEffect, useMemo } from 'react';
import { Save, Upload, AlertCircle, Loader2, Users, BookOpen, CheckCircle, XCircle, Info, TrendingUp, Award, GraduationCap } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useResults, useSubjectCompletion } from '@/hooks/useResults';
import { learnerService } from '@/services/schoolService';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';
import { calculateGrade, getGradeDescription, getGradeDisplay } from '@/services/resultsService';

interface StudentResultInput {
  id: string;
  studentId: string;
  name: string;
  marks: string;
}

export default function ResultsEntry() {
  const { user } = useAuth();
  const isTeacher = user?.userType === 'teacher';

  const { 
    classes: allClasses, 
    isLoading: loadingClasses 
  } = useSchoolClasses({ isActive: true });

  const {
    assignments,
    getSubjectsForClass,
    isLoading: loadingAssignments
  } = useTeacherAssignments(user?.id);

  const assignedClasses = useMemo(() => {
    if (!user?.id || !allClasses.length) return [];
    
    return allClasses.filter(cls => 
      cls.teachers?.includes(user.id) || 
      cls.formTeacherId === user.id
    );
  }, [allClasses, user?.id]);

  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [examType, setExamType] = useState<'week4' | 'week8' | 'endOfTerm'>('week4');
  const [examName, setExamName] = useState('');
  const [totalMarks, setTotalMarks] = useState(100);
  const [term, setTerm] = useState('Term 1');
  const [year, setYear] = useState(new Date().getFullYear());
  
  const [students, setStudents] = useState<StudentResultInput[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedClassData, setSelectedClassData] = useState<any>(null);
  const [showAbsentHelp, setShowAbsentHelp] = useState(false);
  const [showOverwriteWarning, setShowOverwriteWarning] = useState(false);
  const [existingResultsCount, setExistingResultsCount] = useState(0);

  // Use the enhanced results hook
  const { 
    saveResults, 
    isSaving,
    checkExisting,
    isCheckingExisting 
  } = useResults();

  // Get subject completion status
  const {
    completionStatus,
    isLoading: loadingCompletion,
    refetch: refetchCompletion
  } = useSubjectCompletion({
    classId: selectedClass,
    term,
    year,
  });

  const examTypes = [
    { value: 'week4', label: 'Week 4 Assessment', description: 'First monthly assessment' },
    { value: 'week8', label: 'Week 8 Assessment', description: 'Mid-term assessment' },
    { value: 'endOfTerm', label: 'End of Term Exam', description: 'Final term examination' },
  ];

  const availableSubjects = useMemo(() => {
    if (!selectedClass || !user?.id) return [];
    return getSubjectsForClass(selectedClass);
  }, [selectedClass, user?.id, getSubjectsForClass]);

  useEffect(() => {
    if (availableSubjects.length === 1 && !selectedSubject) {
      setSelectedSubject(availableSubjects[0]);
    } else if (availableSubjects.length > 0 && !availableSubjects.includes(selectedSubject)) {
      setSelectedSubject('');
    }
  }, [availableSubjects, selectedSubject]);

  useEffect(() => {
    if (selectedSubject && examType) {
      const typeLabel = examTypes.find(t => t.value === examType)?.label || '';
      setExamName(`${typeLabel} - ${selectedSubject}`);
    }
  }, [selectedSubject, examType]);

  // NEW: Enhanced existing results check that considers teacher assignments
  useEffect(() => {
    const checkExistingResults = async () => {
      if (!selectedClass || !selectedSubject || !user?.id) {
        setShowOverwriteWarning(false);
        setExistingResultsCount(0);
        return;
      }

      try {
        const existing = await checkExisting({
          classId: selectedClass,
          subjectId: selectedSubject,
          examType,
          term,
          year,
        });

        if (existing.exists) {
          setShowOverwriteWarning(true);
          setExistingResultsCount(existing.count);
        } else {
          setShowOverwriteWarning(false);
          setExistingResultsCount(0);
        }
      } catch (error) {
        console.error('Error checking existing results:', error);
      }
    };

    checkExistingResults();
  }, [selectedClass, selectedSubject, examType, term, year, checkExisting]);

  useEffect(() => {
    const loadStudents = async () => {
      if (!selectedClass) {
        setStudents([]);
        setSelectedClassData(null);
        return;
      }

      setLoadingStudents(true);
      try {
        const classInfo = assignedClasses.find(c => c.id === selectedClass);
        setSelectedClassData(classInfo);
        
        if (!classInfo) {
          alert('Class not found or you do not have permission to access it.');
          setSelectedClass('');
          setStudents([]);
          return;
        }
        
        const learners = await learnerService.getLearnersByClass(selectedClass);
        learners.sort((a, b) => a.name.localeCompare(b.name));
        
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
    if (marks && marks.toLowerCase() !== 'x' && !/^\d*$/.test(marks)) return;
    
    if (marks && marks.toLowerCase() !== 'x') {
      const marksNum = parseInt(marks);
      if (marksNum > totalMarks) return;
    }

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

    const results = students
      .filter(s => s.marks !== '')
      .map(s => {
        const marks = s.marks.toLowerCase() === 'x' 
          ? -1 
          : parseInt(s.marks);

        return {
          studentId: s.studentId,
          studentName: s.name,
          marks,
        };
      });

    if (results.length === 0) {
      alert('Please enter marks for at least one student');
      return;
    }

    // NEW: Enhanced confirmation with teacher assignment context
    const absentCount = results.filter(r => r.marks === -1).length;
    const presentCount = results.length - absentCount;
    
    let confirmMessage = `You are about to save results for ${results.length} students:\n\n` +
      `• Present: ${presentCount}\n` +
      `• Absent: ${absentCount}\n\n` +
      `Subject: ${selectedSubject}\n` +
      `Exam: ${examName}\n` +
      `Term: ${term}, ${year}\n\n`;

    // NEW: Add overwrite warning
    if (showOverwriteWarning) {
      confirmMessage += `⚠️ WARNING: This will OVERWRITE ${existingResultsCount} existing results!\n\n`;
    }

    confirmMessage += 'Continue?';

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const response = await saveResults({
        classId: selectedClass,
        className: selectedClassData.name,
        subjectId: selectedSubject,
        subjectName: selectedSubject,
        teacherId: user.id,
        teacherName: user.name || user.email || 'Unknown',
        examType,
        examName: examName.trim(),
        term,
        year,
        totalMarks,
        results,
        overwrite: showOverwriteWarning,
      });

      // NEW: Show completion status after save
      const wasOverwritten = response.overwritten ? ' (existing results overwritten)' : '';
      alert(`✅ Results saved successfully for ${results.length} students${wasOverwritten}!`);
      
      // Clear marks but keep students list
      setStudents(students.map(s => ({ ...s, marks: '' })));
      
      // Refresh completion status
      refetchCompletion();
      
    } catch (error: any) {
      console.error('Error saving results:', error);
      alert(`❌ Failed to save results: ${error.message || 'Please try again.'}`);
    }
  };

  const handleImportFromExcel = () => {
    alert('📊 Excel import functionality coming soon! You will be able to upload a spreadsheet with student marks.');
  };

  const handleQuickFillPass = () => {
    if (!confirm('Fill all empty fields with 60% (pass mark)? This will not overwrite existing entries.')) {
      return;
    }
    
    const passMarks = Math.ceil(totalMarks * 0.6);
    setStudents(students.map(s => 
      s.marks === '' ? { ...s, marks: passMarks.toString() } : s
    ));
  };

  const handleMarkAllAbsent = () => {
    if (!confirm('Mark all students as absent (X)? This will overwrite all current entries.')) {
      return;
    }
    
    setStudents(students.map(s => ({ ...s, marks: 'X' })));
  };

  const handleClearAll = () => {
    if (!confirm('Clear all entered marks? This cannot be undone.')) {
      return;
    }
    
    setStudents(students.map(s => ({ ...s, marks: '' })));
  };

  const filledCount = students.filter(s => s.marks && s.marks !== '').length;
  const totalStudents = students.length;
  const absentCount = students.filter(s => s.marks.toLowerCase() === 'x').length;
  const presentCount = filledCount - absentCount;

  const getGrade = (marks: string): string => {
    if (!marks) return '—';
    if (marks.toLowerCase() === 'x') return 'X (Absent)';
    
    const marksNum = parseInt(marks);
    const percentage = (marksNum / totalMarks) * 100;
    const grade = calculateGrade(percentage);
    const description = getGradeDescription(grade);
    
    return `${getGradeDisplay(grade)} (${description})`;
  };

  const getGradeColor = (marks: string): string => {
    if (!marks) return 'text-gray-400';
    if (marks.toLowerCase() === 'x') return 'text-gray-600';
    
    const marksNum = parseInt(marks);
    const percentage = (marksNum / totalMarks) * 100;
    const grade = calculateGrade(percentage);
    
    if (grade <= 2) return 'text-green-600';
    if (grade <= 4) return 'text-blue-600';
    if (grade <= 6) return 'text-cyan-600';
    if (grade <= 8) return 'text-yellow-600';
    return 'text-red-600';
  };

  // NEW: Enhanced subject completion that integrates with teacher assignments
  const currentSubjectCompletion = useMemo(() => {
    if (!selectedSubject || !completionStatus.length) return null;
    return completionStatus.find(s => s.subjectName === selectedSubject);
  }, [selectedSubject, completionStatus]);

  // NEW: Calculate overall class readiness based on teacher assignments
  const classReadiness = useMemo(() => {
    if (!selectedClass || !assignments.length || !completionStatus.length) return null;
    
    // Get all subjects assigned to this class
    const classAssignments = assignments.filter(a => a.classId === selectedClass);
    const assignedSubjects = Array.from(new Set(classAssignments.map(a => a.subject)));
    
    // Get completion status for assigned subjects only
    const completedSubjects = assignedSubjects.filter(subject => {
      const completion = completionStatus.find(c => c.subjectName === subject);
      return completion && completion.percentComplete === 100;
    });
    
    const completionPercentage = Math.round((completedSubjects.length / assignedSubjects.length) * 100);
    
    return {
      totalSubjects: assignedSubjects.length,
      completedSubjects: completedSubjects.length,
      completionPercentage,
      assignedSubjects,
      completedSubjectsList: completedSubjects,
    };
  }, [selectedClass, assignments, completionStatus]);

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
              {assignedClasses.length} Class{assignedClasses.length !== 1 ? 'es' : ''} • {assignments.length} Subject{assignments.length !== 1 ? 's' : ''}
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

        {/* NEW: Class Readiness Overview */}
        {classReadiness && (
          <div className={`p-6 rounded-xl border-2 ${
            classReadiness.completionPercentage === 100
              ? 'bg-green-50 border-green-200'
              : 'bg-yellow-50 border-yellow-300'
          }`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  {classReadiness.completionPercentage === 100 ? (
                    <CheckCircle className="text-green-600" size={24} />
                  ) : (
                    <AlertCircle className="text-yellow-600" size={24} />
                  )}
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      {selectedClassData?.name} Overall Readiness
                    </h3>
                    <p className="text-sm text-gray-600">
                      {classReadiness.completedSubjects} of {classReadiness.totalSubjects} subjects fully completed
                    </p>
                  </div>
                </div>
                
                {/* Subjects breakdown */}
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Assigned Subjects:</p>
                  <div className="flex flex-wrap gap-2">
                    {classReadiness.assignedSubjects.map((subject, idx) => {
                      const isCompleted = classReadiness.completedSubjectsList.includes(subject);
                      const subjectCompletion = completionStatus.find(c => c.subjectName === subject);
                      return (
                        <div
                          key={idx}
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            isCompleted
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                          title={
                            subjectCompletion
                              ? `${subjectCompletion.percentComplete}% complete`
                              : 'Not started'
                          }
                        >
                          {subject} {isCompleted ? '✓' : subjectCompletion ? `(${subjectCompletion.percentComplete}%)` : '(0%)'}
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="text-2xl font-bold text-green-600">{classReadiness.completedSubjects}</div>
                    <div className="text-sm text-gray-600">Complete</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="text-2xl font-bold text-yellow-600">
                      {classReadiness.totalSubjects - classReadiness.completedSubjects}
                    </div>
                    <div className="text-sm text-gray-600">Incomplete</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="text-2xl font-bold text-blue-600">{classReadiness.completionPercentage}%</div>
                    <div className="text-sm text-gray-600">Ready</div>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      classReadiness.completionPercentage === 100 ? 'bg-green-500' : 'bg-yellow-500'
                    }`}
                    style={{ width: `${classReadiness.completionPercentage}%` }}
                  />
                </div>
              </div>
              {classReadiness.completionPercentage < 100 && (
                <div className="ml-4 text-right">
                  <p className="text-sm text-gray-600 mb-2">Next Steps:</p>
                  <div className="text-xs text-yellow-700 space-y-1">
                    {classReadiness.assignedSubjects
                      .filter(subject => !classReadiness.completedSubjectsList.includes(subject))
                      .slice(0, 2)
                      .map((subject, idx) => (
                        <div key={idx}>• Complete {subject}</div>
                      ))}
                    {classReadiness.assignedSubjects.filter(subject => !classReadiness.completedSubjectsList.includes(subject)).length > 2 && (
                      <div>• ...and {classReadiness.assignedSubjects.filter(subject => !classReadiness.completedSubjectsList.includes(subject)).length - 2} more</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            {classReadiness.completionPercentage === 100 && (
              <div className="mt-4 p-3 bg-green-200 border border-green-400 rounded-lg">
                <p className="text-green-800 font-medium text-center flex items-center justify-center gap-2">
                  <TrendingUp size={18} />
                  🎉 All subjects completed! Students can now receive complete report cards.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Overwrite Warning Alert */}
        {showOverwriteWarning && (
          <div className="flex gap-4 p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded-r-lg">
            <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <p className="text-yellow-900 font-medium">⚠️ Results Already Exist</p>
              <p className="text-yellow-700 text-sm mt-1">
                You have already entered {examTypes.find(t => t.value === examType)?.label} results for {selectedSubject} 
                ({existingResultsCount} students). Saving will <strong>overwrite</strong> the existing results.
              </p>
              <p className="text-yellow-600 text-xs mt-2">
                Make sure this is what you want before clicking Save.
              </p>
            </div>
          </div>
        )}

        {/* Subject Completion Tracker */}
        {currentSubjectCompletion && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Award className="text-green-600" size={20} />
                  Completion Progress: {selectedSubject}
                </h3>
                <p className="text-gray-600 text-sm mt-1">Track which exam types have been entered</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-green-700">
                  {currentSubjectCompletion.percentComplete}%
                </div>
                <div className="text-sm text-gray-600">Complete</div>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className={`p-4 rounded-lg border-2 ${
                currentSubjectCompletion.week4Complete 
                  ? 'bg-green-100 border-green-500' 
                  : 'bg-gray-100 border-gray-300'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900">Week 4</span>
                  {currentSubjectCompletion.week4Complete ? (
                    <CheckCircle className="text-green-600" size={20} />
                  ) : (
                    <XCircle className="text-gray-400" size={20} />
                  )}
                </div>
                <p className="text-sm text-gray-600">
                  {currentSubjectCompletion.enteredStudents.week4}/{currentSubjectCompletion.totalStudents} students
                </p>
              </div>
              
              <div className={`p-4 rounded-lg border-2 ${
                currentSubjectCompletion.week8Complete 
                  ? 'bg-green-100 border-green-500' 
                  : 'bg-gray-100 border-gray-300'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900">Week 8</span>
                  {currentSubjectCompletion.week8Complete ? (
                    <CheckCircle className="text-green-600" size={20} />
                  ) : (
                    <XCircle className="text-gray-400" size={20} />
                  )}
                </div>
                <p className="text-sm text-gray-600">
                  {currentSubjectCompletion.enteredStudents.week8}/{currentSubjectCompletion.totalStudents} students
                </p>
              </div>
              
              <div className={`p-4 rounded-lg border-2 ${
                currentSubjectCompletion.endOfTermComplete 
                  ? 'bg-green-100 border-green-500' 
                  : 'bg-gray-100 border-gray-300'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900">End of Term</span>
                  {currentSubjectCompletion.endOfTermComplete ? (
                    <CheckCircle className="text-green-600" size={20} />
                  ) : (
                    <XCircle className="text-gray-400" size={20} />
                  )}
                </div>
                <p className="text-sm text-gray-600">
                  {currentSubjectCompletion.enteredStudents.endOfTerm}/{currentSubjectCompletion.totalStudents} students
                </p>
              </div>
            </div>
            
            {currentSubjectCompletion.percentComplete === 100 && (
              <div className="mt-4 p-3 bg-green-200 border border-green-400 rounded-lg">
                <p className="text-green-800 font-medium text-center flex items-center justify-center gap-2">
                  <TrendingUp size={18} />
                  🎉 All exam types completed for {selectedSubject}! Students can now receive complete report cards.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Progress Alert */}
        {totalStudents > 0 && (
          <div className="flex gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <p className="text-blue-900 font-medium">Entry Progress</p>
              <p className="text-blue-700 text-sm mt-1">
                <span className="font-bold">{filledCount}</span> of <span className="font-bold">{totalStudents}</span> students ({totalStudents > 0 ? Math.round((filledCount / totalStudents) * 100) : 0}%)
                {absentCount > 0 && <> • <span className="font-bold">{absentCount}</span> marked absent</>}
                {presentCount > 0 && <> • <span className="font-bold">{presentCount}</span> with marks</>}
              </p>
              {selectedClassData && selectedSubject && (
                <p className="text-blue-600 text-xs mt-2">
                  {selectedClassData.name} • {selectedSubject} • {examTypes.find(t => t.value === examType)?.label} • {term} {year}
                </p>
              )}
              <div className="w-full bg-blue-200 rounded-full h-2 mt-3">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${totalStudents > 0 ? (filledCount / totalStudents) * 100 : 0}%` }}
                />
              </div>
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
                setSelectedSubject('');
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
                You are not assigned to teach any subject for this class
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

        {/* Quick Actions */}
        {students.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Info size={18} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Quick Actions</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleQuickFillPass}
                  className="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                >
                  Fill 60% (Pass)
                </button>
                <button
                  onClick={handleMarkAllAbsent}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Mark All Absent
                </button>
                <button
                  onClick={handleClearAll}
                  className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                >
                  Clear All
                </button>
                <button
                  onClick={() => setShowAbsentHelp(!showAbsentHelp)}
                  className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                >
                  {showAbsentHelp ? 'Hide' : 'Show'} Help
                </button>
              </div>
            </div>
            
            {showAbsentHelp && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                <p className="font-medium mb-1">💡 Tips for entering marks:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Enter marks as numbers (0-{totalMarks})</li>
                  <li>Type <strong>"X"</strong> or <strong>"x"</strong> to mark a student as absent</li>
                  <li>Leave blank to skip a student (you can enter their marks later)</li>
                  <li>Grades are calculated automatically using the 1-9 Zambian scale</li>
                  <li>Use Quick Actions above to speed up data entry</li>
                </ul>
              </div>
            )}
          </div>
        )}

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
                  <span className="ml-2 text-blue-600">• {examTypes.find(t => t.value === examType)?.label}</span>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">#</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Student Name</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Student ID</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Marks (/{totalMarks})</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Percentage</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Grade (1-9 Scale)</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {students.map((student, index) => {
                    const isAbsent = student.marks.toLowerCase() === 'x';
                    const marksNum = isAbsent ? -1 : (student.marks ? parseInt(student.marks) : null);
                    const percentage = marksNum !== null && marksNum >= 0 
                      ? ((marksNum / totalMarks) * 100).toFixed(1) 
                      : null;
                    const grade = marksNum !== null ? getGrade(student.marks) : '—';
                    const isPassing = marksNum !== null && marksNum >= 0 && marksNum >= (totalMarks * 0.5);

                    return (
                      <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-gray-600">{index + 1}</td>
                        <td className="px-6 py-4 font-medium text-gray-900">{student.name}</td>
                        <td className="px-6 py-4 text-gray-600 font-mono text-sm">{student.studentId}</td>
                        <td className="px-6 py-4">
                          <input
                            type="text"
                            value={student.marks}
                            onChange={e => handleMarksChange(student.id, e.target.value)}
                            placeholder="0 or X"
                            className="w-28 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center font-semibold transition-colors uppercase"
                          />
                        </td>
                        <td className="px-6 py-4">
                          {isAbsent ? (
                            <span className="font-semibold text-gray-500">Absent</span>
                          ) : percentage !== null ? (
                            <span className="font-semibold text-gray-900">{percentage}%</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`font-semibold ${getGradeColor(student.marks)}`}>
                            {grade}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {student.marks ? (
                            isAbsent ? (
                              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-gray-100 text-gray-700">
                                ✗ Absent
                              </span>
                            ) : isPassing ? (
                              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-700">
                                ✓ Pass
                              </span>
                            ) : (
                              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-700">
                                ✗ Fail
                              </span>
                            )
                          ) : (
                            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-gray-100 text-gray-700">
                              Pending
                            </span>
                          )}
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

        {/* Help Text */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="font-bold text-blue-900 mb-3">Understanding the Grading System</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium text-blue-800 mb-2">1-9 Grading Scale</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• <span className="font-semibold">1-2:</span> Distinction (70-100%)</li>
                <li>• <span className="font-semibold">3-4:</span> Merit (60-69%)</li>
                <li>• <span className="font-semibold">5-6:</span> Credit (50-59%)</li>
                <li>• <span className="font-semibold">7-8:</span> Satisfactory (40-49%)</li>
                <li>• <span className="font-semibold">9:</span> Fail (0-39%)</li>
                <li>• <span className="font-semibold">X:</span> Absent</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-blue-800 mb-2">Important Notes</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Passing mark is <strong>50% (Grade 6 or better)</strong></li>
                <li>• All fields marked with * are required</li>
                <li>• Subjects are based on your class assignments</li>
                <li>• Results can be edited later if needed</li>
                <li>• Data is saved securely and backs up automatically</li>
                <li>• <strong>Complete all 3 exam types (Week 4, Week 8, End of Term) for each subject to enable full report card generation</strong></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}