import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import Landing from "./pages/Landing";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";

// Admin Pages
import AdminDashboard from "./pages/AdminDashboard";
import ClassManagement from "./pages/admin/ClassManagement";
import TeacherManagement from "./pages/admin/TeacherManagement";
import ReportCards from "./pages/admin/ReportCards";
import AdminResultsAnalysis from "./pages/admin/AdminResultsAnalysis";

// Teacher Pages
import TeacherDashboard from "./pages/TeacherDashboard";
import AttendanceTracking from "./pages/teacher/AttendanceTracking";
import ResultsEntry from "./pages/teacher/ResultsEntry";
import TeacherResultsAnalysis from "./pages/teacher/TeacherResultsAnalysis";

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

            {/* Admin Routes */}
            <Route path="/dashboard/admin" element={<AdminDashboard />} />
            <Route path="/dashboard/admin/classes" element={<ClassManagement />} />
            <Route path="/dashboard/admin/teachers" element={<TeacherManagement />} />
            <Route path="/dashboard/admin/report-cards" element={<ReportCards />} />
            <Route path="/dashboard/admin/results-analysis" element={<AdminResultsAnalysis />} />

            {/* Teacher Routes */}
            <Route path="/dashboard/teacher" element={<TeacherDashboard />} />
            <Route path="/dashboard/teacher/attendance" element={<AttendanceTracking />} />
            <Route path="/dashboard/teacher/results-entry" element={<ResultsEntry />} />
            <Route path="/dashboard/teacher/results-analysis" element={<TeacherResultsAnalysis />} />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(<App />);
