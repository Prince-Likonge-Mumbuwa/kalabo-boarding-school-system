// @/pages/teacher/ResultsEntry.tsx - COMPLETE FIXED VERSION
// Fixed: PDF generation and subject-specific completion for same teacher two subjects
// Fixed: Progress bar now reflects total entries entered vs total expected

import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Save, 
  Loader2, 
  Users, 
  BookOpen, 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  GraduationCap, 
  Download,
  Edit3,
  Trash2,
  History,
  UserX,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useResults, useSubjectCompletion } from '@/hooks/useResults';
import { useExamConfig } from '@/hooks/useExamConfig';
import { learnerService } from '@/services/schoolService';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { calculateGrade, normalizeSubjectName } from '@/services/resultsService';

// ==================== INTERFACES ====================
interface StudentResultInput {
  id: string;
  studentId: string;
  name: string;
  marks: string;
}

interface SavedDraft {
  id: string;
  classId: string;
  className: string;
  subject: string;
  examType: 'week4' | 'week8' | 'endOfTerm';
  term: string;
  year: number;
  totalMarks: number;
  results: StudentResultInput[];
  lastModified: string;
  completedCount: number;
  totalStudents: number;
}

interface ExtendedSubjectCompletion {
  subjectId: string;
  subjectName: string;
  totalStudents: number;
  percentComplete: number;
  week4Complete: boolean;
  week8Complete: boolean;
  endOfTermComplete: boolean;
  enteredStudents: {
    week4: number;
    week8: number;
    endOfTerm: number;
  };
  enteredStudentIds?: {
    week4: string[];
    week8: string[];
    endOfTerm: string[];
  };
  savedMarks?: Record<string, number>;
}

interface ClassInfo {
  id: string;
  name: string;
  students?: number;
  teachers?: string[];
  formTeacherId?: string;
}

interface ExamDataItem {
  studentId: string;
  studentName: string;
  marks: number;
  student_id?: string;
}

interface ExamData {
  week4: ExamDataItem[];
  week8: ExamDataItem[];
  endOfTerm: ExamDataItem[];
}

// ==================== MODAL / TOAST STATE ====================
interface ModalState {
  type: 'confirmDelete' | 'confirmCancelEdit' | 'confirmClearDraft' | 'confirmDiscardChanges' | 'confirmOverwrite';
  title: string;
  description: string;
  onConfirm: () => void;
}

