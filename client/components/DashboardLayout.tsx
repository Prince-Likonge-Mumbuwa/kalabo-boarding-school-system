import { useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
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
} from 'lucide-react';

interface DashboardLayoutProps {
  children: ReactNode;
  activeTab?: string;
}

export function DashboardLayout({ children, activeTab = 'dashboard' }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isAdmin = user?.userType === 'admin';

  const adminMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard/admin' },
    { id: 'classes', label: 'Class Management', icon: BookOpen, path: '/dashboard/admin/classes' },
    { id: 'teachers', label: 'Teacher Management', icon: Users, path: '/dashboard/admin/teachers' },
    { id: 'results', label: 'Results Analysis', icon: BarChart3, path: '/dashboard/admin/results-analysis' },
    { id: 'reports', label: 'Report Cards', icon: FileText, path: '/dashboard/admin/report-cards' },
  ];

  const teacherMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard/teacher' },
    { id: 'attendance', label: 'Attendance Tracking', icon: Clock, path: '/dashboard/teacher/attendance' },
    { id: 'results', label: 'Results Entry', icon: PenTool, path: '/dashboard/teacher/results-entry' },
    { id: 'analysis', label: 'Results Analysis', icon: BarChart3, path: '/dashboard/teacher/results-analysis' },
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
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{user?.name}</p>
              <p className="text-xs text-gray-400 capitalize truncate">{user?.userType}</p>
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
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
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
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors duration-200">
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
          <div className="md:hidden">
            <h1 className="font-bold text-gray-900">Dashboard</h1>
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
