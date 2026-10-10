import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Landing from "./pages/Landing";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import ForgotPassword from "./pages/ForgotPassword";
import ParentPortal from "./pages/ParentPortal";

// Admin Pages
import AdminDashboard from "./pages/AdminDashboard";
import AttendanceOverview from "./pages/admin/AttendanceOverview";
import ClassManagement from "./pages/admin/ClassManagement";
import TeacherManagement from "./pages/admin/TeacherManagement";
import ExamManagement from "./pages/admin/ExamManagement";
import ResultsEntryMonitor from "./pages/admin/ResultsEntryMonitor";
import ResultsDataCheck from "./pages/admin/ResultsDataCheck";
import TimetableDataCheck from "./pages/admin/TimetableDataCheck";
import LiveTimetable from "./pages/admin/LiveTimetable";
import ReportCards from "./pages/admin/ReportCards";
import AdminResultsAnalysis from "./pages/admin/AdminResultsAnalysis";
import SbaSchoolOverview from "./pages/admin/SbaSchoolOverview";

// Teacher Pages
import TeacherDashboard from "./pages/TeacherDashboard";
import AttendanceTracking from "./pages/teacher/AttendanceTracking";
import ResultsEntry from "./pages/teacher/ResultsEntry";
import TeacherResultsAnalysis from "./pages/teacher/TeacherResultsAnalysis";
import MyClass from "@/pages/teacher/MyClass";
import SbaEntry from "./pages/teacher/SbaEntry";
import MyTimetable from "./pages/teacher/MyTimetable";   // ← NEW

// Settings Page (works for both admin and teacher)
import Settings from "./pages/Settings";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <PWAInstallPrompt />
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/parent-portal" element={<ParentPortal />} />

            {/* ==================== ADMIN ROUTES ==================== */}
            <Route path="/dashboard/admin" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            } />

            <Route path="/dashboard/admin/classes" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <ClassManagement />
              </ProtectedRoute>
            } />

            {/*
              Attendance Overview also hosts the timetable admin tabs:
              Periods, Holidays, and Approvals. No separate route needed.
            */}
            <Route path="/dashboard/admin/attendance-overview" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AttendanceOverview />
              </ProtectedRoute>
            } />

            <Route path="/dashboard/admin/teachers" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <TeacherManagement />
              </ProtectedRoute>
            } />

            <Route path="/dashboard/admin/exams" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <ExamManagement />
              </ProtectedRoute>
            } />

            {/* Admin Results Entry Monitor — standalone feature */}
            {/* Shows, per teacher, who has entered what and what is missing. */}
            {/* Reads directly from class_slots + results, not from exam configs. */}
            <Route path="/dashboard/admin/results-monitor" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <ResultsEntryMonitor />
              </ProtectedRoute>
            } />

            {/* Admin: who is teaching now / on a date */}
            <Route path="/dashboard/admin/timetable-live" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <LiveTimetable />
              </ProtectedRoute>
            } />

            {/* Admin timetable data check (read-only check, explicit fixes) */}
            <Route path="/dashboard/admin/timetable-data-check" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <TimetableDataCheck />
              </ProtectedRoute>
            } />

            {/* Admin results data check (read-only check, explicit fixes) */}
            <Route path="/dashboard/admin/results-data-check" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <ResultsDataCheck />
              </ProtectedRoute>
            } />

            <Route path="/dashboard/admin/report-cards" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <ReportCards />
              </ProtectedRoute>
            } />

            <Route path="/dashboard/admin/results-analysis" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminResultsAnalysis />
              </ProtectedRoute>
            } />

            {/* Admin SBA Overview — school-wide tracking */}
            <Route path="/dashboard/admin/sba-overview" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <SbaSchoolOverview />
              </ProtectedRoute>
            } />

            {/* Admin Settings */}
            <Route path="/dashboard/admin/settings" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Settings />
              </ProtectedRoute>
            } />

            {/* ==================== TEACHER ROUTES ==================== */}
            <Route path="/dashboard/teacher" element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <TeacherDashboard />
              </ProtectedRoute>
            } />

            {/* My Class - Teacher's assigned class */}
            <Route path="/dashboard/teacher/my-class" element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <MyClass />
              </ProtectedRoute>
            } />

            {/* My Timetable — weekly grid, submitted for admin approval.
                Cover teachers see the owner's periods automatically. */}
            <Route path="/dashboard/teacher/my-timetable" element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <MyTimetable />
              </ProtectedRoute>
            } />

            <Route path="/dashboard/teacher/attendance" element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <AttendanceTracking />
              </ProtectedRoute>
            } />

            <Route path="/dashboard/teacher/results-entry" element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <ResultsEntry />
              </ProtectedRoute>
            } />

            <Route path="/dashboard/teacher/results-analysis" element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <TeacherResultsAnalysis />
              </ProtectedRoute>
            } />

            {/* Teacher SBA Entry — mark entry for assigned SBA subjects */}
            <Route path="/dashboard/teacher/sba-entry" element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <SbaEntry />
              </ProtectedRoute>
            } />

            {/* Teacher Settings */}
            <Route path="/dashboard/teacher/settings" element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <Settings />
              </ProtectedRoute>
            } />

            {/* Catch-all route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(<App />);