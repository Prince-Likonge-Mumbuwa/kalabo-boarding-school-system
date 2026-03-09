// hooks/useAuth.tsx
import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  collection, 
  query, 
  where,
  serverTimestamp,
  limit
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

// Types
interface User {
  uid: string;
  email: string;
  fullName: string;
  userType: 'admin' | 'teacher';
  emailVerified: boolean;
  createdAt: Date;
  nrc?: string;
  dateOfBirth?: string;
  tsNumber?: string;
  employeeNumber?: string;
  dateOfFirstAppointment?: string;
  dateOfCurrentAppointment?: string;
  subjects?: string[];
  schoolId?: string;
  schoolName?: string;
}

interface TeacherSignupData {
  email: string;
  password: string;
  fullName: string;
  userType: 'teacher';
  nrc: string;
  dateOfBirth: string;
  tsNumber: string;
  employeeNumber: string;
  dateOfFirstAppointment: string;
  dateOfCurrentAppointment: string;
  subjects: string[];
}

interface AdminSignupData {
  email: string;
  password: string;
  fullName: string;
  userType: 'admin';
}

type SignupData = TeacherSignupData | AdminSignupData;

// Create Auth Context
interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: () => boolean;
  isTeacher: () => boolean;
  getUserDisplayName: () => string;
  signup: (data: SignupData) => Promise<{ success: boolean; message: string; email?: string }>;
  login: (email: string, password: string) => Promise<any>;
  logout: () => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth Provider Component
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email!,
              fullName: userData.fullName,
              userType: userData.userType,
              emailVerified: firebaseUser.emailVerified,
              createdAt: userData.createdAt?.toDate(),
              nrc: userData.nrc,
              dateOfBirth: userData.dateOfBirth,
              tsNumber: userData.tsNumber,
              employeeNumber: userData.employeeNumber,
              dateOfFirstAppointment: userData.dateOfFirstAppointment,
              dateOfCurrentAppointment: userData.dateOfCurrentAppointment,
              subjects: userData.subjects,
              schoolId: userData.schoolId,
              schoolName: userData.schoolName
            });
            setIsAuthenticated(true);
          } else {
            await signOut(auth);
            setUser(null);
            setIsAuthenticated(false);
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          setUser(null);
          setIsAuthenticated(false);
        }
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const checkAdminLimit = async (): Promise<boolean> => {
    try {
      console.log('Checking admin limit...');
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('userType', '==', 'admin'));
      const querySnapshot = await getDocs(q);
      console.log('Admin count:', querySnapshot.size);
      return querySnapshot.size >= 5;
    } catch (error: any) {
      console.error('Error checking admin limit:', error);
      
      // Handle permission denied error
      if (error.code === 'permission-denied') {
        console.warn('Permission denied when checking admin limit.');
        
        // Try a different approach - check if there are any users at all
        try {
          // Check if the users collection is completely empty
          const anyUserQuery = query(collection(db, 'users'), limit(1));
          const anyUserSnapshot = await getDocs(anyUserQuery);
          
          // If no users exist, this is the first user - allow admin creation
          if (anyUserSnapshot.empty) {
            console.log('No users exist at all, allowing first admin creation');
            return false;
          }
          
          // If users exist but we can't query by admin type, try to count all users
          const allUsersQuery = query(collection(db, 'users'));
          const allUsersSnapshot = await getDocs(allUsersQuery);
          
          // If there are very few users, it's probably safe to assume no admins yet
          if (allUsersSnapshot.size < 3) {
            console.log('Few users exist, assuming no admin yet');
            return false;
          }
        } catch (innerError) {
          console.error('Fallback check failed:', innerError);
          
          // If we can't query at all, maybe this is the very first user?
          // This is a best guess scenario
          try {
            // Try to create a test document to see if collection exists
            const testQuery = query(collection(db, 'users'), limit(0));
            await getDocs(testQuery);
          } catch (testError) {
            // If even a limit(0) query fails, the collection might not exist
            console.log('Users collection might not exist yet');
            return false;
          }
        }
        
        // If we reach here, we can't determine for sure
        throw new Error('Unable to verify admin account limit due to permissions. Please contact support if this is not the first admin account.');
      }
      
      throw new Error('Unable to verify admin account limit');
    }
  };

  const signup = async (data: SignupData) => {
    try {
      // For admin accounts, check the limit
      if (data.userType === 'admin') {
        try {
          const adminLimitReached = await checkAdminLimit();
          if (adminLimitReached) {
            throw new Error('Maximum number of admin accounts (5) has been reached. Please contact support.');
          }
        } catch (limitError: any) {
          // If it's the first admin and we get permission errors, allow it
          if (limitError.message.includes('permissions') || limitError.message.includes('Unable to verify')) {
            console.warn('Admin limit check failed but proceeding as this might be the first admin:', limitError.message);
            // Proceed with signup - this is likely the first admin
          } else {
            throw limitError;
          }
        }
      }

      console.log('Creating user with email:', data.email);
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      const firebaseUser = userCredential.user;
      console.log('User created with UID:', firebaseUser.uid);

      // Prepare user data for Firestore
      const userData: any = {
        fullName: data.fullName,
        email: data.email,
        userType: data.userType,
        createdAt: serverTimestamp(),
        emailVerified: false,
        schoolId: null,
        schoolName: null
      };

      if (data.userType === 'teacher') {
        const teacherData = data as TeacherSignupData;
        Object.assign(userData, {
          nrc: teacherData.nrc,
          dateOfBirth: teacherData.dateOfBirth,
          tsNumber: teacherData.tsNumber,
          employeeNumber: teacherData.employeeNumber,
          dateOfFirstAppointment: teacherData.dateOfFirstAppointment,
          dateOfCurrentAppointment: teacherData.dateOfCurrentAppointment,
          subjects: teacherData.subjects || [],
          isActive: true,
          profileComplete: true
        });
      }

      // Save user data to Firestore
      console.log('Saving user data to Firestore...');
      await setDoc(doc(db, 'users', firebaseUser.uid), userData);
      console.log('User data saved successfully');

      // Send email verification
      console.log('Sending verification email...');
      await sendEmailVerification(firebaseUser);
      console.log('Verification email sent');

      // Sign out to require email verification on next login
      await signOut(auth);
      console.log('User signed out');

      return { 
        success: true, 
        message: 'Account created successfully. Please check your email to verify your account.',
        email: data.email 
      };
    } catch (error: any) {
      console.error('Signup error:', error);
      
      // Handle specific Firebase errors
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('This email is already registered. Please use a different email or try signing in.');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('Password is too weak. Please use a stronger password (minimum 6 characters).');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('Please enter a valid email address.');
      } else if (error.code === 'auth/network-request-failed') {
        throw new Error('Network error. Please check your internet connection and try again.');
      }
      
      // If it's our custom error about permissions, make it more user-friendly
      if (error.message.includes('permissions') || error.message.includes('Unable to verify')) {
        throw new Error('Unable to verify admin account limit. If this is the first admin account, please try again. Otherwise, contact support.');
      }
      
      throw new Error(error.message || 'Failed to create account. Please try again.');
    }
  };

  const login = async (email: string, password: string) => {
    try {
      console.log('Attempting login for:', email);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      if (!firebaseUser.emailVerified) {
        console.log('Email not verified, signing out');
        await signOut(auth);
        throw new Error('Please verify your email before signing in. Check your inbox for the verification link.');
      }

      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (!userDoc.exists()) {
        console.log('User profile not found, signing out');
        await signOut(auth);
        throw new Error('User profile not found. Please contact support.');
      }

      console.log('Login successful');
      return userCredential;
    } catch (error: any) {
      console.error('Login error:', error);
      
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        throw new Error('Invalid email or password. Please try again.');
      } else if (error.code === 'auth/too-many-requests') {
        throw new Error('Too many failed login attempts. Please try again later.');
      } else if (error.code === 'auth/user-disabled') {
        throw new Error('This account has been disabled. Please contact support.');
      } else if (error.code === 'auth/network-request-failed') {
        throw new Error('Network error. Please check your internet connection and try again.');
      }
      
      throw new Error(error.message || 'Failed to sign in. Please try again.');
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
      throw new Error('Failed to log out. Please try again.');
    }
  };

  const resendVerificationEmail = async () => {
    try {
      if (auth.currentUser) {
        await sendEmailVerification(auth.currentUser);
      } else {
        throw new Error('No user is currently signed in');
      }
    } catch (error: any) {
      console.error('Resend verification error:', error);
      throw new Error(error.message || 'Failed to resend verification email');
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
      console.error('Password reset error:', error);
      // Don't throw - for security, we don't want to reveal if email exists
    }
  };

  const isAdmin = (): boolean => {
    return user?.userType === 'admin';
  };

  const isTeacher = (): boolean => {
    return user?.userType === 'teacher';
  };

  const getUserDisplayName = (): string => {
    return user?.fullName || user?.email || 'User';
  };

  const value = {
    user,
    loading,
    isAuthenticated,
    isAdmin,
    isTeacher,
    getUserDisplayName,
    signup,
    login,
    logout,
    resendVerificationEmail,
    resetPassword
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};