import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { 
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export type UserType = 'admin' | 'teacher';

export interface User {
  id: string;
  email: string;
  name: string;
  userType: UserType;
  subjects?: string[];
}

interface AuthContextType {
  user: User | null;
  userType: UserType | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  signup: (email: string, password: string, name: string, userType: UserType, subjects?: string[]) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log('🔥 Setting up auth state listener');
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      console.log('🔄 Auth state changed:', firebaseUser?.email || 'No user');
      
      if (firebaseUser) {
        try {
          // Fetch user data from Firestore
          console.log('📥 Fetching user data from Firestore for:', firebaseUser.uid);
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          
          if (userDoc.exists()) {
            const userData = userDoc.data() as Omit<User, 'id'>;
            console.log('✅ Firestore data found, user type:', userData.userType);
            
            const newUser: User = {
              id: firebaseUser.uid,
              ...userData
            };
            
            // Store in localStorage for persistence
            localStorage.setItem('kalaboboarding_user', JSON.stringify(newUser));
            setUser(newUser);
          } else {
            console.warn('❌ User document not found in Firestore');
            // Don't create default user - this causes the teacher type issue
            setUser(null);
          }
        } catch (error) {
          console.error('❌ Error fetching user data:', error);
          setUser(null);
        }
      } else {
        console.log('👋 No Firebase user, clearing state');
        localStorage.removeItem('kalaboboarding_user');
        setUser(null);
      }
      
      setIsLoading(false);
      console.log('🏁 Auth state update complete');
    });

    return () => {
      console.log('🧹 Cleaning up auth listener');
      unsubscribe();
    };
  }, []);

  const signup = async (
    email: string, 
    password: string, 
    name: string, 
    userType: UserType,
    subjects?: string[]
  ) => {
    try {
      console.log('🚀 Starting signup for:', email, 'type:', userType);
      
      // 1. Create user in Firebase Authentication
      console.log('🔐 Creating Firebase auth user...');
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      console.log('✅ Firebase auth user created:', userCredential.user.uid);
      
      // 2. Store additional user data in Firestore
      const userData = {
        email,
        name,
        userType,
        subjects: subjects || [],
        createdAt: new Date().toISOString(),
      };
      
      console.log('💾 Saving to Firestore with data:', userData);
      await setDoc(doc(db, 'users', userCredential.user.uid), userData);
      console.log('✅ Firestore document saved');
      
      // 3. Create user object WITHOUT setting state (let onAuthStateChanged handle it)
      const newUser: User = {
        id: userCredential.user.uid,
        ...userData
      };
      
      // Store in localStorage temporarily
      localStorage.setItem('kalaboboarding_user', JSON.stringify(newUser));
      
      console.log('🎉 Signup complete for user:', newUser.email, 'type:', newUser.userType);
      
      // Return success - DON'T set user state here, let the auth listener handle it
      return Promise.resolve();
      
    } catch (error: any) {
      console.error('💥 Signup error:', error.code, error.message);
      
      // Clean up: If Firebase auth succeeded but Firestore failed
      if (auth.currentUser?.email === email) {
        try {
          console.log('🧹 Cleaning up orphaned auth user');
          await signOut(auth);
        } catch (cleanupError) {
          console.error('Failed to cleanup orphaned user:', cleanupError);
        }
      }
      
      // Clear localStorage on error
      localStorage.removeItem('kalaboboarding_user');
      
      // Provide user-friendly error messages
      let errorMessage = 'Signup failed. Please try again.';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'Email already registered. Please use a different email or sign in.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please use at least 6 characters.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      } else if (error.code === 'auth/operation-not-allowed') {
        errorMessage = 'Email/password signup is not enabled. Please contact support.';
      } else if (error.code === 'permission-denied') {
        errorMessage = 'Permission denied. Check your Firestore security rules.';
      }
      
      return Promise.reject(new Error(errorMessage));
    }
  };

  const login = async (email: string, password: string) => {
    try {
      console.log('🔑 Attempting login for:', email);
      
      console.log('🔐 Calling Firebase signInWithEmailAndPassword...');
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log('✅ Firebase auth successful for:', userCredential.user.uid);
      
      // Fetch user data from Firestore
      console.log('📥 Fetching user data from Firestore...');
      const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
      
      if (!userDoc.exists()) {
        console.error('❌ User document not found in Firestore');
        localStorage.removeItem('kalaboboarding_user');
        return Promise.reject(new Error('User data not found. Please contact support.'));
      }
      
      const userData = userDoc.data() as Omit<User, 'id'>;
      const loggedInUser: User = {
        id: userCredential.user.uid,
        ...userData
      };
      
      console.log('✅ Login successful, user type:', loggedInUser.userType);
      
      // Store in localStorage for persistence
      localStorage.setItem('kalaboboarding_user', JSON.stringify(loggedInUser));
      
      // Set user state immediately for fast redirect
      setUser(loggedInUser);
      
      console.log('🏁 Login process complete');
      
      return Promise.resolve();
      
    } catch (error: any) {
      console.error('💥 Login error:', error.code);
      
      // Clear localStorage on error
      localStorage.removeItem('kalaboboarding_user');
      
      let errorMessage = 'Login failed. Please try again.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        errorMessage = 'Invalid email or password.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later.';
      } else if (error.code === 'auth/user-disabled') {
        errorMessage = 'Account disabled. Please contact support.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your connection.';
      }
      
      return Promise.reject(new Error(errorMessage));
    }
  };

  const logout = async () => {
    try {
      console.log('👋 Logging out...');
      await signOut(auth);
      localStorage.removeItem('kalaboboarding_user');
      setUser(null);
      console.log('✅ Logout successful');
    } catch (error: any) {
      console.error('💥 Logout error:', error);
      return Promise.reject(new Error(error.message || 'Logout failed. Please try again.'));
    }
  };

  const value: AuthContextType = {
    user,
    userType: user?.userType || null,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    signup,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}