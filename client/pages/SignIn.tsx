import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/hooks/useAuth';
import { Mail, Lock, ArrowRight, Eye, EyeOff, XCircle, AlertCircle } from 'lucide-react';

// Modal Dialog Component (Simplified - only error and info)
interface DialogProps {
  isOpen: boolean;
  type: 'error' | 'info';
  title: string;
  message: string;
  onClose: () => void;
}

const DialogModal = ({ isOpen, type, title, message, onClose }: DialogProps) => {
  if (!isOpen) return null;

  const iconColor = type === 'error' ? 'text-red-500' : 'text-blue-500';
  const bgColor = type === 'error' ? 'bg-red-50' : 'bg-blue-50';
  const borderColor = type === 'error' ? 'border-red-200' : 'border-blue-200';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className={`w-full max-w-md rounded-2xl ${bgColor} border ${borderColor} shadow-2xl transform transition-all duration-300 scale-100 animate-scaleIn`}>
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`${iconColor} flex-shrink-0`}>
              {type === 'error' ? <XCircle size={28} /> : <AlertCircle size={28} />}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
              <p className="text-gray-600">{message}</p>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors duration-300"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function SignIn() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    type: 'error' | 'info';
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: 'error',
    title: '',
    message: ''
  });

  const { login, user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Handle redirect when user state updates
  useEffect(() => {
    if (isAuthenticated && user) {
      console.log('✅ User authenticated, redirecting based on role:', user.userType);
      setLoading(false); // Stop loading
      
      // Immediate redirect - no delay
      if (user.userType === 'admin') {
        navigate('/dashboard/admin', { replace: true });
      } else {
        navigate('/dashboard/teacher', { replace: true });
      }
    }
  }, [isAuthenticated, user, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.email || !formData.password) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Missing Information',
        message: 'Please enter both email and password'
      });
      setLoading(false);
      return;
    }

    try {
      await login(formData.email, formData.password);
      // Auth state will update and useEffect will handle redirect
      // Don't setLoading(false) here - the useEffect will handle it
    } catch (err: any) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Login Failed',
        message: err.message || 'Unable to sign in. Please check your credentials.'
      });
      setLoading(false);
    }
  };

  const handleDialogClose = () => {
    setDialog(prev => ({ ...prev, isOpen: false }));
  };

  const handleForgotPassword = () => {
    setDialog({
      isOpen: true,
      type: 'info',
      title: 'Forgot Password',
      message: 'Please contact your school administrator to reset your password.'
    });
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
          {/* Compact Header for Mobile */}
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
              Welcome Back
            </h1>
            <p className="text-gray-600 text-sm sm:text-base">
              Sign in to KalaboBoarding-SRS
            </p>
          </div>

          {/* Success message from signup redirect - Compact */}
          {location.state?.message && (
            <div className="mb-6 p-4 bg-green-50 rounded-xl border border-green-200 animate-fadeIn">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-green-700 text-sm font-medium mb-1">Account Created!</p>
                  <p className="text-green-600 text-xs">
                    {location.state.message}
                    {location.state?.email && (
                      <span className="block mt-1">Email: {location.state.email}</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Main Form Card */}
          <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 border border-gray-100">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900 text-center">Sign In</h2>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 text-gray-400" size={20} />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="your@email.com"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                    required
                    disabled={loading}
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 text-gray-400" size={20} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                    required
                    disabled={loading}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                    disabled={loading}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {/* Forgot Password Link */}
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
                  onClick={handleForgotPassword}
                >
                  Forgot password?
                </button>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-4 py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 group relative shadow-md hover:shadow-lg"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    <span>Signing In...</span>
                  </div>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            {/* Sign Up Link */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="text-center">
                <p className="text-gray-600 text-sm">
                  Don't have an account?{' '}
                  <Link 
                    to="/signup" 
                    className="text-blue-600 font-semibold hover:text-blue-700 transition-colors inline-flex items-center gap-1 group"
                  >
                    <span>Create one</span>
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