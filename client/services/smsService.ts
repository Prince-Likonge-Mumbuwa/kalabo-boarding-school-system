// @/services/smsService.ts — wired to Firebase Cloud Functions backend
// Version 3.3.0
//   - Cost corrected to ZMW 0.24 per segment (Africa's Talking Zambia)
//   - Adds messageId + studentDocumentId to bulk + announcement results/failures
//   - Adds bulkSendAllClasses() for cross-class bulk sends

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
    /** Firestore `messages` doc ID. */
    messageId?: string;
    /** Firestore `learners` doc ID — used for editing phone on retry. */
    studentDocumentId?: string;
    /** Per-student segment info. */
    segments?: SMSSegmentInfo;
  }>;
  failedList: Array<{
    studentId: string;
    studentName?: string;
    reason: string;
    /** Firestore `messages` doc ID — present when the doc was created. */
    messageId?: string;
    /** Firestore `learners` doc ID — used for editing phone on retry. */
    studentDocumentId?: string;
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

// ==================== BULK ALL CLASSES TYPES ====================

export interface BulkAllClassesResult {
  success: boolean;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  classBreakdown: Array<{
    classId: string;
    className: string;
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    error?: string;
  }>;
  failedList: Array<{
    studentId: string;
    studentName: string;
    className: string;
    reason: string;
    messageId?: string;
    /** Firestore `learners` doc ID — used for editing phone on retry. */
    studentDocumentId?: string;
  }>;
  costEstimate?: {
    totalSegments: number;
    totalCostZmw: number;
    averagePerMessage: number;
    encoding: 'GSM-7' | 'UCS-2' | 'mixed';
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
  /** Ready messages whose report card is still provisional (marks pending). */
  provisionalCount?: number;
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
    /** Firestore `messages` doc ID. */
    messageId?: string;
    /** Firestore `learners` doc ID. */
    studentDocumentId?: string;
    segments?: SMSSegmentInfo;
  }>;
  failedList: Array<{
    studentId: string;
    studentName: string;
    reason: string;
    /** Firestore `messages` doc ID. */
    messageId?: string;
    /** Firestore `learners` doc ID. */
    studentDocumentId?: string;
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
 * Update when AT pricing changes. Used only for client-side estimates —
 * the actual billing comes from AT.
 */
const COST_PER_SEGMENT_ZMW = 0.24;

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

      // One grid load for the whole class — the same report cards the admin
      // sees, so every SMS carries the card's average and grade.
      const { rosterSize, messages } = await resultsService.formatClassResultsSMSAsync(classId, term, year, options);

      const previews: SMSPreview[] = messages.map(m => ({
        success: true,
        studentId: m.studentId,
        studentName: m.studentName,
        body: m.body,
        segments: m.segments,
        estimatedCostZmw: m.segments.segments * COST_PER_SEGMENT_ZMW,
      }));

      const ready = previews;
      const skippedNoResults = Math.max(0, rosterSize - ready.length);
      const provisionalCount = messages.filter(m => m.payload.provisional).length;

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
        totalStudents: rosterSize,
        provisionalCount,
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

  // ==================== BULK SEND (ONE CLASS) ====================

  bulkSendClass: async (
    classId: string,
    term: string,
    year: number,
    options?: SMSFormatOptions
  ): Promise<BulkSendResponse> => {
    try {
      console.log(`📱 Preparing bulk SMS for class ${classId} — ${term} ${year}`);

      // One grid load for the whole class (same cards as the admin view).
      const { rosterSize, messages } = await resultsService.formatClassResultsSMSAsync(classId, term, year, options);
      const ready = messages.map(m => ({
        studentId: m.studentId,
        studentName: m.studentName,
        body: m.body as string | null,
        segments: m.segments as SMSSegmentInfo | null,
      }));
      const skippedNoResults = Math.max(0, rosterSize - ready.length);

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

  // ==================== BULK SEND — ALL CLASSES ====================

  /**
   * Send results SMS to every active learner across multiple classes.
   * Runs sequentially (Africa's Talking rate limits + progress feedback).
   *
   * Each class is sent via bulkSendClass(); results are merged into one
   * aggregate report. Failures carry their Firestore messageId AND
   * studentDocumentId so the UI can offer per-row retry + phone editing.
   */
  bulkSendAllClasses: async (
    term: string,
    year: number,
    classes: Array<{ id: string; name: string }>,
    onProgress?: (current: number, total: number, className: string) => void
  ): Promise<BulkAllClassesResult> => {
    const classBreakdown: BulkAllClassesResult['classBreakdown'] = [];
    const failedList: BulkAllClassesResult['failedList'] = [];

    let totalSent = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let totalRecipients = 0;
    let totalSegments = 0;
    let totalCost = 0;

    for (let i = 0; i < classes.length; i++) {
      const cls = classes[i];
      onProgress?.(i + 1, classes.length, cls.name);

      try {
        const r = await smsService.bulkSendClass(cls.id, term, year);

        classBreakdown.push({
          classId: cls.id,
          className: cls.name,
          total: r.total,
          sent: r.sent,
          failed: r.failed,
          skipped: r.summary?.skippedNoResults ?? 0,
        });

        totalSent += r.sent;
        totalFailed += r.failed;
        totalSkipped += r.summary?.skippedNoResults ?? 0;
        totalRecipients += r.total;

        r.failedList.forEach(f => {
          failedList.push({
            studentId: f.studentId,
            studentName: f.studentName || 'Unknown',
            className: cls.name,
            reason: f.reason,
            messageId: f.messageId,
            studentDocumentId: f.studentDocumentId,
          });
        });

        if (r.costEstimate) {
          totalSegments += r.costEstimate.totalSegments;
          totalCost += r.costEstimate.totalCostZmw;
        }
      } catch (err: any) {
        console.error(`bulkSendAllClasses → ${cls.name} failed:`, err);

        classBreakdown.push({
          classId: cls.id,
          className: cls.name,
          total: 0,
          sent: 0,
          failed: 0,
          skipped: 0,
          error: err.message || 'Class send failed',
        });

        failedList.push({
          studentId: '—',
          studentName: cls.name,
          className: cls.name,
          reason: err.message || 'Class send failed',
        });

        totalFailed += 1;
      }
    }

    return {
      success: true,
      total: totalRecipients,
      sent: totalSent,
      failed: totalFailed,
      skipped: totalSkipped,
      classBreakdown,
      failedList,
      costEstimate:
        totalSegments > 0
          ? {
              totalSegments,
              totalCostZmw: totalCost,
              averagePerMessage:
                totalRecipients > 0
                  ? Math.round(totalSegments / totalRecipients)
                  : 0,
              encoding: 'GSM-7',
            }
          : undefined,
    };
  },

  // ==================== ANNOUNCEMENT PREVIEW ====================

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
      `getSMSLogs(${studentId}): logs are now in Firestore 'messages'.`
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