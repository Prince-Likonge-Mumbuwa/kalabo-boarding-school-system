import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/hooks/useAuth';
import { Mail, Lock, ArrowRight, Eye, EyeOff, Zap } from 'lucide-react';

export default function SignIn() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.email || !formData.password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    
    try {
      // Simulate login delay
      await new Promise(resolve => setTimeout(resolve, 500));

      // In a real app, you would validate credentials against a backend
      // For demo purposes, we'll accept any non-empty email/password
      const newUser = {
        id: Date.now().toString(),
        email: formData.email,
        name: formData.email.split('@')[0],
        userType: 'teacher' as const,
      };

      login(newUser);
      navigate('/dashboard/teacher');
    } catch (err) {
      setError('Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (userType: 'admin' | 'teacher') => {
    setLoading(true);
    setError('');

    try {
      // Simulate login delay
      await new Promise(resolve => setTimeout(resolve, 500));

      const demoUser = {
        id: '1',
        email: userType === 'admin' ? 'admin@school.edu' : 'teacher@school.edu',
        name: userType === 'admin' ? 'Principal Smith' : 'Mr. Johnson',
        userType: userType,
        subjects: userType === 'admin' ? undefined : ['Mathematics', 'Physics'],
      };

      login(demoUser);
      navigate(userType === 'admin' ? '/dashboard/admin' : '/dashboard/teacher');
    } catch (err) {
      setError('Demo login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout className="flex items-center justify-center py-8 sm:py-12 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Welcome Back</h1>
          <p className="text-gray-600">Sign in to your account</p>
        </div>

        {/* Demo Login Buttons */}
        <div className="space-y-3 mb-8">
          <button
            onClick={() => handleDemoLogin('admin')}
            disabled={loading}
            className="w-full p-4 border-2 border-blue-300 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-semibold flex items-center justify-center gap-2 group"
          >
            <Zap size={18} />
            <span>Demo: Admin Account</span>
          </button>
          <button
            onClick={() => handleDemoLogin('teacher')}
            disabled={loading}
            className="w-full p-4 border-2 border-gray-300 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-semibold flex items-center justify-center gap-2 group"
          >
            <Zap size={18} />
            <span>Demo: Teacher Account</span>
          </button>
        </div>

        {/* Divider */}
        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-3 bg-white text-gray-500">Or sign in with your account</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 py-3.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2 group"
          >
            {loading ? 'Signing In...' : 'Sign In'}
            {!loading && <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />}
          </button>
        </form>

        {/* Sign Up Link */}
        <p className="text-center text-gray-600 mt-6">
          Don't have an account?{' '}
          <Link to="/signup" className="text-blue-600 font-semibold hover:text-blue-700">
            Create one
          </Link>
        </p>

        {/* Demo Info */}
        <div className="mt-8 p-4 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-sm text-amber-700">
            <span className="font-semibold">Demo Mode:</span> Click the demo buttons above to test the app with sample admin or teacher accounts. For custom accounts, sign up with your email.
          </p>
        </div>
      </div>
    </Layout>
  );
}
