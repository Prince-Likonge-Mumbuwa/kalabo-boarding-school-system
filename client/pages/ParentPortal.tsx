// @/pages/ParentPortal.tsx
// Consistency rewrite: the parent sees the SAME report card as the admin
// (built by the shared results grid) — same subjects, same active exams,
// same averages, grades and position — on screen and in the PDF. It opens
// on the current academic term and says "Provisional" while marks are
// still pending.
// Version 2.0.0 - PDF export now maps service ReportCardData → admin ReportCardData shape
//                  (fixes blank Avg column), grade descriptions wired, exam-config aware.

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { learnerService } from '@/services/schoolService';
import { resultsService, ReportCardData } from '@/services/resultsService';
import { generateReportCardPDF } from '@/services/pdf/reportCardPDFLib';
import { getCurrentAcademicTerm, type TermName } from '@/utils/academicTerm';
import type { Learner } from '@/types/school';
import {
  Phone,
  Search,
  ArrowLeft,
  User,
  GraduationCap,
  Loader2,
  AlertCircle,
  Users,
  ChevronRight,
  BookOpen,
  Award,
  Calendar,
  Mail,
  Download,
} from 'lucide-react';

const TERMS: TermName[] = ['Term 1', 'Term 2', 'Term 3'];

/* ============================================================
   HELPERS
   ============================================================ */

/* ============================================================
   COMPONENT
   ============================================================ */

