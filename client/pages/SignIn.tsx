import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/hooks/useAuth';
import { Mail, Lock, ArrowRight, Eye, EyeOff, XCircle, AlertCircle, CheckCircle } from 'lucide-react';

// Modal Dialog Component
interface DialogProps {
  isOpen: boolean;
  type: 'error' | 'info' | 'success';
  title: string;
  message: string;
  onClose: () => void;
}

const DialogModal = ({ isOpen, type, title, message, onClose }: DialogProps) => {
  if (!isOpen) return null;

  const getStyles = () => {
    switch(type) {
      case 'error':
        return {
          icon: <XCircle size={28} className="text-red-500" />,
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          buttonColor: 'bg-red-600 hover:bg-red-700'
        };
      case 'success':
        return {
          icon: <CheckCircle size={28} className="text-green-500" />,
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          buttonColor: 'bg-green-600 hover:bg-green-700'
        };
      case 'info':
      default:
        return {
          icon: <AlertCircle size={28} className="text-blue-500" />,
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          buttonColor: 'bg-blue-600 hover:bg-blue-700'
        };
    }
  };

  const styles = getStyles();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className={`w-full max-w-md rounded-2xl ${styles.bgColor} border ${styles.borderColor} shadow-2xl transform transition-all duration-300 scale-100 animate-scaleIn`}>
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              {styles.icon}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
              <p className="text-gray-600 whitespace-pre-line">{message}</p>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className={`px-6 py-2.5 text-white font-medium rounded-lg transition-colors duration-300 ${styles.buttonColor}`}
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
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    type: 'error' | 'info' | 'success';
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: 'error',
    title: '',
    message: ''
  });

  const { login, user, isAuthenticated, resendVerificationEmail } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Handle redirect when user state updates
  useEffect(() => {
    if (isAuthenticated && user) {
      console.log('✅ User authenticated, redirecting based on role:', user.userType);
      setLoading(false);
      
      if (user.userType === 'admin') {
        navigate('/dashboard/admin', { replace: true });
      } else {
        navigate('/dashboard/teacher', { replace: true });
      }
    }
  }, [isAuthenticated, user, navigate]);

  // Check for email from signup redirect
  useEffect(() => {
    if (location.state?.email) {
      setFormData(prev => ({ ...prev, email: location.state.email }));
    }
  }, [location.state]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setShowResendVerification(false);

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
    } catch (err: any) {
      // Check if error is about email verification
      if (err.message.includes('verify your email')) {
        setUnverifiedEmail(formData.email);
        setShowResendVerification(true);
        setDialog({
          isOpen: true,
          type: 'info',
          title: 'Email Not Verified',
          message: 'Please verify your email before signing in.\n\nCheck your inbox for the verification link.'
        });
      } else {
        setDialog({
          isOpen: true,
          type: 'error',
          title: 'Login Failed',
          message: err.message || 'Unable to sign in. Please check your credentials.'
        });
      }
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendLoading(true);
    try {
      await resendVerificationEmail();
      setDialog({
        isOpen: true,
        type: 'success',
        title: 'Verification Email Sent',
        message: `A new verification email has been sent to ${unverifiedEmail}.\n\nPlease check your inbox and spam folder.`
      });
      setShowResendVerification(false);
    } catch (error: any) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Failed to Resend',
        message: error.message || 'Unable to resend verification email. Please try again.'
      });
    } finally {
      setResendLoading(false);
    }
  };

  const handleDialogClose = () => {
    setDialog(prev => ({ ...prev, isOpen: false }));
  };

  const handleForgotPassword = () => {
    navigate('/forgot-password', { state: { email: formData.email } });
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
              Welcome Back
            </h1>
            <p className="text-gray-600 text-sm sm:text-base">
              Sign in to KalaboBoarding-SRS
            </p>
          </div>

          {/* Success message from signup */}
          {location.state?.message && (
            <div className="mb-6 p-4 bg-green-50 rounded-xl border border-green-200 animate-fadeIn">
              <div className="flex items-start gap-3">
                <CheckCircle className="text-green-500 flex-shrink-0" size={20} />
                <div>
                  <p className="text-green-700 text-sm font-medium mb-1">Account Created Successfully!</p>
                  <p className="text-green-600 text-xs">
                    {location.state.message}
                    {location.state?.email && (
                      <span className="block mt-1 font-mono">{location.state.email}</span>
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

              {/* Resend Verification Section */}
              {showResendVerification && (
                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <p className="text-sm text-yellow-700 mb-3">
                    Haven't received the verification email?
                  </p>
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resendLoading}
                    className="w-full py-2 px-4 bg-yellow-600 text-white text-sm font-medium rounded-lg hover:bg-yellow-700 disabled:bg-yellow-300 transition-colors flex items-center justify-center gap-2"
                  >
                    {resendLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        <span>Sending...</span>
                      </>
                    ) : (
                      'Resend Verification Email'
                    )}
                  </button>
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