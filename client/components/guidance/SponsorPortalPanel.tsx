// @/components/guidance/SponsorPortalPanel.tsx
//
// The "Sponsor" side of the Parent Portal. A sponsor enters the one-time
// code from the school's guidance office and downloads, in one PDF, the
// report cards of every learner they sponsor — in order of form/grade.
//
// Order of work, so a code is never wasted:
//   1. check the code (not used, not cancelled, not expired) — nothing spent;
//   2. build all report cards and the PDF;
//   3. spend the code (transaction — fails if someone used it meanwhile);
//   4. hand over the PDF. It can be saved again until the page is left.

import { useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileText, KeyRound, Loader2 } from 'lucide-react';
import { buildSponsorReports, checkSponsorCode, redeemSponsorCode, type SponsorReports } from '@/services/guidanceService';
import { levelHeading } from '@/services/guidancePlan';
import type { SponsorCode } from '@/types/guidance';

type Stage = 'idle' | 'checking' | 'loading' | 'pdf' | 'redeeming' | 'done';

export function SponsorPortalPanel() {
  const [typed, setTyped] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [code, setCode] = useState<SponsorCode | null>(null);
  const [reports, setReports] = useState<SponsorReports | null>(null);
  const [pdf, setPdf] = useState<{ bytes: Uint8Array; name: string } | null>(null);
  const [error, setError] = useState('');

  const busy = stage !== 'idle' && stage !== 'done';

  const save = async (file = pdf) => {
    if (!file) return;
    const { downloadPdf } = await import('@/services/pdf/sponsorReportsPDF');
    downloadPdf(file.bytes, file.name);
  };

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCode(null);
    setReports(null);
    setPdf(null);
    try {
      setStage('checking');
      const found = await checkSponsorCode(typed);
      setCode(found);

      setStage('loading');
      setProgress([0, found.learnerIds.length]);
      const r = await buildSponsorReports(found.learnerIds, found.term, found.year, {
        publicView: true,
        onProgress: (d, t) => setProgress([d, t]),
      });
      setReports(r);
      if (r.cards.length === 0) {
        throw new Error(
          `There are no ${found.term} ${found.year} results for these learners yet. Your code has NOT been used — please try again once the school has entered results.`
        );
      }

      setStage('pdf');
      setProgress([0, r.cards.length]);
      const { generateSponsorReportsPDF, sponsorPdfFileName } = await import('@/services/pdf/sponsorReportsPDF');
      const bytes = await generateSponsorReportsPDF(
        { sponsorName: found.sponsorName, term: found.term, year: found.year, cards: r.cards, noResults: r.noResults },
        (d, t) => setProgress([d, t])
      );

      setStage('redeeming');
      await redeemSponsorCode(found.code);

      const file = { bytes, name: sponsorPdfFileName(found.sponsorName, found.term, found.year) };
      setPdf(file);
      setStage('done');
      setTyped('');
      await save(file);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Your code has not been used — please try again.');
      setStage('idle');
    }
  };

  const stageText =
    stage === 'checking' ? 'Checking the code…'
    : stage === 'loading' ? `Collecting results ${progress[0]} of ${progress[1]}…`
    : stage === 'pdf' ? `Preparing report cards ${progress[0]} of ${progress[1]}…`
    : stage === 'redeeming' ? 'Finishing…'
    : '';

  // Summary by form/grade for the finished download.
  const levels: { heading: string; count: number }[] = [];
  for (const c of reports?.cards ?? []) {
    const h = levelHeading(c.className, c.form);
    const last = levels[levels.length - 1];
    if (last && last.heading === h) last.count++;
    else levels.push({ heading: h, count: 1 });
  }

  return (
    <div className="space-y-6">
      <div className="bg-white/15 backdrop-blur-xl rounded-2xl shadow-2xl p-6 sm:p-8 border border-white/30 animate-fadeInUp">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white text-center">Sponsor Report Cards</h2>
          <p className="text-gray-300 text-sm text-center mt-1">
            Enter the code you received from the school's guidance office to download the report cards of all the learners you sponsor.
          </p>
          <div className="w-12 h-1 bg-rose-500 mx-auto mt-3 rounded-full" />
        </div>

        <form onSubmit={start} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-200">Sponsor code</label>
            <div className="relative group">
              <KeyRound className="absolute left-3 top-3.5 text-gray-300 group-focus-within:text-rose-300 transition-colors" size={20} />
              <input
                value={typed}
                onChange={e => setTyped(e.target.value.toUpperCase())}
                placeholder="e.g. SP-7KQ3-M9XP"
                className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all text-white placeholder-white/60 backdrop-blur-sm font-mono tracking-wider uppercase"
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <p className="text-xs text-gray-300">Each code works once. Keep this page open until your download has finished.</p>
          </div>

          <button
            type="submit"
            disabled={busy || !typed.trim()}
            className="w-full py-3.5 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed"
          >
            {busy ? (<><Loader2 className="animate-spin" size={18} /><span>{stageText}</span></>) : (<><Download size={18} /><span>Get Report Cards</span></>)}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3 bg-red-500/20 border border-red-500/40 rounded-xl flex items-start gap-3 animate-fadeIn">
            <AlertCircle className="text-red-300 flex-shrink-0 mt-0.5" size={18} />
            <p className="text-red-100 text-sm">{error}</p>
          </div>
        )}
      </div>

      {stage === 'done' && code && reports && pdf && (
        <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl p-6 border border-white/40 animate-fadeInUp text-gray-800">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="text-green-600 shrink-0 mt-0.5" size={24} />
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-gray-900">{code.sponsorName}</h3>
              <p className="text-sm text-gray-600">
                {code.term} {code.year} · {reports.cards.length} report card{reports.cards.length === 1 ? '' : 's'} in one PDF, in order of form/grade
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {levels.map(l => (
              <div key={l.heading} className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-xs text-gray-600">{l.heading}</p>
                <p className="text-lg font-bold text-blue-700">{l.count}</p>
              </div>
            ))}
          </div>

          {reports.noResults.length > 0 && (
            <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
              <strong>{reports.noResults.length}</strong> learner{reports.noResults.length === 1 ? ' has' : 's have'} no results for this term yet
              (listed on the first page of the PDF): {reports.noResults.map(l => l.fullName).join(', ')}.
            </div>
          )}

          <button
            onClick={() => save()}
            className="mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl shadow-md"
          >
            <FileText size={18} /> Save the PDF again
          </button>
          <p className="mt-3 text-xs text-gray-500">
            Your code has now been used. You can save the PDF again until you leave this page; after that, ask the school for a new code.
          </p>
        </div>
      )}
    </div>
  );
}
