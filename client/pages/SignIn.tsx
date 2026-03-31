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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className={`w-full max-w-md rounded-2xl ${styles.bgColor} border ${styles.borderColor} shadow-2xl transform transition-all duration-300 scale-100`}>
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

  // Inline keyframes styles
  const animationStyles = `
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    @keyframes scaleIn {
      from {
        opacity: 0;
        transform: scale(0.95);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    .animate-fadeInUp {
      animation: fadeInUp 0.6s ease-out forwards;
    }
    
    .animate-fadeIn {
      animation: fadeIn 0.3s ease-out forwards;
    }
    
    .animate-scaleIn {
      animation: scaleIn 0.3s ease-out forwards;
    }
    
    .animation-delay-100 {
      animation-delay: 0.1s;
    }
    
    .animation-delay-200 {
      animation-delay: 0.2s;
    }
  `;

  return (
    <>
      <style>{animationStyles}</style>
      
      <DialogModal
        isOpen={dialog.isOpen}
        type={dialog.type}
        title={dialog.title}
        message={dialog.message}
        onClose={handleDialogClose}
      />
      
      <Layout className="relative min-h-screen overflow-hidden">
        {/* Background Image with Overlay */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: 'url("/images/signin-bg.jpg")',
            backgroundAttachment: 'fixed'
          }}
        />
        
        {/* Dark Gradient Overlay - Better contrast for glass morphism */}
        <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/50 to-black/60 backdrop-blur-[1px]" />
        
        {/* Content */}
        <div className="relative z-10 flex items-center justify-center min-h-screen py-8 px-4">
          <div className="w-full max-w-md mx-auto">
            {/* Header with School Logo - Larger, no animation */}
            <div className="text-center mb-8 animate-fadeInUp">
              <div className="inline-block mb-4">
                <div className="w-32 h-32 mx-auto bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl flex items-center justify-center p-3 border border-white/30">
                  <img 
                    src="/images/school-logo.png" 
                    alt="KalaboBoarding School Logo" 
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 drop-shadow-lg">
                Welcome Back
              </h1>
              <p className="text-gray-200 text-sm sm:text-base drop-shadow">
                Sign in to KalaboBoarding-SRS
              </p>
            </div>

            {/* Success message from signup */}
            {location.state?.message && (
              <div className="mb-6 p-4 bg-green-500/20 backdrop-blur-md rounded-xl border border-green-500/40 animate-fadeInUp">
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-green-400 flex-shrink-0" size={20} />
                  <div>
                    <p className="text-green-100 text-sm font-medium mb-1">Account Created Successfully!</p>
                    <p className="text-green-200 text-xs">
                      {location.state.message}
                      {location.state?.email && (
                        <span className="block mt-1 font-mono text-green-300">{location.state.email}</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Main Form Card - Glass Morphism with better contrast */}
            <div className="bg-white/15 backdrop-blur-xl rounded-2xl shadow-2xl p-6 sm:p-8 border border-white/30 animate-fadeInUp animation-delay-100">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white text-center">Sign In</h2>
                <div className="w-12 h-1 bg-blue-500 mx-auto mt-2 rounded-full"></div>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-200">
                    Email Address
                  </label>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-3.5 text-gray-300 group-focus-within:text-blue-400 transition-colors" size={20} />
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="your@email.com"
                      className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-white placeholder-white/60 backdrop-blur-sm"
                      required
                      disabled={loading}
                      autoComplete="email"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-200">
                    Password
                  </label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-3.5 text-gray-300 group-focus-within:text-blue-400 transition-colors" size={20} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="Enter your password"
                      className="w-full pl-10 pr-12 py-3 bg-white/10 border border-white/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-white placeholder-white/60 backdrop-blur-sm"
                      required
                      disabled={loading}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3.5 text-gray-300 hover:text-white transition-colors disabled:opacity-50"
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
                    className="text-sm text-blue-300 hover:text-blue-200 font-medium transition-colors"
                    onClick={handleForgotPassword}
                  >
                    Forgot password?
                  </button>
                </div>

                {/* Resend Verification Section */}
                {showResendVerification && (
                  <div className="p-4 bg-yellow-500/20 backdrop-blur-md rounded-xl border border-yellow-500/40">
                    <p className="text-sm text-yellow-200 mb-3">
                      Haven't received the verification email?
                    </p>
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      disabled={resendLoading}
                      className="w-full py-2.5 px-4 bg-yellow-600/80 hover:bg-yellow-600 text-white text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2 backdrop-blur-sm"
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
                  className="w-full mt-6 py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 group relative shadow-lg hover:shadow-xl disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed"
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
              <div className="mt-6 pt-6 border-t border-white/20">
                <div className="text-center">
                  <p className="text-gray-200 text-sm">
                    Don't have an account?{' '}
                    <Link 
                      to="/signup" 
                      className="text-blue-300 font-semibold hover:text-blue-200 transition-colors inline-flex items-center gap-1 group"
                    >
                      <span>Create one</span>
                      <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                  </p>
                </div>
              </div>
            </div>

            {/* Footer Note */}
            <div className="text-center mt-8 animate-fadeInUp animation-delay-200">
              <p className="text-gray-300/80 text-xs">
                Secure access for authorized users only
              </p>
            </div>
          </div>
        </div>
      </Layout>
    </>
  );
}