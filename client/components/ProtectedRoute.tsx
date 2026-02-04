// src/components/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { UserType } from '@/hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserType[];
}

export function ProtectedRoute({ children, allowedRoles = ['admin', 'teacher'] }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, userType } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/signin" replace />;
  }

  if (!allowedRoles.includes(userType)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}