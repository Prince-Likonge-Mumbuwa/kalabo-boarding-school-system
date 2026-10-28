// @/components/AnnouncementModal.tsx
// Send a free-form SMS to all parents or one specific parent, or summon one
// parent to the office with a ready-made one-SMS template.

import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Loader2, Users, User, Search, Send, AlertTriangle, CheckCircle, MessageSquare, Building2 } from 'lucide-react';
import { smsService } from '@/services/smsService';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import {
  ONE_SMS,
  PLACE_LABEL,
  SIGNER_LABEL,
  buildSummonsMessage,
  nextSchoolDay,
  smsLength,
  toGsm7,
  type SummonsPlace,
  type SummonsSigner,
} from '@/services/smsTemplates';

interface AnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  senderName: string;
  senderUid: string;
  onSuccess?: (summary: { sent: number; failed: number; total: number }) => void;
}

type TargetMode = 'all' | 'student';
type MessageKind = 'free' | 'summons';

const PHONE_KEY = 'summons.callbackPhone';
const readPhone = () => {
  try { return localStorage.getItem(PHONE_KEY) ?? ''; } catch { return ''; }
};
const savePhone = (v: string) => {
  try { localStorage.setItem(PHONE_KEY, v); } catch { /* private window */ }
};

const MAX_LENGTH = 480;
const WARN_LENGTH = 160;

