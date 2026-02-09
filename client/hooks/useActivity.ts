import { useQuery } from '@tanstack/react-query';
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  where,
  Timestamp,
  doc,
  writeBatch
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useEffect } from 'react';

export type ActivityType = 
  | 'class_created' 
  | 'teacher_added' 
  | 'results_entered' 
  | 'student_enrolled' 
  | 'exam_scheduled'
  | 'attendance_taken'
  | 'user_logged_in'
  | 'report_generated'
  | 'meeting_scheduled'
  | 'system_notification';

export interface Activity {
  id: string;
  type: ActivityType;
  message: string;
  userId: string;
  userName: string;
  userRole: 'admin' | 'teacher' | 'student' | 'system';
  timestamp: Date;
  metadata?: {
    classId?: string;
    teacherId?: string;
    studentId?: string;
    examId?: string;
    resultId?: string;
    [key: string]: any;
  };
  read?: boolean;
}

export interface ActivityStats {
  totalActivities: number;
  unreadActivities: number;
  activitiesByType: Record<ActivityType, number>;
  recentActivityUsers: Array<{
    userId: string;
    userName: string;
    lastActivity: Date;
    activityCount: number;
  }>;
}

export const useActivity = (options?: {
  limit?: number;
  showRead?: boolean;
  types?: ActivityType[];
}) => {
  const {
    limit: resultsLimit = 10,
    showRead = true,
    types = []
  } = options || {};

  const fetchRecentActivities = async (): Promise<Activity[]> => {
    const activitiesRef = collection(db, 'activities');
    
    // Build the query
    let q = query(
      activitiesRef,
      orderBy('timestamp', 'desc')
    );
    
    // Apply filters if provided
    const conditions = [];
    
    if (!showRead) {
      conditions.push(where('read', '==', false));
    }
    
    if (types.length > 0) {
      conditions.push(where('type', 'in', types));
    }
    
    // Apply conditions in sequence (Firebase requires composite index for multiple where clauses)
    if (conditions.length > 0) {
      q = query(q, ...conditions);
    }
    
    // Apply limit
    q = query(q, limit(resultsLimit));
    
    const querySnapshot = await getDocs(q);
    
    const activities: Activity[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      activities.push({
        id: doc.id,
        type: data.type,
        message: data.message,
        userId: data.userId,
        userName: data.userName,
        userRole: data.userRole,
        timestamp: data.timestamp?.toDate() || new Date(),
        metadata: data.metadata || {},
        read: data.read || false,
      });
    });
    
    return activities;
  };

  const fetchActivityStats = async (): Promise<ActivityStats> => {
    // Fetch all activities for stats
    const activitiesRef = collection(db, 'activities');
    const q = query(activitiesRef, orderBy('timestamp', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const allActivities: Activity[] = [];
    const usersMap = new Map<string, { 
      userName: string; 
      lastActivity: Date; 
      count: number;
    }>();
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const activity: Activity = {
        id: doc.id,
        type: data.type,
        message: data.message,
        userId: data.userId,
        userName: data.userName,
        userRole: data.userRole,
        timestamp: data.timestamp?.toDate() || new Date(),
        metadata: data.metadata || {},
        read: data.read || false,
      };
      
      allActivities.push(activity);
      
      // Track user activity stats
      if (data.userId && data.userId !== 'system') {
        const userKey = data.userId;
        const userData = usersMap.get(userKey) || {
          userName: data.userName,
          lastActivity: new Date(0),
          count: 0
        };
        
        userData.count += 1;
        if (activity.timestamp > userData.lastActivity) {
          userData.lastActivity = activity.timestamp;
        }
        
        usersMap.set(userKey, userData);
      }
    });
    
    // Calculate stats
    const totalActivities = allActivities.length;
    const unreadActivities = allActivities.filter(a => !a.read).length;
    
    // Count by type
    const activitiesByType = {} as Record<ActivityType, number>;
    allActivities.forEach(activity => {
      activitiesByType[activity.type] = (activitiesByType[activity.type] || 0) + 1;
    });
    
    // Get recent activity users (sorted by most recent activity)
    const recentActivityUsers = Array.from(usersMap.entries())
      .map(([userId, data]) => ({
        userId,
        userName: data.userName,
        lastActivity: data.lastActivity,
        activityCount: data.count,
      }))
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())
      .slice(0, 5);
    
    return {
      totalActivities,
      unreadActivities,
      activitiesByType,
      recentActivityUsers,
    };
  };

  const markAsRead = async (activityIds: string[]): Promise<void> => {
    const batch = writeBatch(db);
    
    activityIds.forEach(id => {
      const activityRef = doc(db, 'activities', id);
      batch.update(activityRef, { read: true });
    });
    
    await batch.commit();
  };

  const markAllAsRead = async (): Promise<void> => {
    const activitiesRef = collection(db, 'activities');
    const q = query(activitiesRef, where('read', '==', false));
    const querySnapshot = await getDocs(q);
    
    const batch = writeBatch(db);
    
    querySnapshot.forEach((docSnapshot) => {
      const activityRef = docSnapshot.ref;
      batch.update(activityRef, { read: true });
    });
    
    if (querySnapshot.size > 0) {
      await batch.commit();
    }
  };

  // Real-time listener (optional - uncomment if you want real-time updates)
  /*
  useEffect(() => {
    if (!enableRealtime) return;
    
    const activitiesRef = collection(db, 'activities');
    const q = query(activitiesRef, orderBy('timestamp', 'desc'), limit(resultsLimit));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const updatedActivities: Activity[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        updatedActivities.push({
          id: doc.id,
          ...data,
          timestamp: data.timestamp?.toDate() || new Date(),
        });
      });
      
      // Update cache or trigger refetch
      queryClient.setQueryData(['activities', resultsLimit], updatedActivities);
    });
    
    return () => unsubscribe();
  }, [enableRealtime, resultsLimit]);
  */

  const activitiesQuery = useQuery({
    queryKey: ['activities', resultsLimit, showRead, types],
    queryFn: fetchRecentActivities,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Auto-refresh every minute
  });

  const statsQuery = useQuery({
    queryKey: ['activities', 'stats'],
    queryFn: fetchActivityStats,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    activities: activitiesQuery.data || [],
    stats: statsQuery.data,
    isLoading: activitiesQuery.isLoading || statsQuery.isLoading,
    isError: activitiesQuery.isError || statsQuery.isError,
    error: activitiesQuery.error || statsQuery.error,
    refetch: () => {
      activitiesQuery.refetch();
      statsQuery.refetch();
    },
    markAsRead,
    markAllAsRead,
  };
};

