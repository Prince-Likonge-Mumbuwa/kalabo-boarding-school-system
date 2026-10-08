// @/pages/admin/AttendanceOverview.tsx
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
import {
  Filter, Download, RefreshCw,
  Search, ChevronDown, X,
  CheckCircle2, XCircle, AlertCircle, Clock,
  Loader2, BookOpen,
} from 'lucide-react';
import type { AttendanceDailyRollup } from '@/types/attendance';

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
// ADVANCED FILTERS
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

// ============================================================================
// RISK OVERVIEW
// ============================================================================

function RiskOverview({
  classId,
  className,
}: {
  classId: string | undefined;
  className: string;
}) {
  // Roughly one term back. Caller can tune later if term boundaries are known.
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
          <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">
            High: {highCount}
          </span>
          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">
            Medium: {mediumCount}
          </span>
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
                  <p className="font-medium text-gray-900 truncate">
                    {risk.studentName}
                  </p>
                  <p className="text-xs text-gray-600 truncate">{risk.className}</p>
                </div>
                <span
                  className={`px-2 py-1 rounded-full text-xs flex-shrink-0 ${
                    risk.riskLevel === 'high'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {risk.riskLevel}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {risk.riskFactors.slice(0, 2).map((factor, i) => (
                  <span
                    key={`${risk.studentId}-${i}`}
                    className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-gray-200"
                  >
                    {factor}
                  </span>
                ))}
                {risk.riskFactors.length > 2 && (
                  <span className="text-[10px] text-gray-500">
                    +{risk.riskFactors.length - 2} more
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 text-center py-4">
          No at-risk students found
        </p>
      )}
    </div>
  );
}

// ============================================================================
// ATTENDANCE CHART
// ============================================================================

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
        <h3 className="text-lg font-bold text-gray-900">
          Attendance Trend (Mon-Fri)
        </h3>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span>
            Avg: <span className="font-bold text-gray-900 tabular-nums">{avgRate}%</span>
          </span>
          <span>
            High: <span className="font-bold text-green-600 tabular-nums">{maxRate.toFixed(0)}%</span>
          </span>
          <span>
            Low: <span className="font-bold text-red-600 tabular-nums">{minRate.toFixed(0)}%</span>
          </span>
        </div>
      </div>

      {/* Bars and gridlines share the same 0-100% axis. */}
      <div className="h-48 sm:h-64 relative">
        {/* Gridlines */}
        <div className="absolute inset-0 pointer-events-none">
          {[0, 25, 50, 75, 100].map((val) => (
            <div
              key={val}
              className="absolute left-0 right-0 border-t border-gray-100"
              style={{ bottom: `${val}%` }}
            />
          ))}
        </div>

        {/* Bars */}
        <div className="absolute inset-0 overflow-x-auto overflow-y-visible pb-4">
          <div className="flex items-end justify-start sm:justify-around gap-2 sm:gap-4 min-w-[300px] sm:min-w-0 h-full">
            {weekdays.map((day) => {
              const [y, m, d] = day.date.split('-').map(Number);
              const dt = new Date(y, m - 1, d);
              return (
                <div
                  key={day.date}
                  className="flex flex-col items-center flex-shrink-0 w-12 sm:w-16 h-full justify-end"
                >
                  <div className="relative group w-full flex justify-center items-end h-full">
                    <div
                      className="w-6 sm:w-8 bg-blue-500 rounded-t transition-all duration-500 hover:bg-blue-600"
                      style={{
                        height: `${day.rate}%`,
                        minHeight: day.rate > 0 ? '2px' : '0',
                      }}
                    />
                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                      {day.rate.toFixed(0)}% ({day.present}/{day.total})
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 mt-2">
                    {dt.toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
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

// ============================================================================
// CLASS BREAKDOWN TABLE
// ============================================================================

function ClassBreakdownTable({
  data,
}: {
  data: AttendanceSummary['classBreakdown'];
}) {
  const classes = Object.values(data);

  if (classes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-gray-500">
          No daily attendance records for the selected period.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">
          Class-wise Attendance (Daily Roll Call)
        </h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Based on daily attendance records only
        </p>
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
              <div>
                <div className="text-lg font-semibold text-gray-900 tabular-nums">{cls.total}</div>
                <div className="text-xs text-gray-500">Total</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-green-600 tabular-nums">{cls.present}</div>
                <div className="text-xs text-gray-500">Present</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-red-600 tabular-nums">{cls.absent}</div>
                <div className="text-xs text-gray-500">Absent</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-yellow-600 tabular-nums">{cls.late}</div>
                <div className="text-xs text-gray-500">Late</div>
              </div>
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

// ============================================================================
// LATE ARRIVALS VIEW
// ============================================================================

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
                <td className="px-4 py-3">
                  <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded-full">absent</span>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full">present</span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{late.firstPeriodSubject}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// SUBJECT TRUANCY VIEW
// ============================================================================

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
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 text-xs rounded-full ${rateBadgeClass(item.rate)}`}>
                    {item.rate.toFixed(1)}%
                  </span>
                </td>
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
              <span className={`px-2 py-1 text-xs rounded-full flex-shrink-0 ${rateBadgeClass(item.rate)}`}>
                {item.rate.toFixed(1)}%
              </span>
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
// MAIN COMPONENT
// ============================================================================

export default function AttendanceOverview() {
  useAuth();

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

  // Trend query: same hook, different range. Only meaningful in daily view.
  const trendRange = useMemo(
    () => ({ start: daysAgoYMD(6), end: formatLocalYMD(new Date()) }),
    [],
  );
  const trendQuery = useAttendanceRollupsForRange(trendRange.start, trendRange.end);
  const trendRollups = isDaily ? trendQuery.data : [];

  // ── Class dropdown options (derived from rollups, no separate query) ──
  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rollups) {
      if (!map.has(r.classId)) map.set(r.classId, r.className);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rollups]);

  const selectedClassName = useMemo(() => {
    if (selectedClass === 'all') return '';
    return classOptions.find((c) => c.id === selectedClass)?.name ?? '';
  }, [selectedClass, classOptions]);

  // ── Filter rollups ─────────────────────────────────────────────────
  const filteredRollups = useMemo(() => {
    let result = rollups;

    if (selectedClass !== 'all') {
      result = result.filter((r) => r.classId === selectedClass);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter((r) => r.className.toLowerCase().includes(term));
    }

    if (advancedFilters.showWeekdaysOnly) {
      result = result.filter((r) => isWeekday(r.date));
    }

    return result;
  }, [rollups, selectedClass, searchTerm, advancedFilters.showWeekdaysOnly]);

  // ── Summary ────────────────────────────────────────────────────────
  const summary = useMemo((): AttendanceSummary => {
    let total = 0;
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;
    const classBreakdown: AttendanceSummary['classBreakdown'] = {};

    for (const r of filteredRollups) {
      const d = r.daily;
      if (!d) continue;

      total += d.total;
      present += d.present;
      absent += d.absent;
      late += d.late;
      excused += d.excused;

      classBreakdown[r.classId] = {
        classId: r.classId,
        className: r.className,
        total: d.total,
        present: d.present,
        absent: d.absent,
        late: d.late,
        excused: d.excused,
        rate: Math.round(d.rate),
      };
    }

    return {
      total,
      present,
      absent,
      late,
      excused,
      rate: total > 0 ? ((present + late) / total) * 100 : 0,
      classBreakdown,
    };
  }, [filteredRollups]);

  // ── Trend data ─────────────────────────────────────────────────────
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

    return Array.from(byDate.entries())
      .map(([date, acc]) => ({
        date,
        total: acc.total,
        present: acc.present,
        late: acc.late,
        rate: acc.total > 0 ? ((acc.present + acc.late) / acc.total) * 100 : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [trendRollups, isDaily, selectedClass]);

  // ── Late arrivals: dedupe by (studentId, date) across the range ────
  const lateArrivals: LateArrivalRow[] = useMemo(() => {
    const seen = new Set<string>();
    const out: LateArrivalRow[] = [];
    for (const r of filteredRollups) {
      for (const la of r.lateArrivals ?? []) {
        const key = `${la.studentId}_${r.date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          studentId: la.studentId,
          studentName: la.studentName,
          className: r.className,
          date: r.date,
          firstPeriodSubject: la.firstPeriodSubject,
        });
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredRollups]);

  // ── Subject alerts: aggregate per (student, subject) across days ───
  const subjectAlerts: SubjectAlertRow[] = useMemo(() => {
    const map = new Map<string, {
      studentId: string;
      studentName: string;
      className: string;
      subject: string;
      missed: number;
      total: number;
    }>();

    for (const r of filteredRollups) {
      for (const sa of r.subjectAlerts ?? []) {
        const key = `${sa.studentId}_${sa.subject}`;
        const acc = map.get(key) ?? {
          studentId: sa.studentId,
          studentName: sa.studentName,
          className: r.className,
          subject: sa.subject,
          missed: 0,
          total: 0,
        };
        acc.missed += sa.missed;
        acc.total += sa.total;
        map.set(key, acc);
      }
    }

    return Array.from(map.values())
      .map((a) => ({
        ...a,
        rate: a.total > 0 ? ((a.total - a.missed) / a.total) * 100 : 0,
      }))
      .sort((a, b) => a.rate - b.rate);
  }, [filteredRollups]);

  // ── Handlers ───────────────────────────────────────────────────────
  const handleRefresh = async () => {
    await rollupsQuery.refetch();
    if (isDaily) await trendQuery.refetch();
  };

  const handleExport = (type: ExportType) => {
    const filename = `attendance_${selectedDate}`;

    switch (type) {
      case 'all': {
        const rows: AttendanceExportRow[] = filteredRollups
          .filter((r) => r.daily)
          .map((r) => ({
            studentId: '',
            studentName: '',
            classId: r.classId,
            className: r.className,
            date: r.date,
            status: '',
            attendanceType: 'daily',
            markedBy: '',
            markedByName: r.periodicTotals.distinctTeachers.join(', '),
            timestamp: r.updatedAt,
          }));
        exportAttendanceRecords(rows, filename, advancedFilters.showWeekdaysOnly);
        break;
      }
      case 'late': {
        const rows: LateArrivalExportRow[] = lateArrivals.map((l) => ({
          studentId: l.studentId,
          studentName: l.studentName,
          className: l.className,
          date: l.date,
          dailyStatus: 'absent',
          firstPeriodStatus: 'present',
        }));
        exportLateArrivals(rows, `late_arrivals_${selectedDate}`);
        break;
      }
      case 'truancy': {
        const rows: SubjectTruancyExportRow[] = subjectAlerts.map((s) => ({
          studentId: s.studentId,
          studentName: s.studentName,
          className: s.className,
          subject: s.subject,
          teacherName: '',
          totalSessions: s.total,
          attended: s.total - s.missed,
          missed: s.missed,
          attendanceRate: s.rate,
          trend: 'stable' as const,
        }));
        exportSubjectTruancy(rows, `subject_truancy_${selectedDate}`);
        break;
      }
    }
  };

  const isLoading = rollupsQuery.isLoading;
  const isError = rollupsQuery.isError;

  // ── Render ─────────────────────────────────────────────────────────
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
                Monitor attendance across all classes
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="p-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 flex-shrink-0"
              >
                <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
              </button>

              <div className="relative group">
                <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700">
                  <Download size={18} />
                  <span className="hidden sm:inline">Export</span>
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 hidden group-hover:block z-10">
                  <button onClick={() => handleExport('all')} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm">
                    All Records
                  </button>
                  <button onClick={() => handleExport('late')} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm">
                    Late Arrivals
                  </button>
                  <button onClick={() => handleExport('truancy')} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm">
                    Subject Truancy
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-1 inline-flex w-full sm:w-auto overflow-x-auto">
            <div className="flex gap-1 min-w-max">
              {(['daily', 'weekly', 'monthly', 'class'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all whitespace-nowrap ${
                    viewMode === mode ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className="w-full flex items-center justify-between p-4 sm:hidden"
            >
              <div className="flex items-center gap-2">
                <Filter size={18} className="text-gray-400" />
                <span className="font-medium text-gray-700">Filters</span>
              </div>
              <ChevronDown size={18} className={`transition-transform ${showMobileFilters ? 'rotate-180' : ''}`} />
            </button>

            <div className={`p-4 ${showMobileFilters ? 'block' : 'hidden sm:block'}`}>
              <div className="flex flex-col sm:flex-row gap-3">
                {isDaily ? (
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full sm:w-auto px-4 py-2.5 border border-gray-300 rounded-xl text-sm"
                  />
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <input
                      type="date"
                      value={dateRange.start}
                      onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                      className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm"
                    />
                    <input
                      type="date"
                      value={dateRange.end}
                      onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
                      className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm"
                    />
                  </div>
                )}

                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="w-full sm:w-auto px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white"
                >
                  <option value="all">All Classes</option>
                  {classOptions.map((cls) => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>

                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search classes..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm"
                  />
                </div>

                <button
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm flex items-center gap-2 hover:bg-gray-50"
                >
                  <Filter size={16} />
                  <span className="hidden sm:inline">Advanced</span>
                </button>
              </div>

              {showAdvancedFilters && (
                <div className="mt-4">
                  <AdvancedFilters
                    filters={advancedFilters}
                    onChange={setAdvancedFilters}
                    onClose={() => setShowAdvancedFilters(false)}
                  />
                </div>
              )}
            </div>
          </div>

          {isError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-700">
                Failed to load attendance data. Try refreshing.
              </p>
            </div>
          )}

          <CompactStats
            present={summary.present}
            absent={summary.absent}
            late={summary.late}
            excused={summary.excused}
            total={summary.total}
          />

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
                    <Clock size={18} />
                    Late Arrivals (selected period)
                  </h3>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {lateArrivals.slice(0, 10).map((late, i) => (
                      <div
                        key={`${late.studentId}-${late.date}-${i}`}
                        className="flex items-center justify-between text-sm p-2 bg-yellow-50 rounded gap-2"
                      >
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
                    <BookOpen size={18} />
                    Subject Truancy Alerts
                  </h3>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {subjectAlerts.slice(0, 10).map((alert, i) => (
                      <div
                        key={`${alert.studentId}-${alert.subject}-${i}`}
                        className="flex items-center justify-between text-sm p-2 bg-orange-50 rounded gap-2"
                      >
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
            {lateArrivals.length > 0 && <LateArrivalsView lateArrivals={lateArrivals} />}
            {subjectAlerts.length > 0 && <SubjectTruancyView truancy={subjectAlerts} />}
          </div>

          <div className="pt-4 border-t border-gray-200">
            <p className="text-xs sm:text-sm text-gray-500">
              Last updated: {new Date().toLocaleString()} · {filteredRollups.length}{' '}
              class{filteredRollups.length === 1 ? '' : 'es'}
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}