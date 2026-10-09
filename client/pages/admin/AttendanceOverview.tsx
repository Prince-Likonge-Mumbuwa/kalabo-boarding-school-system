// @/pages/admin/AttendanceOverview.tsx
//
// ============================================================================
//  ADMIN — ATTENDANCE OVERVIEW (WITH INTEGRATED TIMETABLE MANAGEMENT)
// ============================================================================
//
//  Top-level tabs:
//    • Attendance — the original attendance monitoring view
//        Sub-modes: daily / weekly / monthly / class
//        Stats, trend chart, class breakdown, late arrivals, subject
//        truancy, at-risk students, plus two NEW timetable monitoring
//        cards visible in daily mode:
//          – Timetable Coverage: expected periods vs marked sessions
//          – Teacher Coverage: per-teacher marked vs scheduled
//    • Periods    — the school bell schedule (CRUD + seed defaults)
//    • Holidays   — public + school holidays (CRUD + seed Zambian publics)
//    • Approvals  — teacher-submitted timetables waiting for approval
//
//  Tabs collapse to a bottom nav on mobile.
// ============================================================================

import { DashboardLayout } from '@/components/DashboardLayout';
import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { CompactStats } from '@/components/attendance/CompactStats';
import {
  useAttendanceRollupsForDate,
  useAttendanceRollupsForRange,
} from '@/hooks/useAttendanceRollup';
import { useClassRiskIndex } from '@/hooks/useStudentIndex';
import {
  exportAttendanceRecords,
  exportLateArrivals,
  exportSubjectTruancy,
  type AttendanceExportRow,
  type LateArrivalExportRow,
  type SubjectTruancyExportRow,
} from '@/utils/exportUtils';

// ── Timetable hooks & shared components ────────────────────────────
import {
  usePeriods,
  useUpsertPeriod,
  useDeletePeriod,
  useSeedDefaultPeriods,
  useSchoolHolidays,
  useUpsertHoliday,
  useDeleteHoliday,
  useSeedZambiaHolidays,
  usePendingSubmissions,
  useApproveSubmission,
  useRejectSubmission,
  useTimetableCoverage,
  useTeacherCoverage,
  useClassTimetable,
} from '@/hooks/useTimetable';
import {
  CoverageCard,
  UncoveredPeriodsTable,
  SubmissionDiffView,
  ConflictWarning,
} from '@/components/timetable/TimetableShared';
import { getCurrentAcademicTerm } from '@/utils/academicTerm';

import type {
  PeriodDraft,
  HolidayDraft,
  PendingSubmission,
  ResolvedTimetableEntry,
} from '@/types/timetable';
import type { AttendanceDailyRollup } from '@/types/attendance';

import {
  Filter, Download, RefreshCw,
  Search, ChevronDown, X,
  CheckCircle2, XCircle, AlertCircle, Clock,
  Loader2, BookOpen, Plus, Trash2, Edit3, Calendar,
  Settings as SettingsIcon, Check, Ban, Info,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  rate: number;
  classBreakdown: {
    [classId: string]: {
      classId: string;
      className: string;
      total: number;
      present: number;
      absent: number;
      late: number;
      excused: number;
      rate: number;
    };
  };
}

type ViewMode = 'daily' | 'weekly' | 'monthly' | 'class';
type ExportType = 'all' | 'late' | 'truancy';
type TopTab = 'attendance' | 'periods' | 'holidays' | 'approvals';

