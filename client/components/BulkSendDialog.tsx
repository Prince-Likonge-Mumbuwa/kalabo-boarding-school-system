// @/components/BulkSendDialog.tsx
// Full-screen dialog for sending results SMS to ALL classes.
// Three stages: preflight → sending (live progress) → results.
//
// The admin can override the term + year inside the preflight stage;
// defaults come from the parent (ReportCards.tsx).

import { useState } from 'react';
import {
  X,
  Loader2,
  CheckCircle,
  AlertTriangle,
  RotateCw,
  Send,
  ChevronDown,
  ChevronUp,
  Pencil,
  Calendar,
} from 'lucide-react';
import { smsService, BulkAllClassesResult } from '@/services/smsService';
import { smsHistoryService } from '@/services/smsHistoryService';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import EditPhoneInline from '@/components/EditPhoneInline';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface BulkSendDialogProps {
  isOpen: boolean;
  onClose: () => void;
  classes: Array<{ id: string; name: string }>;
  term: string;
  year: number;
  onComplete: () => void;
  addToast: (type: ToastType, title: string, message: string) => void;
}

type Stage = 'preflight' | 'sending' | 'results';

const ALL_TERMS = ['Term 1', 'Term 2', 'Term 3'];

const getYearOptions = (): number[] => {
  const current = new Date().getFullYear();
  return [current - 2, current - 1, current, current + 1, current + 2];
};

const isPhoneFailureReason = (reason: string): boolean => {
  const r = (reason || '').toLowerCase();
  return r.includes('phone') || r.includes('number') || r.includes('invalid');
};

