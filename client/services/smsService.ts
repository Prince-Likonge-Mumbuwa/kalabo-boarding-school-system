// @/services/smsService.ts — wired to Firebase Cloud Functions backend
// Version 3.1.0 — adds announcement sends (all parents / one parent)
//   - previewAnnouncement() : local cost estimate before sending
//   - sendAnnouncement()    : posts to /sendAnnouncement endpoint

import {
  resultsService,
  formatStudentResultsSMS,
  getSmsSegments,
  type SMSStudentPayload,
  type SMSFormatOptions,
  type SMSSegmentInfo,
} from '@/services/resultsService';

const SMS_API_URL =
  import.meta.env.VITE_SMS_API_URL ||
  'http://localhost:5001/catalyst-f1b1a/us-central1';

// ==================== RESPONSE TYPES ====================

export interface SendSMSResponse {
  success: boolean;
  message: string;
  preview?: string;
  phoneNumber?: string;
  carrier?: string;
  status?: 'queued' | 'sent' | 'failed';
  messageId?: string;
  error?: string;
  studentName?: string;
  segments?: SMSSegmentInfo;
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
    segments?: SMSSegmentInfo;
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
  campaignId?: string;
  error?: string;
  costEstimate?: {
    totalSegments: number;
    totalCharacters: number;
    averagePerMessage: number;
    encoding: 'GSM-7' | 'UCS-2' | 'mixed';
    totalCostZmw: number;
  };
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

export interface SMSPreview {
  success: boolean;
  studentId: string;
  studentName: string;
  body: string;
  segments: SMSSegmentInfo;
  phoneNumber?: string;
  estimatedCostZmw?: number;
  error?: string;
}

export interface ClassSMSPreview {
  success: boolean;
  classId: string;
  term: string;
  year: number;
  totalStudents: number;
  readyCount: number;
  skippedNoResults: number;
  totalSegments: number;
  totalCharacters: number;
  averageCharsPerMessage: number;
  encoding: 'GSM-7' | 'UCS-2' | 'mixed';
  totalCostZmw: number;
  previews: SMSPreview[];
  error?: string;
}

// ==================== ANNOUNCEMENT TYPES ====================

export type AnnouncementTarget =
  | { type: 'all' }
  | { type: 'student'; studentId: string };

export interface AnnouncementSendResponse {
  success: boolean;
  announcementId: string;
  total: number;
  sent: number;
  failed: number;
  results: Array<{
    studentId: string;
    studentName: string;
    phoneNumber: string;
    carrier: string;
    status: string;
    segments?: SMSSegmentInfo;
  }>;
  failedList: Array<{
    studentId: string;
    studentName: string;
    reason: string;
  }>;
  summary: {
    skippedNoPhone: number;
    skippedInvalid: number;
  };
  costEstimate?: {
    totalSegments: number;
    totalCharacters: number;
    averagePerMessage: number;
    encoding: 'GSM-7' | 'UCS-2' | 'mixed';
    totalCostZmw: number;
  };
  error?: string;
}

export interface AnnouncementPreview {
  success: boolean;
  body: string;
  segments: SMSSegmentInfo;
  recipientCount: number;
  totalSegments: number;
  estimatedCostZmw: number;
  error?: string;
}

// ==================== CONFIGURATION ====================

/**
 * Cost per SMS segment in ZMW (Africa's Talking Zambia rates).
 * Update when AT pricing changes. Used only for client-side estimates.
 */
const COST_PER_SEGMENT_ZMW = 0.48;

// ==================== FALLBACK FORMATTER ====================

const buildCompactBody = async (
  studentId: string,
  term: string,
  year: number,
  options?: SMSFormatOptions
): Promise<{ body: string; segments: SMSSegmentInfo; payload: SMSStudentPayload } | null> => {
  try {
    const formatted = await resultsService.formatStudentResultsSMSAsync(
      studentId,
      term,
      year,
      options
    );
    if (!formatted) return null;
    return {
      body: formatted.body,
      segments: formatted.segments,
      payload: formatted.payload,
    };
  } catch (err) {
    console.error('Failed to build compact SMS body:', err);
    return null;
  }
};

// ==================== SERVICE ====================

export const smsService = {
  // ==================== HEALTH ====================

  healthCheck: async (): Promise<{ status: string; smsConfigured: boolean }> => {
    return { status: 'OK', smsConfigured: true };
  },

  getStudentPhoneInfo: async (studentId: string): Promise<StudentPhoneInfo> => {
    return {
      success: false,
      id: studentId,
      documentId: '',
      name: '',
      hasGuardianPhone: false,
      phoneValid: false,
      phoneCarrier: null,
      formattedPhone: null,
      error: 'Not implemented',
    };
  },

  // ==================== PREVIEW — SINGLE ====================

  previewStudentSMS: async (
    studentId: string,
    term: string,
    year: number,
    options?: SMSFormatOptions
  ): Promise<SMSPreview> => {
    try {
      const built = await buildCompactBody(studentId, term, year, options);

      if (!built) {
        return {
          success: false,
          studentId,
          studentName: '',
          body: '',
          segments: { length: 0, encoding: 'GSM-7', segments: 0 },
          error: 'No results to preview',
        };
      }

      return {
        success: true,
        studentId,
        studentName: built.payload.studentName,
        body: built.body,
        segments: built.segments,
        estimatedCostZmw: built.segments.segments * COST_PER_SEGMENT_ZMW,
      };
    } catch (error: any) {
      return {
        success: false,
        studentId,
        studentName: '',
        body: '',
        segments: { length: 0, encoding: 'GSM-7', segments: 0 },
        error: error.message || 'Preview failed',
      };
    }
  },

  // ==================== PREVIEW — BULK ====================

  previewClassSMS: async (
    classId: string,
    term: string,
    year: number,
    options?: SMSFormatOptions
  ): Promise<ClassSMSPreview> => {
    try {
      console.log(`🔍 Previewing bulk SMS for class ${classId} — ${term} ${year}`);

      const learners = await resultsService.getLearnersInClass(classId);

      const previews = await Promise.all(
        learners.map(learner => smsService.previewStudentSMS(learner.id, term, year, options))
      );

      const ready = previews.filter(p => p.success);
      const skippedNoResults = previews.length - ready.length;

      const totalSegments = ready.reduce((sum, p) => sum + p.segments.segments, 0);
      const totalCharacters = ready.reduce((sum, p) => sum + p.segments.length, 0);

      const encodings = new Set(ready.map(p => p.segments.encoding));
      const encoding: 'GSM-7' | 'UCS-2' | 'mixed' =
        encodings.size === 0
          ? 'GSM-7'
          : encodings.size === 1
          ? (Array.from(encodings)[0] as 'GSM-7' | 'UCS-2')
          : 'mixed';

      const totalCostZmw = totalSegments * COST_PER_SEGMENT_ZMW;

      console.log(
        `📊 Class preview: ${ready.length}/${previews.length} ready, ` +
        `${totalSegments} segments, ZMW ${totalCostZmw.toFixed(2)}`
      );

      return {
        success: ready.length > 0,
        classId,
        term,
        year,
        totalStudents: previews.length,
        readyCount: ready.length,
        skippedNoResults,
        totalSegments,
        totalCharacters,
        averageCharsPerMessage:
          ready.length > 0 ? Math.round(totalCharacters / ready.length) : 0,
        encoding,
        totalCostZmw,
        previews,
      };
    } catch (error: any) {
      console.error('❌ Class preview error:', error);
      return {
        success: false,
        classId,
        term,
        year,
        totalStudents: 0,
        readyCount: 0,
        skippedNoResults: 0,
        totalSegments: 0,
        totalCharacters: 0,
        averageCharsPerMessage: 0,
        encoding: 'GSM-7',
        totalCostZmw: 0,
        previews: [],
        error: error.message || 'Preview failed',
      };
    }
  },

  // ==================== SINGLE SEND ====================

  sendStudentResults: async (
    studentId: string,
    term: string,
    year: number,
    options?: SMSFormatOptions
  ): Promise<SendSMSResponse> => {
    try {
      console.log(`📱 Preparing SMS for ${studentId} — ${term} ${year}`);

      const built = await buildCompactBody(studentId, term, year, options);

      if (!built) {
        throw new Error('No results available for this student');
      }

      const { body, segments, payload } = built;

      console.log(
        `📏 SMS: ${segments.length} chars, ${segments.encoding}, ` +
        `${segments.segments} segment(s) — est. ZMW ${(
          segments.segments * COST_PER_SEGMENT_ZMW
        ).toFixed(2)}`
      );

      if (segments.segments > 1) {
        console.warn(
          `⚠️ Multi-segment SMS (${segments.segments}x cost). ` +
          `Consider shortening the message.`
        );
      }

      const response = await fetch(`${SMS_API_URL}/sendSingleSms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          term,
          year,
          messageBody: body,
          meta: {
            source: 'client-compact-v3',
            segments: segments.segments,
            encoding: segments.encoding,
            charCount: segments.length,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send SMS');
      }

      console.log('✅ SMS sent:', data);

      return {
        ...data,
        studentName: data.studentName || payload.studentName,
        preview: data.preview || body,
        segments,
      } as SendSMSResponse;
    } catch (error: any) {
      console.error('❌ SMS send error:', error);
      throw new Error(error.message || 'Failed to send SMS');
    }
  },

  // ==================== BULK SEND ====================

  bulkSendClass: async (
    classId: string,
    term: string,
    year: number,
    options?: SMSFormatOptions
  ): Promise<BulkSendResponse> => {
    try {
      console.log(`📱 Preparing bulk SMS for class ${classId} — ${term} ${year}`);

      const learners = await resultsService.getLearnersInClass(classId);

      const prepared = await Promise.all(
        learners.map(async learner => {
          const built = await buildCompactBody(learner.id, term, year, options);
          return {
            studentId: learner.id,
            studentName: learner.name,
            body: built?.body || null,
            segments: built?.segments || null,
          };
        })
      );

      const ready = prepared.filter(p => p.body !== null);
      const skippedNoResults = prepared.length - ready.length;

      if (ready.length === 0) {
        throw new Error('No students have results to send');
      }

      const totalSegments = ready.reduce((sum, r) => sum + (r.segments?.segments || 0), 0);
      const totalCharacters = ready.reduce((sum, r) => sum + (r.segments?.length || 0), 0);
      const encodings = new Set(ready.map(r => r.segments?.encoding || 'GSM-7'));
      const encoding: 'GSM-7' | 'UCS-2' | 'mixed' =
        encodings.size === 1
          ? (Array.from(encodings)[0] as 'GSM-7' | 'UCS-2')
          : 'mixed';

      const totalCostZmw = totalSegments * COST_PER_SEGMENT_ZMW;

      console.log(
        `📊 Bulk: ${ready.length} students, ${totalSegments} segments total, ` +
        `avg ${Math.round(totalCharacters / ready.length)} chars — ` +
        `est. ZMW ${totalCostZmw.toFixed(2)}`
      );

      const response = await fetch(`${SMS_API_URL}/bulkSendSms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId,
          term,
          year,
          messages: ready.map(r => ({
            studentId: r.studentId,
            messageBody: r.body,
            segments: r.segments?.segments,
            encoding: r.segments?.encoding,
          })),
          meta: {
            source: 'client-compact-v3',
            totalSegments,
            totalCharacters,
            encoding,
            skippedNoResults,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send bulk SMS');
      }

      console.log(`✅ Bulk SMS complete: ${data.sent}/${data.total} sent`);

      const segmentsByStudent = new Map(
        ready.map(r => [r.studentId, r.segments as SMSSegmentInfo])
      );

      const resultsWithSegments = (data.results || []).map((r: any) => ({
        ...r,
        segments: segmentsByStudent.get(r.studentId),
      }));

      return {
        success: data.success,
        total: data.total,
        sent: data.sent,
        failed: data.failed || 0,
        results: resultsWithSegments,
        failedList: data.failedList || [],
        summary: {
          skippedNoPhone: data.summary?.skippedNoPhone ?? 0,
          skippedNoResults: (data.summary?.skippedNoResults ?? 0) + skippedNoResults,
        },
        campaignId: data.campaignId,
        costEstimate: {
          totalSegments,
          totalCharacters,
          averagePerMessage: ready.length > 0 ? Math.round(totalCharacters / ready.length) : 0,
          encoding,
          totalCostZmw,
        },
      };
    } catch (error: any) {
      console.error('❌ Bulk SMS error:', error);
      throw new Error(error.message || 'Failed to send bulk SMS');
    }
  },

  // ==================== ANNOUNCEMENT PREVIEW ====================

  /**
   * Local-only preview of an announcement. No API call, no Firestore reads.
   * Computes segments + cost from the raw message and recipient count.
   *
   * Use in the modal to show "This will send N SMS segments = ZMW X".
   */
  previewAnnouncement: (message: string, recipientCount: number): AnnouncementPreview => {
    try {
      const trimmed = (message || '').trim();
      if (!trimmed) {
        return {
          success: false,
          body: '',
          segments: { length: 0, encoding: 'GSM-7', segments: 0 },
          recipientCount,
          totalSegments: 0,
          estimatedCostZmw: 0,
          error: 'Message is empty',
        };
      }

      const segments = getSmsSegments(trimmed);
      const totalSegments = segments.segments * Math.max(recipientCount, 0);
      const estimatedCostZmw = totalSegments * COST_PER_SEGMENT_ZMW;

      return {
        success: true,
        body: trimmed,
        segments,
        recipientCount,
        totalSegments,
        estimatedCostZmw,
      };
    } catch (error: any) {
      return {
        success: false,
        body: '',
        segments: { length: 0, encoding: 'GSM-7', segments: 0 },
        recipientCount,
        totalSegments: 0,
        estimatedCostZmw: 0,
        error: error.message || 'Preview failed',
      };
    }
  },

  // ==================== ANNOUNCEMENT SEND ====================

  /**
   * Send a free-form SMS to parents.
   *
   * target = { type: 'all' }                        → every active learner's guardian
   * target = { type: 'student', studentId: '...' }  → one learner's guardian
   *
   * The `studentId` can be either the custom ID (e.g. "G12A_001") or the
   * Firestore document ID. The backend resolves both.
   *
   * Backend: /sendAnnouncement
   */
  sendAnnouncement: async (params: {
    message: string;
    target: AnnouncementTarget;
    senderName: string;
    senderUid: string;
  }): Promise<AnnouncementSendResponse> => {
    try {
      const trimmed = (params.message || '').trim();
      if (!trimmed) {
        throw new Error('Message is required');
      }

      // Compute segments client-side so we can attach them to the response
      const segments = getSmsSegments(trimmed);

      console.log(
        `📢 Sending announcement — target: ${params.target.type}, ` +
        `${segments.length} chars, ${segments.segments} segment(s)`
      );

      const response = await fetch(`${SMS_API_URL}/sendAnnouncement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          target: params.target,
          senderName: params.senderName,
          senderUid: params.senderUid,
          meta: {
            source: 'client-announcement-v1',
            segments: segments.segments,
            encoding: segments.encoding,
            charCount: segments.length,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send announcement');
      }

      console.log(
        `✅ Announcement sent: ${data.sent}/${data.total} ` +
        `(failed: ${data.failed})`
      );

      // Attach segment info + cost estimate to each result
      const resultsWithSegments = (data.results || []).map((r: any) => ({
        ...r,
        segments,
      }));

      const totalSegments = segments.segments * (data.sent || 0);
      const totalCostZmw = totalSegments * COST_PER_SEGMENT_ZMW;

      return {
        success: data.success,
        announcementId: data.announcementId,
        total: data.total,
        sent: data.sent,
        failed: data.failed || 0,
        results: resultsWithSegments,
        failedList: data.failedList || [],
        summary: {
          skippedNoPhone: data.summary?.skippedNoPhone ?? 0,
          skippedInvalid: data.summary?.skippedInvalid ?? 0,
        },
        costEstimate: {
          totalSegments,
          totalCharacters: segments.length * (data.sent || 0),
          averagePerMessage: segments.length,
          encoding: segments.encoding,
          totalCostZmw,
        },
      } as AnnouncementSendResponse;
    } catch (error: any) {
      console.error('❌ Announcement error:', error);
      throw new Error(error.message || 'Failed to send announcement');
    }
  },

  // ==================== LOGS / UTILITIES ====================

  getSMSLogs: async (studentId: string): Promise<SMSLog[]> => {
    console.warn(
      `getSMSLogs(${studentId}): logs are now in Firestore 'sms_logs'.`
    );
    return [];
  },

  canReceiveSMS: (
    learner: { guardianPhone?: string; parentPhone?: string } | null | undefined
  ): boolean => {
    if (!learner) return false;
    const phone = learner.guardianPhone || learner.parentPhone;
    return !!phone && phone.length >= 10;
  },

  formatError: (error: string): string => {
    if (!error) return 'Unknown error';
    if (error.includes('No guardian phone')) {
      return 'No phone number on file for this student';
    }
    if (error.includes('Invalid phone number')) {
      return 'Invalid guardian phone number';
    }
    if (error.includes('No results available')) {
      return 'No results entered for this term/year';
    }
    if (error.includes('No students have results')) {
      return 'No students in this class have results for this term';
    }
    if (error.includes('Student not found')) {
      return 'Student not found in database';
    }
    if (error.includes("Africa's Talking rejected")) {
      return 'Gateway rejected the message';
    }
    if (error.includes('Message is required')) {
      return 'Please write a message before sending';
    }
    if (error.includes('Message exceeds')) {
      return 'Message is too long';
    }
    if (error.includes('This target has')) {
      return 'Too many recipients — split into smaller groups';
    }
    if (error.includes('fetch')) {
      return 'Network error — check your internet connection';
    }
    if (error.includes('Failed to send SMS')) {
      return 'Gateway error — please try again';
    }
    return error;
  },

  // ==================== COST UTILITIES ====================

  estimateCost: (body: string): { segments: SMSSegmentInfo; costZmw: number } => {
    const segments = getSmsSegments(body);
    return {
      segments,
      costZmw: segments.segments * COST_PER_SEGMENT_ZMW,
    };
  },

  formatSegmentsLabel: (segments: SMSSegmentInfo): string => {
    const costStr = (segments.segments * COST_PER_SEGMENT_ZMW).toFixed(2);
    return `${segments.length} chars · ${segments.encoding} · ${segments.segments} SMS · ZMW ${costStr}`;
  },

  COST_PER_SEGMENT_ZMW,
};

// Re-export the formatter and encoding helpers so callers can import them
// from one place.
export {
  formatStudentResultsSMS,
  getSmsSegments,
  type SMSStudentPayload,
  type SMSFormatOptions,
  type SMSSegmentInfo,
};