export const AnnouncementModal = ({
  isOpen,
  onClose,
  senderName,
  senderUid,
  onSuccess,
}: AnnouncementModalProps) => {
  const [mode, setMode] = useState<TargetMode>('all');
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; name: string; studentId: string; className?: string } | null>(null);
  const [kind, setKind] = useState<MessageKind>('free');
  const [summons, setSummons] = useState<{ date: string; time: string; place: SummonsPlace; signer: SummonsSigner; phone: string }>(() => ({
    date: nextSchoolDay(), time: '09:00', place: 'head', signer: 'Head', phone: '',
  }));
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);

  const { learners } = useSchoolLearners();
  const searchRef = useRef<HTMLInputElement>(null);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode('all');
      setKind('free');
      setSummons({ date: nextSchoolDay(), time: '09:00', place: 'head', signer: 'Head', phone: readPhone() });
      setMessage('');
      setSearchTerm('');
      setSelectedStudent(null);
      setIsSending(false);
      setError(null);
      setResult(null);
    }
  }, [isOpen]);

  // Filter learners for search
  const searchResults = useMemo(() => {
    if (!searchTerm || searchTerm.length < 2) return [];
    const q = searchTerm.toLowerCase();
    return learners
      .filter(l =>
        (l.fullName || l.name || '').toLowerCase().includes(q) ||
        (l.studentId || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [learners, searchTerm]);

  const isSummons = mode === 'student' && kind === 'summons';

  // The summons text is rebuilt whenever its details change (edits to the
  // text itself are kept until then).
  useEffect(() => {
    if (!isSummons || !selectedStudent) return;
    setMessage(buildSummonsMessage({
      learnerName: selectedStudent.name,
      className: selectedStudent.className,
      ...summons,
    }));
  }, [isSummons, selectedStudent, summons]);

  const setSummonsField = <K extends keyof typeof summons>(k: K, v: (typeof summons)[K]) =>
    setSummons(prev => ({ ...prev, [k]: v }));

  const charCount = message.length;
  const len = smsLength(message);
  const smsSegments = Math.max(1, len.sms);
  const overLimit = isSummons ? len.sms > 1 : charCount > MAX_LENGTH;
  const canSend = message.trim().length > 0
    && !overLimit
    && (mode === 'all' || !!selectedStudent)
    && (!isSummons || (!!summons.date && !!summons.time))
    && !isSending;

  const handleSend = async () => {
    if (!canSend) return;
    setIsSending(true);
    setError(null);

    try {
      const target = mode === 'all'
        ? { type: 'all' as const }
        : { type: 'student' as const, studentId: selectedStudent!.studentId };

      if (isSummons) savePhone(summons.phone);
      const response = await smsService.sendAnnouncement({
        message: message.trim(),
        target,
        senderName,
        senderUid,
        ...(isSummons && {
          category: 'summons' as const,
          summons: { date: summons.date, time: summons.time, place: PLACE_LABEL[summons.place], signer: SIGNER_LABEL[summons.signer] },
        }),
      });

      setResult({
        sent: response.sent,
        failed: response.failed,
        total: response.total,
      });

      // Auto-close after 3s
      setTimeout(() => {
        onSuccess?.({ sent: response.sent, failed: response.failed, total: response.total });
        onClose();
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to send announcement');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  // ---------- Success view ----------
  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">{isSummons ? 'Summons Sent' : 'Announcement Sent'}</h2>
            <p className="text-sm text-gray-600 mb-4">
              Delivered to <strong>{result.sent}</strong> of <strong>{result.total}</strong> parents.
              {result.failed > 0 && (
                <span className="block mt-1 text-amber-700">
                  {result.failed} failed — see Firestore logs for details.
                </span>
              )}
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Main form view ----------
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Send Announcement</h2>
              <p className="text-xs text-gray-500 mt-0.5">Send an SMS to parents</p>
            </div>
            <button onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" disabled={isSending}>
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {/* Target selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Recipients</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { setMode('all'); if (kind === 'summons') { setKind('free'); setMessage(''); } }}
                  disabled={isSending}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                    mode === 'all'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${mode === 'all' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                    <Users size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-900">All Parents</p>
                    <p className="text-xs text-gray-500 truncate">Every active learner's guardian</p>
                  </div>
                </button>

                <button
                  onClick={() => setMode('student')}
                  disabled={isSending}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                    mode === 'student'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${mode === 'student' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                    <User size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-900">One Parent</p>
                    <p className="text-xs text-gray-500 truncate">Pick a specific student</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Student search (only when mode = student) */}
            {mode === 'student' && (
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Search Student</label>
                {selectedStudent ? (
                  <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div>
                      <p className="font-medium text-sm text-gray-900">{selectedStudent.name}</p>
                      <p className="text-xs text-gray-500">{selectedStudent.studentId}</p>
                    </div>
                    <button
                      onClick={() => setSelectedStudent(null)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      disabled={isSending}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      ref={searchRef}
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Type at least 2 characters..."
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={isSending}
                    />
                    {searchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                        {searchResults.map((learner) => (
                          <button
                            key={learner.id}
                            onClick={() => {
                              setSelectedStudent({
                                id: learner.id,
                                name: learner.fullName || learner.name || 'Unknown',
                                studentId: learner.studentId,
                                className: learner.className,
                              });
                              setSearchTerm('');
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                          >
                            <p className="text-sm font-medium text-gray-900">
                              {learner.fullName || learner.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {learner.studentId} • {learner.className}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchTerm.length >= 2 && searchResults.length === 0 && (
                      <p className="mt-2 text-xs text-gray-500">No students found</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Message type (one parent only) */}
            {mode === 'student' && (
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Message type</label>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Message type">
                  {([
                    ['free', MessageSquare, 'Free message', 'Type your own text'],
                    ['summons', Building2, 'Summon to office', 'Ready-made, 1 SMS'],
                  ] as const).map(([k, Icon, title, sub]) => (
                    <button
                      key={k}
                      role="radio"
                      aria-checked={kind === k}
                      onClick={() => { if (kind !== k) { setKind(k); setMessage(''); } }}
                      disabled={isSending}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                        kind === k ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${kind === k ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                        <Icon size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-gray-900">{title}</p>
                        <p className="text-xs text-gray-500 truncate">{sub}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Summons details */}
            {isSummons && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-700">Date</span>
                  <input
                    type="date"
                    aria-label="Summons date"
                    value={summons.date}
                    onChange={e => setSummonsField('date', e.target.value)}
                    disabled={isSending}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-700">Time</span>
                  <input
                    type="time"
                    aria-label="Summons time"
                    value={summons.time}
                    onChange={e => setSummonsField('time', e.target.value)}
                    disabled={isSending}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-700">Report to</span>
                  <select
                    aria-label="Report to"
                    value={summons.place}
                    onChange={e => setSummonsField('place', e.target.value as SummonsPlace)}
                    disabled={isSending}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    {(Object.keys(PLACE_LABEL) as SummonsPlace[]).map(k => (
                      <option key={k} value={k}>{PLACE_LABEL[k].replace(/^the /, '').replace(/^./, c => c.toUpperCase())}</option>
                    ))}
                  </select>
                </label>
                <fieldset>
                  <legend className="mb-1 block text-xs font-medium text-gray-700">Sign as</legend>
                  <div className="flex gap-2">
                    {(Object.keys(SIGNER_LABEL) as SummonsSigner[]).map(k => (
                      <label
                        key={k}
                        className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center text-sm ${
                          summons.signer === k ? 'border-blue-500 bg-blue-50 font-medium text-blue-800' : 'border-gray-300 text-gray-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="summons-signer"
                          className="sr-only"
                          checked={summons.signer === k}
                          onChange={() => setSummonsField('signer', k)}
                          disabled={isSending}
                        />
                        {k}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-gray-700">Call-back number (optional)</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    aria-label="Call-back number"
                    value={summons.phone}
                    onChange={e => setSummonsField('phone', e.target.value)}
                    placeholder="e.g. 0977 123 456"
                    disabled={isSending}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <span className="mt-1 block text-[11px] text-gray-500">Left out automatically if the message would not fit in one SMS.</span>
                </label>
                {!selectedStudent && (
                  <p className="sm:col-span-2 text-xs text-gray-500">Choose the learner above to see the message.</p>
                )}
              </div>
            )}

            {/* Message */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-semibold text-gray-900">{isSummons ? 'Message preview' : 'Message'}</label>
                <span className={`text-xs ${overLimit ? 'text-red-600 font-semibold' : 'text-gray-500'}`} aria-label="Message length">
                  {isSummons ? `${len.chars} / ${ONE_SMS}` : `${charCount} / ${MAX_LENGTH}`} • {smsSegments} SMS{smsSegments > 1 ? 'es' : ''}
                </span>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(isSummons ? toGsm7(e.target.value) : e.target.value)}
                aria-label="Message"
                placeholder={isSummons ? 'The message appears here once you choose the learner.' : 'Type your announcement here... e.g. School closes for mid-term on Friday 3rd Oct at 12:00. Buses depart at 13:00.'}
                rows={isSummons ? 4 : 6}
                disabled={isSending || (isSummons && !selectedStudent)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              {isSummons && overLimit && (
                <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  A summons must fit in one SMS ({ONE_SMS} characters). Shorten the text.
                </p>
              )}
              {!isSummons && charCount > WARN_LENGTH && !overLimit && (
                <p className="mt-1 text-xs text-amber-700 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  This will be sent as {smsSegments} separate SMS messages per recipient.
                </p>
              )}
              {!isSummons && overLimit && (
                <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  Message exceeds {MAX_LENGTH} characters. Shorten it.
                </p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
            <p className="text-xs text-gray-500">
              {mode === 'all'
                ? 'Sending to all active parents'
                : selectedStudent
                ? `${isSummons ? 'Summoning' : 'Sending to'} ${selectedStudent.name}'s guardian`
                : 'Select a student to continue'}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                disabled={isSending}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                {isSending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Send
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};