export const BulkSendDialog = ({
  isOpen,
  onClose,
  classes,
  term,
  year,
  onComplete,
  addToast,
}: BulkSendDialogProps) => {
  const { updateLearner } = useSchoolLearners();

  const [stage, setStage] = useState<Stage>('preflight');

  // Term/year the admin actually sends with — seeded from props, editable in preflight
  const [selectedTerm, setSelectedTerm] = useState<string>(term || 'Term 1');
  const [selectedYear, setSelectedYear] = useState<number>(year || new Date().getFullYear());

  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    className: string;
  }>({ current: 0, total: 0, className: '' });

  const [result, setResult] = useState<BulkAllClassesResult | null>(null);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [bulkRetrying, setBulkRetrying] = useState(false);

  // Inline phone editing state
  const [editingPhoneFor, setEditingPhoneFor] = useState<string | null>(null);
  const [savingPhoneFor, setSavingPhoneFor] = useState<string | null>(null);
  const [phoneErrors, setPhoneErrors] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const handleClose = () => {
    if (stage === 'sending') return; // block close while sending
    setStage('preflight');
    setResult(null);
    setExpandedClass(null);
    setRetryingIds(new Set());
    setEditingPhoneFor(null);
    setSavingPhoneFor(null);
    setPhoneErrors({});
    // Reset term/year back to parent defaults so the next open starts clean
    setSelectedTerm(term || 'Term 1');
    setSelectedYear(year || new Date().getFullYear());
    onClose();
  };

  const handleStart = async () => {
    setStage('sending');
    setProgress({ current: 0, total: classes.length, className: '' });

    try {
      const r = await smsService.bulkSendAllClasses(
        selectedTerm,
        selectedYear,
        classes,
        (current, total, className) =>
          setProgress({ current, total, className })
      );
      setResult(r);
      setStage('results');
      onComplete();
    } catch (err: any) {
      addToast('error', 'Bulk Send Failed', err.message);
      setStage('preflight');
    }
  };

  const handleRetryOne = async (messageId: string) => {
    setRetryingIds(prev => new Set(prev).add(messageId));
    try {
      const r = await smsHistoryService.retryOne(messageId);
      const res = r.results[0];
      if (res?.status === 'sent') {
        addToast('success', 'Retried', 'Message sent successfully');
        setResult(prev =>
          prev
            ? {
                ...prev,
                failedList: prev.failedList.filter(f => f.messageId !== messageId),
                sent: prev.sent + 1,
                failed: Math.max(0, prev.failed - 1),
              }
            : prev
        );
      } else {
        addToast(
          res?.status === 'skipped' ? 'warning' : 'error',
          'Retry ' + (res?.status === 'skipped' ? 'Skipped' : 'Failed'),
          res?.reason || 'Unknown'
        );
      }
      onComplete();
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

  const handleRetryAll = async () => {
    if (!result) return;
    const ids = result.failedList
      .map(f => f.messageId)
      .filter((x): x is string => !!x);

    if (ids.length === 0) {
      addToast('info', 'Nothing to Retry', 'No message IDs available for retry');
      return;
    }

    if (!confirm(`Retry ${ids.length} failed message(s)?`)) return;

    setBulkRetrying(true);
    try {
      const r = await smsHistoryService.retry(ids);
      addToast(
        r.failed > 0 ? 'warning' : 'success',
        'Bulk Retry Complete',
        `Retried: ${r.retried} | Failed: ${r.failed} | Skipped: ${r.skipped}`
      );
      onComplete();
      setResult(prev =>
        prev
          ? {
              ...prev,
              failedList: prev.failedList.filter(
                f => !ids.includes(f.messageId || '')
              ),
              sent: prev.sent + r.retried,
              failed: Math.max(0, prev.failed - r.retried),
            }
          : prev
      );
    } catch (err: any) {
      addToast('error', 'Bulk Retry Error', err.message);
    } finally {
      setBulkRetrying(false);
    }
  };

  const handleSavePhone = async (
    messageId: string,
    studentDocumentId: string,
    normalizedPhone: string
  ) => {
    setSavingPhoneFor(messageId);
    setPhoneErrors(prev => {
      const n = { ...prev };
      delete n[messageId];
      return n;
    });

    try {
      await updateLearner({
        learnerId: studentDocumentId,
        updates: { guardianPhone: normalizedPhone },
      });

      setEditingPhoneFor(null);
      addToast('success', 'Phone updated', `New number saved: ${normalizedPhone}`);

      if (confirm('Phone updated. Retry this message now?')) {
        await handleRetryOne(messageId);
      }
    } catch (err: any) {
      setPhoneErrors(prev => ({
        ...prev,
        [messageId]: err?.message || 'Failed to save',
      }));
      throw err;
    } finally {
      setSavingPhoneFor(null);
    }
  };

  const handleCancelEdit = (messageId: string) => {
    setEditingPhoneFor(null);
    setPhoneErrors(prev => {
      const n = { ...prev };
      delete n[messageId];
      return n;
    });
  };

  const yearOptions = getYearOptions();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={stage !== 'sending' ? handleClose : undefined}
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Bulk SMS — All Classes
              </h2>
              <p className="text-xs text-gray-500">
                {selectedTerm} {selectedYear} · {classes.length} classes
              </p>
            </div>
            {stage !== 'sending' && (
              <button
                onClick={handleClose}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto p-6">
            {stage === 'preflight' && (
              <div className="space-y-4">
                {/* ─── Term + Year selectors ─── */}
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Calendar size={16} className="text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-900">
                      Select Term & Year
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Term
                      </label>
                      <select
                        value={selectedTerm}
                        onChange={(e) => setSelectedTerm(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        {ALL_TERMS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Year
                      </label>
                      <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        {yearOptions.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {(selectedTerm !== term || selectedYear !== year) && (
                    <p className="mt-2 text-[11px] text-blue-700">
                      Note: this differs from the currently selected {term} {year} on the page.
                    </p>
                  )}
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    This will send <strong>{selectedTerm} {selectedYear}</strong> results via SMS
                    to guardians of every active learner across all{' '}
                    <strong>{classes.length}</strong> classes.
                  </p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-xs text-amber-800">
                    <strong>Note:</strong> This may take several minutes. Messages
                    are dispatched synchronously. Failed sends will be listed
                    with reasons and can be retried.
                  </p>
                </div>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                  {classes.map(c => (
                    <div
                      key={c.id}
                      className="px-4 py-2 border-b border-gray-50 last:border-0 text-sm"
                    >
                      {c.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stage === 'sending' && (
              <div className="text-center py-8">
                <Loader2 size={48} className="animate-spin text-blue-600 mx-auto mb-4" />
                <p className="text-sm font-medium text-gray-900 mb-1">
                  Sending to class {progress.current} of {progress.total}
                </p>
                <p className="text-xs text-gray-500">{progress.className}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {selectedTerm} {selectedYear}
                </p>
                <div className="mt-4 w-full max-w-md mx-auto">
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-300"
                      style={{
                        width: `${
                          (progress.current / Math.max(progress.total, 1)) * 100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {stage === 'results' && result && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">Total</p>
                    <p className="text-lg font-bold text-gray-900">{result.total}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-green-600">Sent</p>
                    <p className="text-lg font-bold text-green-700">{result.sent}</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-red-600">Failed</p>
                    <p className="text-lg font-bold text-red-700">{result.failed}</p>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-yellow-600">Skipped</p>
                    <p className="text-lg font-bold text-yellow-700">
                      {result.skipped}
                    </p>
                  </div>
                </div>

                {/* Cost estimate */}
                {result.costEstimate && (
                  <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-800">
                    Cost: ZMW {result.costEstimate.totalCostZmw.toFixed(2)} ·{' '}
                    {result.costEstimate.totalSegments} segments · avg{' '}
                    {result.costEstimate.averagePerMessage} chars
                  </div>
                )}

                {/* Class breakdown */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">
                    By Class
                  </h3>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    {result.classBreakdown.map(cb => (
                      <button
                        key={cb.classId}
                        onClick={() =>
                          setExpandedClass(
                            expandedClass === cb.classId ? null : cb.classId
                          )
                        }
                        className="w-full flex items-center justify-between px-4 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-left"
                      >
                        <div className="flex items-center gap-2">
                          {expandedClass === cb.classId ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )}
                          <span className="text-sm font-medium">{cb.className}</span>
                          {cb.error && (
                            <span className="text-[10px] text-red-600">
                              ({cb.error})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-green-600">{cb.sent} sent</span>
                          {cb.failed > 0 && (
                            <span className="text-red-600">{cb.failed} failed</span>
                          )}
                          {cb.skipped > 0 && (
                            <span className="text-yellow-600">
                              {cb.skipped} skipped
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Failures */}
                {result.failedList.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1">
                        <AlertTriangle size={14} className="text-red-600" />
                        Failures ({result.failedList.length})
                      </h3>
                      <button
                        onClick={handleRetryAll}
                        disabled={bulkRetrying}
                        className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-xs"
                      >
                        {bulkRetrying ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <RotateCw size={14} />
                        )}
                        Retry all
                      </button>
                    </div>
                    <div className="border border-red-100 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                      {result.failedList.map((f, i) => {
                        const canEditPhone =
                          isPhoneFailureReason(f.reason) &&
                          !!f.messageId &&
                          !!f.studentDocumentId;

                        return (
                          <div
                            key={`${f.studentId}-${i}`}
                            className="px-4 py-2 border-b border-red-50 last:border-0 flex items-start justify-between gap-3"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {f.studentName}
                                <span className="ml-2 text-xs text-gray-500">
                                  {f.className}
                                </span>
                              </p>
                              <p className="text-xs text-red-600 mt-0.5">{f.reason}</p>

                              {canEditPhone && (
                                editingPhoneFor === f.messageId ? (
                                  <EditPhoneInline
                                    initialValue={null}
                                    isSaving={savingPhoneFor === f.messageId}
                                    externalError={phoneErrors[f.messageId!]}
                                    onSave={(normalizedPhone) =>
                                      handleSavePhone(
                                        f.messageId!,
                                        f.studentDocumentId!,
                                        normalizedPhone
                                      )
                                    }
                                    onCancel={() => handleCancelEdit(f.messageId!)}
                                  />
                                ) : (
                                  <button
                                    onClick={() => setEditingPhoneFor(f.messageId!)}
                                    className="mt-2 inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 font-medium"
                                  >
                                    <Pencil size={10} />
                                    Edit phone number
                                  </button>
                                )
                              )}

                              {isPhoneFailureReason(f.reason) &&
                                !f.messageId && (
                                  <p className="text-[10px] text-amber-700 mt-1">
                                    No message was created for this failure — fix
                                    the number from the student's profile, then
                                    re-run bulk send.
                                  </p>
                                )}
                            </div>
                            {f.messageId && (
                              <button
                                onClick={() => handleRetryOne(f.messageId!)}
                                disabled={retryingIds.has(f.messageId)}
                                className="flex-shrink-0 p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg disabled:opacity-50"
                                title="Retry this"
                              >
                                {retryingIds.has(f.messageId) ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <RotateCw size={14} />
                                )}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {result.failedList.length === 0 && (
                  <div className="text-center py-6">
                    <CheckCircle size={32} className="mx-auto text-green-500 mb-2" />
                    <p className="text-sm text-gray-700">
                      All messages sent successfully!
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
            {stage === 'preflight' && (
              <>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStart}
                  disabled={classes.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
                >
                  <Send size={16} />
                  Send {selectedTerm} {selectedYear}
                </button>
              </>
            )}
            {stage === 'sending' && (
              <p className="text-xs text-gray-500 mr-auto">
                Please wait — do not close this window.
              </p>
            )}
            {stage === 'results' && (
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkSendDialog;