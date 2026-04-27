// @/hooks/useResultsEntryMonitor.ts
import { useMemo, useCallback, useState, useEffect } from 'react';
import { useExamConfig } from './useExamConfig';
import { useSchoolClasses } from './useSchoolClasses';
import { useSchoolTeachers } from './useSchoolTeachers';
import { resultsService } from '@/services/resultsService';

export type ExamType = 'week4' | 'week8' | 'endOfTerm';

export interface MissingEntry {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  examType: ExamType;
  examName: string;
  totalMarks?: number;
  configuredDate?: string;
}

export interface SubjectProgress {
  subjectId: string;
  subjectName: string;
  week4Complete: boolean;
  week8Complete: boolean;
  endOfTermComplete: boolean;
  week4StudentCount: number;
  week8StudentCount: number;
  endOfTermStudentCount: number;
  totalStudents: number;
  completionPercentage: number;
  expectedExams: ExamType[];
  completedExams: ExamType[];
  missingExams: ExamType[];
}

export interface ClassProgress {
  classId: string;
  className: string;
  totalRequired: number;
  completedCount: number;
  missingCount: number;
  completionPercentage: number;
  subjects: SubjectProgress[];
}

export interface TeacherProgress {
  teacherId: string;
  teacherName: string;
  teacherEmail?: string;
  missingCount: number;
  totalRequired: number;
  completedCount: number;
  completionPercentage: number;
  status: 'complete' | 'on-track' | 'behind' | 'critical';
  missingEntries: MissingEntry[];
  classProgress: ClassProgress[];
}

interface UseResultsEntryMonitorOptions {
  term: string;
  year: number;
  teacherId?: string;
}

const EXAM_NAMES: Record<ExamType, string> = {
  week4: 'Week 4 Test',
  week8: 'Week 8 Test',
  endOfTerm: 'End of Term Exam'
};

// Order matters for display
const EXAM_ORDER: ExamType[] = ['week4', 'week8', 'endOfTerm'];

