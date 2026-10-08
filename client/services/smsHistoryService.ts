// @/services/smsHistoryService.ts
// Companion to smsService — same fetch-based pattern, same base URL.
// Powers the SMS History panel and the retry endpoints.

const SMS_API_URL =
  import.meta.env.VITE_SMS_API_URL ||
  'http://localhost:5001/catalyst-f1b1a/us-central1';

// ==================== TYPES ====================

export type SmsStatus =
  | 'PENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'REJECTED'
  | 'UNDELIVERED'
  | string;

export interface SmsHistoryItem {
  id: string;
  to: string | null;
  message: string;
  status: SmsStatus;
  attempts: number;
  providerMessageId: string | null;
  cost: number | null;
  error: string | null;
  statusCode: string | null;

  /** Custom student ID (e.g. "G10E_001"). */
  studentId: string | null;
  /** Firestore learner document ID — used for edits like guardianPhone. */
  studentDocumentId: string | null;
  studentName: string | null;
  guardianPhone: string | null;
  carrier: string | null;

  term: string | null;
  year: number | null;
  classId: string | null;
  type: 'single' | 'bulk' | 'announcement' | string | null;
  campaignId: string | null;
  announcementId: string | null;

  createdAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;

  deliveryReport: {
    status: string | null;
    phoneNumber: string | null;
    failureReason: string | null;
    updatedAt: string | null;
  } | null;
}

export interface SmsHistoryFilters {
  limit?: number;
  status?: string;
  type?: string;
  classId?: string;
  term?: string;
  year?: number;
  studentId?: string;
  cursor?: string;
}

export interface SmsHistoryResponse {
  success: boolean;
  messages: SmsHistoryItem[];
  nextCursor: string | null;
  hasMore: boolean;
  count: number;
}

export interface RetryResult {
  messageId: string;
  status: 'sent' | 'failed' | 'skipped';
  studentName?: string | null;
  reason?: string;
}

export interface RetryResponse {
  success: boolean;
  total: number;
  retried: number;
  failed: number;
  skipped: number;
  results: RetryResult[];
}

// ==================== HELPERS ====================

const post = async <T>(path: string, body: any): Promise<T> => {
  const res = await fetch(`${SMS_API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }

  return data as T;
};

// ==================== SERVICE ====================

export const smsHistoryService = {
  /**
   * Fetch paginated SMS history, newest first.
   * All filters are optional; omit them for the full log.
   */
  getHistory: (filters: SmsHistoryFilters = {}): Promise<SmsHistoryResponse> =>
    post<SmsHistoryResponse>('/getSmsHistory', filters),

  /**
   * Retry multiple messages at once (max 100 per request).
   * Only FAILED / REJECTED / UNDELIVERED / PENDING statuses are retryable,
   * up to MAX_RETRIES (3) attempts per message.
   */
  retry: (messageIds: string[]): Promise<RetryResponse> =>
    post<RetryResponse>('/retrySms', { messageIds }),

  /**
   * Retry a single message.
   */
  retryOne: (messageId: string): Promise<RetryResponse> =>
    post<RetryResponse>('/retrySms', { messageId }),
};