// @/pages/SignUp.tsx - UPDATED with relaxed validation
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/hooks/useAuth';
import { 
  ArrowRight, 
  Mail, 
  Lock, 
  User, 
  BookOpen, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Calendar,
  Hash,
  Briefcase,
  CreditCard,
  Eye,
  EyeOff,
  FileText
} from 'lucide-react';

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

// Password strength checker
interface PasswordStrength {
  score: number;
  message: string;
  color: string;
  requirements: {
    length: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
    special: boolean;
  };
}

const checkPasswordStrength = (password: string): PasswordStrength => {
  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password)
  };

  const fulfilledCount = Object.values(requirements).filter(Boolean).length;

  let score = 0;
  let message = '';
  let color = '';

  if (password.length === 0) {
    score = 0;
    message = 'Enter a password';
    color = 'gray';
  } else if (fulfilledCount <= 2) {
    score = 1;
    message = 'Weak password';
    color = 'red';
  } else if (fulfilledCount === 3) {
    score = 2;
    message = 'Fair password';
    color = 'yellow';
  } else if (fulfilledCount === 4) {
    score = 3;
    message = 'Good password';
    color = 'blue';
  } else if (fulfilledCount === 5) {
    score = 4;
    message = 'Strong password';
    color = 'green';
  }

  return { score, message, color, requirements };
};

