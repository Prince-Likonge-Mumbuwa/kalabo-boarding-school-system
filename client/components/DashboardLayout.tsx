import { useState, ReactNode } from 'react';
import { useEmbedded } from '@/components/workspace/embedded';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAdmissionsOfficer } from '@/hooks/useAdmissionsOfficer';
import { useGuidanceOfficer } from '@/hooks/useGuidanceOfficer';
import { useMyHodRole } from '@/hooks/useDepartments';
import { useTimetablerRole } from '@/hooks/useTimetableBuilder';
import { useTeacherClasses, holdsFormTeacherSlot } from '@/hooks/useTeacherClasses';
import {
  Menu,
  X,
  LogOut,
  Settings,
  LayoutDashboard,
  Users,
  BookOpen,
  BarChart3,
  FileText,
  Clock,
  PenTool,
  CalendarCheck,
  Calendar,
  GraduationCap,
  ClipboardCheck,
  Activity,
  UserPlus,
  Award,
  History,
  CalendarRange,
  HeartHandshake,
} from 'lucide-react';

// Union of all navigable tab ids — keeps activeTab type-safe across pages.
// Add new tab ids here when you add new routes.
type ActiveTab =
  | 'dashboard'
  | 'classes'
  | 'teachers'
  | 'attendance'
  | 'exams'
  | 'results-monitor'
  | 'results'
  | 'reports'
  | 'my-class'
  | 'my-timetable'      // ← NEW
  | 'analysis'
  | 'sba'
  | 'sba-overview'
  | 'year-transition'
  | 'admissions'
  | 'my-department'
  | 'timetable-builder'
  | 'admissions-classes'
  | 'results-sba'
  | 'attendance-timetable'
  | 'audit-trail'
  | 'guidance'
  | (string & {}); // allow any string for forward-compatibility without losing hints

interface DashboardLayoutProps {
  children: ReactNode;
  activeTab?: ActiveTab;
}

/**
 * The app frame (sidebar + top bar). Inside a tabbed workspace the
 * workspace has already drawn the frame, so a page used as a tab renders
 * only its content.
 */
export function DashboardLayout(props: DashboardLayoutProps) {
  const embedded = useEmbedded();
  if (embedded) return <>{props.children}</>;
  return <DashboardShell {...props} />;
}

