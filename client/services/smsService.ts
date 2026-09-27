// @/services/smsService.ts — wired to Firebase Cloud Functions backend
// Version 3.0.0 — CBC-aligned subject codes + bulk preflight
//   - Uses SUBJECT_SMS_ABBREVIATIONS from resultsService.ts v7.0.0
//   - Messages average ~140-160 chars (1 SMS) instead of ~264 (2 SMS)
//   - Adds previewClassSMS() for bulk cost estimation before sending

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
  /** Segment metadata returned to caller for cost transparency. */
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
    /** Per-student segment info. */
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
  /** Aggregate cost estimate across the whole batch. */
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

/** NEW: bulk preview — one entry per student + class-level totals. */
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

// ==================== CONFIGURATION ====================

/**
 * Cost per SMS segment in ZMW (Africa's Talking Zambia rates).
 * Update when AT pricing changes. Used only for client-side estimates —
 * the actual billing comes from AT.
 */
const COST_PER_SEGMENT_ZMW = 0.48;

// ==================== FALLBACK FORMATTER ====================
// If the backend hasn't yet adopted the compact format, the client-side
// formatter in resultsService is used to guarantee short messages.
// This wrapper keeps the caller simple — always returns a compact body.

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

  /** Firebase Functions backend has no health endpoint — stub. */
  healthCheck: async (): Promise<{ status: string; smsConfigured: boolean }> => {
    return { status: 'OK', smsConfigured: true };
  },

  /** Not implemented against the new backend — use canReceiveSMS() locally. */
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

  /**
   * Build the exact SMS body that would be sent — without hitting the API.
   * Use in the UI to show users a preview before they confirm.
   */
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

  /**
   * Build previews for every student in a class without sending anything.
   * Returns per-student bodies + class-level cost estimate.
   *
   * Use this to drive a "Confirm send to N students for ZMW X" modal.
   */
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

  /**
   * Send results SMS to a single student's guardian.
   *
   * The compact body is built client-side (from Firestore) and sent to the
   * backend as `messageBody`. If the backend doesn't accept `messageBody`,
   * it will fall back to building its own — but the client-side compact
   * version is preferred and cuts cost roughly in half.
   */
  sendStudentResults: async (
    studentId: string,
    term: string,
    year: number,
    options?: SMSFormatOptions
  ): Promise<SendSMSResponse> => {
    try {
      console.log(`📱 Preparing SMS for ${studentId} — ${term} ${year}`);

      // 1) Build the compact body locally
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

      // 2) Send to backend, including the pre-formatted body.
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

  /**
   * Bulk send results to all active students in a class.
   *
   * Compact bodies are built in parallel on the client and shipped to the
   * backend as an array. The backend can then skip its own formatting.
   */
  bulkSendClass: async (
    classId: string,
    term: string,
    year: number,
    options?: SMSFormatOptions
  ): Promise<BulkSendResponse> => {
    try {
      console.log(`📱 Preparing bulk SMS for class ${classId} — ${term} ${year}`);

      // 1) Load all learners in the class and pre-build compact bodies
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

      // 2) Aggregate cost estimate
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

      // 3) Send the pre-built bodies to the backend
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

      // 4) Merge client-side segment info into per-student results
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

  // ==================== LOGS / UTILITIES ====================

  /** Logs live in Firestore `sms_logs` — stub so callers don't break. */
  getSMSLogs: async (studentId: string): Promise<SMSLog[]> => {
    console.warn(
      `getSMSLogs(${studentId}): logs are now in Firestore 'sms_logs'.`
    );
    return [];
  },

  /** Local check — no API call. */
  canReceiveSMS: (
    learner: { guardianPhone?: string; parentPhone?: string } | null | undefined
  ): boolean => {
    if (!learner) return false;
    const phone = learner.guardianPhone || learner.parentPhone;
    return !!phone && phone.length >= 10;
  },

  /** Translate backend error strings into user-friendly messages. */
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
    if (error.includes('fetch')) {
      return 'Network error — check your internet connection';
    }
    if (error.includes('Failed to send SMS')) {
      return 'Gateway error — please try again';
    }
    return error;
  },

  // ==================== COST UTILITIES (exported for UI) ====================

  /**
   * Estimate SMS cost for a raw body without sending.
   * Handy for "What will this cost?" previews.
   */
  estimateCost: (body: string): { segments: SMSSegmentInfo; costZmw: number } => {
    const segments = getSmsSegments(body);
    return {
      segments,
      costZmw: segments.segments * COST_PER_SEGMENT_ZMW,
    };
  },

  /** Format a segments object for display. */
  formatSegmentsLabel: (segments: SMSSegmentInfo): string => {
    const costStr = (segments.segments * COST_PER_SEGMENT_ZMW).toFixed(2);
    return `${segments.length} chars · ${segments.encoding} · ${segments.segments} SMS · ZMW ${costStr}`;
  },

  /** Expose the per-segment rate for callers that compute their own totals. */
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