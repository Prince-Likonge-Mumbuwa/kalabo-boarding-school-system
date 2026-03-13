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

// Admin Pages
import AdminDashboard from "./pages/AdminDashboard";
import AttendanceOverview from "./pages/admin/AttendanceOverview";
import ClassManagement from "./pages/admin/ClassManagement";
import TeacherManagement from "./pages/admin/TeacherManagement";
import ExamManagement from "./pages/admin/ExamManagement";
import ReportCards from "./pages/admin/ReportCards";
import AdminResultsAnalysis from "./pages/admin/AdminResultsAnalysis";

// Teacher Pages
import TeacherDashboard from "./pages/TeacherDashboard";
import AttendanceTracking from "./pages/teacher/AttendanceTracking";
import ResultsEntry from "./pages/teacher/ResultsEntry";
import TeacherResultsAnalysis from "./pages/teacher/TeacherResultsAnalysis";
import MyClass from "@/pages/teacher/MyClass";

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