interface AdvancedFilters {
  showWeekdaysOnly: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysAgoYMD(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatLocalYMD(d);
}

function isWeekday(ymd: string): boolean {
  const [y, m, d] = ymd.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day >= 1 && day <= 5;
}

function rateClass(rate: number): string {
  if (rate >= 90) return 'text-green-600';
  if (rate >= 75) return 'text-yellow-600';
  return 'text-red-600';
}

function rateBadgeClass(rate: number): string {
  if (rate >= 90) return 'bg-green-100 text-green-700';
  if (rate >= 75) return 'bg-yellow-100 text-yellow-700';
  return 'bg-red-100 text-red-700';
}

// ============================================================================
// EXISTING COMPONENTS (unchanged)
// ============================================================================

function AdvancedFilters({
  filters,
  onChange,
  onClose,
}: {
  filters: AdvancedFilters;
  onChange: (filters: AdvancedFilters) => void;
  onClose: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Advanced Filters</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
      </div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={filters.showWeekdaysOnly}
          onChange={(e) => onChange({ ...filters, showWeekdaysOnly: e.target.checked })}
          className="rounded border-gray-300 text-blue-600"
        />
        <span className="text-sm text-gray-700">Show Monday-Friday only</span>
      </label>
    </div>
  );
}

function RiskOverview({
  classId,
  className,
}: {
  classId: string | undefined;
  className: string;
}) {
  const termStart = useMemo(() => daysAgoYMD(120), []);
  const { atRisk, isLoading } = useClassRiskIndex(classId, className, termStart);

  if (!classId) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <h3 className="font-semibold text-gray-900 mb-2">At-Risk Students</h3>
        <p className="text-sm text-gray-500">Select a class to view at-risk students.</p>
      </div>
    );
  }

  const highCount = atRisk.filter((r) => r.riskLevel === 'high').length;
  const mediumCount = atRisk.filter((r) => r.riskLevel === 'medium').length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">At-Risk Students</h3>
        <div className="flex gap-2">
          <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">High: {highCount}</span>
          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">Medium: {mediumCount}</span>
        </div>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-blue-600" />
        </div>
      ) : atRisk.length > 0 ? (
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {atRisk.slice(0, 10).map((risk) => (
            <div key={risk.studentId} className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{risk.studentName}</p>
                  <p className="text-xs text-gray-600 truncate">{risk.className}</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs flex-shrink-0 ${
                  risk.riskLevel === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {risk.riskLevel}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {risk.riskFactors.slice(0, 2).map((factor, i) => (
                  <span key={`${risk.studentId}-${i}`} className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-gray-200">
                    {factor}
                  </span>
                ))}
                {risk.riskFactors.length > 2 && (
                  <span className="text-[10px] text-gray-500">+{risk.riskFactors.length - 2} more</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 text-center py-4">No at-risk students found</p>
      )}
    </div>
  );
}

interface ChartPoint {
  date: string;
  total: number;
  present: number;
  late: number;
  rate: number;
}

function AttendanceChart({ data }: { data: ChartPoint[] }) {
  if (!data.length) return null;
  const weekdays = data.filter((d) => isWeekday(d.date)).slice(-7);
  if (weekdays.length === 0) return null;

  const rates = weekdays.map((d) => d.rate);
  const maxRate = Math.max(...rates);
  const minRate = Math.min(...rates);
  const avgRate = Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <h3 className="text-lg font-bold text-gray-900">Attendance Trend (Mon-Fri)</h3>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span>Avg: <span className="font-bold text-gray-900 tabular-nums">{avgRate}%</span></span>
          <span>High: <span className="font-bold text-green-600 tabular-nums">{maxRate.toFixed(0)}%</span></span>
          <span>Low: <span className="font-bold text-red-600 tabular-nums">{minRate.toFixed(0)}%</span></span>
        </div>
      </div>
      <div className="h-48 sm:h-64 relative">
        <div className="absolute inset-0 pointer-events-none">
          {[0, 25, 50, 75, 100].map((val) => (
            <div key={val} className="absolute left-0 right-0 border-t border-gray-100" style={{ bottom: `${val}%` }} />
          ))}
        </div>
        <div className="absolute inset-0 overflow-x-auto overflow-y-visible pb-4">
          <div className="flex items-end justify-start sm:justify-around gap-2 sm:gap-4 min-w-[300px] sm:min-w-0 h-full">
            {weekdays.map((day) => {
              const [y, m, d] = day.date.split('-').map(Number);
              const dt = new Date(y, m - 1, d);
              return (
                <div key={day.date} className="flex flex-col items-center flex-shrink-0 w-12 sm:w-16 h-full justify-end">
                  <div className="relative group w-full flex justify-center items-end h-full">
                    <div className="w-6 sm:w-8 bg-blue-500 rounded-t transition-all duration-500 hover:bg-blue-600"
                      style={{ height: `${day.rate}%`, minHeight: day.rate > 0 ? '2px' : '0' }} />
                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                      {day.rate.toFixed(0)}% ({day.present}/{day.total})
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 mt-2">{dt.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                  <span className="text-[10px] text-gray-400">{dt.getDate()}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClassBreakdownTable({ data }: { data: AttendanceSummary['classBreakdown'] }) {
  const classes = Object.values(data);
  if (classes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-gray-500">No daily attendance records for the selected period.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Class-wise Attendance (Daily Roll Call)</h3>
        <p className="text-sm text-gray-500 mt-0.5">Based on daily attendance records only</p>
      </div>
      <div className="block sm:hidden divide-y divide-gray-200">
        {classes.map((cls) => (
          <div key={cls.classId} className="p-4 hover:bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-900">{cls.className}</h4>
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${rateBadgeClass(cls.rate)}`}>
                {cls.rate >= 90 ? <CheckCircle2 size={12} /> : cls.rate >= 75 ? <AlertCircle size={12} /> : <XCircle size={12} />}
                {cls.rate}%
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div><div className="text-lg font-semibold text-gray-900 tabular-nums">{cls.total}</div><div className="text-xs text-gray-500">Total</div></div>
              <div><div className="text-lg font-semibold text-green-600 tabular-nums">{cls.present}</div><div className="text-xs text-gray-500">Present</div></div>
              <div><div className="text-lg font-semibold text-red-600 tabular-nums">{cls.absent}</div><div className="text-xs text-gray-500">Absent</div></div>
              <div><div className="text-lg font-semibold text-yellow-600 tabular-nums">{cls.late}</div><div className="text-xs text-gray-500">Late</div></div>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Class', 'Total', 'Present', 'Absent', 'Late', 'Excused', 'Rate'].map((h) => (
                <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {classes.map((cls) => (
              <tr key={cls.classId} className="hover:bg-gray-50/50">
                <td className="px-6 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">{cls.className}</td>
                <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap tabular-nums">{cls.total}</td>
                <td className="px-6 py-4 text-sm font-medium text-green-600 whitespace-nowrap tabular-nums">{cls.present}</td>
                <td className="px-6 py-4 text-sm font-medium text-red-600 whitespace-nowrap tabular-nums">{cls.absent}</td>
                <td className="px-6 py-4 text-sm font-medium text-yellow-600 whitespace-nowrap tabular-nums">{cls.late}</td>
                <td className="px-6 py-4 text-sm font-medium text-purple-600 whitespace-nowrap tabular-nums">{cls.excused}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`text-sm font-semibold tabular-nums ${rateClass(cls.rate)}`}>{cls.rate}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface LateArrivalRow {
  studentId: string;
  studentName: string;
  className: string;
  date: string;
  firstPeriodSubject: string;
}

function LateArrivalsView({ lateArrivals }: { lateArrivals: LateArrivalRow[] }) {
  if (lateArrivals.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-yellow-200 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 bg-yellow-50 border-b border-yellow-200">
        <div className="flex items-center gap-2">
          <Clock size={20} className="text-yellow-600" />
          <h3 className="font-semibold text-yellow-800">Late Arrivals Detected</h3>
        </div>
        <p className="text-sm text-yellow-700 mt-1">
          Students marked absent in daily roll call but present in first period
        </p>
      </div>
      <div className="block sm:hidden divide-y divide-gray-200">
        {lateArrivals.slice(0, 10).map((late, i) => (
          <div key={`${late.studentId}-${late.date}-${i}`} className="p-4">
            <div className="flex justify-between items-start mb-2">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{late.studentName}</p>
                <p className="text-sm text-gray-600 truncate">{late.className}</p>
              </div>
              <p className="text-sm text-gray-500 flex-shrink-0">{late.date}</p>
            </div>
            <div className="flex gap-2 mt-2">
              <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded-full">Daily: absent</span>
              <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full">1st Period: present</span>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {['Student', 'Class', 'Date', 'Daily', '1st Period', 'Subject'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {lateArrivals.slice(0, 10).map((late, i) => (
              <tr key={`${late.studentId}-${late.date}-${i}`} className="hover:bg-yellow-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{late.studentName}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{late.className}</td>
                <td className="px-4 py-3 text-sm text-gray-700 tabular-nums">{late.date}</td>
                <td className="px-4 py-3"><span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded-full">absent</span></td>
                <td className="px-4 py-3"><span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full">present</span></td>
                <td className="px-4 py-3 text-sm text-gray-700">{late.firstPeriodSubject}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface SubjectAlertRow {
  studentId: string;
  studentName: string;
  className: string;
  subject: string;
  rate: number;
  missed: number;
  total: number;
}

function SubjectTruancyView({ truancy }: { truancy: SubjectAlertRow[] }) {
  if (truancy.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-orange-200 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 bg-orange-50 border-b border-orange-200">
        <div className="flex items-center gap-2">
          <BookOpen size={20} className="text-orange-600" />
          <h3 className="font-semibold text-orange-800">Subject Truancy Analysis</h3>
        </div>
        <p className="text-sm text-orange-700 mt-1">Students with low attendance by subject</p>
      </div>
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {['Student', 'Class', 'Subject', 'Rate', 'Missed', 'Total'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {truancy.slice(0, 10).map((item, i) => (
              <tr key={`${item.studentId}-${item.subject}-${i}`} className="hover:bg-orange-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.studentName}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{item.className}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{item.subject}</td>
                <td className="px-4 py-3"><span className={`px-2 py-1 text-xs rounded-full ${rateBadgeClass(item.rate)}`}>{item.rate.toFixed(1)}%</span></td>
                <td className="px-4 py-3 text-sm text-red-600 font-medium tabular-nums">{item.missed}</td>
                <td className="px-4 py-3 text-sm text-gray-700 tabular-nums">{item.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="block sm:hidden divide-y divide-gray-200">
        {truancy.slice(0, 10).map((item, i) => (
          <div key={`${item.studentId}-${item.subject}-${i}`} className="p-4">
            <div className="flex justify-between items-start mb-2">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{item.studentName}</p>
                <p className="text-sm text-gray-600 truncate">{item.className}</p>
              </div>
              <span className={`px-2 py-1 text-xs rounded-full flex-shrink-0 ${rateBadgeClass(item.rate)}`}>{item.rate.toFixed(1)}%</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
              <div><span className="text-gray-500">Subject: </span>{item.subject}</div>
              <div>
                <span className="text-gray-500">Missed: </span>
                <span className="text-red-600 font-medium tabular-nums">{item.missed}</span>
                <span className="text-gray-500"> / {item.total}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// NEW — PERIODS TAB
// ============================================================================

function PeriodsTab() {
  const { year } = getCurrentAcademicTerm();
  const periodsQ = usePeriods(year, { includeInactive: true });
  const upsert = useUpsertPeriod();
  const remove = useDeletePeriod();
  const seed = useSeedDefaultPeriods();

  const [editing, setEditing] = useState<PeriodDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const periods = periodsQ.data ?? [];

  const startNew = () => {
    const nextOrder = periods.length === 0 ? 1 : Math.max(...periods.map(p => p.order)) + 1;
    setEditing({
      order: nextOrder,
      name: `P${nextOrder}`,
      startTime: '07:30',
      endTime: '08:20',
      kind: 'lesson',
      academicYear: year,
      isActive: true,
    });
    setError(null);
  };

  const save = async () => {
    if (!editing) return;
    setError(null);
    try {
      await upsert.mutateAsync(editing);
      setEditing(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save period.');
    }
  };

  const del = async (id: string) => {
    if (!confirm('Delete this period? Blocked if any timetable entry uses it.')) return;
    setError(null);
    try {
      await remove.mutateAsync(id);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete period.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-gray-900">Bell Schedule — {year}</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Periods are shared across the whole school. Order is used by attendance and the timetable.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => { await seed.mutateAsync(year); }}
            disabled={seed.isPending || periods.length > 0}
            title={periods.length > 0 ? 'Already seeded' : 'Seed a default 8-lesson day'}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5"
          >
            {seed.isPending ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
            Seed defaults
          </button>
          <button onClick={startNew} className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5">
            <Plus size={14} /> Add period
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {periodsQ.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-blue-600" size={24} />
        </div>
      ) : periods.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Info className="text-gray-400 mx-auto mb-2" size={28} />
          <p className="text-sm text-gray-600">
            No periods yet. Use <span className="font-medium">Seed defaults</span> for a typical 8-lesson day, or add them one by one.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Order', 'Name', 'Start', 'End', 'Kind', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {periods.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2 text-sm tabular-nums">{p.order}</td>
                  <td className="px-4 py-2 text-sm font-medium">{p.name}</td>
                  <td className="px-4 py-2 text-sm tabular-nums">{p.startTime}</td>
                  <td className="px-4 py-2 text-sm tabular-nums">{p.endTime}</td>
                  <td className="px-4 py-2 text-sm capitalize">{p.kind}</td>
                  <td className="px-4 py-2 text-xs">
                    {p.isActive
                      ? <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700">Active</span>
                      : <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Inactive</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => setEditing({ ...p, id: p.id })} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Edit">
                      <Edit3 size={14} />
                    </button>
                    <button onClick={() => del(p.id)} disabled={remove.isPending} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <PeriodEditorDialog
          draft={editing}
          onChange={setEditing}
          onSave={save}
          onClose={() => setEditing(null)}
          saving={upsert.isPending}
        />
      )}
    </div>
  );
}

function PeriodEditorDialog({
  draft, onChange, onSave, onClose, saving,
}: {
  draft: PeriodDraft;
  onChange: (d: PeriodDraft) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{draft.id ? 'Edit period' : 'New period'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Order</span>
              <input type="number" min={1} value={draft.order}
                onChange={e => onChange({ ...draft, order: Number(e.target.value) || 1 })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Name</span>
              <input value={draft.name}
                onChange={e => onChange({ ...draft, name: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Start</span>
              <input type="time" value={draft.startTime}
                onChange={e => onChange({ ...draft, startTime: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">End</span>
              <input type="time" value={draft.endTime}
                onChange={e => onChange({ ...draft, endTime: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Kind</span>
            <select value={draft.kind}
              onChange={e => onChange({ ...draft, kind: e.target.value as PeriodDraft['kind'] })}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="lesson">Lesson</option>
              <option value="break">Break</option>
              <option value="assembly">Assembly</option>
              <option value="lunch">Lunch</option>
            </select>
          </label>
          <label className="flex items-center gap-2 pt-1">
            <input type="checkbox" checked={draft.isActive}
              onChange={e => onChange({ ...draft, isActive: e.target.checked })}
              className="rounded border-gray-300 text-blue-600" />
            <span className="text-sm text-gray-700">Active</span>
          </label>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={onSave} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// NEW — HOLIDAYS TAB
// ============================================================================

function HolidaysTab() {
  const { year } = getCurrentAcademicTerm();
  const holidaysQ = useSchoolHolidays({ year });
  const upsert = useUpsertHoliday();
  const remove = useDeleteHoliday();
  const seed = useSeedZambiaHolidays();

  const [editing, setEditing] = useState<HolidayDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  const holidays = holidaysQ.data ?? [];

  const startNew = () => {
    const today = formatLocalYMD(new Date());
    setEditing({ name: '', startDate: today, endDate: today, kind: 'public' });
    setError(null);
    setSeedMsg(null);
  };

  const save = async () => {
    if (!editing) return;
    setError(null);
    try {
      await upsert.mutateAsync(editing);
      setEditing(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save holiday.');
    }
  };

  const del = async (id: string) => {
    if (!confirm('Delete this holiday?')) return;
    setError(null);
    try {
      await remove.mutateAsync(id);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete holiday.');
    }
  };

  const runSeed = async () => {
    setError(null);
    setSeedMsg(null);
    try {
      const result = await seed.mutateAsync(year);
      setSeedMsg(
        result.written === 0
          ? `All ${year} Zambian public holidays are already present.`
          : `Seeded ${result.written} holiday${result.written === 1 ? '' : 's'} for ${year}. Skipped ${result.skipped} already present.`,
      );
    } catch (e: any) {
      setError(e?.message ?? 'Failed to seed holidays.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-gray-900">School Holidays — {year}</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Public + school holidays block lessons and attendance on the affected dates.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={runSeed} disabled={seed.isPending}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5">
            {seed.isPending ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
            Seed Zambian holidays
          </button>
          <button onClick={startNew} className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5">
            <Plus size={14} /> Add holiday
          </button>
        </div>
      </div>

      {seedMsg && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 flex items-center gap-2">
          <Check size={16} /> {seedMsg}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {holidaysQ.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-blue-600" size={24} />
        </div>
      ) : holidays.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Info className="text-gray-400 mx-auto mb-2" size={28} />
          <p className="text-sm text-gray-600">
            No holidays for {year}. Use <span className="font-medium">Seed Zambian holidays</span> to add the standard national holidays, then add school-specific ones manually.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Name', 'From', 'To', 'Kind', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {holidays.map(h => (
                <tr key={h.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2 text-sm font-medium text-gray-900">{h.name}</td>
                  <td className="px-4 py-2 text-sm tabular-nums">{h.startDate}</td>
                  <td className="px-4 py-2 text-sm tabular-nums">{h.endDate}</td>
                  <td className="px-4 py-2 text-xs capitalize">
                    <span className={`px-2 py-0.5 rounded-full ${
                      h.kind === 'public' ? 'bg-blue-50 text-blue-700'
                      : h.kind === 'school' ? 'bg-purple-50 text-purple-700'
                      : 'bg-amber-50 text-amber-700'
                    }`}>{h.kind}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => setEditing({ ...h, id: h.id })} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Edit">
                      <Edit3 size={14} />
                    </button>
                    <button onClick={() => del(h.id)} disabled={remove.isPending} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <HolidayEditorDialog
          draft={editing}
          onChange={setEditing}
          onSave={save}
          onClose={() => setEditing(null)}
          saving={upsert.isPending}
        />
      )}
    </div>
  );
}

function HolidayEditorDialog({
  draft, onChange, onSave, onClose, saving,
}: {
  draft: HolidayDraft;
  onChange: (d: HolidayDraft) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{draft.id ? 'Edit holiday' : 'New holiday'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Name</span>
            <input value={draft.name}
              onChange={e => onChange({ ...draft, name: e.target.value })}
              placeholder="e.g. School Founders' Day"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">From</span>
              <input type="date" value={draft.startDate}
                onChange={e => onChange({ ...draft, startDate: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">To</span>
              <input type="date" value={draft.endDate}
                onChange={e => onChange({ ...draft, endDate: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Kind</span>
            <select value={draft.kind}
              onChange={e => onChange({ ...draft, kind: e.target.value as HolidayDraft['kind'] })}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="public">Public holiday</option>
              <option value="school">School holiday</option>
              <option value="exam-week">Exam week</option>
            </select>
          </label>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={onSave}
            disabled={saving || !draft.name.trim() || !draft.startDate || !draft.endDate}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// NEW — APPROVALS TAB
// ============================================================================

function ApprovalsTab() {
  const pendingQ = usePendingSubmissions();
  const approve = useApproveSubmission();
  const reject = useRejectSubmission();

  const [rejecting, setRejecting] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const submissions = pendingQ.data ?? [];

  const handleApprove = async (id: string) => {
    setActionError(null);
    try {
      await approve.mutateAsync(id);
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to approve.');
    }
  };

  const handleReject = async () => {
    if (!rejecting) return;
    setActionError(null);
    try {
      await reject.mutateAsync({ submissionId: rejecting.id, reason });
      setRejecting(null);
      setReason('');
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to reject.');
    }
  };

  if (pendingQ.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="animate-spin text-blue-600" size={24} />
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
        <CheckCircle2 className="text-green-500 mx-auto mb-3" size={32} />
        <h3 className="font-semibold text-gray-900 mb-1">All caught up</h3>
        <p className="text-sm text-gray-500">No timetable submissions are waiting for approval.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">Pending Submissions</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {submissions.length} batch{submissions.length === 1 ? '' : 'es'} awaiting review.
          Approving replaces the currently-active timetable rows for the affected slots.
        </p>
      </div>

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} /> {actionError}
        </div>
      )}

      <div className="space-y-3">
        {submissions.map(sub => (
          <SubmissionRow
            key={sub.id}
            submission={sub}
            onApprove={() => handleApprove(sub.id)}
            onReject={() => setRejecting({ id: sub.id, name: sub.submittedByName })}
            approving={approve.isPending}
            rejecting={reject.isPending}
          />
        ))}
      </div>

      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Reject {rejecting.name}'s submission</h3>
            </div>
            <div className="p-5">
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Reason (shown to the teacher)</span>
                <textarea value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={3}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="e.g. Two subjects clash on Tuesday P3. Please adjust and resubmit." />
              </label>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => { setRejecting(null); setReason(''); }}
                className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleReject}
                disabled={reject.isPending || !reason.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5">
                {reject.isPending ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubmissionRow({
  submission, onApprove, onReject, approving, rejecting,
}: {
  submission: PendingSubmission;
  onApprove: () => void;
  onReject: () => void;
  approving: boolean;
  rejecting: boolean;
}) {
  const firstClass = submission.classIds[0];
  const classTimetableQ = useClassTimetable(firstClass, {
    term: submission.term,
    year: submission.year,
  });
  const activeRows: ResolvedTimetableEntry[] = classTimetableQ.data ?? [];
  const hasConflicts = submission.conflicts.length > 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{submission.submittedByName}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {submission.term} {submission.year} · {submission.entries.length} rows ·{' '}
            {submission.submittedAt.toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasConflicts && (
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
              <AlertCircle size={12} /> {submission.conflicts.length} conflict
              {submission.conflicts.length === 1 ? '' : 's'}
            </span>
          )}
          <button onClick={onReject} disabled={approving || rejecting}
            className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg disabled:opacity-50 flex items-center gap-1">
            <Ban size={12} /> Reject
          </button>
          <button onClick={onApprove} disabled={approving || rejecting}
            className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 flex items-center gap-1">
            {approving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Approve
          </button>
        </div>
      </div>

      {hasConflicts && (
        <div className="px-5 pt-3">
          <ConflictWarning conflicts={submission.conflicts} />
        </div>
      )}

      <div className="p-5">
        <SubmissionDiffView pending={submission} activeForSlots={activeRows} />
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AttendanceOverview() {
  useAuth();

  const [topTab, setTopTab] = useState<TopTab>('attendance');
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [selectedDate, setSelectedDate] = useState(() => formatLocalYMD(new Date()));
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(() => ({
    start: daysAgoYMD(7),
    end: formatLocalYMD(new Date()),
  }));
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({
    showWeekdaysOnly: true,
  });

  const isDaily = viewMode === 'daily';

  const dailyQuery = useAttendanceRollupsForDate(selectedDate);
  const rangeQuery = useAttendanceRollupsForRange(dateRange.start, dateRange.end);

  const rollupsQuery = isDaily ? dailyQuery : rangeQuery;
  const rollups: AttendanceDailyRollup[] = rollupsQuery.data;

  const trendRange = useMemo(
    () => ({ start: daysAgoYMD(6), end: formatLocalYMD(new Date()) }),
    [],
  );
  const trendQuery = useAttendanceRollupsForRange(trendRange.start, trendRange.end);
  const trendRollups = isDaily ? trendQuery.data : [];

  // ── Timetable coverage (only in daily view) ────────────────────────
  const coverageQ = useTimetableCoverage(isDaily ? selectedDate : undefined);
  const teacherCoverageQ = useTeacherCoverage(isDaily ? selectedDate : undefined);

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rollups) {
      if (!map.has(r.classId)) map.set(r.classId, r.className);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rollups]);

  const selectedClassName = useMemo(() => {
    if (selectedClass === 'all') return '';
    return classOptions.find((c) => c.id === selectedClass)?.name ?? '';
  }, [selectedClass, classOptions]);

  const filteredRollups = useMemo(() => {
    let result = rollups;
    if (selectedClass !== 'all') result = result.filter((r) => r.classId === selectedClass);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter((r) => r.className.toLowerCase().includes(term));
    }
    if (advancedFilters.showWeekdaysOnly) result = result.filter((r) => isWeekday(r.date));
    return result;
  }, [rollups, selectedClass, searchTerm, advancedFilters.showWeekdaysOnly]);

  const summary = useMemo((): AttendanceSummary => {
    let total = 0, present = 0, absent = 0, late = 0, excused = 0;
    const classBreakdown: AttendanceSummary['classBreakdown'] = {};
    for (const r of filteredRollups) {
      const d = r.daily;
      if (!d) continue;
      total += d.total; present += d.present; absent += d.absent; late += d.late; excused += d.excused;
      classBreakdown[r.classId] = {
        classId: r.classId, className: r.className,
        total: d.total, present: d.present, absent: d.absent, late: d.late, excused: d.excused,
        rate: Math.round(d.rate),
      };
    }
    return {
      total, present, absent, late, excused,
      rate: total > 0 ? ((present + late) / total) * 100 : 0,
      classBreakdown,
    };
  }, [filteredRollups]);

  const trendData: ChartPoint[] = useMemo(() => {
    if (!isDaily) return [];
    const byDate = new Map<string, { total: number; present: number; late: number }>();
    for (const r of trendRollups) {
      if (selectedClass !== 'all' && r.classId !== selectedClass) continue;
      if (!r.daily) continue;
      const acc = byDate.get(r.date) ?? { total: 0, present: 0, late: 0 };
      acc.total += r.daily.total;
      acc.present += r.daily.present;
      acc.late += r.daily.late;
      byDate.set(r.date, acc);
    }
    return Array.from(byDate.entries()).map(([date, acc]) => ({
      date, total: acc.total, present: acc.present, late: acc.late,
      rate: acc.total > 0 ? ((acc.present + acc.late) / acc.total) * 100 : 0,
    })).sort((a, b) => a.date.localeCompare(b.date));
  }, [trendRollups, isDaily, selectedClass]);

  const lateArrivals: LateArrivalRow[] = useMemo(() => {
    const seen = new Set<string>();
    const out: LateArrivalRow[] = [];
    for (const r of filteredRollups) {
      for (const la of r.lateArrivals ?? []) {
        const key = `${la.studentId}_${r.date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          studentId: la.studentId, studentName: la.studentName,
          className: r.className, date: r.date,
          firstPeriodSubject: la.firstPeriodSubject,
        });
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredRollups]);

  const subjectAlerts: SubjectAlertRow[] = useMemo(() => {
    const map = new Map<string, {
      studentId: string; studentName: string; className: string; subject: string;
      missed: number; total: number;
    }>();
    for (const r of filteredRollups) {
      for (const sa of r.subjectAlerts ?? []) {
        const key = `${sa.studentId}_${sa.subject}`;
        const acc = map.get(key) ?? {
          studentId: sa.studentId, studentName: sa.studentName,
          className: r.className, subject: sa.subject, missed: 0, total: 0,
        };
        acc.missed += sa.missed;
        acc.total += sa.total;
        map.set(key, acc);
      }
    }
    return Array.from(map.values())
      .map((a) => ({ ...a, rate: a.total > 0 ? ((a.total - a.missed) / a.total) * 100 : 0 }))
      .sort((a, b) => a.rate - b.rate);
  }, [filteredRollups]);

  const handleRefresh = async () => {
    await rollupsQuery.refetch();
    if (isDaily) {
      await trendQuery.refetch();
      await coverageQ.refetch();
      await teacherCoverageQ.refetch();
    }
  };

  const handleExport = (type: ExportType) => {
    const filename = `attendance_${selectedDate}`;
    switch (type) {
      case 'all': {
        const rows: AttendanceExportRow[] = filteredRollups
          .filter((r) => r.daily)
          .map((r) => ({
            studentId: '', studentName: '', classId: r.classId, className: r.className,
            date: r.date, status: '', attendanceType: 'daily',
            markedBy: '', markedByName: r.periodicTotals.distinctTeachers.join(', '),
            timestamp: r.updatedAt,
          }));
        exportAttendanceRecords(rows, filename, advancedFilters.showWeekdaysOnly);
        break;
      }
      case 'late': {
        const rows: LateArrivalExportRow[] = lateArrivals.map((l) => ({
          studentId: l.studentId, studentName: l.studentName, className: l.className,
          date: l.date, dailyStatus: 'absent', firstPeriodStatus: 'present',
        }));
        exportLateArrivals(rows, `late_arrivals_${selectedDate}`);
        break;
      }
      case 'truancy': {
        const rows: SubjectTruancyExportRow[] = subjectAlerts.map((s) => ({
          studentId: s.studentId, studentName: s.studentName, className: s.className,
          subject: s.subject, teacherName: '', totalSessions: s.total,
          attended: s.total - s.missed, missed: s.missed,
          attendanceRate: s.rate, trend: 'stable' as const,
        }));
        exportSubjectTruancy(rows, `subject_truancy_${selectedDate}`);
        break;
      }
    }
  };

  const isLoading = rollupsQuery.isLoading;
  const isError = rollupsQuery.isError;

  return (
    <DashboardLayout activeTab="attendance">
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                Attendance Overview
              </h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1">
                Monitor attendance and manage the school timetable
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleRefresh} disabled={isLoading}
                className="p-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 flex-shrink-0">
                <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
              </button>
              <div className="relative group">
                <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700">
                  <Download size={18} />
                  <span className="hidden sm:inline">Export</span>
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 hidden group-hover:block z-10">
                  <button onClick={() => handleExport('all')} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm">All Records</button>
                  <button onClick={() => handleExport('late')} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm">Late Arrivals</button>
                  <button onClick={() => handleExport('truancy')} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm">Subject Truancy</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">

          {/* ── Top-level tab strip ────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-1 inline-flex w-full sm:w-auto overflow-x-auto">
            <div className="flex gap-1 min-w-max">
              <button
                onClick={() => setTopTab('attendance')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  topTab === 'attendance' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <BookOpen size={14} /> Attendance
              </button>
              <button
                onClick={() => setTopTab('periods')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  topTab === 'periods' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <SettingsIcon size={14} /> Periods
              </button>
              <button
                onClick={() => setTopTab('holidays')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  topTab === 'holidays' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Calendar size={14} /> Holidays
              </button>
              <button
                onClick={() => setTopTab('approvals')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  topTab === 'approvals' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Check size={14} /> Approvals
              </button>
            </div>
          </div>

          {/* ── Periods tab ─────────────────────────────────────── */}
          {topTab === 'periods' && <PeriodsTab />}

          {/* ── Holidays tab ────────────────────────────────────── */}
          {topTab === 'holidays' && <HolidaysTab />}

          {/* ── Approvals tab ───────────────────────────────────── */}
          {topTab === 'approvals' && <ApprovalsTab />}

          {/* ── Attendance tab (original + coverage cards) ─────── */}
          {topTab === 'attendance' && (
            <>
              <div className="bg-white rounded-xl border border-gray-200 p-1 inline-flex w-full sm:w-auto overflow-x-auto">
                <div className="flex gap-1 min-w-max">
                  {(['daily', 'weekly', 'monthly', 'class'] as ViewMode[]).map((mode) => (
                    <button key={mode} onClick={() => setViewMode(mode)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all whitespace-nowrap ${
                        viewMode === mode ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
                      }`}>
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <button onClick={() => setShowMobileFilters(!showMobileFilters)}
                  className="w-full flex items-center justify-between p-4 sm:hidden">
                  <div className="flex items-center gap-2">
                    <Filter size={18} className="text-gray-400" />
                    <span className="font-medium text-gray-700">Filters</span>
                  </div>
                  <ChevronDown size={18} className={`transition-transform ${showMobileFilters ? 'rotate-180' : ''}`} />
                </button>
                <div className={`p-4 ${showMobileFilters ? 'block' : 'hidden sm:block'}`}>
                  <div className="flex flex-col sm:flex-row gap-3">
                    {isDaily ? (
                      <input type="date" value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="w-full sm:w-auto px-4 py-2.5 border border-gray-300 rounded-xl text-sm" />
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <input type="date" value={dateRange.start}
                          onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                          className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm" />
                        <input type="date" value={dateRange.end}
                          onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
                          className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm" />
                      </div>
                    )}
                    <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}
                      className="w-full sm:w-auto px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white">
                      <option value="all">All Classes</option>
                      {classOptions.map((cls) => (<option key={cls.id} value={cls.id}>{cls.name}</option>))}
                    </select>
                    <div className="relative flex-1">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="text" placeholder="Search classes..."
                        value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm" />
                    </div>
                    <button onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                      className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm flex items-center gap-2 hover:bg-gray-50">
                      <Filter size={16} />
                      <span className="hidden sm:inline">Advanced</span>
                    </button>
                  </div>
                  {showAdvancedFilters && (
                    <div className="mt-4">
                      <AdvancedFilters filters={advancedFilters} onChange={setAdvancedFilters}
                        onClose={() => setShowAdvancedFilters(false)} />
                    </div>
                  )}
                </div>
              </div>

              {isError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-sm text-red-700">Failed to load attendance data. Try refreshing.</p>
                </div>
              )}

              <CompactStats
                present={summary.present} absent={summary.absent}
                late={summary.late} excused={summary.excused} total={summary.total}
              />

              {/* ── NEW: Timetable coverage card (daily only) ─── */}
              {isDaily && (
                <CoverageCard
                  rows={coverageQ.data ?? []}
                  dateLabel={new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, {
                    weekday: 'long', day: '2-digit', month: 'short', year: 'numeric',
                  })}
                  loading={coverageQ.isLoading}
                />
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-1">
                  <RiskOverview
                    classId={selectedClass === 'all' ? undefined : selectedClass}
                    className={selectedClassName}
                  />
                </div>
                <div className="lg:col-span-2 space-y-4">
                  {lateArrivals.length > 0 && (
                    <div className="bg-white rounded-xl border border-yellow-200 p-4">
                      <h3 className="font-semibold text-yellow-800 mb-3 flex items-center gap-2">
                        <Clock size={18} /> Late Arrivals (selected period)
                      </h3>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {lateArrivals.slice(0, 10).map((late, i) => (
                          <div key={`${late.studentId}-${late.date}-${i}`}
                            className="flex items-center justify-between text-sm p-2 bg-yellow-50 rounded gap-2">
                            <div className="min-w-0">
                              <span className="font-medium truncate">{late.studentName}</span>
                              <span className="text-xs text-gray-500 ml-2">{late.className}</span>
                            </div>
                            <span className="text-xs text-gray-500 flex-shrink-0 tabular-nums">{late.date}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {subjectAlerts.length > 0 && (
                    <div className="bg-white rounded-xl border border-orange-200 p-4">
                      <h3 className="font-semibold text-orange-800 mb-3 flex items-center gap-2">
                        <BookOpen size={18} /> Subject Truancy Alerts
                      </h3>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {subjectAlerts.slice(0, 10).map((alert, i) => (
                          <div key={`${alert.studentId}-${alert.subject}-${i}`}
                            className="flex items-center justify-between text-sm p-2 bg-orange-50 rounded gap-2">
                            <div className="min-w-0">
                              <span className="font-medium truncate">{alert.studentName}</span>
                              <span className="text-xs text-gray-500 ml-2">{alert.subject}</span>
                            </div>
                            <span className={`text-xs font-medium flex-shrink-0 tabular-nums ${alert.rate < 60 ? 'text-red-600' : 'text-orange-600'}`}>
                              {alert.rate.toFixed(0)}% attendance
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4 sm:space-y-6">
                {isDaily && trendData.length > 0 && <AttendanceChart data={trendData} />}
                {Object.keys(summary.classBreakdown).length > 0 && (
                  <ClassBreakdownTable data={summary.classBreakdown} />
                )}

                {/* ── NEW: Per-teacher coverage (daily only) ─── */}
                {isDaily && (teacherCoverageQ.data?.length ?? 0) > 0 && (
                  <UncoveredPeriodsTable
                    rows={teacherCoverageQ.data ?? []}
                    loading={teacherCoverageQ.isLoading}
                  />
                )}

                {lateArrivals.length > 0 && <LateArrivalsView lateArrivals={lateArrivals} />}
                {subjectAlerts.length > 0 && <SubjectTruancyView truancy={subjectAlerts} />}
              </div>

              <div className="pt-4 border-t border-gray-200">
                <p className="text-xs sm:text-sm text-gray-500">
                  Last updated: {new Date().toLocaleString()} · {filteredRollups.length}{' '}
                  class{filteredRollups.length === 1 ? '' : 'es'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}