// Helper function to create new activity (you can call this from other parts of your app)
export const createActivity = async (activityData: {
  type: ActivityType;
  message: string;
  userId: string;
  userName: string;
  userRole: 'admin' | 'teacher' | 'student' | 'system';
  metadata?: Record<string, any>;
}): Promise<string> => {
  const { addDoc, collection } = await import('firebase/firestore');
  const { db } = await import('@/lib/firebase');
  
  const activitiesRef = collection(db, 'activities');
  
  const newActivity = {
    ...activityData,
    timestamp: Timestamp.now(),
    read: false,
    metadata: activityData.metadata || {},
  };
  
  const docRef = await addDoc(activitiesRef, newActivity);
  return docRef.id;
};

// Common activity creation helpers
export const ActivityHelpers = {
  classCreated: (className: string, userId: string, userName: string) =>
    createActivity({
      type: 'class_created',
      message: `${className} class created`,
      userId,
      userName,
      userRole: 'admin',
      metadata: { className },
    }),
  
  teacherAdded: (teacherName: string, department: string, userId: string, userName: string) =>
    createActivity({
      type: 'teacher_added',
      message: `${teacherName} added to ${department} department`,
      userId,
      userName,
      userRole: 'admin',
      metadata: { teacherName, department },
    }),
  
  resultsEntered: (className: string, subject: string, teacherName: string, userId: string) =>
    createActivity({
      type: 'results_entered',
      message: `Results entered for ${className} - ${subject}`,
      userId,
      userName: teacherName,
      userRole: 'teacher',
      metadata: { className, subject, teacherName },
    }),
  
  studentEnrolled: (studentName: string, className: string, userId: string, userName: string) =>
    createActivity({
      type: 'student_enrolled',
      message: `${studentName} enrolled in ${className}`,
      userId,
      userName,
      userRole: 'admin',
      metadata: { studentName, className },
    }),
  
  examScheduled: (examName: string, className: string, date: string, userId: string, userName: string) =>
    createActivity({
      type: 'exam_scheduled',
      message: `${examName} scheduled for ${className} on ${date}`,
      userId,
      userName,
      userRole: 'teacher',
      metadata: { examName, className, date },
    }),
  
  userLoggedIn: (userName: string, userRole: string, userId: string) =>
    createActivity({
      type: 'user_logged_in',
      message: `${userName} (${userRole}) logged in`,
      userId,
      userName,
      userRole: userRole as any,
      metadata: {},
    }),
};