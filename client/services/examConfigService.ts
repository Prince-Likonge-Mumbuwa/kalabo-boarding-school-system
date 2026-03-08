// @/services/examConfigService.ts
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  DocumentData,
  limit // Add this missing import
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ExamConfig, ExamConfigFilters } from '@/types/exam';

// Helper to convert Firestore data
const toDate = (timestamp: any): Date | undefined => {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  if (timestamp.seconds) {
    return new Date(timestamp.seconds * 1000);
  }
  return undefined;
};

export const examConfigService = {
  /**
   * Get exam configurations with optional filters
   */
  getConfigs: async (filters?: ExamConfigFilters): Promise<ExamConfig[]> => {
    try {
      const configsRef = collection(db, 'examConfigs');
      const constraints: any[] = [];

      if (filters?.year !== undefined) {
        constraints.push(where('year', '==', filters.year));
      }
      if (filters?.term) {
        constraints.push(where('term', '==', filters.term));
      }
      if (filters?.isActive !== undefined) {
        constraints.push(where('isActive', '==', filters.isActive));
      }

      let q;
      if (constraints.length > 0) {
        q = query(configsRef, ...constraints, orderBy('createdAt', 'desc'));
      } else {
        q = query(configsRef, orderBy('year', 'desc'), orderBy('term'), orderBy('createdAt', 'desc'));
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data() as DocumentData;
        return {
          id: doc.id,
          term: data.term,
          year: data.year,
          examTypes: data.examTypes || { week4: true, week8: true, endOfTerm: true },
          week4Date: data.week4Date,
          week8Date: data.week8Date,
          endOfTermDate: data.endOfTermDate,
          week4TotalMarks: data.week4TotalMarks,
          week8TotalMarks: data.week8TotalMarks,
          endOfTermTotalMarks: data.endOfTermTotalMarks,
          isActive: data.isActive !== false,
          createdBy: data.createdBy,
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
        } as ExamConfig;
      });
    } catch (error) {
      console.error('Error fetching exam configs:', error);
      throw error;
    }
  },

  /**
   * Get a single exam configuration by ID
   */
  getConfigById: async (configId: string): Promise<ExamConfig | null> => {
    try {
      const configRef = doc(db, 'examConfigs', configId);
      const configDoc = await getDoc(configRef);
      
      if (!configDoc.exists()) return null;
      
      const data = configDoc.data() as DocumentData;
      return {
        id: configDoc.id,
        term: data.term,
        year: data.year,
        examTypes: data.examTypes || { week4: true, week8: true, endOfTerm: true },
        week4Date: data.week4Date,
        week8Date: data.week8Date,
        endOfTermDate: data.endOfTermDate,
        week4TotalMarks: data.week4TotalMarks,
        week8TotalMarks: data.week8TotalMarks,
        endOfTermTotalMarks: data.endOfTermTotalMarks,
        isActive: data.isActive !== false,
        createdBy: data.createdBy,
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
      } as ExamConfig;
    } catch (error) {
      console.error('Error fetching exam config:', error);
      throw error;
    }
  },

  /**
   * Get the active configuration for a specific term and year
   */
  getActiveConfigForTerm: async (term: string, year: number): Promise<ExamConfig | null> => {
    try {
      const configsRef = collection(db, 'examConfigs');
      const q = query(
        configsRef,
        where('term', '==', term),
        where('year', '==', year),
        where('isActive', '==', true),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      
      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;
      
      const docSnapshot = snapshot.docs[0];
      const data = docSnapshot.data() as DocumentData;
      return {
        id: docSnapshot.id,
        term: data.term,
        year: data.year,
        examTypes: data.examTypes || { week4: true, week8: true, endOfTerm: true },
        week4Date: data.week4Date,
        week8Date: data.week8Date,
        endOfTermDate: data.endOfTermDate,
        week4TotalMarks: data.week4TotalMarks,
        week8TotalMarks: data.week8TotalMarks,
        endOfTermTotalMarks: data.endOfTermTotalMarks,
        isActive: data.isActive !== false,
        createdBy: data.createdBy,
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
      } as ExamConfig;
    } catch (error) {
      console.error('Error fetching active exam config:', error);
      throw error;
    }
  },

  /**
   * Create a new exam configuration
   */
  createConfig: async (data: Partial<ExamConfig>): Promise<string> => {
    try {
      // Check if a configuration already exists for this term/year
      const existing = await examConfigService.getActiveConfigForTerm(data.term!, data.year!);
      
      const configData = {
        term: data.term,
        year: data.year,
        examTypes: data.examTypes || { week4: true, week8: true, endOfTerm: true },
        week4Date: data.week4Date || null,
        week8Date: data.week8Date || null,
        endOfTermDate: data.endOfTermDate || null,
        week4TotalMarks: data.week4TotalMarks || 100,
        week8TotalMarks: data.week8TotalMarks || 100,
        endOfTermTotalMarks: data.endOfTermTotalMarks || 100,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const configsRef = collection(db, 'examConfigs');
      const docRef = await addDoc(configsRef, configData);
      return docRef.id;
    } catch (error) {
      console.error('Error creating exam config:', error);
      throw error;
    }
  },

  /**
   * Update an exam configuration
   */
  updateConfig: async (configId: string, updates: Partial<ExamConfig>): Promise<void> => {
    try {
      const configRef = doc(db, 'examConfigs', configId);
      await updateDoc(configRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating exam config:', error);
      throw error;
    }
  },

  /**
   * Delete an exam configuration
   */
  deleteConfig: async (configId: string): Promise<void> => {
    try {
      const configRef = doc(db, 'examConfigs', configId);
      await deleteDoc(configRef);
    } catch (error) {
      console.error('Error deleting exam config:', error);
      throw error;
    }
  },

  /**
   * Copy configurations from one term to another
   */
  copyConfigs: async (fromYear: number, fromTerm: string, toYear: number, toTerm: string): Promise<void> => {
    try {
      // Get source configurations
      const configsRef = collection(db, 'examConfigs');
      const q = query(
        configsRef,
        where('year', '==', fromYear),
        where('term', '==', fromTerm)
      );
      
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        throw new Error(`No configurations found for ${fromTerm} ${fromYear}`);
      }

      const batch = writeBatch(db);

      snapshot.docs.forEach(docSnapshot => { // Renamed to docSnapshot to avoid conflict
        const data = docSnapshot.data(); // Use docSnapshot.data() instead of doc.data()
        const newConfigRef = doc(collection(db, 'examConfigs'));
        batch.set(newConfigRef, {
          term: toTerm,
          year: toYear,
          examTypes: data.examTypes,
          week4Date: data.week4Date,
          week8Date: data.week8Date,
          endOfTermDate: data.endOfTermDate,
          week4TotalMarks: data.week4TotalMarks,
          week8TotalMarks: data.week8TotalMarks,
          endOfTermTotalMarks: data.endOfTermTotalMarks,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();
      console.log(`✅ Copied ${snapshot.size} configs from ${fromTerm} ${fromYear} to ${toTerm} ${toYear}`);
    } catch (error) {
      console.error('Error copying exam configs:', error);
      throw error;
    }
  },

  /**
   * Deactivate a configuration (soft delete)
   */
  deactivateConfig: async (configId: string): Promise<void> => {
    try {
      const configRef = doc(db, 'examConfigs', configId);
      await updateDoc(configRef, {
        isActive: false,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error deactivating exam config:', error);
      throw error;
    }
  },
};