export const useResultsEntryMonitor = (options: UseResultsEntryMonitorOptions) => {
  const { term, year, teacherId } = options;
  const [completionCache, setCompletionCache] = useState<Map<string, any>>(new Map());
  const [isLoadingCompletions, setIsLoadingCompletions] = useState(true);
  
  // Get exam configurations - THIS IS CRITICAL for knowing what's expected
  const { configs, isLoading: configsLoading } = useExamConfig({ year });
  
  // Get all teachers
  const { allTeachers, isLoading: teachersLoading } = useSchoolTeachers();
  
  // Get all active classes with teacher assignments
  const { classes, isLoading: classesLoading } = useSchoolClasses({ year, isActive: true });
  
  const isLoading = configsLoading || teachersLoading || classesLoading || isLoadingCompletions;
  
  // CRITICAL: Get the active exam types for this specific term from the CONFIG
  const activeExamTypes = useMemo((): ExamType[] => {
    if (!configs || configs.length === 0) {
      console.warn('No exam configs found - returning empty array');
      return [];
    }
    
    const termConfig = configs.find((c: any) => c.term === term);
    if (!termConfig) {
      console.warn(`No config found for term ${term} - returning empty array`);
      return [];
    }
    
    const active: ExamType[] = [];
    
    // Only include exams that are explicitly configured for this term
    if (termConfig.examTypes?.week4 === true && termConfig.week4TotalMarks > 0) {
      active.push('week4');
    }
    if (termConfig.examTypes?.week8 === true && termConfig.week8TotalMarks > 0) {
      active.push('week8');
    }
    if (termConfig.examTypes?.endOfTerm === true && termConfig.endOfTermTotalMarks > 0) {
      active.push('endOfTerm');
    }
    
    console.log(`Active exams for ${term} ${year}:`, active);
    return active;
  }, [configs, term, year]);
  
  // Build teacher assignments map from classes
  const allTeacherAssignmentsMap = useMemo(() => {
    const map = new Map<string, {
      teacherId: string;
      teacherName: string;
      teacherEmail?: string;
      assignments: Array<{
        classId: string;
        className: string;
        subjectId: string;
        subjectName: string;
      }>;
    }>();
    
    for (const cls of classes) {
      const teacherAssignments = (cls as any).teacherAssignments;
      if (!teacherAssignments || !Array.isArray(teacherAssignments)) continue;
      
      for (const assignment of teacherAssignments) {
        const teacherIdKey = assignment.teacherId;
        if (!teacherIdKey) continue;
        
        if (!map.has(teacherIdKey)) {
          const teacher = allTeachers.find(t => t.id === teacherIdKey);
          map.set(teacherIdKey, {
            teacherId: teacherIdKey,
            teacherName: teacher?.name || teacher?.id || assignment.teacherName || 'Unknown',
            teacherEmail: teacher?.email,
            assignments: [],
          });
        }
        
        map.get(teacherIdKey)!.assignments.push({
          classId: cls.id,
          className: cls.name,
          subjectId: assignment.subjectId || assignment.subject,
          subjectName: assignment.subject,
        });
      }
    }
    
    return map;
  }, [classes, allTeachers]);
  
  // Fetch completion status for ALL classes and cache
  useEffect(() => {
    const fetchAllCompletionStatuses = async () => {
      if (!classes.length || !activeExamTypes.length) {
        setIsLoadingCompletions(false);
        return;
      }
      
      setIsLoadingCompletions(true);
      const cache = new Map<string, any>();
      
      try {
        // Fetch completion status for each class in parallel
        const completionPromises = classes.map(async (cls) => {
          try {
            const statuses = await resultsService.getSubjectCompletionStatus(
              cls.id,
              term,
              year
            );
            return { classId: cls.id, statuses };
          } catch (error) {
            console.error(`Error fetching completion for class ${cls.id}:`, error);
            return { classId: cls.id, statuses: [] };
          }
        });
        
        const results = await Promise.all(completionPromises);
        
        for (const { classId, statuses } of results) {
          for (const status of statuses) {
            const key = `${classId}_${status.subjectId}`;
            cache.set(key, status);
          }
        }
        
        setCompletionCache(cache);
      } catch (error) {
        console.error('Error fetching completion statuses:', error);
      } finally {
        setIsLoadingCompletions(false);
      }
    };
    
    if (classes.length > 0 && !classesLoading && activeExamTypes.length > 0) {
      fetchAllCompletionStatuses();
    }
  }, [classes, term, year, activeExamTypes, classesLoading]);
  
  // Helper to get completion status for a specific class and subject
  const getCompletionStatus = useCallback((classId: string, subjectId: string) => {
    const key = `${classId}_${subjectId}`;
    return completionCache.get(key);
  }, [completionCache]);
  
  // Build teacher progress data - ACCURATE based on configured exams
  const teacherProgress = useMemo((): TeacherProgress[] => {
    if (isLoading || activeExamTypes.length === 0) return [];
    
    // Determine which teachers to process
    let targetTeachers: Array<{
      teacherId: string;
      teacherName: string;
      teacherEmail?: string;
      assignments: Array<{
        classId: string;
        className: string;
        subjectId: string;
        subjectName: string;
      }>;
    }> = [];
    
    if (teacherId) {
      const teacherData = allTeacherAssignmentsMap.get(teacherId);
      if (teacherData) {
        targetTeachers = [teacherData];
      }
    } else {
      targetTeachers = Array.from(allTeacherAssignmentsMap.values());
    }
    
    const results: TeacherProgress[] = [];
    const termConfig = configs?.find((c: any) => c.term === term);
    
    for (const teacher of targetTeachers) {
      const classProgressMap = new Map<string, ClassProgress>();
      const allMissingEntries: MissingEntry[] = [];
      let totalRequired = 0;
      let totalCompleted = 0;
      
      for (const assignment of teacher.assignments) {
        const completion = getCompletionStatus(assignment.classId, assignment.subjectId);
        
        // Determine which exams are COMPLETE based on actual Firestore data
        // An exam is considered COMPLETE only if ALL students have marks entered
        // OR if the exam is marked as "not conducted" for ALL students
        let week4Complete = false;
        let week8Complete = false;
        let endOfTermComplete = false;
        let week4StudentCount = 0;
        let week8StudentCount = 0;
        let endOfTermStudentCount = 0;
        let totalStudents = 0;
        
        if (completion) {
          week4Complete = completion.week4Complete === true;
          week8Complete = completion.week8Complete === true;
          endOfTermComplete = completion.endOfTermComplete === true;
          week4StudentCount = completion.enteredStudents?.week4 || 0;
          week8StudentCount = completion.enteredStudents?.week8 || 0;
          endOfTermStudentCount = completion.enteredStudents?.endOfTerm || 0;
          totalStudents = completion.totalStudents || 0;
        } else {
          // If no completion data, we need to get student count from elsewhere
          // For now, we'll assume 0 - this will be fixed when data is fetched
          totalStudents = 0;
        }
        
        // Track which exams are expected vs completed
        const expectedExams: ExamType[] = [...activeExamTypes];
        const completedExams: ExamType[] = [];
        const missingExams: ExamType[] = [];
        
        if (week4Complete && activeExamTypes.includes('week4')) {
          completedExams.push('week4');
        } else if (activeExamTypes.includes('week4')) {
          missingExams.push('week4');
        }
        
        if (week8Complete && activeExamTypes.includes('week8')) {
          completedExams.push('week8');
        } else if (activeExamTypes.includes('week8')) {
          missingExams.push('week8');
        }
        
        if (endOfTermComplete && activeExamTypes.includes('endOfTerm')) {
          completedExams.push('endOfTerm');
        } else if (activeExamTypes.includes('endOfTerm')) {
          missingExams.push('endOfTerm');
        }
        
        const subjectCompletedCount = completedExams.length;
        const subjectExpectedCount = expectedExams.length;
        const subjectCompletionPercentage = subjectExpectedCount > 0
          ? Math.round((subjectCompletedCount / subjectExpectedCount) * 100)
          : 100;
        
        // Build missing entries for THIS SUBJECT based on expected exams
        const subjectMissingEntries: MissingEntry[] = [];
        
        for (const examType of missingExams) {
          let totalMarks: number | undefined;
          let configuredDate: string | undefined;
          
          if (termConfig) {
            if (examType === 'week4') {
              totalMarks = termConfig.week4TotalMarks;
              configuredDate = termConfig.week4Date;
            } else if (examType === 'week8') {
              totalMarks = termConfig.week8TotalMarks;
              configuredDate = termConfig.week8Date;
            } else if (examType === 'endOfTerm') {
              totalMarks = termConfig.endOfTermTotalMarks;
              configuredDate = termConfig.endOfTermDate;
            }
          }
          
          subjectMissingEntries.push({
            classId: assignment.classId,
            className: assignment.className,
            subjectId: assignment.subjectId,
            subjectName: assignment.subjectName,
            examType,
            examName: EXAM_NAMES[examType],
            totalMarks,
            configuredDate: configuredDate ? new Date(configuredDate).toISOString() : undefined,
          });
          
          allMissingEntries.push({
            classId: assignment.classId,
            className: assignment.className,
            subjectId: assignment.subjectId,
            subjectName: assignment.subjectName,
            examType,
            examName: EXAM_NAMES[examType],
            totalMarks,
            configuredDate: configuredDate ? new Date(configuredDate).toISOString() : undefined,
          });
        }
        
        // Update class progress
        if (!classProgressMap.has(assignment.classId)) {
          classProgressMap.set(assignment.classId, {
            classId: assignment.classId,
            className: assignment.className,
            totalRequired: 0,
            completedCount: 0,
            missingCount: 0,
            completionPercentage: 0,
            subjects: [],
          });
        }
        
        const classProgress = classProgressMap.get(assignment.classId)!;
        classProgress.subjects.push({
          subjectId: assignment.subjectId,
          subjectName: assignment.subjectName,
          week4Complete,
          week8Complete,
          endOfTermComplete,
          week4StudentCount,
          week8StudentCount,
          endOfTermStudentCount,
          totalStudents,
          completionPercentage: subjectCompletionPercentage,
          expectedExams,
          completedExams,
          missingExams,
        });
        
        classProgress.totalRequired += subjectExpectedCount;
        classProgress.completedCount += subjectCompletedCount;
        classProgress.missingCount = classProgress.totalRequired - classProgress.completedCount;
        classProgress.completionPercentage = classProgress.totalRequired > 0
          ? Math.round((classProgress.completedCount / classProgress.totalRequired) * 100)
          : 100;
        
        totalRequired += subjectExpectedCount;
        totalCompleted += subjectCompletedCount;
      }
      
      const missingCount = totalRequired - totalCompleted;
      const completionPercentage = totalRequired > 0
        ? Math.round((totalCompleted / totalRequired) * 100)
        : 100;
      
      // Determine status based on completion percentage
      let status: 'complete' | 'on-track' | 'behind' | 'critical';
      if (completionPercentage === 100) {
        status = 'complete';
      } else if (completionPercentage >= 75) {
        status = 'on-track';
      } else if (completionPercentage >= 50) {
        status = 'behind';
      } else {
        status = 'critical';
      }
      
      results.push({
        teacherId: teacher.teacherId,
        teacherName: teacher.teacherName,
        teacherEmail: teacher.teacherEmail,
        missingCount,
        totalRequired,
        completedCount: totalCompleted,
        completionPercentage,
        status,
        missingEntries: allMissingEntries,
        classProgress: Array.from(classProgressMap.values()),
      });
    }
    
    // Sort by completion percentage (worst first for admins)
    return results.sort((a, b) => a.completionPercentage - b.completionPercentage);
  }, [isLoading, allTeacherAssignmentsMap, activeExamTypes, configs, term, teacherId, getCompletionStatus]);
  
  // Get single teacher data (for teacher view)
  const myProgress = useMemo(() => {
    if (!teacherId) return null;
    return teacherProgress.find(t => t.teacherId === teacherId) || null;
  }, [teacherProgress, teacherId]);
  
  // Summary statistics for admin
  const summary = useMemo(() => {
    const totalTeachers = teacherProgress.length;
    const totalMissingEntries = teacherProgress.reduce((sum, t) => sum + t.missingCount, 0);
    const totalRequiredEntries = teacherProgress.reduce((sum, t) => sum + t.totalRequired, 0);
    
    const teachersComplete = teacherProgress.filter(t => t.status === 'complete').length;
    const teachersOnTrack = teacherProgress.filter(t => t.status === 'on-track').length;
    const teachersBehind = teacherProgress.filter(t => t.status === 'behind').length;
    const teachersCritical = teacherProgress.filter(t => t.status === 'critical').length;
    
    const overallCompletion = totalRequiredEntries > 0
      ? Math.round(((totalRequiredEntries - totalMissingEntries) / totalRequiredEntries) * 100)
      : 100;
    
    return {
      totalTeachers,
      totalMissingEntries,
      totalRequiredEntries,
      completedEntries: totalRequiredEntries - totalMissingEntries,
      overallCompletion,
      teachersComplete,
      teachersOnTrack,
      teachersBehind,
      teachersCritical,
    };
  }, [teacherProgress]);
  
  // Get missing entries by exam type
  const missingByExamType = useMemo(() => {
    const map: Record<ExamType, MissingEntry[]> = {
      week4: [],
      week8: [],
      endOfTerm: [],
    };
    
    for (const teacher of teacherProgress) {
      for (const entry of teacher.missingEntries) {
        if (activeExamTypes.includes(entry.examType)) {
          map[entry.examType].push(entry);
        }
      }
    }
    
    return map;
  }, [teacherProgress, activeExamTypes]);
  
  return {
    teacherProgress,
    myProgress,
    activeExamTypes,
    summary,
    missingByExamType,
    isLoading,
    getExamName: (examType: ExamType) => EXAM_NAMES[examType],
    refetch: () => {
      setIsLoadingCompletions(true);
      setCompletionCache(new Map());
      setTimeout(() => {
        setIsLoadingCompletions(false);
      }, 100);
    },
  };
};