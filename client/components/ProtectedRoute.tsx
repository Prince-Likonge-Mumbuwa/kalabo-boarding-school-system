// src/components/ProtectedRoute.tsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: Array<'admin' | 'teacher'>;
}

export function ProtectedRoute({ children, allowedRoles = ['admin', 'teacher'] }: ProtectedRouteProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="relative">
          {/* Outer ring */}
          <div className="w-16 h-16 border-4 border-gray-200 rounded-full"></div>
          {/* Inner spinning ring */}
          <div className="absolute top-0 left-0 w-16 h-16 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
        </div>
        <p className="ml-4 text-gray-600">Loading...</p>
      </div>
    );
  }

  // Not authenticated - redirect to signin
  if (!isAuthenticated) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  // Check if user has required role
  if (user && !allowedRoles.includes(user.userType)) {
    // Redirect to appropriate dashboard based on their actual role
    if (user.userType === 'admin') {
      return <Navigate to="/dashboard/admin" replace />;
    } else {
      return <Navigate to="/dashboard/teacher" replace />;
    }
  }

  // Authenticated and authorized - render children
  return <>{children}</>;
}

// Optional: Create a separate component for the loading spinner
export const AuthLoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="text-center">
      <div className="relative inline-block">
        <div className="w-12 h-12 border-4 border-gray-200 rounded-full"></div>
        <div className="absolute top-0 left-0 w-12 h-12 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
      </div>
      <p className="mt-4 text-gray-600">Verifying authentication...</p>
    </div>
  </div>
);