function DashboardShell({ children, activeTab = 'dashboard' }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isAdmin = user?.userType === 'admin';
  const { isOfficer } = useAdmissionsOfficer();
  const { isOfficer: isGuidanceOfficer } = useGuidanceOfficer();
  const { role: hodRole } = useMyHodRole();
  const { isTimetabler } = useTimetablerRole();
  // "My Class" is only for a class's form teacher (or the teacher covering them).
  const { data: teacherClasses } = useTeacherClasses({ enabled: user?.userType === 'teacher' });
  const isFormTeacher = holdsFormTeacherSlot(teacherClasses);

  // Related admin pages are grouped into tabbed workspaces; each item opens
  // its workspace's usual first tab. (Old page addresses still work and
  // open the matching tab.)
  const adminMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard/admin' },
    // Admissions + Class Management
    { id: 'admissions-classes', label: 'Admissions & Classes', icon: BookOpen, path: '/dashboard/admin/classes' },
    { id: 'teachers', label: 'Teachers', icon: Users, path: '/dashboard/admin/teachers' },
    // Attendance Overview + Who's Teaching + Periods / Holidays / Timetable generator
    { id: 'attendance-timetable', label: 'Attendance & Timetable', icon: CalendarCheck, path: '/dashboard/admin/attendance-overview' },
    { id: 'exams', label: 'Exam Management', icon: Calendar, path: '/dashboard/admin/exams' },
    // Results Monitor + Results Analysis + SBA Overview
    { id: 'results-sba', label: 'Results & SBA', icon: BarChart3, path: '/dashboard/admin/results-monitor' },
    { id: 'reports', label: 'Report Cards', icon: FileText, path: '/dashboard/admin/report-cards' },
    // Sponsored learners' results and one-time sponsor codes.
    { id: 'guidance', label: 'Guidance & Sponsors', icon: HeartHandshake, path: '/dashboard/admin/guidance' },
    // New academic year: promote learners, graduate the final year.
    { id: 'year-transition', label: 'Year Transition', icon: GraduationCap, path: '/dashboard/admin/year-transition' },
    // Who did what, and when.
    { id: 'audit-trail', label: 'Audit Trail', icon: History, path: '/dashboard/admin/audit-trail' },
  ];

  const teacherMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard/teacher' },
    ...(isFormTeacher ? [{ id: 'my-class', label: 'My Class', icon: GraduationCap, path: '/dashboard/teacher/my-class' }] : []),
    // The teacher's timetable as published by the school (read-only, PDF)
    { id: 'my-timetable', label: 'My Timetable', icon: Calendar, path: '/dashboard/teacher/my-timetable' },
    { id: 'attendance', label: 'Attendance Tracking', icon: Clock, path: '/dashboard/teacher/attendance' },
    { id: 'results', label: 'Results Entry', icon: PenTool, path: '/dashboard/teacher/results-entry' },
    { id: 'analysis', label: 'Results Analysis', icon: BarChart3, path: '/dashboard/teacher/results-analysis' },
    { id: 'sba', label: 'SBA Entry', icon: ClipboardCheck, path: '/dashboard/teacher/sba-entry' },
    // Only for teachers the admin made admissions officers.
    ...(isOfficer ? [{ id: 'admissions', label: 'Admissions', icon: UserPlus, path: '/dashboard/teacher/admissions' }] : []),
    // Only for teachers the admin made guidance & counselling officers.
    ...(isGuidanceOfficer ? [{ id: 'guidance', label: 'Guidance & Counselling', icon: HeartHandshake, path: '/dashboard/teacher/guidance' }] : []),
    // Only for a Head of Department (appointed in Teacher Management).
    ...(hodRole ? [{ id: 'my-department', label: 'My Department', icon: Award, path: '/dashboard/teacher/department' }] : []),
    // A HoD the admin allowed to generate timetables.
    ...(hodRole && isTimetabler ? [{ id: 'timetable-builder', label: 'Timetable Builder', icon: CalendarRange, path: '/dashboard/teacher/timetable-builder' }] : []),
  ];

  const menuItems = isAdmin ? adminMenuItems : teacherMenuItems;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`fixed md:relative z-40 w-64 h-screen bg-gray-900 text-white flex flex-col transition-transform duration-300 transform ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Logo & Close Button */}
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
              K
            </div>
            <span className="font-bold text-lg">KalaboBoarding</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* User Info */}
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
              {user?.fullName?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{user?.fullName}</p>
              <p className="text-xs text-gray-400 capitalize truncate">
                {hodRole ? `HoD · ${hodRole.department}` : user?.userType}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  navigate(item.path);
                  setSidebarOpen(false);
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Icon size={20} />
                <span className="font-medium text-sm">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Settings & Logout */}
        <div className="p-4 border-t border-gray-800 space-y-2">
          <button
            onClick={() => {
              navigate(isAdmin ? '/dashboard/admin/settings' : '/dashboard/teacher/settings');
              setSidebarOpen(false);
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors duration-200"
          >
            <Settings size={20} />
            <span className="font-medium text-sm">Settings</span>
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-red-600/20 hover:text-red-400 transition-colors duration-200"
          >
            <LogOut size={20} />
            <span className="font-medium text-sm">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <div className="md:hidden min-w-0">
            <p className="font-bold text-gray-900 truncate">
              {menuItems.find(i => i.id === activeTab)?.label ?? 'Dashboard'}
            </p>
          </div>
          <div className="ml-auto" />
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}