export default function SignUp() {
  const [userType, setUserType] = useState<'admin' | 'teacher'>('teacher');
  const [formData, setFormData] = useState({
    // Common fields
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    
    // Teacher-specific fields
    nrc: '',
    dateOfBirth: '',
    tsNumber: '',
    employeeNumber: '',
    dateOfFirstAppointment: '',
    dateOfCurrentAppointment: '',
    subjects: '',
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>({
    score: 0,
    message: '',
    color: 'gray',
    requirements: {
      length: false,
      uppercase: false,
      lowercase: false,
      number: false,
      special: false
    }
  });

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

  // Update password strength when password changes
  useEffect(() => {
    setPasswordStrength(checkPasswordStrength(formData.password));
  }, [formData.password]);

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
      // Clear teacher-specific fields when switching to admin
      setFormData(prev => ({
        ...prev,
        nrc: '',
        dateOfBirth: '',
        tsNumber: '',
        employeeNumber: '',
        dateOfFirstAppointment: '',
        dateOfCurrentAppointment: '',
        subjects: '',
      }));
    }
  };

  const validateTeacherFields = () => {
    const errors: string[] = [];

    // NRC validation (Zambian NRC format: 123456/78/1)
    const nrcRegex = /^\d{6}\/\d{2}\/\d{1}$/;
    if (!nrcRegex.test(formData.nrc)) {
      errors.push('NRC must be in format: 123456/78/1');
    }

    // Date of birth validation (must be at least 18 years ago)
    const dob = new Date(formData.dateOfBirth);
    const today = new Date();
    const age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (age < 18 || (age === 18 && monthDiff < 0)) {
      errors.push('Teacher must be at least 18 years old');
    }

    // UPDATED: TS Number validation - any sequence less than 10 characters
    if (!formData.tsNumber || formData.tsNumber.length >= 10) {
      errors.push('TS Number must be less than 10 characters');
    }

    // UPDATED: Employee number validation - any sequence less than 10 characters
    if (!formData.employeeNumber || formData.employeeNumber.length >= 10) {
      errors.push('Employee Number must be less than 10 characters');
    }

    // Date validations
    if (formData.dateOfFirstAppointment && formData.dateOfCurrentAppointment) {
      const firstAppointment = new Date(formData.dateOfFirstAppointment);
      const currentAppointment = new Date(formData.dateOfCurrentAppointment);
      
      if (currentAppointment < firstAppointment) {
        errors.push('Current appointment date cannot be before first appointment');
      }
    }

    // Subjects validation
    if (!formData.subjects.trim()) {
      errors.push('Please specify at least one subject');
    }

    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Common validation
    if (!formData.email || !formData.password || !formData.fullName) {
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

    // Enhanced password validation
    if (passwordStrength.score < 2) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Weak Password',
        message: 'Please use a stronger password. It should be at least 8 characters and include uppercase, lowercase, numbers, and special characters.'
      });
      setLoading(false);
      return;
    }

    // Teacher-specific validation
    if (userType === 'teacher') {
      const teacherErrors = validateTeacherFields();
      if (teacherErrors.length > 0) {
        setDialog({
          isOpen: true,
          type: 'error',
          title: 'Invalid Teacher Information',
          message: teacherErrors.join('\n')
        });
        setLoading(false);
        return;
      }
    }

    try {
      // Prepare data based on user type
      if (userType === 'teacher') {
        const subjects = formData.subjects.split(',').map(s => s.trim()).filter(s => s);
        
        await signup({
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName,
          userType: 'teacher',
          nrc: formData.nrc,
          dateOfBirth: formData.dateOfBirth,
          tsNumber: formData.tsNumber,
          employeeNumber: formData.employeeNumber,
          dateOfFirstAppointment: formData.dateOfFirstAppointment,
          dateOfCurrentAppointment: formData.dateOfCurrentAppointment,
          subjects
        });
      } else {
        await signup({
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName,
          userType: 'admin'
        });
      }
      
      // Show success dialog
      setDialog({
        isOpen: true,
        type: 'success',
        title: 'Verification Email Sent!',
        message: `Your ${userType} account has been created. Please check your email (${formData.email}) to verify your account before signing in.`,
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
    if (dialog.type === 'success' && dialog.redirectTo) {
      navigate(dialog.redirectTo, { 
        state: { 
          message: `Your ${userType} account has been created successfully! Please check your email to verify your account before signing in.`,
          email: formData.email
        } 
      });
    }
  };

  // Password strength indicator component
  const PasswordStrengthIndicator = () => (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-300 ${
              passwordStrength.color === 'red' ? 'bg-red-500' :
              passwordStrength.color === 'yellow' ? 'bg-yellow-500' :
              passwordStrength.color === 'blue' ? 'bg-blue-500' :
              passwordStrength.color === 'green' ? 'bg-green-500' : 'bg-gray-300'
            }`}
            style={{ width: `${(passwordStrength.score / 4) * 100}%` }}
          />
        </div>
        <span className={`text-xs font-medium text-${passwordStrength.color}-600`}>
          {passwordStrength.message}
        </span>
      </div>

      {/* Password requirements checklist */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className={`flex items-center gap-1 ${passwordStrength.requirements.length ? 'text-green-600' : 'text-gray-400'}`}>
          {passwordStrength.requirements.length ? <CheckCircle size={12} /> : <XCircle size={12} />}
          <span>8+ characters</span>
        </div>
        <div className={`flex items-center gap-1 ${passwordStrength.requirements.uppercase ? 'text-green-600' : 'text-gray-400'}`}>
          {passwordStrength.requirements.uppercase ? <CheckCircle size={12} /> : <XCircle size={12} />}
          <span>Uppercase</span>
        </div>
        <div className={`flex items-center gap-1 ${passwordStrength.requirements.lowercase ? 'text-green-600' : 'text-gray-400'}`}>
          {passwordStrength.requirements.lowercase ? <CheckCircle size={12} /> : <XCircle size={12} />}
          <span>Lowercase</span>
        </div>
        <div className={`flex items-center gap-1 ${passwordStrength.requirements.number ? 'text-green-600' : 'text-gray-400'}`}>
          {passwordStrength.requirements.number ? <CheckCircle size={12} /> : <XCircle size={12} />}
          <span>Number</span>
        </div>
        <div className={`flex items-center gap-1 ${passwordStrength.requirements.special ? 'text-green-600' : 'text-gray-400'}`}>
          {passwordStrength.requirements.special ? <CheckCircle size={12} /> : <XCircle size={12} />}
          <span>Special char</span>
        </div>
      </div>
    </div>
  );

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
        <div className="w-full max-w-2xl mx-auto">
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
                  {userType === 'admin' && ' (Maximum 5 administrators per school)'}
                </p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Full Name *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3.5 text-gray-400" size={20} />
                  <input
                    type="text"
                    name="fullName"
                    value={formData.fullName}
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

              {/* Teacher-specific fields */}
              {userType === 'teacher' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* NRC */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        NRC Number *
                      </label>
                      <div className="relative">
                        <CreditCard className="absolute left-3 top-3.5 text-gray-400" size={20} />
                        <input
                          type="text"
                          name="nrc"
                          value={formData.nrc}
                          onChange={handleChange}
                          placeholder="123456/78/1"
                          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                          required
                          disabled={loading}
                        />
                      </div>
                      <p className="text-xs text-gray-500">Format: 123456/78/1</p>
                    </div>

                    {/* Date of Birth */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Date of Birth *
                      </label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-3.5 text-gray-400" size={20} />
                        <input
                          type="date"
                          name="dateOfBirth"
                          value={formData.dateOfBirth}
                          onChange={handleChange}
                          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                          required
                          disabled={loading}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* TS Number - UPDATED placeholder */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        TS Number *
                      </label>
                      <div className="relative">
                        <Hash className="absolute left-3 top-3.5 text-gray-400" size={20} />
                        <input
                          type="text"
                          name="tsNumber"
                          value={formData.tsNumber}
                          onChange={handleChange}
                          placeholder="e.g., TS123 or 45678"
                          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                          required
                          disabled={loading}
                          maxLength={9}
                        />
                      </div>
                      <p className="text-xs text-gray-500">Any sequence less than 10 characters</p>
                    </div>

                    {/* Employee Number - UPDATED placeholder */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Employee Number *
                      </label>
                      <div className="relative">
                        <Briefcase className="absolute left-3 top-3.5 text-gray-400" size={20} />
                        <input
                          type="text"
                          name="employeeNumber"
                          value={formData.employeeNumber}
                          onChange={handleChange}
                          placeholder="e.g., EMP123 or 7890"
                          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                          required
                          disabled={loading}
                          maxLength={9}
                        />
                      </div>
                      <p className="text-xs text-gray-500">Any sequence less than 10 characters</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Date of First Appointment */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        First Appointment Date *
                      </label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-3.5 text-gray-400" size={20} />
                        <input
                          type="date"
                          name="dateOfFirstAppointment"
                          value={formData.dateOfFirstAppointment}
                          onChange={handleChange}
                          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                          required
                          disabled={loading}
                        />
                      </div>
                    </div>

                    {/* Date of Current Appointment */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Current Appointment Date *
                      </label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-3.5 text-gray-400" size={20} />
                        <input
                          type="date"
                          name="dateOfCurrentAppointment"
                          value={formData.dateOfCurrentAppointment}
                          onChange={handleChange}
                          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                          required
                          disabled={loading}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Subjects (Teacher Only) */}
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
                        placeholder="Mathematics, English, Science, Physics, Chemistry"
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
                </>
              )}

              {/* Password */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 text-gray-400" size={20} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className={`w-full pl-10 pr-12 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed ${
                      formData.password && passwordStrength.score < 2 ? 'border-red-300' : 'border-gray-300'
                    }`}
                    required
                    minLength={8}
                    disabled={loading}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                {formData.password && <PasswordStrengthIndicator />}
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Confirm Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 text-gray-400" size={20} />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className={`w-full pl-10 pr-12 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed ${
                      formData.confirmPassword && formData.password !== formData.confirmPassword ? 'border-red-300' : 'border-gray-300'
                    }`}
                    required
                    disabled={loading}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                  <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                    <XCircle size={12} /> Passwords do not match
                  </p>
                )}
              </div>

              {/* Admin Note */}
              {userType === 'admin' && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      <span className="font-medium">Important:</span> Only one administrator account is allowed per school. 
                      Maximum of 5 administrators system-wide.
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