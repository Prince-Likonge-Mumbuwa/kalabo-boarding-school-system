// @/hooks/useResultsEntryMonitor.ts
import { useMemo, useCallback, useState, useEffect } from 'react';
import { useExamConfig } from './useExamConfig';
import { useSchoolClasses } from './useSchoolClasses';
import { useSchoolTeachers } from './useSchoolTeachers';
import { resultsService } from '@/services/resultsService';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

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

export const useResultsEntryMonitor = (options: UseResultsEntryMonitorOptions) => {
  const { term, year, teacherId } = options;
  const [completionCache, setCompletionCache] = useState<Map<string, any>>(new Map());
  const [isLoadingCompletions, setIsLoadingCompletions] = useState(true);
  
  // Get exam configurations
  const { configs, isLoading: configsLoading } = useExamConfig({ year });
  
  // Get all teachers
  const { allTeachers, isLoading: teachersLoading } = useSchoolTeachers();
  
  // Get all active classes with teacher assignments
  const { classes, isLoading: classesLoading } = useSchoolClasses({ year, isActive: true });
  
  const isLoading = configsLoading || teachersLoading || classesLoading || isLoadingCompletions;
  
  // Get active exam types from config
  const activeExamTypes = useMemo((): ExamType[] => {
    if (!configs || configs.length === 0) return ['week4', 'week8', 'endOfTerm'];
    
    const termConfig = configs.find((c: any) => c.term === term);
    if (!termConfig) return ['week4', 'week8', 'endOfTerm'];
    
    const active: ExamType[] = [];
    if (termConfig.week4TotalMarks !== undefined && termConfig.week4TotalMarks > 0) active.push('week4');
    if (termConfig.week8TotalMarks !== undefined && termConfig.week8TotalMarks > 0) active.push('week8');
    if (termConfig.endOfTermTotalMarks !== undefined && termConfig.endOfTermTotalMarks > 0) active.push('endOfTerm');
    
    return active.length > 0 ? active : ['week4', 'week8', 'endOfTerm'];
  }, [configs, term]);
  
  // Build teacher assignments map from classes (using your actual data structure)
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
      // Use teacherAssignments from your EnhancedClass
      const teacherAssignments = (cls as any).teacherAssignments;
      if (!teacherAssignments || !Array.isArray(teacherAssignments)) continue;
      
      for (const assignment of teacherAssignments) {
        const teacherIdKey = assignment.teacherId;
        if (!teacherIdKey) continue;
        
        if (!map.has(teacherIdKey)) {
          const teacher = allTeachers.find(t => t.id === teacherIdKey);
          map.set(teacherIdKey, {
            teacherId: teacherIdKey,
            teacherName: teacher?.name || teacher?.fullName || assignment.teacherName || 'Unknown',
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
  
  // Fetch completion status for all classes and subjects in one go
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
    
    if (classes.length > 0 && !classesLoading) {
      fetchAllCompletionStatuses();
    }
  }, [classes, term, year, activeExamTypes, classesLoading]);
  
  // Helper to get completion status for a specific class and subject
  const getCompletionStatus = useCallback((classId: string, subjectId: string) => {
    const key = `${classId}_${subjectId}`;
    return completionCache.get(key);
  }, [completionCache]);
  
  // Build teacher progress data
  const teacherProgress = useMemo((): TeacherProgress[] => {
    if (isLoading) return [];
    
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
        
        // Determine which exams are complete based on actual Firestore data
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
        }
        
        // Calculate subject completion percentage
        let subjectCompletedCount = 0;
        if (week4Complete) subjectCompletedCount++;
        if (week8Complete) subjectCompletedCount++;
        if (endOfTermComplete) subjectCompletedCount++;
        
        const subjectCompletionPercentage = activeExamTypes.length > 0
          ? Math.round((subjectCompletedCount / activeExamTypes.length) * 100)
          : 100;
        
        // Build missing entries for this subject
        const subjectMissingEntries: MissingEntry[] = [];
        
        if (!week4Complete && activeExamTypes.includes('week4')) {
          subjectMissingEntries.push({
            classId: assignment.classId,
            className: assignment.className,
            subjectId: assignment.subjectId,
            subjectName: assignment.subjectName,
            examType: 'week4',
            examName: EXAM_NAMES.week4,
            totalMarks: termConfig?.week4TotalMarks,
            configuredDate: termConfig?.week4Date ? new Date(termConfig.week4Date).toISOString() : undefined,
          });
        }
        
        if (!week8Complete && activeExamTypes.includes('week8')) {
          subjectMissingEntries.push({
            classId: assignment.classId,
            className: assignment.className,
            subjectId: assignment.subjectId,
            subjectName: assignment.subjectName,
            examType: 'week8',
            examName: EXAM_NAMES.week8,
            totalMarks: termConfig?.week8TotalMarks,
            configuredDate: termConfig?.week8Date ? new Date(termConfig.week8Date).toISOString() : undefined,
          });
        }
        
        if (!endOfTermComplete && activeExamTypes.includes('endOfTerm')) {
          subjectMissingEntries.push({
            classId: assignment.classId,
            className: assignment.className,
            subjectId: assignment.subjectId,
            subjectName: assignment.subjectName,
            examType: 'endOfTerm',
            examName: EXAM_NAMES.endOfTerm,
            totalMarks: termConfig?.endOfTermTotalMarks,
            configuredDate: termConfig?.endOfTermDate ? new Date(termConfig.endOfTermDate).toISOString() : undefined,
          });
        }
        
        allMissingEntries.push(...subjectMissingEntries);
        
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
        });
        
        classProgress.totalRequired += activeExamTypes.length;
        classProgress.completedCount += subjectCompletedCount;
        classProgress.missingCount = classProgress.totalRequired - classProgress.completedCount;
        classProgress.completionPercentage = classProgress.totalRequired > 0
          ? Math.round((classProgress.completedCount / classProgress.totalRequired) * 100)
          : 100;
        
        totalRequired += activeExamTypes.length;
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
        map[entry.examType].push(entry);
      }
    }
    
    return map;
  }, [teacherProgress]);
  
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
      // The useEffect will re-run when classes change
      // Force a re-fetch by triggering the effect again
      setTimeout(() => {
        setIsLoadingCompletions(false);
      }, 100);
    },
  };
};