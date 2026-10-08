// @/components/SmsHistoryPanel.tsx
// SMS history log with filters, per-row retry, and bulk retry of failed sends.
// Includes inline phone-number editing for failures caused by bad numbers.

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MessageCircle,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Filter,
  ChevronDown,
  RotateCw,
  Send,
  AlertTriangle,
  X,
  Eye,
  Pencil,
} from 'lucide-react';
import {
  smsHistoryService,
  SmsHistoryItem,
  SmsHistoryFilters,
} from '@/services/smsHistoryService';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import EditPhoneInline from '@/components/EditPhoneInline';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface SmsHistoryPanelProps {
  classId?: string;
  term?: string;
  year?: number;
  onRetryComplete?: () => void;
  addToast: (type: ToastType, title: string, message: string) => void;
}

const RETRYABLE = ['FAILED', 'REJECTED', 'UNDELIVERED', 'PENDING'];
const MAX_RETRIES = 3;

const statusConfig = (status: string) => {
  switch (status) {
    case 'DELIVERED':
      return { cls: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Delivered' };
    case 'SENT':
      return { cls: 'bg-blue-100 text-blue-800', icon: Send, label: 'Sent' };
    case 'PENDING':
      return { cls: 'bg-yellow-100 text-yellow-800', icon: Clock, label: 'Pending' };
    case 'FAILED':
      return { cls: 'bg-red-100 text-red-800', icon: XCircle, label: 'Failed' };
    case 'REJECTED':
      return { cls: 'bg-red-100 text-red-800', icon: XCircle, label: 'Rejected' };
    case 'UNDELIVERED':
      return { cls: 'bg-red-100 text-red-800', icon: XCircle, label: 'Undelivered' };
    default:
      return { cls: 'bg-gray-100 text-gray-800', icon: Clock, label: status };
  }
};

const fmtDate = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Detects whether a message failed because of a bad/missing phone number.
 * Used to decide whether to show the "Edit phone number" link.
 */
const isPhoneFailure = (msg: SmsHistoryItem): boolean => {
  const reason = (msg.error || msg.deliveryReport?.failureReason || '').toLowerCase();
  return (
    reason.includes('phone') ||
    reason.includes('number') ||
    reason.includes('invalid') ||
    !msg.guardianPhone
  );
};

export const SmsHistoryPanel = ({
  classId,
  term,
  year,
  onRetryComplete,
  addToast,
}: SmsHistoryPanelProps) => {
  const { updateLearner } = useSchoolLearners();

  const [messages, setMessages] = useState<SmsHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [classFilter, setClassFilter] = useState(classId || '');
  const [showFilters, setShowFilters] = useState(false);

  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [bulkRetrying, setBulkRetrying] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewMessage, setPreviewMessage] = useState<SmsHistoryItem | null>(null);

  // Inline phone editing state
  const [editingPhoneFor, setEditingPhoneFor] = useState<string | null>(null);
  const [savingPhoneFor, setSavingPhoneFor] = useState<string | null>(null);
  const [phoneErrors, setPhoneErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (classId !== undefined) setClassFilter(classId);
  }, [classId]);

  const fetchHistory = useCallback(
    async (reset: boolean) => {
      setIsLoading(true);
      try {
        const filters: SmsHistoryFilters = {
          limit: 50,
          status: statusFilter || undefined,
          type: typeFilter || undefined,
          classId: classFilter || undefined,
          term: term || undefined,
          year: year || undefined,
          cursor: reset ? undefined : nextCursor || undefined,
        };
        const res = await smsHistoryService.getHistory(filters);
        setMessages(prev => (reset ? res.messages : [...prev, ...res.messages]));
        setNextCursor(res.nextCursor);
        setHasMore(res.hasMore);
      } catch (err: any) {
        addToast('error', 'History Load Failed', err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [statusFilter, typeFilter, classFilter, term, year, nextCursor, addToast]
  );

  useEffect(() => {
    fetchHistory(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, typeFilter, classFilter, term, year]);

  const handleRetryOne = async (messageId: string) => {
    setRetryingIds(prev => new Set(prev).add(messageId));
    try {
      const r = await smsHistoryService.retryOne(messageId);
      const res = r.results[0];
      if (res?.status === 'sent') {
        addToast('success', 'Retry Sent', 'Message re-sent successfully');
      } else if (res?.status === 'skipped') {
        addToast('warning', 'Skipped', res.reason || 'Not retryable');
      } else {
        addToast('error', 'Retry Failed', res?.reason || 'Unknown error');
      }
      await fetchHistory(true);
      onRetryComplete?.();
    } catch (err: any) {
      addToast('error', 'Retry Error', err.message);
    } finally {
      setRetryingIds(prev => {
        const n = new Set(prev);
        n.delete(messageId);
        return n;
      });
    }
  };

  const handleBulkRetry = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!confirm(`Retry ${ids.length} message(s)?`)) return;

    setBulkRetrying(true);
    try {
      const r = await smsHistoryService.retry(ids);
      const type: ToastType =
        r.failed > 0 && r.retried === 0
          ? 'error'
          : r.failed > 0
          ? 'warning'
          : 'success';
      addToast(
        type,
        'Bulk Retry Complete',
        `Retried: ${r.retried} | Failed: ${r.failed} | Skipped: ${r.skipped}`
      );
      setSelectedIds(new Set());
      await fetchHistory(true);
      onRetryComplete?.();
    } catch (err: any) {
      addToast('error', 'Bulk Retry Error', err.message);
    } finally {
      setBulkRetrying(false);
    }
  };

  const handleRetryAllFailed = () => {
    const ids = messages
      .filter(
        m => RETRYABLE.includes(m.status) && (m.attempts || 0) < MAX_RETRIES
      )
      .map(m => m.id);
    if (ids.length === 0) {
      addToast('info', 'Nothing to Retry', 'No retryable messages found');
      return;
    }
    handleBulkRetry(ids);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectAllRetryable = () => {
    const ids = messages
      .filter(
        m => RETRYABLE.includes(m.status) && (m.attempts || 0) < MAX_RETRIES
      )
      .map(m => m.id);
    setSelectedIds(new Set(ids));
  };

  // ---------- Phone edit ----------
  const handleSavePhone = async (msg: SmsHistoryItem, normalizedPhone: string) => {
    if (!msg.studentDocumentId) {
      throw new Error('Missing learner document ID on this message');
    }

    setSavingPhoneFor(msg.id);
    setPhoneErrors(prev => {
      const n = { ...prev };
      delete n[msg.id];
      return n;
    });

    try {
      await updateLearner({
        learnerId: msg.studentDocumentId,
        updates: { guardianPhone: normalizedPhone },
      });

      setEditingPhoneFor(null);
      addToast(
        'success',
        'Phone updated',
        `New number saved: ${normalizedPhone}`
      );

      if (confirm('Phone updated. Retry this message now?')) {
        await handleRetryOne(msg.id);
      } else {
        await fetchHistory(true);
      }
    } catch (err: any) {
      setPhoneErrors(prev => ({
        ...prev,
        [msg.id]: err?.message || 'Failed to save',
      }));
      throw err;
    } finally {
      setSavingPhoneFor(null);
    }
  };

  const handleCancelEdit = (msgId: string) => {
    setEditingPhoneFor(null);
    setPhoneErrors(prev => {
      const n = { ...prev };
      delete n[msgId];
      return n;
    });
  };

  const stats = useMemo(() => {
    const total = messages.length;
    const delivered = messages.filter(m => m.status === 'DELIVERED').length;
    const failed = messages.filter(m =>
      ['FAILED', 'REJECTED', 'UNDELIVERED'].includes(m.status)
    ).length;
    const pending = messages.filter(
      m => m.status === 'PENDING' || m.status === 'SENT'
    ).length;
    return { total, delivered, failed, pending };
  }, [messages]);

  const retryableCount = useMemo(
    () =>
      messages.filter(
        m => RETRYABLE.includes(m.status) && (m.attempts || 0) < MAX_RETRIES
      ).length,
    [messages]
  );

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <MessageCircle size={20} className="text-blue-600" />
              <h3 className="font-semibold text-gray-900">SMS History</h3>
              <span className="text-xs text-gray-500">({stats.total} loaded)</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {selectedIds.size > 0 && (
                <>
                  <button
                    onClick={() => handleBulkRetry(Array.from(selectedIds))}
                    disabled={bulkRetrying}
                    className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-xs"
                  >
                    {bulkRetrying ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <RotateCw size={14} />
                    )}
                    Retry {selectedIds.size} selected
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="p-1.5 text-gray-500 hover:text-gray-700 rounded-lg"
                  >
                    <X size={14} />
                  </button>
                </>
              )}
              {selectedIds.size === 0 && retryableCount > 0 && (
                <button
                  onClick={handleRetryAllFailed}
                  disabled={bulkRetrying}
                  className="flex items-center gap-1 px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 disabled:opacity-50 text-xs"
                >
                  {bulkRetrying ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RotateCw size={14} />
                  )}
                  Retry all failed ({retryableCount})
                </button>
              )}
              <button
                onClick={() => setShowFilters(s => !s)}
                className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-xs"
              >
                <Filter size={14} />
                Filters
                <ChevronDown
                  size={14}
                  className={showFilters ? 'rotate-180' : ''}
                />
              </button>
              <button
                onClick={() => fetchHistory(true)}
                disabled={isLoading}
                className="p-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="mt-3 flex gap-3 text-xs overflow-x-auto">
            <span className="text-green-600">● Delivered: {stats.delivered}</span>
            <span className="text-red-600">● Failed: {stats.failed}</span>
            <span className="text-yellow-600">● Pending: {stats.pending}</span>
          </div>

          {showFilters && (
            <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="">All statuses</option>
                <option value="DELIVERED">Delivered</option>
                <option value="SENT">Sent</option>
                <option value="PENDING">Pending</option>
                <option value="FAILED">Failed</option>
                <option value="REJECTED">Rejected</option>
                <option value="UNDELIVERED">Undelivered</option>
              </select>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="">All types</option>
                <option value="single">Single</option>
                <option value="bulk">Bulk</option>
                <option value="announcement">Announcement</option>
              </select>
              <input
                type="text"
                placeholder="Class ID filter..."
                value={classFilter}
                onChange={e => setClassFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          )}
        </div>

        {/* List */}
        <div className="max-h-[560px] overflow-y-auto">
          {isLoading && messages.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-blue-600" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">No SMS history found</p>
            </div>
          ) : (
            <>
              {retryableCount > 0 && (
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
                  <span className="text-xs text-amber-800">
                    {retryableCount} retryable message(s)
                  </span>
                  <button
                    onClick={selectAllRetryable}
                    className="text-xs text-amber-700 hover:text-amber-900 font-medium"
                  >
                    Select all retryable
                  </button>
                </div>
              )}

              {messages.map(msg => {
                const cfg = statusConfig(msg.status);
                const Icon = cfg.icon;
                const isRetryable =
                  RETRYABLE.includes(msg.status) &&
                  (msg.attempts || 0) < MAX_RETRIES;
                const isRetrying = retryingIds.has(msg.id);
                const isSelected = selectedIds.has(msg.id);
                const canEditPhone =
                  isPhoneFailure(msg) && !!msg.studentDocumentId;

                return (
                  <div
                    key={msg.id}
                    className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 ${
                      isSelected ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {isRetryable && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(msg.id)}
                          className="mt-1 rounded"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-gray-900 truncate">
                            {msg.studentName || 'Unknown'}
                          </span>
                          <span className="text-xs text-gray-500">
                            {msg.guardianPhone || '(no number)'}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.cls}`}
                          >
                            <Icon size={10} />
                            {cfg.label}
                          </span>
                          {msg.attempts > 0 && (
                            <span className="text-[10px] text-gray-500">
                              attempts: {msg.attempts}/{MAX_RETRIES}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2 break-words">
                          {msg.message}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500 flex-wrap">
                          <span>{fmtDate(msg.createdAt)}</span>
                          {msg.term && (
                            <span>
                              {msg.term} {msg.year}
                            </span>
                          )}
                          {msg.type && <span className="capitalize">{msg.type}</span>}
                          {msg.carrier && <span>{msg.carrier}</span>}
                        </div>
                        {(msg.error || msg.deliveryReport?.failureReason) && (
                          <div className="mt-1 flex items-start gap-1 text-[10px] text-red-600">
                            <AlertTriangle size={10} className="mt-0.5 flex-shrink-0" />
                            <span>
                              {msg.error || msg.deliveryReport?.failureReason}
                            </span>
                          </div>
                        )}

                        {/* Inline phone editor — only for phone-related failures */}
                        {canEditPhone && (
                          editingPhoneFor === msg.id ? (
                            <EditPhoneInline
                              initialValue={msg.guardianPhone}
                              isSaving={savingPhoneFor === msg.id}
                              externalError={phoneErrors[msg.id]}
                              onSave={(normalizedPhone) =>
                                handleSavePhone(msg, normalizedPhone)
                              }
                              onCancel={() => handleCancelEdit(msg.id)}
                            />
                          ) : (
                            <button
                              onClick={() => setEditingPhoneFor(msg.id)}
                              className="mt-2 inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 font-medium"
                            >
                              <Pencil size={10} />
                              Edit phone number
                            </button>
                          )
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => setPreviewMessage(msg)}
                          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"
                          title="Preview"
                        >
                          <Eye size={14} />
                        </button>
                        {isRetryable && (
                          <button
                            onClick={() => handleRetryOne(msg.id)}
                            disabled={isRetrying}
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg disabled:opacity-50"
                            title="Retry"
                          >
                            {isRetrying ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <RotateCw size={14} />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {hasMore && (
                <div className="p-4 text-center">
                  <button
                    onClick={() => fetchHistory(false)}
                    disabled={isLoading}
                    className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                  >
                    {isLoading ? 'Loading...' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Preview modal */}
      {previewMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setPreviewMessage(null)}
          />
          <div className="relative bg-white rounded-xl max-w-lg w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Message Preview</h3>
              <button
                onClick={() => setPreviewMessage(null)}
                className="p-1 text-gray-500 hover:text-gray-700"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-500">To: </span>
                {previewMessage.guardianPhone}
              </div>
              <div>
                <span className="text-gray-500">Student: </span>
                {previewMessage.studentName}
              </div>
              <div>
                <span className="text-gray-500">Status: </span>
                {previewMessage.status}
              </div>
              {previewMessage.error && (
                <div className="text-red-600">
                  <span className="text-gray-500">Error: </span>
                  {previewMessage.error}
                </div>
              )}
              <div className="pt-2 border-t border-gray-100">
                <pre className="whitespace-pre-wrap text-xs text-gray-800 font-mono bg-gray-50 p-3 rounded-lg">
                  {previewMessage.message}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SmsHistoryPanel;