const ParentPortal = () => {
  const [phone, setPhone] = useState('');
  const [searching, setSearching] = useState(false);
  const [children, setChildren] = useState<Learner[]>([]);
  const [selectedChild, setSelectedChild] = useState<Learner | null>(null);
  // Opens on the current academic term (was always "Term 1").
  const [term, setTerm] = useState<TermName>(() => getCurrentAcademicTerm().term);
  const [year, setYear] = useState<number>(() => getCurrentAcademicTerm().year);
  const [reportCard, setReportCard] = useState<(ReportCardData & { degraded?: boolean }) | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  // The exams the card is based on come from the card itself (the shared
  // grid), so the columns always match the admin's report card.
  const configuredExamTypes: string[] = reportCard?.activeExams ?? [];

  const resetResults = () => {
    setReportCard(null);
    setError('');
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      setError('Please enter a guardian phone number.');
      return;
    }

    setSearching(true);
    setError('');
    setChildren([]);
    setSelectedChild(null);
    resetResults();
    setHasSearched(false);

    try {
      const learners = await learnerService.getLearnersByGuardianPhone(phone.trim());
      setChildren(learners);
      setHasSearched(true);

      if (learners.length === 1) {
        setSelectedChild(learners[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to search. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const handleLoadReport = async () => {
    if (!selectedChild) return;

    setLoadingReport(true);
    setError('');
    setReportCard(null);

    try {
      const report = await resultsService.generateReportCard(
        selectedChild.id || selectedChild.studentId,
        term,
        year,
        { includeIncomplete: true, markMissing: true, publicView: true }
      );

      if (!report) {
        setError(
          `No results found for ${selectedChild.fullName} for ${term} ${year}. ` +
            `Please confirm the term/year or contact the school.`
        );
      } else {
        setReportCard(report);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load results. Please try again.');
    } finally {
      setLoadingReport(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!reportCard) return;

    setDownloadingPDF(true);
    setError('');

    try {
      // The card is already in the shape the PDF uses (same as the admin's).
      const pdfBytes = await generateReportCardPDF(reportCard as any, configuredExamTypes);

      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const safeName = (reportCard.studentName || 'student').replace(/[^a-z0-9]/gi, '_');
      const safeTerm = (reportCard.term || 'term').replace(/\s+/g, '');
      const filename = `${safeName}_${safeTerm}_${reportCard.year}_ReportCard.pdf`;

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Failed to generate PDF. Please try again.');
    } finally {
      setDownloadingPDF(false);
    }
  };

  // -1 absent, -2 not conducted, -3 (or anything else negative) pending.
  const formatMark = (value: number): string => {
    if (value === -1) return 'ABS';
    if (value === -2) return 'NC';
    if (typeof value !== 'number' || value < 0) return '—';
    return `${value}%`;
  };

  const gradeColor = (grade: number) => {
    if (grade < 0) return 'text-gray-500';
    if (grade <= 2) return 'text-green-600';
    if (grade <= 4) return 'text-blue-600';
    if (grade <= 6) return 'text-yellow-600';
    if (grade <= 8) return 'text-orange-600';
    return 'text-red-600';
  };

  const animationStyles = `
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .animate-fadeInUp { animation: fadeInUp 0.5s ease-out forwards; }
    .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }
  `;

  const showWeek4 = configuredExamTypes.includes('week4');
  const showWeek8 = configuredExamTypes.includes('week8');
  const showEOT = configuredExamTypes.includes('endOfTerm');

  return (
    <>
      <style>{animationStyles}</style>

      <Layout className="relative min-h-screen overflow-hidden">
        {/* Background */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: 'url("/images/signin-bg.jpg")',
            backgroundAttachment: 'fixed',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/60 to-black/70 backdrop-blur-[1px]" />

        <div className="relative z-10 min-h-screen py-8 px-4">
          <div className="max-w-3xl mx-auto">
            {/* Header */}
            <div className="text-center mb-6 animate-fadeInUp">
              <div className="inline-block mb-4">
                <div className="w-24 h-24 mx-auto bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl flex items-center justify-center p-3 border border-white/30">
                  <img
                    src="/images/school-logo.png"
                    alt="School Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 drop-shadow-lg">
                Parent Portal
              </h1>
              <p className="text-gray-200 text-sm sm:text-base">
                Access your child's academic results
              </p>
            </div>

            {/* Back link */}
            <div className="mb-4 animate-fadeInUp">
              <Link
                to="/signin"
                className="inline-flex items-center gap-2 text-blue-300 hover:text-blue-200 text-sm font-medium transition-colors"
              >
                <ArrowLeft size={16} />
                Back to Sign In
              </Link>
            </div>

            {/* Search card */}
            <div className="bg-white/15 backdrop-blur-xl rounded-2xl shadow-2xl p-6 sm:p-8 border border-white/30 animate-fadeInUp">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-white text-center">
                  Look Up Your Children
                </h2>
                <p className="text-gray-300 text-sm text-center mt-1">
                  Enter the guardian phone number registered with the school
                </p>
                <div className="w-12 h-1 bg-blue-500 mx-auto mt-3 rounded-full" />
              </div>

              <form onSubmit={handleSearch} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-200">
                    Guardian Phone Number
                  </label>
                  <div className="relative group">
                    <Phone
                      className="absolute left-3 top-3.5 text-gray-300 group-focus-within:text-blue-400 transition-colors"
                      size={20}
                    />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. 0977123456"
                      className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-white placeholder-white/60 backdrop-blur-sm"
                      disabled={searching}
                      autoComplete="tel"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={searching}
                  className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed"
                >
                  {searching ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      <span>Searching...</span>
                    </>
                  ) : (
                    <>
                      <Search size={18} />
                      <span>Find My Children</span>
                    </>
                  )}
                </button>
              </form>

              {error && (
                <div className="mt-4 p-3 bg-red-500/20 border border-red-500/40 rounded-xl flex items-start gap-3 animate-fadeIn">
                  <AlertCircle className="text-red-300 flex-shrink-0 mt-0.5" size={18} />
                  <p className="text-red-100 text-sm">{error}</p>
                </div>
              )}
            </div>

            {/* No results */}
            {hasSearched && children.length === 0 && !error && (
              <div className="mt-6 bg-white/15 backdrop-blur-xl rounded-2xl shadow-2xl p-6 border border-white/30 animate-fadeInUp">
                <div className="text-center">
                  <AlertCircle className="mx-auto text-yellow-300 mb-3" size={40} />
                  <h3 className="text-white font-semibold text-lg mb-1">
                    No children found
                  </h3>
                  <p className="text-gray-300 text-sm">
                    We couldn't find any learners linked to that phone number.
                    Please confirm the number with the school office.
                  </p>
                </div>
              </div>
            )}

            {/* Children list */}
            {children.length > 0 && (
              <div className="mt-6 bg-white/15 backdrop-blur-xl rounded-2xl shadow-2xl p-6 border border-white/30 animate-fadeInUp">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="text-blue-300" size={20} />
                  <h3 className="text-white font-semibold">
                    Found {children.length}{' '}
                    {children.length === 1 ? 'child' : 'children'}
                  </h3>
                </div>

                <div className="space-y-2">
                  {children.map((child) => {
                    const isSelected = selectedChild?.id === child.id;
                    return (
                      <button
                        key={child.id}
                        onClick={() => {
                          setSelectedChild(child);
                          resetResults();
                        }}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left ${
                          isSelected
                            ? 'bg-blue-500/30 border-blue-400/60 shadow-lg'
                            : 'bg-white/5 border-white/20 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-500/40 flex items-center justify-center">
                            <User className="text-white" size={20} />
                          </div>
                          <div>
                            <p className="text-white font-semibold text-sm">
                              {child.fullName}
                            </p>
                            <p className="text-gray-300 text-xs">
                              {child.className || 'No class'} • ID:{' '}
                              {child.studentId || '—'}
                            </p>
                          </div>
                        </div>
                        <ChevronRight
                          className={`text-white/60 transition-transform ${
                            isSelected ? 'translate-x-1' : ''
                          }`}
                          size={18}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Term/year + View Results */}
            {selectedChild && (
              <div className="mt-6 bg-white/15 backdrop-blur-xl rounded-2xl shadow-2xl p-6 border border-white/30 animate-fadeInUp">
                <div className="flex items-center gap-2 mb-4">
                  <GraduationCap className="text-blue-300" size={20} />
                  <h3 className="text-white font-semibold">
                    Results for {selectedChild.fullName}
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">
                      Term
                    </label>
                    <select
                      value={term}
                      onChange={(e) => {
                        setTerm(e.target.value as TermName);
                        resetResults();
                      }}
                      className="w-full px-3 py-2.5 bg-white/10 border border-white/30 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {TERMS.map((t) => (
                        <option key={t} value={t} className="text-gray-900">
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">
                      Year
                    </label>
                    <select
                      value={year}
                      onChange={(e) => {
                        setYear(Number(e.target.value));
                        resetResults();
                      }}
                      className="w-full px-3 py-2.5 bg-white/10 border border-white/30 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {Array.from({ length: 5 }).map((_, i) => {
                        const y = new Date().getFullYear() - i;
                        return (
                          <option key={y} value={y} className="text-gray-900">
                            {y}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="flex items-end">
                    <button
                      onClick={handleLoadReport}
                      disabled={loadingReport}
                      className="w-full py-2.5 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed"
                    >
                      {loadingReport ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />
                          <span>Loading...</span>
                        </>
                      ) : (
                        <>
                          <BookOpen size={16} />
                          <span>View Results</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Report Card */}
            {reportCard && (
              <div className="mt-6 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl p-6 border border-white/40 animate-fadeInUp text-gray-800">
                {/* Student header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-gray-200">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {reportCard.studentName}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {reportCard.className} • Form {reportCard.form} •{' '}
                      {reportCard.studentId}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Position</p>
                      <p className="text-lg font-bold text-blue-700">
                        {reportCard.position}
                      </p>
                    </div>
                    <button
                      onClick={handleDownloadPDF}
                      disabled={downloadingPDF}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl transition-all shadow-md hover:shadow-lg disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed text-sm"
                    >
                      {downloadingPDF ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />
                          <span>Preparing...</span>
                        </>
                      ) : (
                        <>
                          <Download size={16} />
                          <span>Download PDF</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Summary tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
                  <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                    <p className="text-xs text-gray-600">Overall</p>
                    <p className="text-lg font-bold text-blue-700">
                      {reportCard.percentage}%
                    </p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                    <p className="text-xs text-gray-600">Grade</p>
                    <p className={`text-lg font-bold ${gradeColor(reportCard.overallGrade)}`}>
                      {reportCard.overallGrade > 0
                        ? `${reportCard.overallGrade} (${reportCard.overallGradeDescription})`
                        : '—'}
                    </p>
                  </div>
                  <div className="bg-yellow-50 rounded-xl p-3 border border-yellow-100">
                    <p className="text-xs text-gray-600">Status</p>
                    <p
                      className={`text-lg font-bold capitalize ${
                        reportCard.status === 'pass'
                          ? 'text-green-700'
                          : 'text-red-700'
                      }`}
                    >
                      {reportCard.status}
                    </p>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-3 border border-purple-100">
                    <p className="text-xs text-gray-600">Completion</p>
                    <p className="text-lg font-bold text-purple-700">
                      {reportCard.completionPercentage}%
                    </p>
                  </div>
                </div>

                {/* Provisional / partial-data notices */}
                {reportCard.isProvisional && (
                  <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
                    <strong>Provisional:</strong> {reportCard.totalSubjects - reportCard.completedSubjects} subject
                    {reportCard.totalSubjects - reportCard.completedSubjects === 1 ? ' is' : 's are'} still awaiting marks
                    (shown as —). The average may change when they are entered.
                  </div>
                )}
                {reportCard.degraded && (
                  <div className="mb-3 p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-600">
                    Some school settings could not be loaded, so this view may differ slightly from the official report card.
                  </div>
                )}

                {/* Subjects table */}
                <div className="overflow-x-auto -mx-2 px-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200">
                        <th className="py-2 pr-2">Subject</th>
                        {showWeek4 && <th className="py-2 px-2 text-center">W4</th>}
                        {showWeek8 && <th className="py-2 px-2 text-center">W8</th>}
                        {showEOT && <th className="py-2 px-2 text-center">EOT</th>}
                        <th className="py-2 px-2 text-center bg-gray-50">Avg</th>
                        <th className="py-2 pl-2 text-center">Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportCard.subjects.map((subject) => (
                        <tr
                          key={subject.subjectId}
                          className="border-b border-gray-100 hover:bg-gray-50"
                        >
                          <td className="py-2 pr-2">
                            <p className="font-medium text-gray-900">
                              {subject.subjectName}
                            </p>
                            <p className="text-[11px] text-gray-500">
                              {subject.teacherName}
                            </p>
                          </td>
                          {showWeek4 && (
                            <td className="py-2 px-2 text-center text-gray-700">
                              {formatMark(subject.week4)}
                            </td>
                          )}
                          {showWeek8 && (
                            <td className="py-2 px-2 text-center text-gray-700">
                              {formatMark(subject.week8)}
                            </td>
                          )}
                          {showEOT && (
                            <td className="py-2 px-2 text-center text-gray-700">
                              {formatMark(subject.endOfTerm)}
                            </td>
                          )}
                          <td className="py-2 px-2 text-center font-semibold text-gray-900 bg-gray-50">
                            {subject.averagePercentage >= 0
                              ? `${subject.averagePercentage}%`
                              : '—'}
                          </td>
                          <td
                            className={`py-2 pl-2 text-center font-bold ${gradeColor(
                              subject.grade
                            )}`}
                          >
                            {subject.grade > 0 ? subject.grade : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Teacher's comment */}
                <div className="mt-5 p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex items-start gap-2">
                    <Award className="text-blue-600 flex-shrink-0 mt-0.5" size={18} />
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
                        Teacher's Comment
                      </p>
                      <p className="text-sm text-gray-800">
                        {reportCard.teachersComment}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Footer meta */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={12} /> Generated {reportCard.generatedDate}
                  </span>
                  <span>
                    {reportCard.term} • {reportCard.year}
                  </span>
                  {reportCard.parentsEmail && (
                    <span className="inline-flex items-center gap-1">
                      <Mail size={12} /> {reportCard.parentsEmail}
                    </span>
                  )}
                </div>

                <p className="mt-4 text-[11px] text-gray-400 text-center">
                  N/C = Not Conducted • — = Not Entered • Grades 1–9 (1 best, 9 fail)
                </p>
              </div>
            )}

            {/* Footer */}
            <div className="text-center mt-8 animate-fadeInUp">
              <p className="text-gray-300/80 text-xs">
                For support, contact the school office • KalaboBoarding-SRS
              </p>
            </div>
          </div>
        </div>
      </Layout>
    </>
  );
};

export default ParentPortal;