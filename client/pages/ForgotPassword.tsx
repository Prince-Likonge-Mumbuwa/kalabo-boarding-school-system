// pages/ForgotPassword.tsx
import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/hooks/useAuth';
import { Mail, ArrowLeft, CheckCircle, AlertCircle, Loader } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Pre-fill email from signin page if provided
  useState(() => {
    if (location.state?.email) {
      setEmail(location.state.email);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus('idle');

    if (!email) {
      setStatus('error');
      setMessage('Please enter your email address');
      setLoading(false);
      return;
    }

    try {
      await resetPassword(email);
      setStatus('success');
      setMessage(`Password reset email sent to ${email}`);
    } catch (error: any) {
      setStatus('error');
      // Don't reveal if email exists for security
      setMessage('If an account exists with this email, you will receive a password reset link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout className="flex items-center justify-center min-h-screen py-4 px-4">
      <div className="w-full max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Reset Password
          </h1>
          <p className="text-gray-600 text-sm sm:text-base">
            Enter your email to receive a password reset link
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 border border-gray-100">
          {/* Success Message */}
          {status === 'success' && (
            <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-start gap-3">
                <CheckCircle className="text-green-500 flex-shrink-0" size={20} />
                <div>
                  <h3 className="text-green-800 font-medium mb-1">Check Your Email</h3>
                  <p className="text-green-600 text-sm">{message}</p>
                  <p className="text-green-600 text-xs mt-2">
                    Click the link in the email to reset your password. The link will expire in 1 hour.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {status === 'error' && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-blue-500 flex-shrink-0" size={20} />
                <p className="text-blue-700 text-sm">{message}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 text-gray-400" size={20} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-100"
                  required
                  disabled={loading || status === 'success'}
                  autoComplete="email"
                />
              </div>
              <p className="text-xs text-gray-500">
                We'll send a password reset link to this email
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || status === 'success'}
              className="w-full mt-4 py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="animate-spin" size={18} />
                  <span>Sending...</span>
                </>
              ) : (
                'Send Reset Link'
              )}
            </button>
          </form>

          {/* Additional Info */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600 text-center">
              <span className="font-medium">Note:</span> For security reasons, password reset links expire after 1 hour.
              If you don't receive an email, check your spam folder.
            </p>
          </div>

          {/* Back to Sign In */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <Link 
              to="/signin" 
              className="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1 text-sm group"
            >
              <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
              <span>Back to Sign In</span>
            </Link>
          </div>
        </div>

        {/* Security Note */}
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            Having trouble? Contact your school administrator for assistance
          </p>
        </div>
      </div>
    </Layout>
  );
}