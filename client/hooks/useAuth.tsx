import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';

export type UserType = 'admin' | 'teacher' | null;

export interface User {
  id: string;
  email: string;
  name?: string;
  userType: 'admin' | 'teacher';
  subjects?: string[]; // For teachers
}

interface AuthContextType {
  user: User | null;
  userType: UserType;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;
  signup: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    // Try to restore user from localStorage
    try {
      const stored = localStorage.getItem('kalaboboarding_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback((userData: User) => {
    setUser(userData);
    localStorage.setItem('kalaboboarding_user', JSON.stringify(userData));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('kalaboboarding_user');
  }, []);

  const signup = useCallback((userData: User) => {
    setUser(userData);
    localStorage.setItem('kalaboboarding_user', JSON.stringify(userData));
  }, []);

  const value: AuthContextType = {
    user,
    userType: user?.userType || null,
    isAuthenticated: user !== null,
    login,
    logout,
    signup,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
