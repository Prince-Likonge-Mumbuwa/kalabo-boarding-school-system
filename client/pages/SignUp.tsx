import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/hooks/useAuth';
import { ArrowRight, Mail, Lock, User, BookOpen, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

// Modal Dialog Component
interface DialogProps {
  isOpen: boolean;
  type: 'success' | 'error';
  title: string;
  message: string;
  onClose: () => void;
}

const DialogModal = ({ isOpen, type, title, message, onClose }: DialogProps) => {
  if (!isOpen) return null;

  const iconColor = type === 'success' ? 'text-green-500' : 'text-red-500';
  const bgColor = type === 'success' ? 'bg-green-50' : 'bg-red-50';
  const borderColor = type === 'success' ? 'border-green-200' : 'border-red-200';
  const buttonColor = type === 'success' 
    ? 'bg-green-600 hover:bg-green-700' 
    : 'bg-blue-600 hover:bg-blue-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className={`w-full max-w-md rounded-2xl ${bgColor} border ${borderColor} shadow-2xl transform transition-all duration-300 scale-100 animate-scaleIn`}>
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`${iconColor} flex-shrink-0`}>
              {type === 'success' ? (
                <CheckCircle size={28} className="animate-pulse" />
              ) : (
                <XCircle size={28} />
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
              <p className="text-gray-600">{message}</p>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className={`px-6 py-2.5 text-white font-medium rounded-lg transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] ${buttonColor}`}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function SignUp() {
  const [userType, setUserType] = useState<'admin' | 'teacher'>('teacher');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    subjects: '',
  });
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    type: 'success' | 'error';
    title: string;
    message: string;
    redirectTo?: string;
  }>({
    isOpen: false,
    type: 'success',
    title: '',
    message: ''
  });

  const { signup, user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      console.log('Already authenticated, redirecting to dashboard');
      if (user.userType === 'admin') {
        navigate('/dashboard/admin', { replace: true });
      } else {
        navigate('/dashboard/teacher', { replace: true });
      }
    }
  }, [isAuthenticated, user, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleUserTypeChange = (type: 'admin' | 'teacher') => {
    setUserType(type);
    if (type === 'admin') {
      setFormData(prev => ({ ...prev, subjects: '' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validation
    if (!formData.email || !formData.password || !formData.name) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Missing Information',
        message: 'Please fill in all required fields'
      });
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Password Mismatch',
        message: 'The passwords you entered do not match'
      });
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Weak Password',
        message: 'Password must be at least 6 characters long'
      });
      setLoading(false);
      return;
    }

    if (userType === 'teacher' && !formData.subjects.trim()) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Subjects Required',
        message: 'Please specify the subjects you teach'
      });
      setLoading(false);
      return;
    }

    try {
      const subjects = userType === 'teacher' 
        ? formData.subjects.split(',').map(s => s.trim()).filter(s => s)
        : undefined;
      
      await signup(
        formData.email, 
        formData.password, 
        formData.name, 
        userType,
        subjects
      );
      
      // Show success dialog - DON'T redirect yet
      setDialog({
        isOpen: true,
        type: 'success',
        title: 'Account Created!',
        message: `Your ${userType} account has been created successfully.`,
        redirectTo: '/signin'
      });
      
    } catch (err: any) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Sign Up Failed',
        message: err.message || 'Unable to create account. Please try again.'
      });
      setLoading(false);
    }
  };

  const handleDialogClose = () => {
    setDialog(prev => ({ ...prev, isOpen: false }));
    // Only redirect if it's a success dialog with redirect path
    if (dialog.type === 'success' && dialog.redirectTo) {
      navigate(dialog.redirectTo, { 
        state: { 
          message: `Your ${userType} account has been created successfully! Please sign in.`,
          email: formData.email
        } 
      });
    }
  };

  return (
    <>
      <DialogModal
        isOpen={dialog.isOpen}
        type={dialog.type}
        title={dialog.title}
        message={dialog.message}
        onClose={handleDialogClose}
      />
      
      <Layout className="flex items-center justify-center min-h-screen py-4 px-4">
        <div className="w-full max-w-md mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
              Create Account
            </h1>
            <p className="text-gray-600 text-sm sm:text-base">
              Join KalaboBoarding-SRS
            </p>
          </div>

          {/* Main Form Card */}
          <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 border border-gray-100">
            {/* Role Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Select Your Role *
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleUserTypeChange('admin')}
                  disabled={loading}
                  className={`p-4 rounded-xl border-2 transition-all duration-200 text-center font-medium flex flex-col items-center ${
                    userType === 'admin'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${
                    userType === 'admin' ? 'bg-blue-600' : 'bg-gray-100'
                  }`}>
                    <User size={16} className={userType === 'admin' ? 'text-white' : 'text-gray-600'} />
                  </div>
                  <span className="text-sm">Administrator</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleUserTypeChange('teacher')}
                  disabled={loading}
                  className={`p-4 rounded-xl border-2 transition-all duration-200 text-center font-medium flex flex-col items-center ${
                    userType === 'teacher'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${
                    userType === 'teacher' ? 'bg-blue-600' : 'bg-gray-100'
                  }`}>
                    <BookOpen size={16} className={userType === 'teacher' ? 'text-white' : 'text-gray-600'} />
                  </div>
                  <span className="text-sm">Teacher</span>
                </button>
              </div>
              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-700">
                  <span className="font-medium">Creating:</span> {userType} account
                  {userType === 'admin' && ' (Only one per school)'}
                </p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Full Name *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3.5 text-gray-400" size={20} />
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="John Doe"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                    required
                    disabled={loading}
                    autoComplete="name"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 text-gray-400" size={20} />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="john@example.com"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                    required
                    disabled={loading}
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Subjects (Teacher Only) */}
              {userType === 'teacher' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Subjects You Teach *
                  </label>
                  <div className="relative">
                    <BookOpen className="absolute left-3 top-3.5 text-gray-400" size={20} />
                    <textarea
                      name="subjects"
                      value={formData.subjects}
                      onChange={handleChange}
                      placeholder="Mathematics, English, Science"
                      rows={2}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                      required
                      disabled={loading}
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    Separate subjects with commas
                  </p>
                </div>
              )}

              {/* Password */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 text-gray-400" size={20} />
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                    required
                    minLength={6}
                    disabled={loading}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Confirm Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 text-gray-400" size={20} />
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                    required
                    disabled={loading}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              {/* Admin Note */}
              {userType === 'admin' && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      <span className="font-medium">Important:</span> Only one administrator account is allowed per school.
                    </p>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-4 py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 group relative shadow-md hover:shadow-lg"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    <span>Creating Account...</span>
                  </div>
                ) : (
                  <>
                    <span>Create {userType.charAt(0).toUpperCase() + userType.slice(1)} Account</span>
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            {/* Sign In Link */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="text-center">
                <p className="text-gray-600 text-sm">
                  Already have an account?{' '}
                  <Link 
                    to="/signin" 
                    className="text-blue-600 font-semibold hover:text-blue-700 transition-colors inline-flex items-center gap-1 group"
                  >
                    <span>Sign In</span>
                    <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    </>
  );
}