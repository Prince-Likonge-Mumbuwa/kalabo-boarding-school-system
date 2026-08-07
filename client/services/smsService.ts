// @/services/smsService.ts - UPDATED FOR NEW BACKEND
const SMS_API_URL = import.meta.env.VITE_SMS_API_URL || 'http://localhost:3000';

export interface SendSMSResponse {
  success: boolean;
  message: string;
  preview?: string;
  phoneNumber?: string;
  carrier?: string;
  status?: string;
  error?: string;
  studentName?: string;
}

export interface BulkSendResponse {
  success: boolean;
  total: number;
  sent: number;
  failed: number;
  results: Array<{ 
    studentId: string; 
    studentName: string;
    phoneNumber: string; 
    carrier: string;
    status: string; 
  }>;
  failedList: Array<{ 
    studentId: string; 
    studentName?: string;
    reason: string; 
  }>;
  summary?: {
    skippedNoPhone: number;
    skippedNoResults: number;
  };
  error?: string;
}

export interface SMSLog {
  id: string;
  studentId: string;
  studentName?: string;
  guardianPhone: string;
  carrier?: string;
  term: string;
  year: number;
  message: string;
  status: string;
  sentAt: any;
  error?: string;
}

export interface StudentPhoneInfo {
  success: boolean;
  id: string;
  documentId: string;
  name: string;
  hasGuardianPhone: boolean;
  phoneValid: boolean;
  phoneCarrier: string | null;
  formattedPhone: string | null;
  error?: string;
}

export const smsService = {
  /**
   * Check if the SMS backend is reachable
   */
  healthCheck: async (): Promise<{ status: string; smsConfigured: boolean }> => {
    try {
      const response = await fetch(`${SMS_API_URL}/api/health`);
      return await response.json();
    } catch (error) {
      console.error('SMS backend health check failed:', error);
      return { status: 'ERROR', smsConfigured: false };
    }
  },

  /**
   * Get student phone info (check if they can receive SMS)
   */
  getStudentPhoneInfo: async (studentId: string): Promise<StudentPhoneInfo> => {
    try {
      const response = await fetch(`${SMS_API_URL}/api/student/${studentId}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch student');
      }
      
      return await response.json();
    } catch (error: any) {
      console.error('Fetch student error:', error);
      return {
        success: false,
        id: studentId,
        documentId: '',
        name: '',
        hasGuardianPhone: false,
        phoneValid: false,
        phoneCarrier: null,
        formattedPhone: null,
        error: error.message
      };
    }
  },

  /**
   * Send results SMS to a single student's guardian
   */
  sendStudentResults: async (
    studentId: string, 
    term: string, 
    year: number
  ): Promise<SendSMSResponse> => {
    try {
      console.log(`📱 Sending SMS to ${studentId} for ${term} ${year}`);
      
      const response = await fetch(`${SMS_API_URL}/api/send-sms`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ studentId, term, year })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        // Backend returns meaningful error messages
        throw new Error(data.error || 'Failed to send SMS');
      }
      
      console.log('✅ SMS sent successfully:', data);
      return data;
      
    } catch (error: any) {
      console.error('❌ SMS send error:', error);
      throw new Error(error.message || 'Failed to send SMS');
    }
  },
  
  /**
   * Bulk send results to all students in a class
   */
  bulkSendClass: async (
    classId: string, 
    term: string, 
    year: number
  ): Promise<BulkSendResponse> => {
    try {
      console.log(`📱 Bulk sending SMS to class ${classId} for ${term} ${year}`);
      
      const response = await fetch(`${SMS_API_URL}/api/bulk-send`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ classId, term, year })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send bulk SMS');
      }
      
      console.log(`✅ Bulk SMS complete: ${data.sent}/${data.total} sent`);
      
      // Return the data directly - it already matches our interface
      return {
        success: data.success,
        total: data.total,
        sent: data.sent,
        failed: data.failed || 0,
        results: data.results || [],
        failedList: data.failedList || [],
        summary: data.summary
      };
      
    } catch (error: any) {
      console.error('❌ Bulk SMS error:', error);
      throw new Error(error.message || 'Failed to send bulk SMS');
    }
  },
  
  /**
   * Get SMS logs for a specific student
   */
  getSMSLogs: async (studentId: string): Promise<SMSLog[]> => {
    try {
      const response = await fetch(`${SMS_API_URL}/api/sms-logs/${studentId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch SMS logs');
      }
      
      const data = await response.json();
      return data.logs || [];
      
    } catch (error) {
      console.error('Fetch SMS logs error:', error);
      return [];
    }
  },

  /**
   * Check if a student can receive SMS (quick check without API call)
   * Use this from your hooks that already have learner data
   */
  canReceiveSMS: (learner: { guardianPhone?: string; parentPhone?: string } | null | undefined): boolean => {
    if (!learner) return false;
    const phone = learner.guardianPhone || learner.parentPhone;
    return !!phone && phone.length >= 10;
  },

  /**
   * Format error message for display to admin
   */
  formatError: (error: string): string => {
    if (error.includes('No guardian phone')) {
      return 'No phone number on file for this student';
    }
    if (error.includes('Invalid phone number')) {
      return 'Invalid guardian phone number';
    }
    if (error.includes('No results available')) {
      return 'No results entered for this term/year';
    }
    if (error.includes('Student not found')) {
      return 'Student not found in database';
    }
    return error;
  }
};