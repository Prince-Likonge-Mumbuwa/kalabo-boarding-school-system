import "./global.css";

import { lazy, Suspense } from "react";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { SessionGuard } from "@/components/app/SessionGuard";
import { UpdateNotice } from "@/components/app/UpdateNotice";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { adminWorkspaceRoutes } from "@/routes/adminWorkspaceRoutes";
import Landing from "./pages/Landing";
import SignIn from "./pages/SignIn";
const SignUp = lazy(() => import("./pages/SignUp"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ParentPortal = lazy(() => import("./pages/ParentPortal"));

// Admin Pages
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const TeacherManagement = lazy(() => import("./pages/admin/TeacherManagement"));
const ExamManagement = lazy(() => import("./pages/admin/ExamManagement"));
const ResultsDataCheck = lazy(() => import("./pages/admin/ResultsDataCheck"));
const TimetableDataCheck = lazy(() => import("./pages/admin/TimetableDataCheck"));
const ReportCards = lazy(() => import("./pages/admin/ReportCards"));
const YearTransition = lazy(() => import("./pages/admin/YearTransition"));
const AuditTrail = lazy(() => import("./pages/admin/AuditTrail"));
const OfficerAdmissions = lazy(() => import("./pages/teacher/Admissions"));
const AdminGuidance = lazy(() => import("./pages/admin/Guidance"));
const OfficerGuidance = lazy(() => import("./pages/teacher/Guidance"));

// Teacher Pages
const TeacherDashboard = lazy(() => import("./pages/TeacherDashboard"));
const AttendanceTracking = lazy(() => import("./pages/teacher/AttendanceTracking"));
const ResultsEntry = lazy(() => import("./pages/teacher/ResultsEntry"));
const TeacherResultsAnalysis = lazy(() => import("./pages/teacher/TeacherResultsAnalysis"));
const MyClass = lazy(() => import("@/pages/teacher/MyClass"));
const SbaEntry = lazy(() => import("./pages/teacher/SbaEntry"));
const MyTimetable = lazy(() => import("./pages/teacher/MyTimetable"));
const MyDepartment = lazy(() => import("./pages/teacher/MyDepartment"));
const TeacherTimetableBuilder = lazy(() => import("./pages/teacher/TimetableBuilderPage"));

// Settings Page (works for both admin and teacher)
const Settings = lazy(() => import("./pages/Settings"));

import NotFound from "./pages/NotFound";

// Pages load on demand (each page is its own download), so the first
// screen appears quickly even on a slow connection.
//
// Query defaults: data stays fresh for a minute and is kept for 10 minutes,
// and is not re-fetched just because the window regains focus — that alone
// used to re-read Firestore every time a teacher switched apps.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PageLoading = () => (
  <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
    <div className="h-6 w-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mr-3" />
    Loading…
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <SessionGuard />
          <UpdateNotice />
          <PWAInstallPrompt />
          <Suspense fallback={<PageLoading />}>
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



            {/* Admin workspaces (tabbed): Admissions & Classes, Results & SBA,
                Attendance. Old page addresses open their tab. */}
            {adminWorkspaceRoutes()}

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




            {/* Admissions officer (a teacher with the role) */}
            <Route path="/dashboard/teacher/admissions" element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <OfficerAdmissions />
              </ProtectedRoute>
            } />

            {/* Guidance & counselling: sponsored learners, sponsor codes */}
            <Route path="/dashboard/admin/guidance" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminGuidance />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/teacher/guidance" element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <OfficerGuidance />
              </ProtectedRoute>
            } />

            {/* Year transition: promotion, graduation, admissions */}
            <Route path="/dashboard/admin/year-transition" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <YearTransition />
              </ProtectedRoute>
            } />

            {/* Audit trail: who did what, and when */}
            <Route path="/dashboard/admin/audit-trail" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AuditTrail />
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

            {/* My Timetable — the school's published timetable (read-only).
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

            {/* Head of Department: the department's teachers and their results entry */}
            <Route path="/dashboard/teacher/department" element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <MyDepartment />
              </ProtectedRoute>
            } />

            {/* Timetable generator for HoDs the admin allowed (Timetablers) */}
            <Route path="/dashboard/teacher/timetable-builder" element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <TeacherTimetableBuilder />
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
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(<App />);