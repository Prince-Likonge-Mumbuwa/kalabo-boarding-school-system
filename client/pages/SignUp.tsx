import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/hooks/useAuth';
import { ArrowRight, Mail, Lock, User, BookOpen } from 'lucide-react';

export default function SignUp() {
  const [searchParams] = useSearchParams();
  const initialUserType = (searchParams.get('type') as 'admin' | 'teacher') || 'teacher';
  
  const [userType, setUserType] = useState<'admin' | 'teacher'>(initialUserType);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    subjects: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { signup } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.email || !formData.password || !formData.name) {
      setError('Please fill in all required fields');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (userType === 'teacher' && !formData.subjects) {
      setError('Please specify your subjects');
      return;
    }

    setLoading(true);
    
    try {
      // Simulate signup delay
      await new Promise(resolve => setTimeout(resolve, 500));

      const newUser = {
        id: Date.now().toString(),
        email: formData.email,
        name: formData.name,
        userType: userType as 'admin' | 'teacher',
        subjects: userType === 'teacher' ? formData.subjects.split(',').map(s => s.trim()) : undefined,
      };

      signup(newUser);
      navigate(userType === 'admin' ? '/dashboard/admin' : '/dashboard/teacher');
    } catch (err) {
      setError('Sign up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout className="flex items-center justify-center py-8 sm:py-12 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Create Account</h1>
          <p className="text-gray-600">Join KalaboBoarding-SRS today</p>
        </div>

        {/* User Type Selector */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => {
              setUserType('admin');
              setFormData(prev => ({ ...prev, subjects: '' }));
            }}
            className={`p-4 rounded-xl border-2 transition-all duration-300 text-center font-semibold ${
              userType === 'admin'
                ? 'border-blue-600 bg-blue-50 text-blue-600'
                : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
            }`}
          >
            <User size={20} className="mx-auto mb-2" />
            Administrator
          </button>
          <button
            onClick={() => setUserType('teacher')}
            className={`p-4 rounded-xl border-2 transition-all duration-300 text-center font-semibold ${
              userType === 'teacher'
                ? 'border-blue-600 bg-blue-50 text-blue-600'
                : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
            }`}
          >
            <BookOpen size={20} className="mx-auto mb-2" />
            Teacher
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Full Name *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-3.5 text-gray-400" size={20} />
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter your full name"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address *
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

          {/* Subjects (Teacher Only) */}
          {userType === 'teacher' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subjects You Teach *
              </label>
              <div className="relative">
                <BookOpen className="absolute left-3 top-3.5 text-gray-400" size={20} />
                <textarea
                  name="subjects"
                  value={formData.subjects}
                  onChange={handleChange}
                  placeholder="e.g., Mathematics, English, Science (comma-separated)"
                  rows={2}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Enter subjects separated by commas</p>
            </div>
          )}

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password *
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 text-gray-400" size={20} />
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="At least 6 characters"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Password *
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 text-gray-400" size={20} />
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm your password"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 py-3.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2 group"
          >
            {loading ? 'Creating Account...' : 'Create Account'}
            {!loading && <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />}
          </button>
        </form>

        {/* Sign In Link */}
        <p className="text-center text-gray-600 mt-6">
          Already have an account?{' '}
          <Link to="/signin" className="text-blue-600 font-semibold hover:text-blue-700">
            Sign In
          </Link>
        </p>

        {/* Info Box */}
        <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-700">
            <span className="font-semibold">Note:</span> Only one administrator account is allowed per school.
          </p>
        </div>
      </div>
    </Layout>
  );
}
