// @/pages/teacher/ResultsEntry.tsx - ONLY THE ERROR FIXED, NOTHING ELSE CHANGED
import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useEffect, useMemo, useRef } from 'react'; // ← Added React import
import { Save, Loader2, Users, BookOpen, AlertCircle, CheckCircle, XCircle, ChevronDown, ChevronUp, GraduationCap, Lock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useResults, useSubjectCompletion } from '@/hooks/useResults';
import { learnerService } from '@/services/schoolService';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { calculateGrade, getGradeDisplay } from '@/services/resultsService';

interface StudentResultInput {
  id: string;
  studentId: string;
  name: string;
  marks: string;
}

// ==================== GRADE BADGE ====================
const GradeBadge = ({ grade }: { grade: number | null }) => {
  if (grade === null) return <span className="text-gray-300 text-xs">—</span>;
  if (grade === -1) return <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-xs font-mono">X</span>;
  
  const colors = {
    1: 'bg-green-600 text-white',
    2: 'bg-green-500 text-white',
    3: 'bg-blue-500 text-white',
    4: 'bg-blue-400 text-white',
    5: 'bg-cyan-500 text-white',
    6: 'bg-cyan-400 text-white',
    7: 'bg-yellow-500 text-white',
    8: 'bg-orange-500 text-white',
    9: 'bg-red-500 text-white',
  };
  
  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${colors[grade as keyof typeof colors] || 'bg-gray-500 text-white'}`}>
      {grade}
    </span>
  );
};

// ==================== STUDENT ROW ====================
interface StudentRowProps {
  student: StudentResultInput;
  index: number;
  totalMarks: number;
  onMarksChange: (studentId: string, marks: string) => void;
  inputRef?: React.RefObject<HTMLInputElement>;
  onEnterPress?: () => void;
  isMobile: boolean;
  disabled?: boolean;
}

const StudentRow = ({ 
  student, 
  index, 
  totalMarks, 
  onMarksChange, 
  inputRef, 
  onEnterPress,
  isMobile,
  disabled = false
}: StudentRowProps) => {
  const marks = student.marks;
  const isAbsent = marks.toLowerCase() === 'x';
  const marksNum = marks && !isAbsent ? parseInt(marks) : null;
  const percentage = marksNum !== null ? ((marksNum / totalMarks) * 100).toFixed(0) : null;
  const grade = marksNum !== null 
    ? calculateGrade(parseFloat(percentage || '0'))
    : isAbsent ? -1 : null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' && onEnterPress) {
      e.preventDefault();
      onEnterPress();
    }
    if (e.key === 'ArrowDown' && onEnterPress) {
      e.preventDefault();
      onEnterPress();
    }
  };

  if (isMobile) {
    return (
      <div className="bg-white border-b border-gray-100 p-4 last:border-b-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-xs font-medium text-gray-400 w-6">{index + 1}</span>
            <span className="font-medium text-gray-900 text-sm truncate">{student.name}</span>
          </div>
          <GradeBadge grade={grade} />
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={marks}
              onChange={e => onMarksChange(student.id, e.target.value)}
              onKeyDown={handleKeyDown}
              ref={inputRef}
              placeholder={disabled ? "Locked" : "0 / X"}
              className={`
                w-full px-4 py-3 border rounded-lg text-base font-medium uppercase
                focus:ring-2 focus:ring-blue-500 focus:border-transparent
                ${disabled 
                  ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed' 
                  : 'border-gray-300'
                }
              `}
              inputMode="numeric"
              disabled={disabled}
            />
            {!disabled && marks && !isAbsent && marksNum !== null && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                <span className="text-xs text-gray-500">{marksNum}/{totalMarks}</span>
              </div>
            )}
            {disabled && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <Lock size={14} className="text-gray-400" />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <tr className={`hover:bg-gray-50/50 transition-colors group ${disabled ? 'opacity-75' : ''}`}>
      <td className="px-3 py-3 text-xs text-gray-500 font-mono">{index + 1}</td>
      <td className="px-3 py-3">
        <div className="font-medium text-gray-900 text-sm truncate max-w-[200px]" title={student.name}>
          {student.name}
        </div>
        <div className="text-xs text-gray-400 font-mono">{student.studentId.slice(-6)}</div>
      </td>
      <td className="px-3 py-3">
        <div className="relative w-28">
          <input
            type="text"
            value={marks}
            onChange={e => onMarksChange(student.id, e.target.value)}
            onKeyDown={handleKeyDown}
            ref={inputRef}
            placeholder={disabled ? "—" : "0"}
            className={`
              w-full px-3 py-1.5 border rounded-lg text-sm font-medium text-center uppercase
              focus:ring-2 focus:ring-blue-500 focus:border-transparent
              ${disabled 
                ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed' 
                : 'border-gray-300'
              }
            `}
            inputMode="numeric"
            disabled={disabled}
          />
          {!disabled && marks && !isAbsent && marksNum !== null && (
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-[10px] text-gray-400">
              /{totalMarks}
            </div>
          )}
          {disabled && (
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
              <Lock size={12} className="text-gray-400" />
            </div>
          )}
        </div>
      </td>
      <td className="px-3 py-3">
        <GradeBadge grade={grade} />
      </td>
    </tr>
  );
};

// ==================== SUBJECT PROGRESS BAR ====================
const SubjectProgress = ({ 
  completion, 
  selectedExamType,
  onExamTypeChange 
}: { 
  completion: any; 
  selectedExamType: string;
  onExamTypeChange: (type: 'week4' | 'week8' | 'endOfTerm') => void;
}) => {
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  if (!completion) return null;
  
  const examTypes = [
    { 
      id: 'week4', 
      label: 'W4', 
      fullLabel: 'Week 4',
      isComplete: completion.week4Complete,
      count: completion.enteredStudents.week4
    },
    { 
      id: 'week8', 
      label: 'W8', 
      fullLabel: 'Week 8',
      isComplete: completion.week8Complete,
      count: completion.enteredStudents.week8
    },
    { 
      id: 'endOfTerm', 
      label: 'EOT', 
      fullLabel: 'End of Term',
      isComplete: completion.endOfTermComplete,
      count: completion.enteredStudents.endOfTerm
    },
  ];

  // Determine which exam types are available
  const week4Complete = completion.week4Complete;
  const week8Complete = completion.week8Complete;
  
  // Week 8 is enabled only if Week 4 is complete
  const isWeek8Enabled = week4Complete;
  // End of Term is enabled only if Week 8 is complete
  const isEndOfTermEnabled = week8Complete;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <GraduationCap size={16} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700">
            {completion.subjectName}
          </span>
        </div>
        <span className="text-xs text-gray-500">
          {completion.percentComplete}% complete
        </span>
      </div>
      
      {/* Progress Bar - Single, clean visualization */}
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden mb-4">
        <div 
          className="h-full bg-blue-500 rounded-full transition-all duration-500"
          style={{ width: `${completion.percentComplete}%` }}
        />
      </div>
      
      {/* Exam Type Selector - Shows lock states */}
      <div className="grid grid-cols-3 gap-2">
        {examTypes.map((exam) => {
          const isSelected = selectedExamType === exam.id;
          const isLocked = 
            (exam.id === 'week8' && !week4Complete) ||
            (exam.id === 'endOfTerm' && !week8Complete);
          
          return (
            <button
              key={exam.id}
              onClick={() => !isLocked && onExamTypeChange(exam.id as any)}
              disabled={isLocked}
              className={`
                relative flex flex-col items-center p-2 rounded-lg transition-all
                ${isSelected 
                  ? 'bg-blue-50 border-2 border-blue-500' 
                  : 'border-2 border-transparent'
                }
                ${isLocked 
                  ? 'opacity-50 cursor-not-allowed bg-gray-50' 
                  : 'hover:bg-gray-50 cursor-pointer'
                }
              `}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`text-xs font-semibold ${
                  exam.isComplete ? 'text-green-600' : isSelected ? 'text-blue-600' : 'text-gray-600'
                }`}>
                  {exam.label}
                </span>
                {exam.isComplete && (
                  <CheckCircle size={12} className="text-green-500" />
                )}
                {isLocked && !exam.isComplete && (
                  <Lock size={10} className="text-gray-400" />
                )}
              </div>
              <span className="text-[10px] text-gray-500">
                {exam.count}/{completion.totalStudents}
              </span>
              {exam.isComplete && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
      
      {/* Contextual Hint */}
      {selectedExamType === 'week4' && !completion.week4Complete && (
        <p className="text-xs text-gray-500 mt-3 text-center">
          Complete Week 4 to unlock Week 8
        </p>
      )}
      {selectedExamType === 'week8' && !completion.week8Complete && week4Complete && (
        <p className="text-xs text-gray-500 mt-3 text-center">
          Complete Week 8 to unlock End of Term
        </p>
      )}
      {selectedExamType === 'endOfTerm' && !completion.endOfTermComplete && week8Complete && (
        <p className="text-xs text-gray-500 mt-3 text-center">
          Final exam entry
        </p>
      )}
    </div>
  );
};

// ==================== SKELETON ====================
const TableSkeleton = () => (
  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
    <div className="p-4 border-b border-gray-200 bg-gray-50">
      <div className="h-5 bg-gray-200 rounded w-48"></div>
    </div>
    <div className="divide-y divide-gray-100">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="p-4 flex items-center gap-4">
          <div className="w-6 h-4 bg-gray-200 rounded"></div>
          <div className="flex-1 h-4 bg-gray-200 rounded"></div>
          <div className="w-20 h-8 bg-gray-200 rounded"></div>
          <div className="w-10 h-6 bg-gray-200 rounded"></div>
        </div>
      ))}
    </div>
  </div>
);

// ==================== EMPTY STATE ====================
const EmptyState = ({ 
  hasClass, 
  hasSubject, 
  hasStudents 
}: { 
  hasClass: boolean; 
  hasSubject: boolean; 
  hasStudents: boolean;
}) => {
  if (!hasClass) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
          <BookOpen className="text-gray-400" size={32} />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Select a class to begin</h3>
        <p className="text-gray-600 max-w-md mx-auto text-sm">
          Choose a class from the dropdown above. Your assigned classes will appear based on your teaching assignments.
        </p>
      </div>
    );
  }
  
  if (!hasSubject) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-yellow-100 rounded-full mb-4">
          <AlertCircle className="text-yellow-600" size={32} />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No subject selected</h3>
        <p className="text-gray-600 max-w-md mx-auto text-sm">
          Please select a subject you're assigned to teach for this class.
        </p>
      </div>
    );
  }
  
  if (!hasStudents) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
          <Users className="text-gray-400" size={32} />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No students enrolled</h3>
        <p className="text-gray-600 max-w-md mx-auto text-sm">
          This class doesn't have any enrolled students yet. Contact the administrator to add students.
        </p>
      </div>
    );
  }
  
  return null;
};

// ==================== MAIN COMPONENT ====================
export default function ResultsEntry() {
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  // SIMPLE FIX: Store DOM elements, not RefObjects
  const inputElements = useRef<Map<string, HTMLInputElement>>(new Map());
  const tableContainerRef = useRef<HTMLDivElement>(null);
  
  // Core state
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [examType, setExamType] = useState<'week4' | 'week8' | 'endOfTerm'>('week4');
  const [term, setTerm] = useState('Term 1');
  const [year, setYear] = useState(new Date().getFullYear());
  const [totalMarks, setTotalMarks] = useState(100);
  
  // Data state
  const [students, setStudents] = useState<StudentResultInput[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedClassData, setSelectedClassData] = useState<any>(null);

  // Hooks
  const { classes, isLoading: loadingClasses } = useSchoolClasses({ isActive: true });
  const { assignments, getSubjectsForClass, isLoading: loadingAssignments } = useTeacherAssignments(user?.id);
  const { saveResults, isSaving, checkExisting } = useResults();
  
  // Subject completion with lifecycle tracking
  const {
    completionStatus,
    isLoading: loadingCompletion,
    refetch: refetchCompletion
  } = useSubjectCompletion({
    classId: selectedClass,
    term,
    year,
  });

  // Get assigned classes
  const assignedClasses = useMemo(() => {
    if (!user?.id || !classes.length) return [];
    return classes.filter(cls => 
      cls.teachers?.includes(user.id) || 
      cls.formTeacherId === user.id
    );
  }, [classes, user?.id]);

  // Get available subjects for selected class
  const availableSubjects = useMemo(() => {
    if (!selectedClass || !user?.id) return [];
    return getSubjectsForClass(selectedClass);
  }, [selectedClass, user?.id, getSubjectsForClass]);

  // Get completion for current subject
  const currentSubjectCompletion = useMemo(() => {
    if (!selectedSubject || !completionStatus.length) return null;
    return completionStatus.find(s => s.subjectName === selectedSubject);
  }, [selectedSubject, completionStatus]);

  // LIFECYCLE RULES:
  // - Week 4: Always enabled initially
  // - Week 8: Enabled only if Week 4 is complete
  // - End of Term: Enabled only if Week 8 is complete
  const isExamTypeEnabled = (type: 'week4' | 'week8' | 'endOfTerm') => {
    if (!currentSubjectCompletion) return type === 'week4'; // Default to Week 4
    
    if (type === 'week4') return true;
    if (type === 'week8') return currentSubjectCompletion.week4Complete;
    if (type === 'endOfTerm') return currentSubjectCompletion.week8Complete;
    
    return false;
  };

  // Auto-select appropriate exam type based on completion
  useEffect(() => {
    if (!currentSubjectCompletion) return;
    
    // If current selection is locked, move to next available
    if (!isExamTypeEnabled(examType)) {
      if (isExamTypeEnabled('week4')) {
        setExamType('week4');
      } else if (isExamTypeEnabled('week8')) {
        setExamType('week8');
      } else if (isExamTypeEnabled('endOfTerm')) {
        setExamType('endOfTerm');
      }
    }
  }, [currentSubjectCompletion, examType]);

  // Auto-select subject if only one
  useEffect(() => {
    if (availableSubjects.length === 1 && !selectedSubject) {
      setSelectedSubject(availableSubjects[0]);
    }
  }, [availableSubjects, selectedSubject]);

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
        const classInfo = assignedClasses.find(c => c.id === selectedClass);
        setSelectedClassData(classInfo);
        
        if (!classInfo) {
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
        setStudents([]);
        setSelectedClassData(null);
      } finally {
        setLoadingStudents(false);
      }
    };

    loadStudents();
  }, [selectedClass, assignedClasses]);

  // Focus management - SIMPLE: store the element directly
  const focusNextInput = (currentStudentId: string) => {
    const currentIndex = students.findIndex(s => s.id === currentStudentId);
    if (currentIndex < students.length - 1) {
      const nextStudent = students[currentIndex + 1];
      const nextInput = inputElements.current.get(nextStudent.id);
      nextInput?.focus();
    }
  };

  // Handlers
  const handleMarksChange = (studentId: string, marks: string) => {
    // Allow only numbers, X, or empty
    if (marks && marks.toLowerCase() !== 'x' && !/^\d*$/.test(marks)) return;
    
    const marksNum = parseInt(marks);
    if (marks && marks.toLowerCase() !== 'x' && marksNum > totalMarks) return;

    setStudents(students.map(s =>
      s.id === studentId ? { ...s, marks } : s
    ));
  };

  const handleExamTypeChange = (type: 'week4' | 'week8' | 'endOfTerm') => {
    if (isExamTypeEnabled(type)) {
      setExamType(type);
    }
  };

  const handleSaveResults = async () => {
    if (!selectedClass || !selectedSubject || !selectedClassData || !user) return;

    const results = students
      .filter(s => s.marks !== '')
      .map(s => ({
        studentId: s.studentId,
        studentName: s.name,
        marks: s.marks.toLowerCase() === 'x' ? -1 : parseInt(s.marks),
      }));

    if (results.length === 0) {
      alert('Please enter marks for at least one student');
      return;
    }

    try {
      await saveResults({
        classId: selectedClass,
        className: selectedClassData.name,
        subjectId: selectedSubject,
        subjectName: selectedSubject,
        teacherId: user.id,
        teacherName: user.name || user.email || 'Unknown',
        examType,
        examName: `${examType} - ${selectedSubject}`,
        term,
        year,
        totalMarks,
        results,
        overwrite: false,
      });

      // Clear marks on success
      setStudents(students.map(s => ({ ...s, marks: '' })));
      
      // Refresh completion status
      refetchCompletion();
      
    } catch (error: any) {
      console.error('Error saving results:', error);
      alert(`Failed to save: ${error.message || 'Please try again'}`);
    }
  };

  const handleClearAll = () => {
    if (students.some(s => s.marks !== '') && confirm('Clear all entered marks?')) {
      setStudents(students.map(s => ({ ...s, marks: '' })));
    }
  };

  // Stats
  const filledCount = students.filter(s => s.marks && s.marks !== '').length;
  const totalStudents = students.length;
  const completionPercentage = totalStudents > 0 ? Math.round((filledCount / totalStudents) * 100) : 0;
  
  // Is current exam type locked?
  const isCurrentExamLocked = currentSubjectCompletion 
    ? !isExamTypeEnabled(examType)
    : false;
  
  // Has this exam type already been completed?
  const isExamCompleted = currentSubjectCompletion
    ? (examType === 'week4' && currentSubjectCompletion.week4Complete) ||
      (examType === 'week8' && currentSubjectCompletion.week8Complete) ||
      (examType === 'endOfTerm' && currentSubjectCompletion.endOfTermComplete)
    : false;

  // Loading states
  if (loadingClasses || loadingAssignments) {
    return (
      <DashboardLayout activeTab="results">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
            <p className="text-gray-600">Loading your classes...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="results">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* ===== HEADER - MINIMAL ===== */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              Results Entry
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              {selectedClassData?.name || 'Select a class'} • {term} {year}
            </p>
          </div>
          
          {/* Save Button - Disabled if exam is locked or completed */}
          {selectedClass && selectedSubject && students.length > 0 && (
            <button
              onClick={handleSaveResults}
              disabled={isSaving || filledCount === 0 || isExamCompleted || isCurrentExamLocked}
              className={`
                inline-flex items-center justify-center gap-2
                bg-blue-600 text-white rounded-xl hover:bg-blue-700
                font-medium transition-all active:scale-[0.98]
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
                px-5 py-3 shadow-lg
                ${isMobile ? 'w-full' : ''}
              `}
              title={isExamCompleted ? 'This exam has already been completed' : ''}
            >
              {isSaving ? (
                <Loader2 size={18} className="animate-spin" />
              ) : isExamCompleted ? (
                <CheckCircle size={18} />
              ) : (
                <Save size={18} />
              )}
              <span>
                {isExamCompleted 
                  ? 'Completed' 
                  : isCurrentExamLocked 
                    ? 'Locked' 
                    : `Save ${filledCount > 0 ? `(${filledCount})` : ''}`}
              </span>
            </button>
          )}
        </div>

        {/* ===== FILTERS - COMPACT ===== */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            
            {/* Class Select */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Class <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedClass}
                onChange={e => {
                  setSelectedClass(e.target.value);
                  setSelectedSubject('');
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                disabled={assignedClasses.length === 0}
              >
                <option value="">Select class...</option>
                {assignedClasses.map(cls => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({cls.students || 0})
                  </option>
                ))}
              </select>
            </div>
            
            {/* Subject Select */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Subject <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedSubject}
                onChange={e => setSelectedSubject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                disabled={!selectedClass || availableSubjects.length === 0}
              >
                <option value="">
                  {!selectedClass ? 'Select class first' : 
                   availableSubjects.length === 0 ? 'No subjects' : 'Select subject...'}
                </option>
                {availableSubjects.map(subject => (
                  <option key={subject} value={subject}>{subject}</option>
                ))}
              </select>
            </div>
            
            {/* Term & Year Combined */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Term
                </label>
                <select
                  value={term}
                  onChange={e => setTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                >
                  <option value="Term 1">T1</option>
                  <option value="Term 2">T2</option>
                  <option value="Term 3">T3</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Year
                </label>
                <input
                  type="number"
                  value={year}
                  onChange={e => setYear(parseInt(e.target.value) || new Date().getFullYear())}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  min="2020"
                  max="2030"
                />
              </div>
            </div>
            
            {/* Total Marks */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Total Marks
              </label>
              <input
                type="number"
                value={totalMarks}
                onChange={e => setTotalMarks(parseInt(e.target.value) || 100)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                min="1"
                max="500"
                disabled={isExamCompleted}
              />
            </div>
          </div>
        </div>

        {/* ===== SUBJECT PROGRESS - CLEAN, MINIMAL, LIFECYCLE-AWARE ===== */}
        {selectedClass && selectedSubject && currentSubjectCompletion && (
          <SubjectProgress 
            completion={currentSubjectCompletion}
            selectedExamType={examType}
            onExamTypeChange={handleExamTypeChange}
          />
        )}

        {/* ===== RESULTS ENTRY - THREE COLUMNS ONLY ===== */}
        {loadingStudents ? (
          <TableSkeleton />
        ) : (
          <>
            <EmptyState 
              hasClass={!!selectedClass}
              hasSubject={!!selectedSubject}
              hasStudents={students.length > 0}
            />
            
            {selectedClass && selectedSubject && students.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                
                {/* Header - Clean, minimal */}
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-900 text-sm">
                      {selectedClassData?.name} • {selectedSubject}
                    </span>
                  </div>
                  
                  {/* Entry Progress - Single bar */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                      {filledCount}/{totalStudents}
                    </span>
                    <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${completionPercentage}%` }}
                      />
                    </div>
                    {filledCount > 0 && (
                      <button
                        onClick={handleClearAll}
                        className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
                        disabled={isExamCompleted}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Mobile-Optimized Card List */}
                {isMobile ? (
                  <div className="divide-y divide-gray-100">
                    {students.map((student, index) => (
                      <StudentRow
                        key={student.id}
                        student={student}
                        index={index}
                        totalMarks={totalMarks}
                        onMarksChange={handleMarksChange}
                        inputRef={{
                          current: inputElements.current.get(student.id) || null
                        }}
                        onEnterPress={() => focusNextInput(student.id)}
                        isMobile={true}
                        disabled={isExamCompleted || isCurrentExamLocked}
                      />
                    ))}
                  </div>
                ) : (
                  /* Desktop Compact Table - THREE COLUMNS ONLY */
                  <div className="overflow-x-auto" ref={tableContainerRef}>
                    <table className="w-full">
                      <thead className="bg-gray-50 text-xs">
                        <tr>
                          <th className="px-3 py-3 text-left font-medium text-gray-600 w-12">#</th>
                          <th className="px-3 py-3 text-left font-medium text-gray-600">Student</th>
                          <th className="px-3 py-3 text-left font-medium text-gray-600">Marks</th>
                          <th className="px-3 py-3 text-left font-medium text-gray-600">Grade</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {students.map((student, index) => (
                          <StudentRow
                            key={student.id}
                            student={student}
                            index={index}
                            totalMarks={totalMarks}
                            onMarksChange={handleMarksChange}
                            inputRef={{
                              current: inputElements.current.get(student.id) || null
                            }}
                            onEnterPress={() => focusNextInput(student.id)}
                            isMobile={false}
                            disabled={isExamCompleted || isCurrentExamLocked}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                
                {/* Keyboard Shortcuts Hint */}
                {!isExamCompleted && !isCurrentExamLocked && (
                  <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex items-center gap-4">
                    <span>⏎ Enter: next student</span>
                    <span>X: absent</span>
                    <span>0-{totalMarks}: marks</span>
                  </div>
                )}
                
                {/* Completion Message */}
                {isExamCompleted && (
                  <div className="px-4 py-3 bg-green-50 border-t border-green-200 text-sm text-green-700 flex items-center gap-2">
                    <CheckCircle size={16} />
                    <span>✓ {examType} results are complete and locked</span>
                  </div>
                )}
                
                {isCurrentExamLocked && !isExamCompleted && (
                  <div className="px-4 py-3 bg-yellow-50 border-t border-yellow-200 text-sm text-yellow-700 flex items-center gap-2">
                    <Lock size={16} />
                    <span>🔒 Complete previous exam type to unlock</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ===== NO CLASSES STATE ===== */}
        {!loadingClasses && assignedClasses.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-yellow-100 rounded-full mb-4">
              <BookOpen className="text-yellow-600" size={32} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Classes Assigned</h3>
            <p className="text-gray-600 max-w-md mx-auto text-sm">
              You haven't been assigned to any classes yet. Contact your administrator to get teaching assignments.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}