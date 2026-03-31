// @/pages/SignUp.tsx - REDESIGNED with step-based progression
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/hooks/useAuth';
import { 
  ArrowRight, 
  ArrowLeft,
  Mail, 
  Lock, 
  User, 
  BookOpen, 
  CheckCircle, 
  XCircle, 
  Calendar,
  Hash,
  Briefcase,
  CreditCard,
  Eye,
  EyeOff,
  UserCheck,
  GraduationCap
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className={`w-full max-w-md rounded-2xl ${bgColor} border ${borderColor} shadow-2xl transform transition-all duration-300 scale-100`}>
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
}

const checkPasswordStrength = (password: string): PasswordStrength => {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (password.length === 0) {
    return { score: 0, message: 'Enter a password', color: 'gray' };
  } else if (score <= 2) {
    return { score: 1, message: 'Weak', color: 'red' };
  } else if (score === 3) {
    return { score: 2, message: 'Fair', color: 'yellow' };
  } else if (score === 4) {
    return { score: 3, message: 'Good', color: 'blue' };
  } else {
    return { score: 4, message: 'Strong', color: 'green' };
  }
};

export default function SignUp() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    // Step 1: Account Info
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    
    // Step 2: Personal Info
    nrc: '',
    dateOfBirth: '',
    
    // Step 3: Professional Info
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
    color: 'gray'
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
    
    @keyframes slideInRight {
      from {
        opacity: 0;
        transform: translateX(30px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    
    @keyframes slideInLeft {
      from {
        opacity: 0;
        transform: translateX(-30px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    .animate-fadeInUp {
      animation: fadeInUp 0.5s ease-out forwards;
    }
    
    .animate-slideInRight {
      animation: slideInRight 0.5s ease-out forwards;
    }
    
    .animate-slideInLeft {
      animation: slideInLeft 0.5s ease-out forwards;
    }
  `;

  useEffect(() => {
    setPasswordStrength(checkPasswordStrength(formData.password));
  }, [formData.password]);

  useEffect(() => {
    if (isAuthenticated && user) {
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

  const validateStep = () => {
    if (step === 1) {
      if (!formData.fullName || !formData.email || !formData.password || !formData.confirmPassword) {
        setDialog({
          isOpen: true,
          type: 'error',
          title: 'Missing Information',
          message: 'Please fill in all fields'
        });
        return false;
      }
      if (formData.password !== formData.confirmPassword) {
        setDialog({
          isOpen: true,
          type: 'error',
          title: 'Password Mismatch',
          message: 'Passwords do not match'
        });
        return false;
      }
      if (passwordStrength.score < 2) {
        setDialog({
          isOpen: true,
          type: 'error',
          title: 'Weak Password',
          message: 'Please use a stronger password'
        });
        return false;
      }
      return true;
    }
    
    if (step === 2) {
      const nrcRegex = /^\d{6}\/\d{2}\/\d{1}$/;
      if (!nrcRegex.test(formData.nrc)) {
        setDialog({
          isOpen: true,
          type: 'error',
          title: 'Invalid NRC',
          message: 'NRC must be in format: 123456/78/1'
        });
        return false;
      }
      
      const dob = new Date(formData.dateOfBirth);
      const today = new Date();
      const age = today.getFullYear() - dob.getFullYear();
      if (age < 18) {
        setDialog({
          isOpen: true,
          type: 'error',
          title: 'Invalid Age',
          message: 'Teacher must be at least 18 years old'
        });
        return false;
      }
      return true;
    }
    
    if (step === 3) {
      if (!formData.tsNumber || formData.tsNumber.length >= 10) {
        setDialog({
          isOpen: true,
          type: 'error',
          title: 'Invalid TS Number',
          message: 'TS Number must be less than 10 characters'
        });
        return false;
      }
      if (!formData.employeeNumber || formData.employeeNumber.length >= 10) {
        setDialog({
          isOpen: true,
          type: 'error',
          title: 'Invalid Employee Number',
          message: 'Employee Number must be less than 10 characters'
        });
        return false;
      }
      if (!formData.subjects.trim()) {
        setDialog({
          isOpen: true,
          type: 'error',
          title: 'Missing Subjects',
          message: 'Please specify at least one subject'
        });
        return false;
      }
      return true;
    }
    
    return true;
  };

  const nextStep = () => {
    if (validateStep()) {
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    setStep(step - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep()) return;
    
    setLoading(true);
    try {
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
      
      setDialog({
        isOpen: true,
        type: 'success',
        title: 'Verification Email Sent!',
        message: `Your teacher account has been created. Please check your email (${formData.email}) to verify your account.`,
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
          message: `Your teacher account has been created successfully! Please check your email to verify your account.`,
          email: formData.email
        } 
      });
    }
  };

  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
              step === s
                ? 'bg-blue-600 text-white shadow-lg scale-110'
                : step > s
                ? 'bg-green-500 text-white'
                : 'bg-white/20 text-gray-300'
            }`}
          >
            {step > s ? <CheckCircle size={20} /> : s}
          </div>
          {s < 3 && (
            <div className={`w-12 h-0.5 mx-1 ${step > s ? 'bg-green-500' : 'bg-white/20'}`} />
          )}
        </div>
      ))}
    </div>
  );

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
        {/* Background */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: 'url("/images/signup-bg.jpg")',
            backgroundAttachment: 'fixed'
          }}
        />
        
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/50 to-black/60 backdrop-blur-[1px]" />
        
        {/* Content */}
        <div className="relative z-10 flex items-center justify-center min-h-screen py-8 px-4">
          <div className="w-full max-w-lg mx-auto">
            {/* Header */}
            <div className="text-center mb-6 animate-fadeInUp">
              <div className="inline-block mb-3">
                <div className="w-16 h-16 mx-auto bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl flex items-center justify-center p-1.5 border border-white/30">
                  <img 
                    src="/images/school-logo.png" 
                    alt="KalaboBoarding School Logo" 
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-white mb-1">Teacher Registration</h1>
              <p className="text-gray-300 text-sm">Step {step} of 3</p>
            </div>

            {/* Step Indicator */}
            <StepIndicator />

            {/* Form Card */}
            <div className="bg-white/15 backdrop-blur-xl rounded-2xl shadow-2xl p-6 border border-white/30">
              <form onSubmit={handleSubmit}>
                {/* Step 1: Account Info */}
                {step === 1 && (
                  <div className="space-y-4 animate-slideInRight">
                    <div>
                      <label className="block text-sm font-medium text-gray-200 mb-1">
                        Full Name *
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 text-gray-300" size={18} />
                        <input
                          type="text"
                          name="fullName"
                          value={formData.fullName}
                          onChange={handleChange}
                          placeholder="John Doe"
                          className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-white/60 text-sm"
                          required
                          disabled={loading}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-200 mb-1">
                        Email Address *
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 text-gray-300" size={18} />
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleChange}
                          placeholder="john@example.com"
                          className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-white/60 text-sm"
                          required
                          disabled={loading}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-200 mb-1">
                        Password *
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-2.5 text-gray-300" size={18} />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          name="password"
                          value={formData.password}
                          onChange={handleChange}
                          placeholder="••••••••"
                          className="w-full pl-10 pr-10 py-2 bg-white/10 border border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-white/60 text-sm"
                          required
                          disabled={loading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-2.5 text-gray-300 hover:text-white"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      {formData.password && (
                        <div className="mt-1">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-300 ${
                                  passwordStrength.color === 'red' ? 'bg-red-500 w-1/4' :
                                  passwordStrength.color === 'yellow' ? 'bg-yellow-500 w-2/4' :
                                  passwordStrength.color === 'blue' ? 'bg-blue-500 w-3/4' :
                                  passwordStrength.color === 'green' ? 'bg-green-500 w-full' : 'w-0'
                                }`}
                              />
                            </div>
                            <span className={`text-xs text-${passwordStrength.color}-400`}>
                              {passwordStrength.message}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-200 mb-1">
                        Confirm Password *
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-2.5 text-gray-300" size={18} />
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          name="confirmPassword"
                          value={formData.confirmPassword}
                          onChange={handleChange}
                          placeholder="••••••••"
                          className="w-full pl-10 pr-10 py-2 bg-white/10 border border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-white/60 text-sm"
                          required
                          disabled={loading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-2.5 text-gray-300 hover:text-white"
                        >
                          {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Personal Info */}
                {step === 2 && (
                  <div className="space-y-4 animate-slideInRight">
                    <div>
                      <label className="block text-sm font-medium text-gray-200 mb-1">
                        NRC Number *
                      </label>
                      <div className="relative">
                        <CreditCard className="absolute left-3 top-2.5 text-gray-300" size={18} />
                        <input
                          type="text"
                          name="nrc"
                          value={formData.nrc}
                          onChange={handleChange}
                          placeholder="123456/78/1"
                          className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-white/60 text-sm"
                          required
                          disabled={loading}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Format: 123456/78/1</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-200 mb-1">
                        Date of Birth *
                      </label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-2.5 text-gray-300" size={18} />
                        <input
                          type="date"
                          name="dateOfBirth"
                          value={formData.dateOfBirth}
                          onChange={handleChange}
                          className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white text-sm [color-scheme:dark]"
                          required
                          disabled={loading}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: Professional Info */}
                {step === 3 && (
                  <div className="space-y-4 animate-slideInRight">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-200 mb-1">
                          TS Number *
                        </label>
                        <div className="relative">
                          <Hash className="absolute left-3 top-2.5 text-gray-300" size={18} />
                          <input
                            type="text"
                            name="tsNumber"
                            value={formData.tsNumber}
                            onChange={handleChange}
                            placeholder="TS123"
                            className="w-full pl-10 pr-3 py-2 bg-white/10 border border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-white/60 text-sm"
                            required
                            disabled={loading}
                            maxLength={9}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-200 mb-1">
                          Employee Number *
                        </label>
                        <div className="relative">
                          <Briefcase className="absolute left-3 top-2.5 text-gray-300" size={18} />
                          <input
                            type="text"
                            name="employeeNumber"
                            value={formData.employeeNumber}
                            onChange={handleChange}
                            placeholder="EMP123"
                            className="w-full pl-10 pr-3 py-2 bg-white/10 border border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-white/60 text-sm"
                            required
                            disabled={loading}
                            maxLength={9}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-200 mb-1">
                          First Appointment *
                        </label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-2.5 text-gray-300" size={18} />
                          <input
                            type="date"
                            name="dateOfFirstAppointment"
                            value={formData.dateOfFirstAppointment}
                            onChange={handleChange}
                            className="w-full pl-10 pr-3 py-2 bg-white/10 border border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white text-sm [color-scheme:dark]"
                            required
                            disabled={loading}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-200 mb-1">
                          Current Appointment *
                        </label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-2.5 text-gray-300" size={18} />
                          <input
                            type="date"
                            name="dateOfCurrentAppointment"
                            value={formData.dateOfCurrentAppointment}
                            onChange={handleChange}
                            className="w-full pl-10 pr-3 py-2 bg-white/10 border border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white text-sm [color-scheme:dark]"
                            required
                            disabled={loading}
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-200 mb-1">
                        Subjects *
                      </label>
                      <div className="relative">
                        <BookOpen className="absolute left-3 top-2.5 text-gray-300" size={18} />
                        <textarea
                          name="subjects"
                          value={formData.subjects}
                          onChange={handleChange}
                          placeholder="Mathematics, English, Science"
                          rows={2}
                          className="w-full pl-10 pr-3 py-2 bg-white/10 border border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-white/60 text-sm resize-none"
                          required
                          disabled={loading}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Separate subjects with commas</p>
                    </div>
                  </div>
                )}

                {/* Navigation Buttons */}
                <div className="flex gap-3 mt-6">
                  {step > 1 && (
                    <button
                      type="button"
                      onClick={prevStep}
                      className="flex-1 py-2.5 border border-white/30 text-white font-medium rounded-lg hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
                    >
                      <ArrowLeft size={16} />
                      Back
                    </button>
                  )}
                  
                  {step < 3 ? (
                    <button
                      type="button"
                      onClick={nextStep}
                      className="flex-1 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                    >
                      Continue
                      <ArrowRight size={16} />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white font-medium rounded-lg hover:from-green-700 hover:to-green-800 disabled:from-gray-500 disabled:to-gray-600 transition-all flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                          <span>Creating...</span>
                        </>
                      ) : (
                        <>
                          <span>Create Account</span>
                          <CheckCircle size={16} />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </form>

              {/* Sign In Link */}
              <div className="mt-4 pt-4 border-t border-white/20">
                <p className="text-center text-gray-300 text-sm">
                  Already have an account?{' '}
                  <Link to="/signin" className="text-blue-300 font-semibold hover:text-blue-200 transition-colors">
                    Sign In
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