interface ToastState {
  id: number;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

// ==================== HELPER FUNCTIONS ====================
const getAvailableExamTypes = (config: any) => {
  if (!config?.examTypes) return [];
  
  const types = [];
  if (config.examTypes.week4 === true) types.push({ id: 'week4', label: 'Week 4', shortLabel: 'W4' });
  if (config.examTypes.week8 === true) types.push({ id: 'week8', label: 'Week 8', shortLabel: 'W8' });
  if (config.examTypes.endOfTerm === true) types.push({ id: 'endOfTerm', label: 'End of Term', shortLabel: 'EOT' });
  
  return types;
};

const getTotalMarksForExamType = (config: any, examType: string): number => {
  if (!config) return 100;
  const marksKey = `${examType}TotalMarks`;
  return config[marksKey] || 100;
};

// ==================== GRADE BADGE ====================
const GradeBadge = ({ grade }: { grade: number | null }) => {
  if (grade === null) return <span className="text-gray-300 text-xs">—</span>;
  if (grade === -1) return <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-xs font-mono">X</span>;
  
  const colors: Record<number, string> = {
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
    <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${colors[grade] || 'bg-gray-500 text-white'}`}>
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
  showExistingMark?: number | null;
  onMarkAbsent?: (studentId: string) => void;
}

const StudentRow = ({ 
  student, 
  index, 
  totalMarks, 
  onMarksChange, 
  inputRef, 
  onEnterPress,
  isMobile,
  disabled = false,
  showExistingMark,
  onMarkAbsent
}: StudentRowProps) => {
  const marks = student.marks || '';
  const isAbsent = marks.toLowerCase() === 'x';
  const marksNum = marks && !isAbsent ? parseInt(marks) : null;
  const percentage = marksNum !== null ? ((marksNum / totalMarks) * 100).toFixed(0) : null;
  const grade = marksNum !== null 
    ? calculateGrade(parseFloat(percentage || '0'))
    : isAbsent ? -1 : null;

  const hasExistingMark = showExistingMark !== undefined && showExistingMark !== null && marks === '';

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

  const handleMarkAbsent = () => {
    if (onMarkAbsent) {
      onMarkAbsent(student.id);
    }
  };

  if (isMobile) {
    return (
      <div className="bg-white border-b border-gray-100 p-3 last:border-b-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-xs font-medium text-gray-400 w-5">{index + 1}</span>
            <span className="font-medium text-gray-900 text-sm truncate">{student.name}</span>
          </div>
          <GradeBadge grade={grade} />
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={marks}
              onChange={e => onMarksChange(student.id, e.target.value)}
              onKeyDown={handleKeyDown}
              ref={inputRef}
              placeholder={disabled ? "Locked" : hasExistingMark ? `${showExistingMark}` : "0"}
              className={`
                w-full px-3 py-2.5 border rounded-lg text-base font-medium
                focus:ring-2 focus:ring-blue-500 focus:border-transparent
                ${disabled 
                  ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed' 
                  : hasExistingMark
                    ? 'bg-green-50 border-green-300 text-green-700'
                    : 'border-gray-300'
                }
              `}
              inputMode="numeric"
              disabled={disabled}
            />
            {!disabled && marks && !isAbsent && marksNum !== null && (
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-gray-500">
                {marksNum}/{totalMarks}
              </div>
            )}
          </div>
          {!disabled && (
            <button
              onClick={handleMarkAbsent}
              className={`p-2 rounded-lg transition-colors ${
                isAbsent 
                  ? 'bg-gray-700 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title="Mark as absent"
            >
              <UserX size={16} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <tr className={`hover:bg-gray-50/50 transition-colors group ${disabled ? 'opacity-75' : ''}`}>
      <td className="px-3 py-2.5 text-xs text-gray-500 font-mono">{index + 1}</td>
      <td className="px-3 py-2.5">
        <div className="font-medium text-gray-900 text-sm truncate max-w-[180px]" title={student.name}>
          {student.name}
        </div>
        <div className="text-xs text-gray-400 font-mono">{student.studentId.slice(-6)}</div>
      </td>
      <td className="px-3 py-2.5">
        <div className="relative w-24">
          <input
            type="text"
            value={marks}
            onChange={e => onMarksChange(student.id, e.target.value)}
            onKeyDown={handleKeyDown}
            ref={inputRef}
            placeholder={disabled ? "—" : hasExistingMark ? `${showExistingMark}` : "0"}
            className={`
              w-full px-2 py-1.5 border rounded-lg text-sm font-medium text-center
              focus:ring-2 focus:ring-blue-500 focus:border-transparent
              ${disabled 
                ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed' 
                : hasExistingMark
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : 'border-gray-300'
              }
            `}
            inputMode="numeric"
            disabled={disabled}
          />
          {!disabled && marks && !isAbsent && marksNum !== null && (
            <div className="absolute right-1 top-1/2 transform -translate-y-1/2 text-[10px] text-gray-400">
              /{totalMarks}
            </div>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <GradeBadge grade={grade} />
      </td>
      <td className="px-3 py-2.5">
        {!disabled && (
          <button
            onClick={handleMarkAbsent}
            className={`p-1.5 rounded-lg transition-colors ${
              isAbsent 
                ? 'bg-gray-700 text-white' 
                : 'text-gray-500 hover:bg-gray-100'
            }`}
            title="Mark as absent"
          >
            <UserX size={16} />
          </button>
        )}
      </td>
    </tr>
  );
};

// ==================== SUBJECT PROGRESS BAR ====================
interface SubjectProgressProps {
  completion: ExtendedSubjectCompletion | null;
  selectedExamType: string;
  onExamTypeChange: (type: 'week4' | 'week8' | 'endOfTerm') => void;
  hasDraft?: boolean;
  availableExamTypes: Array<{ id: string; label: string; shortLabel: string }>;
  examConfig: any;
  subjectName: string;
  isLoading?: boolean;
  hasExistingResults?: boolean;
}

const SubjectProgress = ({ 
  completion, 
  selectedExamType,
  onExamTypeChange,
  hasDraft,
  availableExamTypes,
  examConfig,
  subjectName,
  isLoading = false,
  hasExistingResults = false
}: SubjectProgressProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  if (availableExamTypes.length === 0) {
    return (
      <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4 text-center">
        <AlertCircle size={20} className="text-yellow-600 mx-auto mb-2" />
        <p className="text-sm text-yellow-700 font-medium">No Exams Configured for {examConfig?.term || 'this term'}</p>
        <p className="text-xs text-yellow-600 mt-1">
          No exam types are enabled for this term. Please contact the administrator.
        </p>
      </div>
    );
  }
  
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-center gap-2">
          <Loader2 size={20} className="animate-spin text-blue-600" />
          <span className="text-sm text-gray-600">Loading completion status...</span>
        </div>
      </div>
    );
  }
  
  const safeCompletion = completion || {
    subjectId: normalizeSubjectName(subjectName),
    subjectName,
    totalStudents: 0,
    percentComplete: 0,
    week4Complete: false,
    week8Complete: false,
    endOfTermComplete: false,
    enteredStudents: { week4: 0, week8: 0, endOfTerm: 0 }
  };
  
  // Calculate total entries entered vs total expected ACROSS ALL EXAMS
  let totalEnteredEntries = 0;
  let totalExpectedEntries = 0;
  
  const examTypes = availableExamTypes.map(type => {
    const enteredCount = safeCompletion.enteredStudents?.[type.id as keyof typeof safeCompletion.enteredStudents] || 0;
    const totalStudents = safeCompletion.totalStudents || 0;
    const totalMarks = getTotalMarksForExamType(examConfig, type.id);
    
    // Add to totals
    totalEnteredEntries += enteredCount;
    totalExpectedEntries += totalStudents;
    
    // Consider exam "complete" if ALL students have marks (100%)
    const isComplete = enteredCount === totalStudents && totalStudents > 0;
    
    return {
      id: type.id,
      label: type.shortLabel,
      fullLabel: type.label,
      isComplete,
      count: enteredCount,
      totalMarks,
      totalStudents
    };
  });

  // Calculate overall progress percentage based on TOTAL ENTRIES
  const overallProgressPercentage = totalExpectedEntries > 0
    ? Math.round((totalEnteredEntries / totalExpectedEntries) * 100)
    : 0;

  const completedExams = examTypes.filter(exam => exam.isComplete).length;
  const gridCols = examTypes.length === 3 ? 'grid-cols-3' : examTypes.length === 2 ? 'grid-cols-2' : 'grid-cols-1';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <GraduationCap size={16} className="text-gray-500 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-700">{safeCompletion.subjectName}</span>
          {hasDraft && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Draft</span>}
          {hasExistingResults && !hasDraft && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1">
              <CheckCircle size={10} /> Saved Results Exist
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {totalEnteredEntries}/{totalExpectedEntries} entries
          </span>
          <span className="text-xs font-medium text-gray-700">
            {overallProgressPercentage}% complete
          </span>
        </div>
      </div>
      
      {/* PROGRESS BAR - Based on total entries entered vs total expected */}
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden mb-4">
        <div 
          className="h-full bg-blue-500 rounded-full transition-all duration-500"
          style={{ width: `${overallProgressPercentage}%` }}
        />
      </div>
      
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">
          {completedExams}/{examTypes.length} exams complete
        </span>
        <span className="text-xs text-gray-400">
          (100% = all students have marks)
        </span>
      </div>
      
      <div className={`grid ${gridCols} gap-1.5 sm:gap-2`}>
        {examTypes.map((exam) => {
          const isSelected = selectedExamType === exam.id;
          const examProgressPercentage = exam.totalStudents > 0 
            ? Math.round((exam.count / exam.totalStudents) * 100)
            : 0;
          
          return (
            <button
              key={exam.id}
              onClick={() => onExamTypeChange(exam.id as any)}
              className={`
                relative flex flex-col items-center p-1.5 sm:p-2 rounded-lg transition-all duration-200
                ${isSelected 
                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md shadow-blue-200 scale-[1.02] border-0' 
                  : 'bg-gray-50 border border-gray-200 hover:bg-gray-100 hover:border-gray-300 text-gray-700'
                }
              `}
            >
              <div className="flex items-center gap-1 mb-0.5 sm:mb-1">
                <span className={`text-xs font-semibold ${isSelected ? 'text-white' : exam.isComplete ? 'text-green-600' : 'text-gray-600'}`}>
                  {exam.label}
                </span>
                {exam.isComplete && !isSelected && <CheckCircle size={10} className="text-green-500 flex-shrink-0" />}
                {exam.isComplete && isSelected && <CheckCircle size={10} className="text-white flex-shrink-0" />}
              </div>
              
              {/* Mini progress bar for each exam */}
              <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden my-0.5">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${
                    examProgressPercentage === 100 ? 'bg-green-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${examProgressPercentage}%` }}
                />
              </div>
              
              <span className={`text-[10px] ${isSelected ? 'text-blue-100' : 'text-gray-500'}`}>
                {exam.count}/{exam.totalStudents}
              </span>
              <span className={`text-[8px] mt-0.5 ${isSelected ? 'text-blue-200' : 'text-gray-400'}`}>
                {exam.totalMarks} marks • {examProgressPercentage}%
              </span>
              {isSelected && <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-6 h-1 bg-white rounded-full opacity-60" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ==================== DRAFT CARD ====================
interface DraftCardProps {
  draft: SavedDraft;
  onLoad: () => void;
  onDelete: () => void;
}

const DraftCard = ({ draft, onLoad, onDelete }: DraftCardProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const examLabel = draft.examType === 'week4' ? 'Week 4' : draft.examType === 'week8' ? 'Week 8' : 'End of Term';
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md transition-all">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <h4 className="font-medium text-gray-900 text-sm truncate">
            {draft.className} • {draft.subject}
          </h4>
          <p className="text-xs text-gray-500 truncate">
            {examLabel} • {draft.term} {draft.year}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onLoad}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Load draft"
          >
            <Edit3 size={14} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete draft"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-600">
          {draft.completedCount}/{draft.totalStudents} entered
        </span>
        <span className="text-gray-400">
          {new Date(draft.lastModified).toLocaleTimeString()}
        </span>
      </div>
      <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div 
          className="h-full bg-yellow-500 rounded-full"
          style={{ width: `${(draft.completedCount / draft.totalStudents) * 100}%` }}
        />
      </div>
    </div>
  );
};

// ==================== MARK SCHEDULE PDF PREVIEW ====================
interface MarksPDFPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  students: StudentResultInput[];
  classInfo: ClassInfo | null;
  subject: string;
  examType: 'week4' | 'week8' | 'endOfTerm';
  term: string;
  year: number;
  totalMarks: number;
  onDownload: () => void;
  allExamData: ExamData | null;
  loadingAllData: boolean;
}

const MarksPDFPreview = ({ 
  isOpen, 
  onClose, 
  students, 
  classInfo, 
  subject, 
  examType, 
  term, 
  year, 
  totalMarks,
  onDownload,
  allExamData,
  loadingAllData
}: MarksPDFPreviewProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');

  const savedMarksMap = useMemo(() => {
    const map = new Map();
    
    if (allExamData) {
      const currentExamData = allExamData[examType] || [];
      currentExamData.forEach((item: ExamDataItem) => {
        if (item.studentId) {
          map.set(item.studentId, {
            marks: item.marks,
            isSaved: true
          });
        }
        if (item.student_id) {
          map.set(item.student_id, {
            marks: item.marks,
            isSaved: true
          });
        }
      });
    }
    
    return map;
  }, [allExamData, examType]);

  const displayStudents = useMemo(() => {
    return students.map((student: StudentResultInput) => {
      let saved = savedMarksMap.get(student.studentId);
      if (!saved) {
        saved = savedMarksMap.get(student.id);
      }
      
      let displayMarks = student.marks;
      let isFromSaved = false;
      
      if ((!displayMarks || displayMarks === '') && saved) {
        if (saved.marks === -1) {
          displayMarks = 'X';
        } else if (saved.marks >= 0) {
          displayMarks = saved.marks.toString();
        }
        isFromSaved = true;
      }
      
      let percentage = null;
      let grade = null;
      const marksNum = displayMarks && displayMarks.toLowerCase() !== 'x' ? parseInt(displayMarks) : null;
      
      if (marksNum !== null) {
        percentage = ((marksNum / totalMarks) * 100).toFixed(1);
        grade = calculateGrade(parseFloat(percentage));
      } else if (displayMarks?.toLowerCase() === 'x') {
        grade = -1;
      }
      
      return {
        ...student,
        displayMarks,
        isFromSaved,
        percentage,
        grade
      };
    });
  }, [students, savedMarksMap, totalMarks]);

  if (!isOpen) return null;

  const completedCount = displayStudents.filter((s: any) => 
    s.displayMarks && s.displayMarks !== ''
  ).length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
          
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 rounded-t-2xl px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">Mark Schedule Preview</h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1 truncate">
                {classInfo?.name} • {subject} • {examType === 'week4' ? 'Week 4' : examType === 'week8' ? 'Week 8' : 'End of Term'} • {term} {year}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={onDownload}
                disabled={loadingAllData}
                className="inline-flex items-center justify-center gap-1 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm sm:text-base"
              >
                {loadingAllData ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                <span className="hidden xs:inline">{loadingAllData ? 'Loading...' : 'Download'}</span>
              </button>
              <button
                onClick={onClose}
                className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <XCircle size={18} className="text-gray-500" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-3 sm:p-6">
            <div className="min-w-[300px] sm:min-w-[600px]">
              {/* School Header */}
              <div className="text-center mb-4 sm:mb-6">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900">MINISTRY OF EDUCATION</h1>
                <h2 className="text-base sm:text-xl font-semibold text-gray-800 mt-0.5 sm:mt-1">KALABO BOARDING SECONDARY SCHOOL</h2>
                <h3 className="text-sm sm:text-lg font-medium text-blue-600 mt-1 sm:mt-2">MARK SCHEDULE</h3>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 rounded-lg text-xs sm:text-sm">
                <div className="min-w-0">
                  <p className="text-gray-500">Class</p>
                  <p className="font-medium truncate">{classInfo?.name}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-gray-500">Subject</p>
                  <p className="font-medium truncate">{subject}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-gray-500">Exam</p>
                  <p className="font-medium truncate">{examType === 'week4' ? 'Week 4' : examType === 'week8' ? 'Week 8' : 'End of Term'}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-gray-500">Marks</p>
                  <p className="font-medium">{totalMarks}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-gray-500">Term</p>
                  <p className="font-medium truncate">{term} {year}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-gray-500">Students</p>
                  <p className="font-medium">{students.length}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-gray-500">Entered</p>
                  <p className="font-medium text-green-600">{completedCount}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-gray-500">Teacher</p>
                  <p className="font-medium truncate">—</p>
                </div>
              </div>

              {loadingAllData && (
                <div className="text-center py-6 sm:py-8">
                  <Loader2 className="animate-spin text-blue-600 mx-auto mb-2" size={24} />
                  <p className="text-sm text-gray-600">Fetching exam data...</p>
                </div>
              )}

              {/* Table */}
              {!loadingAllData && (
                <div className="overflow-x-auto -mx-3 sm:-mx-6">
                  <div className="inline-block min-w-full align-middle px-3 sm:px-6">
                    <table className="w-full border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="px-2 sm:px-3 py-2 text-left font-semibold text-gray-700 border border-gray-300 w-10 sm:w-12">#</th>
                          <th className="px-2 sm:px-3 py-2 text-left font-semibold text-gray-700 border border-gray-300">Student Name</th>
                          <th className="px-2 sm:px-3 py-2 text-left font-semibold text-gray-700 border border-gray-300 hidden sm:table-cell">Student ID</th>
                          <th className="px-2 sm:px-3 py-2 text-center font-semibold text-gray-700 border border-gray-300 w-16 sm:w-20">Marks</th>
                          <th className="px-2 sm:px-3 py-2 text-center font-semibold text-gray-700 border border-gray-300 w-16 sm:w-20">%</th>
                          <th className="px-2 sm:px-3 py-2 text-center font-semibold text-gray-700 border border-gray-300 w-12 sm:w-16">Grade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayStudents.map((student: any, index: number) => {
                          const marks = student.displayMarks;
                          const isAbsent = marks?.toLowerCase() === 'x';
                          
                          let marksNum = null;
                          if (!isAbsent && marks && marks !== '') {
                            marksNum = parseInt(marks);
                          }
                          
                          const percentage = marksNum !== null ? ((marksNum / totalMarks) * 100).toFixed(1) : null;
                          const grade = marksNum !== null 
                            ? calculateGrade(parseFloat(percentage || '0'))
                            : isAbsent ? -1 : null;

                          return (
                            <tr key={student.id} className={`hover:bg-gray-50 ${student.isFromSaved ? 'bg-green-50/30' : ''}`}>
                              <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-gray-500 border border-gray-300">{index + 1}</td>
                              <td className="px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300">
                                <div className="truncate max-w-[120px] sm:max-w-none" title={student.name}>
                                  {student.name}
                                </div>
                                <div className="text-xs text-gray-500 sm:hidden">{student.studentId.slice(-6)}</div>
                              </td>
                              <td className="px-2 sm:px-3 py-1.5 sm:py-2 font-mono text-gray-600 border border-gray-300 hidden sm:table-cell">{student.studentId}</td>
                              <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-center border border-gray-300">
                                {marks ? (
                                  <span className={`font-medium ${isAbsent ? 'text-gray-500 italic' : student.isFromSaved ? 'text-green-700' : ''}`}>
                                    {isAbsent ? 'ABS' : marks}
                                  </span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-center border border-gray-300">
                                {percentage ? (
                                  <span className="font-medium text-gray-700">{percentage}%</span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-center border border-gray-300">
                                {grade !== null ? (
                                  <GradeBadge grade={grade} />
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="mt-3 sm:mt-4 text-[10px] sm:text-xs text-gray-500 text-right">
                Generated: {new Date().toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== SKELETON ====================
const TableSkeleton = () => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="h-5 bg-gray-200 rounded w-32 sm:w-48"></div>
      </div>
      <div className="divide-y divide-gray-100">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="p-3 sm:p-4 flex flex-wrap items-center gap-2 sm:gap-4">
            <div className="w-5 h-4 bg-gray-200 rounded"></div>
            <div className="flex-1 h-4 bg-gray-200 rounded min-w-[120px]"></div>
            <div className="w-16 sm:w-20 h-8 bg-gray-200 rounded"></div>
            <div className="w-10 h-6 bg-gray-200 rounded"></div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==================== EMPTY STATE ====================
interface EmptyStateProps {
  hasClass: boolean;
  hasSubject: boolean;
  hasStudents: boolean;
  noExamsConfigured?: boolean;
}

const EmptyState = ({ 
  hasClass, 
  hasSubject, 
  hasStudents,
  noExamsConfigured
}: EmptyStateProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  if (noExamsConfigured) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-yellow-100 rounded-full mb-3 sm:mb-4">
          <AlertCircle className="text-yellow-600" size={isMobile ? 24 : 32} />
        </div>
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">No Exams Configured</h3>
        <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto">
          No exams have been configured for this term. Please contact the administrator to set up exam configurations.
        </p>
      </div>
    );
  }
  
  if (!hasClass) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 rounded-full mb-3 sm:mb-4">
          <BookOpen className="text-gray-400" size={isMobile ? 24 : 32} />
        </div>
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">Select a class to begin</h3>
        <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto">
          Choose a class from the dropdown above. Your assigned classes will appear based on your teaching assignments.
        </p>
      </div>
    );
  }
  
  if (!hasSubject) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-yellow-100 rounded-full mb-3 sm:mb-4">
          <AlertCircle className="text-yellow-600" size={isMobile ? 24 : 32} />
        </div>
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">No subject selected</h3>
        <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto">
          {hasClass ? 
            "You don't teach any subjects in this class. If you're the form teacher but not a subject teacher, you cannot enter results." :
            "Please select a subject you're assigned to teach for this class."
          }
        </p>
      </div>
    );
  }
  
  if (!hasStudents) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 rounded-full mb-3 sm:mb-4">
          <Users className="text-gray-400" size={isMobile ? 24 : 32} />
        </div>
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">No students enrolled</h3>
        <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto">
          This class doesn't have any enrolled students yet. Contact the administrator to add students.
        </p>
      </div>
    );
  }
  
  return null;
};

// ==================== CONFIRM MODAL ====================
interface ConfirmModalProps {
  modal: ModalState | null;
  onClose: () => void;
  isLoading?: boolean;
}

const ConfirmModal = ({ modal, onClose, isLoading = false }: ConfirmModalProps) => {
  if (!modal) return null;
  const isDanger = modal.type === 'confirmDelete';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={isLoading ? undefined : onClose}
      />
      <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 flex flex-col gap-4">
        <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full self-start
          ${isDanger ? 'bg-red-100' : 'bg-amber-100'}`}>
          {isDanger
            ? <Trash2 size={22} className="text-red-600" />
            : <AlertCircle size={22} className="text-amber-600" />}
        </div>

        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-1">{modal.title}</h3>
          <p className="text-sm text-gray-500 leading-relaxed">{modal.description}</p>
        </div>

        <div className="flex gap-2.5 pt-1">
          <button
            onClick={isLoading ? undefined : onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={modal.onConfirm}
            disabled={isLoading}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors
              flex items-center justify-center gap-2
              disabled:opacity-50 disabled:cursor-not-allowed
              ${isDanger ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' : 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500'}
              focus:outline-none focus:ring-2 focus:ring-offset-2`}
          >
            {isLoading && <Loader2 size={14} className="animate-spin" />}
            {isDanger ? 'Delete' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== TOAST ====================
interface ToastProps {
  toasts: ToastState[];
  onDismiss: (id: number) => void;
}

const ToastContainer = ({ toasts, onDismiss }: ToastProps) => {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastItem = ({ toast, onDismiss }: { toast: ToastState; onDismiss: (id: number) => void }) => {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 3500);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  const bgColor = toast.type === 'success' ? 'bg-green-600' : toast.type === 'warning' ? 'bg-yellow-600' : toast.type === 'info' ? 'bg-blue-600' : 'bg-red-600';
  const Icon = toast.type === 'success' ? CheckCircle : toast.type === 'warning' ? AlertCircle : toast.type === 'info' ? GraduationCap : XCircle;

  return (
    <div
      className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg
        text-white text-sm font-medium max-w-xs animate-in slide-in-from-bottom-2 ${bgColor}`}
    >
      <Icon size={16} className="flex-shrink-0" />
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-white/70 hover:text-white flex-shrink-0 ml-1"
      >
        <XCircle size={14} />
      </button>
    </div>
  );
};

// ==================== OVERWRITE INFO BANNER ====================
interface OverwriteInfoProps {
  hasExistingResults: boolean;
}

const OverwriteInfo = ({ hasExistingResults }: OverwriteInfoProps) => {
  if (!hasExistingResults) return null;
  
  return (
    <div className="bg-blue-50 border-l-4 border-blue-500 p-3 sm:p-4 rounded-lg">
      <div className="flex items-center gap-2 sm:gap-3">
        <RefreshCw size={18} className="text-blue-600 flex-shrink-0" />
        <div className="min-w-0">
          <p className="font-medium text-blue-800 text-sm sm:text-base">Auto-Overwrite Mode Active</p>
          <p className="text-xs sm:text-sm text-blue-700">
            Saved results exist for this exam. Simply enter new marks and click <strong>Overwrite</strong> to automatically replace all results. No need to enter edit mode first.
          </p>
        </div>
      </div>
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
export default function ResultsEntry() {
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isSmallMobile = useMediaQuery('(max-width: 380px)');
  
  const inputElements = useRef<Map<string, HTMLInputElement>>(new Map());
  const tableContainerRef = useRef<HTMLDivElement>(null);
  
  // Core State
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [examType, setExamType] = useState<'week4' | 'week8' | 'endOfTerm'>('week4');
  const [term, setTerm] = useState('Term 1');
  const [year, setYear] = useState(new Date().getFullYear());
  
  // Data State
  const [students, setStudents] = useState<StudentResultInput[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedClassData, setSelectedClassData] = useState<ClassInfo | null>(null);
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  
  // PDF Preview State
  const [showPDFPreview, setShowPDFPreview] = useState(false);
  const [allExamData, setAllExamData] = useState<ExamData | null>(null);
  const [loadingAllData, setLoadingAllData] = useState(false);

  // UI State
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Track last subject to detect changes (CRITICAL FIX for RE and English)
  const lastSubjectRef = useRef<string>('');

  // Modal and toast state
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toasts, setToasts] = useState<ToastState[]>([]);

  // Helper functions
  const showToast = useCallback((type: 'success' | 'error' | 'warning' | 'info', message: string) => {
    setToasts(prev => [...prev, { id: Date.now(), type, message }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Hooks
  const { classes, isLoading: loadingClasses } = useSchoolClasses({ isActive: true });
  const { assignments, getSubjectsForClass, isFormTeacherForClass, isLoading: loadingAssignments } = useTeacherAssignments(user?.uid);
  const { configs: examConfigs, isLoading: loadingExamConfig } = useExamConfig({ year, term });
  const { saveResults, isSaving, checkExisting, isCheckingExisting, deleteResults, isDeleting } = useResults();
  
  // FIXED: Added subjectId to useSubjectCompletion to prevent cross-subject contamination
  const { completionStatus, isLoading: loadingCompletion, refetch: refetchCompletion } = useSubjectCompletion({
    classId: selectedClass,
    subjectId: selectedSubject, // CRITICAL: Pass subjectId to filter specific subject
    term,
    year,
  });

  // Memoized values
  const currentExamConfig = examConfigs?.[0];
  const availableExamTypes = useMemo(() => getAvailableExamTypes(currentExamConfig), [currentExamConfig]);
  const totalMarks = useMemo(() => getTotalMarksForExamType(currentExamConfig, examType), [currentExamConfig, examType]);
  
  // Get unique subjects for selected class (handles RE and English correctly)
  const availableSubjects = useMemo(() => {
    if (!selectedClass || !user?.uid) return [];
    const subjects = getSubjectsForClass(selectedClass);
    console.log('📚 Available subjects for class:', subjects);
    return subjects;
  }, [selectedClass, user?.uid, getSubjectsForClass]);

  const isOnlyFormTeacher = useMemo(() => {
    if (!selectedClass || !user?.uid) return false;
    const subjects = getSubjectsForClass(selectedClass);
    const isFormTeacher = isFormTeacherForClass(selectedClass);
    return subjects.length === 0 && isFormTeacher;
  }, [selectedClass, user?.uid, getSubjectsForClass, isFormTeacherForClass]);

  // FIXED: Use subjectId for matching, not subjectName
  const currentSubjectCompletion = useMemo(() => {
    if (!selectedSubject || !completionStatus.length) return null;
    const normalizedSelected = normalizeSubjectName(selectedSubject);
    const found = completionStatus.find((s: any) => s.subjectId === normalizedSelected) as ExtendedSubjectCompletion | null;
    console.log(`🔍 Looking for subject: ${selectedSubject} (normalized: ${normalizedSelected}), found: ${found?.subjectName || 'not found'}`);
    return found;
  }, [selectedSubject, completionStatus]);

  // FIXED: Enhanced hasFirestoreResults with better logging
  const hasFirestoreResults = useMemo(() => {
    if (!currentSubjectCompletion || !examType) return false;
    const count = currentSubjectCompletion.enteredStudents?.[examType as keyof typeof currentSubjectCompletion.enteredStudents] ?? 0;
    console.log(`🔍 Firestore check - Subject: ${selectedSubject}, SubjectId: ${currentSubjectCompletion.subjectId}, Exam: ${examType}, Results found: ${count}`);
    return count > 0;
  }, [currentSubjectCompletion, examType, selectedSubject]);

  const currentDraft = useMemo(() => {
    return drafts.find(d => 
      d.classId === selectedClass &&
      d.subject === selectedSubject &&
      d.examType === examType &&
      d.term === term &&
      d.year === year
    );
  }, [drafts, selectedClass, selectedSubject, examType, term, year]);

  // Get assigned classes for dropdown
  const assignedClasses = useMemo(() => {
    if (!user?.uid || !classes.length) return [];
    const assignedClassIds = new Set(assignments.map(a => a.classId));
    return classes.filter((cls: ClassInfo) => assignedClassIds.has(cls.id));
  }, [classes, assignments, user?.uid]);

  // ==================== EFFECTS ====================
  
  // Track unsaved changes
  useEffect(() => {
    if (students.length > 0) {
      const hasChanges = students.some(s => s.marks && s.marks !== '');
      setHasUnsavedChanges(hasChanges);
    }
  }, [students]);

  // Load drafts from localStorage
  useEffect(() => {
    const savedDrafts = localStorage.getItem('results_drafts');
    if (savedDrafts) {
      try {
        setDrafts(JSON.parse(savedDrafts));
      } catch (e) {
        console.error('Failed to load drafts:', e);
      }
    }
  }, []);

  const saveDrafts = useCallback((newDrafts: SavedDraft[]) => {
    setDrafts(newDrafts);
    localStorage.setItem('results_drafts', JSON.stringify(newDrafts));
  }, []);

  // Auto-select first subject if only one available
  useEffect(() => {
    if (availableSubjects.length === 1 && !selectedSubject) {
      console.log('🎯 Auto-selecting single subject:', availableSubjects[0]);
      setSelectedSubject(availableSubjects[0]);
    }
  }, [availableSubjects, selectedSubject]);

  // CRITICAL FIX: Complete state reset when subject changes (for RE and English)
  useEffect(() => {
    if (selectedSubject && selectedSubject !== lastSubjectRef.current) {
      console.log(`🔄 Subject changed from "${lastSubjectRef.current}" to "${selectedSubject}" - Refetching completion status`);
      
      // Reset exam type to first available configured exam
      if (availableExamTypes.length > 0) {
        const firstExamType = availableExamTypes[0].id as 'week4' | 'week8' | 'endOfTerm';
        setExamType(firstExamType);
      }
      
      // Clear unsaved changes flag
      setHasUnsavedChanges(false);
      
      // Clear all marks for the new subject
      setStudents(prev => prev.map(s => ({ ...s, marks: '' })));
      
      // Clear active draft ID
      setActiveDraftId(null);
      
      // CRITICAL: Force refetch completion status for the new subject
      refetchCompletion();
      
      // Update the ref
      lastSubjectRef.current = selectedSubject;
      
      // Show feedback to user
      showToast('info', `Switched to ${selectedSubject}. Select an exam type to begin.`);
    }
  }, [selectedSubject, availableExamTypes, refetchCompletion, showToast]);

  // Auto-select first available exam type when they become available
  useEffect(() => {
    if (availableExamTypes.length > 0 && selectedSubject) {
      const currentTypeExists = availableExamTypes.some(t => t.id === examType);
      if (!currentTypeExists) {
        const firstType = availableExamTypes[0].id as 'week4' | 'week8' | 'endOfTerm';
        setExamType(firstType);
        console.log(`🎯 Auto-selected exam type: ${firstType} for subject ${selectedSubject}`);
      }
    }
  }, [availableExamTypes, examType, selectedSubject]);

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
        setSelectedClassData(classInfo || null);
        
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
        setHasUnsavedChanges(false);
      } catch (error) {
        console.error('Error loading students:', error);
        showToast('error', 'Failed to load students');
        setStudents([]);
        setSelectedClassData(null);
      } finally {
        setLoadingStudents(false);
      }
    };

    loadStudents();
  }, [selectedClass, assignedClasses, showToast]);

  // Load existing results when subject/exam type changes (for display only)
  useEffect(() => {
    const loadExistingResults = async () => {
      if (!selectedClass || !selectedSubject || !selectedClassData || !user) return;
      
      // Only load if there are existing results AND no unsaved changes
      if (hasFirestoreResults && !hasUnsavedChanges) {
        try {
          const existingResponse = await checkExisting({
            classId: selectedClass,
            subjectId: selectedSubject,
            examType,
            term,
            year,
          });

          if (existingResponse?.results?.length) {
            // Display existing marks in the input fields (so teacher can see what's saved)
            setStudents(prevStudents =>
              prevStudents.map(student => {
                const existing = existingResponse.results.find(
                  (r: any) => r.studentId === student.studentId || r.student_id === student.studentId
                );
                return {
                  ...student,
                  marks: existing ? (existing.marks === -1 ? 'X' : String(existing.marks)) : '',
                };
              })
            );
            console.log(`📋 Loaded ${existingResponse.results.length} existing results for display`);
          }
        } catch (error) {
          console.error('Error loading existing results:', error);
        }
      }
    };
    
    loadExistingResults();
  }, [selectedClass, selectedSubject, examType, term, year, hasFirestoreResults, hasUnsavedChanges, checkExisting, selectedClassData, user]);

  // Load draft data (only if no Firestore results)
  useEffect(() => {
    if (currentDraft && currentDraft.id !== activeDraftId && !hasFirestoreResults && !hasUnsavedChanges) {
      setStudents(currentDraft.results);
      setActiveDraftId(currentDraft.id);
    }
  }, [currentDraft, activeDraftId, hasUnsavedChanges, hasFirestoreResults]);

  // Auto-save draft (only if no Firestore results, or as backup)
  useEffect(() => {
    if (!selectedClass || !selectedSubject || !students.length || !selectedClassData) return;
    
    // Don't auto-save draft if there are Firestore results (to avoid confusion)
    if (hasFirestoreResults) return;

    const filledCount = students.filter(s => s.marks && s.marks !== '').length;
    if (filledCount === 0) return;

    const timer = setTimeout(() => {
      const draftId = currentDraft?.id || `draft_${Date.now()}`;
      const newDraft: SavedDraft = {
        id: draftId,
        classId: selectedClass,
        className: selectedClassData.name,
        subject: selectedSubject,
        examType,
        term,
        year,
        totalMarks,
        results: students.map(s => ({ ...s })),
        lastModified: new Date().toISOString(),
        completedCount: filledCount,
        totalStudents: students.length
      };

      const existingIndex = drafts.findIndex(d => d.id === draftId);
      let newDrafts: SavedDraft[];
      
      if (existingIndex >= 0) {
        newDrafts = [...drafts];
        newDrafts[existingIndex] = newDraft;
      } else {
        newDrafts = [newDraft, ...drafts].slice(0, 10);
      }
      
      saveDrafts(newDrafts);
      setActiveDraftId(draftId);
    }, 2000);

    return () => clearTimeout(timer);
  }, [students, selectedClass, selectedSubject, examType, term, year, totalMarks, selectedClassData, drafts, currentDraft, saveDrafts, hasFirestoreResults]);

  const focusNextInput = useCallback((currentStudentId: string) => {
    const currentIndex = students.findIndex(s => s.id === currentStudentId);
    if (currentIndex < students.length - 1) {
      const nextStudent = students[currentIndex + 1];
      const nextInput = inputElements.current.get(nextStudent.id);
      nextInput?.focus();
    }
  }, [students]);

  // Fetch all exam data for PDF preview
  useEffect(() => {
    const fetchAllExamData = async () => {
      if (!showPDFPreview || !selectedClass || !selectedSubject || !checkExisting || !availableExamTypes.length) return;
      
      setLoadingAllData(true);
      
      try {
        const promises = availableExamTypes.map(type => 
          checkExisting({
            classId: selectedClass,
            subjectId: selectedSubject,
            examType: type.id as any,
            term,
            year,
          })
        );
        
        const responses = await Promise.all(promises);
        
        const transformedData: ExamData = {
          week4: [],
          week8: [],
          endOfTerm: []
        };
        
        responses.forEach((response, index) => {
          const examTypeId = availableExamTypes[index].id;
          transformedData[examTypeId as keyof ExamData] = (response?.results || []).map((item: any) => ({
            studentId: item.studentId || item.student_id,
            studentName: item.studentName || item.student_name,
            marks: item.marks,
            student_id: item.student_id
          }));
        });
        
        setAllExamData(transformedData);
        
      } catch (error) {
        console.error('Error fetching exam data:', error);
        showToast('error', 'Failed to fetch exam data');
      } finally {
        setLoadingAllData(false);
      }
    };
    
    fetchAllExamData();
  }, [showPDFPreview, selectedClass, selectedSubject, term, year, checkExisting, availableExamTypes, showToast]);

  // ==================== EVENT HANDLERS ====================
  
  const handleMarksChange = useCallback((studentId: string, marks: string) => {
    if (marks && marks.toLowerCase() !== 'x' && !/^\d*$/.test(marks)) return;
    
    const marksNum = parseInt(marks);
    if (marks && marks.toLowerCase() !== 'x' && marksNum > totalMarks) {
      showToast('warning', `Marks cannot exceed ${totalMarks}`);
      return;
    }

    setStudents(prev => prev.map(s =>
      s.id === studentId ? { ...s, marks } : s
    ));
    setHasUnsavedChanges(true);
  }, [totalMarks, showToast]);

  const handleMarkAbsent = useCallback((studentId: string) => {
    setStudents(prev => prev.map(s =>
      s.id === studentId ? { ...s, marks: s.marks.toLowerCase() === 'x' ? '' : 'x' } : s
    ));
    setHasUnsavedChanges(true);
  }, []);

  // Handle exam type change with unsaved changes warning
  const handleExamTypeChange = useCallback((type: 'week4' | 'week8' | 'endOfTerm') => {
    if (hasUnsavedChanges) {
      setModal({
        type: 'confirmDiscardChanges',
        title: 'Unsaved changes',
        description: 'You have unsaved marks. Switching exam types will discard your current entries. Are you sure?',
        onConfirm: () => {
          setModal(null);
          setExamType(type);
          setHasUnsavedChanges(false);
        },
      });
    } else {
      setExamType(type);
    }
  }, [hasUnsavedChanges]);

  // ==================== SAVE RESULTS WITH AUTO-OVERWRITE ====================
  const handleSaveResults = useCallback(async () => {
    if (!selectedClass || !selectedSubject || !selectedClassData || !user) return;

    const results = students
      .filter(s => s.marks !== '')
      .map(s => ({
        studentId: s.studentId,
        studentName: s.name,
        marks: s.marks.toLowerCase() === 'x' ? -1 : parseInt(s.marks),
      }));

    if (results.length === 0) {
      showToast('warning', 'Please enter marks for at least one student.');
      return;
    }

    // If there are existing results, show a confirmation before overwriting
    if (hasFirestoreResults) {
      setModal({
        type: 'confirmOverwrite',
        title: 'Overwrite Existing Results?',
        description: `Results already exist for ${selectedSubject} (${examType === 'week4' ? 'Week 4' : examType === 'week8' ? 'Week 8' : 'End of Term'}). Saving will OVERWRITE all existing results. This action cannot be undone. Are you sure?`,
        onConfirm: async () => {
          setModal(null);
          await performSave(results);
        },
      });
    } else {
      await performSave(results);
    }
  }, [selectedClass, selectedSubject, selectedClassData, user, students, examType, term, year, totalMarks, hasFirestoreResults, showToast]);

  const performSave = async (results: Array<{ studentId: string; studentName: string; marks: number }>) => {
    try {
      const saveResult = await saveResults({
        classId: selectedClass,
        className: selectedClassData!.name,
        subjectId: selectedSubject,
        subjectName: selectedSubject,
        teacherId: user!.uid,
        teacherName: user!.fullName || user!.email || 'Unknown',
        examType,
        examName: `${examType === 'week4' ? 'Week 4' : examType === 'week8' ? 'Week 8' : 'End of Term'} - ${selectedSubject}`,
        term,
        year,
        totalMarks,
        results,
        overwrite: true, // ALWAYS overwrite existing results
      });

      // Clear students after successful save
      setStudents(prev => prev.map(s => ({ ...s, marks: '' })));
      setHasUnsavedChanges(false);

      // Clear draft if exists
      if (currentDraft) {
        const newDrafts = drafts.filter(d => d.id !== currentDraft.id);
        saveDrafts(newDrafts);
      }

      // Refresh completion status
      await refetchCompletion();

      showToast('success', `Results ${saveResult.overwritten ? 'updated' : 'saved'} successfully.`);

    } catch (error: any) {
      console.error('Error saving results:', error);
      showToast('error', `Failed to save: ${error.message || 'Please try again'}`);
    }
  };

  // ==================== DELETE RESULTS ====================
  const handleDeleteResults = useCallback(() => {
    if (!selectedClass || !selectedSubject || !selectedClassData) return;
    
    if (hasUnsavedChanges) {
      showToast('warning', 'Please save or clear your current entries before deleting saved results.');
      return;
    }
    
    const examLabel = examType === 'week4' ? 'Week 4' : examType === 'week8' ? 'Week 8' : 'End of Term';
    setModal({
      type: 'confirmDelete',
      title: 'Delete results?',
      description: `This will permanently delete all saved ${examLabel} results for ${selectedSubject} in ${selectedClassData.name}. This cannot be undone.`,
      onConfirm: async () => {
        try {
          await deleteResults({
            classId: selectedClass,
            subjectId: selectedSubject,
            examType,
            term,
            year,
          });

          setModal(null);
          setStudents(prev => prev.map(s => ({ ...s, marks: '' })));
          setHasUnsavedChanges(false);
          await refetchCompletion();

          showToast('success', `${examLabel} results deleted.`);
        } catch (error: any) {
          setModal(null);
          console.error('Error deleting results:', error);
          showToast('error', `Failed to delete: ${error.message || 'Please try again'}`);
        }
      },
    });
  }, [selectedClass, selectedSubject, selectedClassData, examType, term, year, deleteResults, hasUnsavedChanges, refetchCompletion, showToast]);

  const handleLoadDraft = useCallback((draft: SavedDraft) => {
    if (hasUnsavedChanges) {
      setModal({
        type: 'confirmDiscardChanges',
        title: 'Unsaved changes',
        description: 'You have unsaved marks. Loading a draft will discard your current entries. Proceed?',
        onConfirm: () => {
          setModal(null);
          performLoadDraft(draft);
        },
      });
    } else {
      performLoadDraft(draft);
    }
  }, [hasUnsavedChanges]);

  const performLoadDraft = useCallback((draft: SavedDraft) => {
    setSelectedClass(draft.classId);
    setSelectedSubject(draft.subject);
    setExamType(draft.examType);
    setTerm(draft.term);
    setYear(draft.year);
    setStudents(draft.results);
    setActiveDraftId(draft.id);
    setHasUnsavedChanges(false);
  }, []);

  const handleDeleteDraft = useCallback((draftId: string) => {
    const draft = drafts.find(d => d.id === draftId);
    setModal({
      type: 'confirmClearDraft',
      title: 'Delete draft?',
      description: draft
        ? `Delete the draft for ${draft.subject} (${draft.examType === 'week4' ? 'Week 4' : draft.examType === 'week8' ? 'Week 8' : 'End of Term'}) in ${draft.className}? This only removes it from local storage — no Firestore data is affected.`
        : 'Delete this draft?',
      onConfirm: () => {
        setModal(null);
        const newDrafts = drafts.filter(d => d.id !== draftId);
        saveDrafts(newDrafts);
        if (activeDraftId === draftId) setActiveDraftId(null);
        showToast('info', 'Draft deleted');
      },
    });
  }, [drafts, activeDraftId, saveDrafts, showToast]);

  const handleDownloadMarks = useCallback(() => {
    setShowPDFPreview(true);
  }, []);

  // FIXED: PDF generation now uses the same displayStudents logic as the preview
  const handleGeneratePDF = useCallback(async () => {
    try {
      const { generateMarkSchedulePDF } = await import('@/services/pdf/markSchedulePDF');
      
      const teacherDisplayName = user?.fullName || user?.email || 'Teacher';
      
      // Build saved marks map exactly like the preview does
      const savedMarksMap = new Map();
      if (allExamData && allExamData[examType]) {
        allExamData[examType].forEach((item: ExamDataItem) => {
          if (item.studentId) savedMarksMap.set(item.studentId, item.marks);
          if (item.student_id) savedMarksMap.set(item.student_id, item.marks);
        });
      }
      
      // Build display students exactly like MarksPDFPreview does
      const studentsForPDF = students.map(student => {
        let saved = savedMarksMap.get(student.studentId);
        if (!saved) {
          saved = savedMarksMap.get(student.id);
        }
        
        let displayMarks = student.marks;
        let isFromSaved = false;
        
        if ((!displayMarks || displayMarks === '') && saved !== undefined) {
          if (saved === -1) {
            displayMarks = 'X';
          } else if (saved >= 0) {
            displayMarks = saved.toString();
          }
          isFromSaved = true;
        }
        
        let marksNum = null;
        let percentage = null;
        let grade = null;
        const isAbsent = displayMarks?.toLowerCase() === 'x';
        
        if (!isAbsent && displayMarks && displayMarks !== '') {
          marksNum = parseInt(displayMarks);
          if (!isNaN(marksNum)) {
            percentage = ((marksNum / totalMarks) * 100).toFixed(1);
            grade = calculateGrade(parseFloat(percentage));
          }
        } else if (isAbsent) {
          grade = -1;
        }
        
        return {
          name: student.name,
          studentId: student.studentId,
          marks: displayMarks || '',
          marksNum: marksNum,
          percentage: percentage,
          grade: grade,
          isAbsent: isAbsent
        };
      });

      await generateMarkSchedulePDF({
        className: selectedClassData?.name || '',
        subject: selectedSubject,
        examType,
        term,
        year,
        totalMarks,
        students: studentsForPDF,
        teacherName: teacherDisplayName,
        schoolName: 'KALABO BOARDING SECONDARY SCHOOL',
        allExamData: allExamData || undefined
      });
      
      setShowPDFPreview(false);
      showToast('success', 'PDF generated successfully');
    } catch (error) {
      console.error('PDF generation error:', error);
      showToast('error', 'Failed to generate PDF. Check console for details.');
    }
  }, [user, allExamData, examType, students, totalMarks, selectedClassData, selectedSubject, term, year, showToast]);

  const handleClearAllMarks = useCallback(() => {
    setModal({
      type: 'confirmCancelEdit',
      title: 'Clear all marks?',
      description: 'This will erase all marks you have entered so far. Your local draft will also be cleared. No Firestore data is affected.',
      onConfirm: () => {
        setModal(null);
        setStudents(students.map(s => ({ ...s, marks: '' })));
        setHasUnsavedChanges(false);
        showToast('info', 'All marks cleared');
      },
    });
  }, [students, showToast]);

  // Computed values for UI
  const filledCount = students.filter(s => s.marks && s.marks !== '').length;
  const totalStudents = students.length;
  const completionPercentage = totalStudents > 0 ? Math.round((filledCount / totalStudents) * 100) : 0;
  const noExamsConfigured = selectedClass && selectedSubject && availableExamTypes.length === 0;

  // Loading state
  if (loadingClasses || loadingAssignments || loadingExamConfig) {
    return (
      <DashboardLayout activeTab="results">
        <div className="p-3 sm:p-4 lg:p-6">
          <div className="flex flex-col items-center justify-center min-h-[50vh] sm:min-h-[60vh]">
            <Loader2 className="animate-spin text-blue-600 mb-3 sm:mb-4" size={32} />
            <p className="text-sm sm:text-base text-gray-600">Loading...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="results">
      <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        
        {/* Unsaved Changes Warning Banner */}
        {hasUnsavedChanges && (
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle size={18} className="text-yellow-600" />
              <span className="text-sm text-yellow-700">You have unsaved marks. Save before leaving or switching exams.</span>
            </div>
            <button
              onClick={handleSaveResults}
              disabled={isSaving || filledCount === 0}
              className="px-3 py-1 bg-yellow-500 text-white rounded-lg text-sm hover:bg-yellow-600 transition-colors"
            >
              Save Now
            </button>
          </div>
        )}

        {/* Overwrite Info Banner */}
        <OverwriteInfo hasExistingResults={hasFirestoreResults && !hasUnsavedChanges} />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 tracking-tight truncate">
              Results Entry
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1 truncate">
              {selectedClassData?.name || 'Select a class'} • {term} {year}
            </p>
            {selectedClass && isOnlyFormTeacher && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertCircle size={12} />
                You're the form teacher but don't teach any subjects in this class. You cannot enter results.
              </p>
            )}
          </div>
          
          {/* Action Buttons */}
          {selectedClass && selectedSubject && students.length > 0 && availableExamTypes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              
              {/* Download Button */}
              <button
                onClick={handleDownloadMarks}
                className={`
                  inline-flex items-center justify-center gap-1 sm:gap-2
                  bg-green-600 text-white rounded-xl hover:bg-green-700
                  font-medium transition-all active:scale-[0.98]
                  focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2
                  px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base
                  ${isSmallMobile ? 'flex-1' : ''}
                `}
              >
                <Download size={16} />
                <span className="hidden xs:inline">Download</span>
              </button>

              {/* Delete Button */}
              <button
                onClick={handleDeleteResults}
                disabled={isDeleting || !hasFirestoreResults}
                className={`
                  inline-flex items-center justify-center gap-1 sm:gap-2
                  bg-red-600 text-white rounded-xl hover:bg-red-700
                  font-medium transition-all active:scale-[0.98]
                  focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
                  disabled:opacity-40 disabled:cursor-not-allowed
                  px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base
                  ${isSmallMobile ? 'flex-1' : ''}
                `}
                title={!hasFirestoreResults ? 'No saved results to delete for this exam' : 'Delete saved results'}
              >
                {isDeleting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
                <span className="hidden xs:inline">Delete</span>
              </button>

              {/* Save Button - ALWAYS enabled when there are entries */}
              <button
                onClick={handleSaveResults}
                disabled={isSaving || filledCount === 0}
                className={`
                  inline-flex items-center justify-center gap-1 sm:gap-2
                  ${hasFirestoreResults ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}
                  text-white rounded-xl font-medium transition-all active:scale-[0.98]
                  focus:outline-none focus:ring-2 focus:ring-offset-2
                  ${hasFirestoreResults ? 'focus:ring-amber-500' : 'focus:ring-blue-500'}
                  disabled:opacity-50 disabled:cursor-not-allowed
                  px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base
                  ${isSmallMobile ? 'flex-1' : ''}
                `}
              >
                {isSaving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                <span className="hidden xs:inline">
                  {hasFirestoreResults ? 'Overwrite' : 'Save'}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Drafts Section - only show if no Firestore results */}
        {drafts.length > 0 && selectedSubject && !hasFirestoreResults && (
          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
            <div className="flex items-center gap-1 sm:gap-2 mb-2 sm:mb-3">
              <History size={14} className="text-gray-500 flex-shrink-0" />
              <h3 className="text-xs sm:text-sm font-medium text-gray-700">Your Drafts</h3>
              <span className="text-[10px] sm:text-xs text-gray-500">(Auto-saved)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              {drafts.slice(0, 6).map(draft => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  onLoad={() => handleLoadDraft(draft)}
                  onDelete={() => handleDeleteDraft(draft.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            
            {/* Class Select */}
            <div className="min-w-0">
              <label className="block text-[10px] sm:text-xs font-medium text-gray-600 mb-0.5 sm:mb-1">
                Class <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedClass}
                onChange={e => {
                  if (hasUnsavedChanges) {
                    setModal({
                      type: 'confirmDiscardChanges',
                      title: 'Unsaved changes',
                      description: 'You have unsaved marks. Changing class will discard your current entries. Proceed?',
                      onConfirm: () => {
                        setModal(null);
                        setSelectedClass(e.target.value);
                        setSelectedSubject('');
                        setHasUnsavedChanges(false);
                      },
                    });
                  } else {
                    setSelectedClass(e.target.value);
                    setSelectedSubject('');
                  }
                }}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs sm:text-sm bg-white truncate"
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
            
            {/* Subject Select - Shows all subjects including RE and English */}
            <div className="min-w-0">
              <label className="block text-[10px] sm:text-xs font-medium text-gray-600 mb-0.5 sm:mb-1">
                Subject <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedSubject}
                onChange={e => {
                  if (hasUnsavedChanges) {
                    setModal({
                      type: 'confirmDiscardChanges',
                      title: 'Unsaved changes',
                      description: 'You have unsaved marks. Changing subject will discard your current entries. Proceed?',
                      onConfirm: () => {
                        setModal(null);
                        setSelectedSubject(e.target.value);
                        setHasUnsavedChanges(false);
                      },
                    });
                  } else {
                    setSelectedSubject(e.target.value);
                  }
                }}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs sm:text-sm bg-white truncate"
                disabled={!selectedClass || availableSubjects.length === 0}
              >
                <option value="">
                  {!selectedClass ? 'Select class first' : 
                   availableSubjects.length === 0 ? 'No subjects (form teacher only)' : 'Select subject...'}
                </option>
                {availableSubjects.map(subject => (
                  <option key={subject} value={subject} className="truncate">{subject}</option>
                ))}
              </select>
              {selectedClass && availableSubjects.length === 0 && (
                <p className="text-[10px] text-amber-600 mt-1">
                  You're the form teacher but don't teach any subjects in this class.
                </p>
              )}
            </div>
            
            {/* Term & Year */}
            <div className="grid grid-cols-2 gap-1 sm:gap-2">
              <div className="min-w-0">
                <label className="block text-[10px] sm:text-xs font-medium text-gray-600 mb-0.5 sm:mb-1">
                  Term
                </label>
                <select
                  value={term}
                  onChange={e => {
                    setTerm(e.target.value);
                  }}
                  className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs sm:text-sm bg-white"
                >
                  <option value="Term 1">Term 1</option>
                  <option value="Term 2">Term 2</option>
                  <option value="Term 3">Term 3</option>
                </select>
              </div>
              <div className="min-w-0">
                <label className="block text-[10px] sm:text-xs font-medium text-gray-600 mb-0.5 sm:mb-1">
                  Year
                </label>
                <input
                  type="number"
                  value={year}
                  onChange={e => {
                    setYear(parseInt(e.target.value) || new Date().getFullYear());
                  }}
                  className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs sm:text-sm"
                  min="2020"
                  max="2030"
                />
              </div>
            </div>
            
            {/* Exam Config Summary */}
            {currentExamConfig && (
              <div className="min-w-0 bg-blue-50 rounded-lg p-2 flex items-center gap-2">
                <GraduationCap size={14} className="text-blue-600 flex-shrink-0" />
                <span className="text-xs text-blue-700">
                  {availableExamTypes.length} exam(s) configured for {term}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Subject Progress - Always shows when subject selected */}
        {selectedClass && selectedSubject && availableSubjects.length > 0 && (
          <SubjectProgress 
            completion={currentSubjectCompletion}
            selectedExamType={examType}
            onExamTypeChange={handleExamTypeChange}
            hasDraft={!!currentDraft && !hasFirestoreResults}
            availableExamTypes={availableExamTypes}
            examConfig={currentExamConfig}
            subjectName={selectedSubject}
            isLoading={loadingCompletion}
            hasExistingResults={hasFirestoreResults}
          />
        )}

        {/* Results Entry */}
        {loadingStudents ? (
          <TableSkeleton />
        ) : (
          <>
            <EmptyState 
              hasClass={!!selectedClass}
              hasSubject={!!selectedSubject}
              hasStudents={students.length > 0}
              noExamsConfigured={noExamsConfigured}
            />
            
            {selectedClass && selectedSubject && students.length > 0 && availableExamTypes.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                
                {/* Header */}
                <div className="px-3 sm:px-4 py-2 sm:py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                    <Users size={14} className="text-gray-500 flex-shrink-0" />
                    <span className="font-medium text-gray-900 text-xs sm:text-sm truncate">
                      {selectedClassData?.name} • {selectedSubject}
                    </span>
                    {currentDraft && !hasFirestoreResults && (
                      <span className="text-[10px] sm:text-xs bg-yellow-100 text-yellow-700 px-1.5 sm:px-2 py-0.5 rounded-full whitespace-nowrap">
                        Draft
                      </span>
                    )}
                    {hasFirestoreResults && (
                      <span className="text-[10px] sm:text-xs bg-blue-100 text-blue-700 px-1.5 sm:px-2 py-0.5 rounded-full whitespace-nowrap">
                        Saved Results
                      </span>
                    )}
                    {hasUnsavedChanges && (
                      <span className="text-[10px] sm:text-xs bg-yellow-100 text-yellow-700 px-1.5 sm:px-2 py-0.5 rounded-full whitespace-nowrap">
                        Unsaved
                      </span>
                    )}
                  </div>
                  
                  {/* Progress */}
                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    <span className="text-[10px] sm:text-xs text-gray-500">
                      {filledCount}/{totalStudents}
                    </span>
                    <div className="w-16 sm:w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${completionPercentage}%` }}
                      />
                    </div>
                    {filledCount > 0 && !hasFirestoreResults && (
                      <button
                        onClick={handleClearAllMarks}
                        className="text-[10px] sm:text-xs text-gray-500 hover:text-gray-700 hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Mobile-Optimized Card List */}
                {isMobile ? (
                  <div className="divide-y divide-gray-100">
                    {students.map((student, index) => {
                      const existingMark = currentSubjectCompletion?.enteredStudentIds?.[examType]?.includes(student.studentId)
                        ? currentSubjectCompletion?.savedMarks?.[student.studentId]
                        : null;

                      return (
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
                          disabled={false}
                          showExistingMark={existingMark}
                          onMarkAbsent={handleMarkAbsent}
                        />
                      );
                    })}
                  </div>
                ) : (
                  /* Desktop Table */
                  <div className="overflow-x-auto" ref={tableContainerRef}>
                    <table className="w-full">
                      <thead className="bg-gray-50 text-xs">
                        <tr>
                          <th className="px-3 py-2 sm:py-3 text-left font-medium text-gray-600 w-10 sm:w-12">#</th>
                          <th className="px-3 py-2 sm:py-3 text-left font-medium text-gray-600">Student</th>
                          <th className="px-3 py-2 sm:py-3 text-left font-medium text-gray-600">Marks</th>
                          <th className="px-3 py-2 sm:py-3 text-left font-medium text-gray-600">Grade</th>
                          <th className="px-3 py-2 sm:py-3 text-left font-medium text-gray-600 w-16">Absent</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {students.map((student, index) => {
                          const existingMark = currentSubjectCompletion?.enteredStudentIds?.[examType]?.includes(student.studentId)
                            ? currentSubjectCompletion?.savedMarks?.[student.studentId]
                            : null;

                          return (
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
                              disabled={false}
                              showExistingMark={existingMark}
                              onMarkAbsent={handleMarkAbsent}
                            />
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                
                {/* Status Messages */}
                <div className="px-3 sm:px-4 py-2 bg-gray-50 border-t border-gray-200 text-[10px] sm:text-xs text-gray-500 flex flex-wrap items-center gap-2 sm:gap-4">
                  <span>⏎ Enter: next student</span>
                  <span>X: absent (click absent button)</span>
                  <span>0-{totalMarks}: marks</span>
                  {hasFirestoreResults && (
                    <span className="ml-auto text-amber-600 font-medium">
                      ⚡ Overwrite mode: Saving will replace existing results
                    </span>
                  )}
                  {!hasFirestoreResults && (
                    <span className="ml-auto">Auto-saved draft</span>
                  )}
                </div>
                
                {hasFirestoreResults && (
                  <div className="px-3 sm:px-4 py-3 bg-blue-50 border-t border-blue-200 text-xs sm:text-sm text-blue-700">
                    <div className="flex items-center gap-2">
                      <RefreshCw size={16} />
                      <span>⚡ Results exist for this exam. Simply enter new marks and click <strong>Overwrite</strong> to replace all existing results.</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* No Classes State */}
        {!loadingClasses && assignedClasses.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-yellow-100 rounded-full mb-3 sm:mb-4">
              <BookOpen className="text-yellow-600" size={isMobile ? 24 : 32} />
            </div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">No Classes Assigned</h3>
            <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto">
              You haven't been assigned to any classes yet. Contact your administrator to get teaching assignments.
            </p>
          </div>
        )}

        {/* Form Teacher Only State */}
        {selectedClass && isOnlyFormTeacher && !selectedSubject && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-amber-100 rounded-full mb-3 sm:mb-4">
              <AlertCircle className="text-amber-600" size={isMobile ? 24 : 32} />
            </div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">Form Teacher Only</h3>
            <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto">
              You're the form teacher for this class but don't teach any subjects. Form teachers cannot enter results. Only subject teachers can enter marks.
            </p>
          </div>
        )}
      </div>

      {/* PDF Preview Modal */}
      {selectedSubject && (
        <MarksPDFPreview
          isOpen={showPDFPreview}
          onClose={() => setShowPDFPreview(false)}
          students={students}
          classInfo={selectedClassData}
          subject={selectedSubject}
          examType={examType}
          term={term}
          year={year}
          totalMarks={totalMarks}
          onDownload={handleGeneratePDF}
          allExamData={allExamData}
          loadingAllData={loadingAllData}
        />
      )}

      {/* Confirm Modal */}
      <ConfirmModal
        modal={modal}
        onClose={() => setModal(null)}
        isLoading={isDeleting || isSaving}
      />

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </DashboardLayout>
  );
}