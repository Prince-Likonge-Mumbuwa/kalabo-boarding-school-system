// @/pages/admin/workspaces/AttendanceTimetable.tsx
//
// Admin: "Attendance" (attendance + timetable) — five tabs at one level (no tabs inside
// tabs):
//
//   Overview        /dashboard/admin/attendance-overview   registers taken
//   Who's Teaching  /dashboard/admin/timetable-live        timetabled lessons now / on a date
//   Periods         /dashboard/admin/timetable/periods     bell schedule
//   Holidays        /dashboard/admin/timetable/holidays    school & public holidays
//   Approvals       /dashboard/admin/timetable/approvals   teachers' timetable submissions
//   Face recognition /dashboard/admin/face-recognition     enrol faces, match levels
//                   (the on/off switch stays in Settings)
//
// Periods, Holidays and Approvals used to be tabs inside Attendance
// Overview; they are the same components. Teachers' own Attendance Tracking
// page is not part of this workspace.

import { lazy } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, CalendarCheck, Check, Clock, ScanFace, Search, Settings as SettingsIcon } from 'lucide-react';
import { TabbedWorkspace, type WorkspaceTab } from '@/components/workspace/TabbedWorkspace';

const AttendanceOverview = lazy(() => import('../AttendanceOverview'));
const LiveTimetable = lazy(() => import('../LiveTimetable'));
const PeriodsTab = lazy(() => import('../AttendanceOverview').then(m => ({ default: m.PeriodsTab })));
const HolidaysTab = lazy(() => import('../AttendanceOverview').then(m => ({ default: m.HolidaysTab })));
const ApprovalsTab = lazy(() => import('../AttendanceOverview').then(m => ({ default: m.ApprovalsTab })));
const FaceRecognitionPanel = lazy(() => import('@/components/face/FaceRecognitionPanel'));

export const ATTENDANCE_TIMETABLE_PATHS = {
  attendance: '/dashboard/admin/attendance-overview',
  live: '/dashboard/admin/timetable-live',
  periods: '/dashboard/admin/timetable/periods',
  holidays: '/dashboard/admin/timetable/holidays',
  approvals: '/dashboard/admin/timetable/approvals',
  face: '/dashboard/admin/face-recognition',
} as const;

const padded = (node: React.ReactNode) => <div className="p-3 sm:p-6 lg:p-8 space-y-4">{node}</div>;

const tabs: WorkspaceTab[] = [
  { id: 'attendance', label: 'Overview', icon: CalendarCheck, paths: [ATTENDANCE_TIMETABLE_PATHS.attendance], render: () => <AttendanceOverview /> },
  { id: 'live', label: "Who's Teaching", icon: Clock, paths: [ATTENDANCE_TIMETABLE_PATHS.live], render: () => <LiveTimetable /> },
  { id: 'periods', label: 'Periods', icon: SettingsIcon, paths: [ATTENDANCE_TIMETABLE_PATHS.periods], render: () => padded(<PeriodsTab />) },
  { id: 'holidays', label: 'Holidays', icon: Calendar, paths: [ATTENDANCE_TIMETABLE_PATHS.holidays], render: () => padded(<HolidaysTab />) },
  { id: 'approvals', label: 'Approvals', icon: Check, paths: [ATTENDANCE_TIMETABLE_PATHS.approvals], render: () => padded(<ApprovalsTab />) },
  { id: 'face', label: 'Face recognition', icon: ScanFace, paths: [ATTENDANCE_TIMETABLE_PATHS.face], render: () => padded(<FaceRecognitionPanel />) },
];

export default function AttendanceTimetableWorkspace() {
  return (
    <TabbedWorkspace
      navId="attendance-timetable"
      title="Attendance"
      description="Attendance registers, the lessons timetabled now or on any date, the school timetable set-up and face recognition."
      tabs={tabs}
      actions={
        <Link
          to="/dashboard/admin/timetable-data-check"
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Search size={15} aria-hidden="true" /> Data check
        </Link>
      }
    />
  );
}
