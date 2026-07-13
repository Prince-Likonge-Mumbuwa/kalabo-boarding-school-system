// SMS Service for your main frontend app

// Use environment variable for API URL (default to localhost for development)
const SMS_API_URL = import.meta.env.VITE_SMS_API_URL || 'http://localhost:3000';

export interface SendSMSResponse {
  success: boolean;
  message: string;
  preview?: string;
  phoneNumber?: string;
}

export interface BulkSendResponse {
  success: boolean;
  total: number;
  sent: number;
  failed: number;  // This is a number (count of failures)
  results: Array<{ studentId: string; phoneNumber: string; status: string }>;
  failedList: Array<{ studentId: string; reason: string }>;  // Renamed from 'failed' to avoid duplicate
}

export interface SMSLog {
  id: string;
  studentId: string;
  guardianPhone: string;
  term: string;
  year: number;
  message: string;
  status: string;
  sentAt: any;
}

export const smsService = {
  /**
   * Send results SMS to a single student's guardian
   */
  sendStudentResults: async (
    studentId: string, 
    term: string, 
    year: number
  ): Promise<SendSMSResponse> => {
    try {
      const response = await fetch(`${SMS_API_URL}/api/send-sms`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ studentId, term, year })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send SMS');
      }
      
      return await response.json();
    } catch (error) {
      console.error('SMS send error:', error);
      throw error;
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
      const response = await fetch(`${SMS_API_URL}/api/bulk-send`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ classId, term, year })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send bulk SMS');
      }
      
      const data = await response.json();
      
      // Transform the response to match our interface
      return {
        success: data.success,
        total: data.total,
        sent: data.sent,
        failed: data.failed,
        results: data.results || [],
        failedList: data.failed || []
      };
    } catch (error) {
      console.error('Bulk SMS error:', error);
      throw error;
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
      console.error('Fetch logs error:', error);
      return [];
    }
  },
  
  /**
   * Get student details (check if has guardian phone)
   */
  getStudent: async (studentId: string): Promise<any> => {
    try {
      const response = await fetch(`${SMS_API_URL}/api/student/${studentId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch student');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Fetch student error:', error);
      throw error;
    }
  }
};