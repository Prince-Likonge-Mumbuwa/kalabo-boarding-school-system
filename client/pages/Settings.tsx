// @/pages/Settings.tsx - FIXED VERSION
import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSchoolTeachers } from '@/hooks/useSchoolTeachers';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  User,
  Mail,
  Lock,
  BookOpen,
  GraduationCap,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  Save,
  Trash2,
  Eye,
  EyeOff,
  Plus,
  X,
  Shield,
  Key,
  FileText
} from 'lucide-react';

// ==================== TYPES ====================
interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
}

// ==================== TOAST COMPONENT ====================
const Toast = ({ toast, onClose }: { toast: Toast; onClose: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icons = {
    success: <CheckCircle className="text-green-500" size={20} />,
    error: <XCircle className="text-red-500" size={20} />,
    info: <AlertCircle className="text-blue-500" size={20} />,
    warning: <AlertCircle className="text-yellow-500" size={20} />
  };

  const bgColors = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    info: 'bg-blue-50 border-blue-200',
    warning: 'bg-yellow-50 border-yellow-200'
  };

  return (
    <div className={`fixed top-4 right-4 z-50 max-w-md w-full rounded-xl border p-4 shadow-lg animate-in slide-in-from-top-2 duration-300 ${bgColors[toast.type]}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {icons[toast.type]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{toast.title}</p>
          <p className="text-xs text-gray-600 mt-1">{toast.message}</p>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 ml-2 p-1 hover:bg-white/50 rounded-lg transition-colors"
        >
          <X size={16} className="text-gray-400 hover:text-gray-600" />
        </button>
      </div>
    </div>
  );
};

// ==================== CONFIRMATION MODAL ====================
interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDanger?: boolean;
}

const ConfirmModal = ({ 
  isOpen, 
  title, 
  message, 
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm, 
  onCancel,
  isDanger = false
}: ConfirmModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onCancel} />
      <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
          <div className="text-center">
            <div className={`mx-auto flex items-center justify-center w-16 h-16 ${isDanger ? 'bg-red-100' : 'bg-yellow-100'} rounded-full mb-4`}>
              {isDanger ? (
                <Trash2 className="text-red-600" size={32} />
              ) : (
                <AlertCircle className="text-yellow-600" size={32} />
              )}
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
            <p className="text-sm text-gray-600 mb-6">{message}</p>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                className={`flex-1 px-4 py-2.5 text-white rounded-lg font-medium transition-colors ${
                  isDanger 
                    ? 'bg-red-600 hover:bg-red-700' 
                    : 'bg-yellow-600 hover:bg-yellow-700'
                }`}
              >
                {confirmText}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== PASSWORD UPDATE MODAL ====================
interface PasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}

const PasswordModal = ({ isOpen, onClose, onSuccess, onError }: PasswordModalProps) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, message: '' });

  useEffect(() => {
    // Check password strength
    const score = 
      (newPassword.length >= 8 ? 1 : 0) +
      (/[A-Z]/.test(newPassword) ? 1 : 0) +
      (/[a-z]/.test(newPassword) ? 1 : 0) +
      (/[0-9]/.test(newPassword) ? 1 : 0) +
      (/[^A-Za-z0-9]/.test(newPassword) ? 1 : 0);

    let message = '';
    if (newPassword.length === 0) message = '';
    else if (score <= 2) message = 'Weak password';
    else if (score === 3) message = 'Fair password';
    else if (score === 4) message = 'Good password';
    else if (score === 5) message = 'Strong password';

    setPasswordStrength({ score, message });
  }, [newPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      onError('New passwords do not match');
      return;
    }

    if (passwordStrength.score < 3) {
      onError('Please use a stronger password');
      return;
    }

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error('No user logged in');

      // Re-authenticate user
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, newPassword);
      
      onSuccess();
      onClose();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Password update error:', error);
      if (error.code === 'auth/wrong-password') {
        onError('Current password is incorrect');
      } else if (error.code === 'auth/weak-password') {
        onError('New password is too weak');
      } else {
        onError(error.message || 'Failed to update password');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
          
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Update Password</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X size={18} className="text-gray-500" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Current Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Password
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <div className="relative">
                <Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              
              {/* Password Strength Indicator */}
              {newPassword && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${
                          passwordStrength.score <= 2 ? 'bg-red-500' :
                          passwordStrength.score === 3 ? 'bg-yellow-500' :
                          passwordStrength.score === 4 ? 'bg-blue-500' :
                          'bg-green-500'
                        }`}
                        style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                      />
                    </div>
                    <span className={`text-xs ${
                      passwordStrength.score <= 2 ? 'text-red-600' :
                      passwordStrength.score === 3 ? 'text-yellow-600' :
                      passwordStrength.score === 4 ? 'text-blue-600' :
                      'text-green-600'
                    }`}>
                      {passwordStrength.message}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full pl-10 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    confirmPassword && newPassword !== confirmPassword ? 'border-red-300' : 'border-gray-300'
                  }`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-600 mt-1">Passwords do not match</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword || passwordStrength.score < 3}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                Update
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// ==================== MAIN SETTINGS COMPONENT ====================
export default function Settings() {
  const { user } = useAuth();
  const { updateTeacher } = useSchoolTeachers();
  
  // Toast state
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Modal states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  // Form states - using simple string array for qualifications
  const [formData, setFormData] = useState({
    fullName: user?.fullName || '',
    email: user?.email || '',
    subjects: user?.subjects || [] as string[],
    qualifications: [] as string[], // Simple string array
    newSubject: '',
    newQualification: ''
  });

  // Track unsaved changes
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load user data
  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        fullName: user.fullName || '',
        email: user.email || '',
        subjects: user.subjects || [],
        // Note: qualifications would need to be loaded from somewhere
        // This is a placeholder - you'd need to fetch from teacher document
      }));
    }
  }, [user]);

  // Check for unsaved changes
  useEffect(() => {
    const changed = 
      formData.fullName !== user?.fullName ||
      formData.email !== user?.email ||
      JSON.stringify(formData.subjects) !== JSON.stringify(user?.subjects || []) ||
      formData.qualifications.length > 0; // Simple check - you'd need to compare with stored values
    
    setHasChanges(changed);
  }, [formData, user]);

  // Toast functions
  const addToast = (toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { ...toast, id }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Handle form submission
  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    try {
      await updateTeacher({
        teacherId: user.uid,
        updates: {
          name: formData.fullName,
          email: formData.email,
          subjects: formData.subjects,
          qualifications: formData.qualifications
        }
      });

      addToast({
        type: 'success',
        title: 'Settings Updated',
        message: 'Your profile has been updated successfully.'
      });

      setHasChanges(false);
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Update Failed',
        message: error.message || 'Failed to update settings'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle subject management
  const handleAddSubject = () => {
    if (!formData.newSubject.trim()) return;
    if (formData.subjects.includes(formData.newSubject.trim())) {
      addToast({
        type: 'warning',
        title: 'Duplicate Subject',
        message: 'This subject is already in your list'
      });
      return;
    }
    setFormData({
      ...formData,
      subjects: [...formData.subjects, formData.newSubject.trim()],
      newSubject: ''
    });
  };

  const handleRemoveSubject = (subject: string) => {
    setFormData({
      ...formData,
      subjects: formData.subjects.filter(s => s !== subject)
    });
  };

  // Handle qualification management (simplified)
  const handleAddQualification = () => {
    if (!formData.newQualification.trim()) return;
    
    setFormData({
      ...formData,
      qualifications: [...formData.qualifications, formData.newQualification.trim()],
      newQualification: ''
    });
  };

  const handleRemoveQualification = (qualification: string) => {
    setFormData({
      ...formData,
      qualifications: formData.qualifications.filter(q => q !== qualification)
    });
  };

  // Handle account deletion
  const handleDeleteAccount = async () => {
    if (!user) return;

    try {
      // Delete user document from Firestore
      await deleteDoc(doc(db, 'users', user.uid));
      
      // Delete auth user
      await auth.currentUser?.delete();

      addToast({
        type: 'success',
        title: 'Account Deleted',
        message: 'Your account has been permanently deleted.'
      });

      // Redirect to home after a short delay
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Deletion Failed',
        message: error.message || 'Failed to delete account. Please try again.'
      });
      setShowDeleteConfirm(false);
    }
  };

  // Handle navigation with unsaved changes
  const handleBack = () => {
    if (hasChanges) {
      setShowUnsavedConfirm(true);
    } else {
      window.history.back();
    }
  };

  if (!user) return null;

  return (
    <DashboardLayout activeTab="settings">
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        
        {/* Toasts */}
        <div className="fixed top-4 right-4 z-50 space-y-2 max-w-[90vw] sm:max-w-md">
          {toasts.map(toast => (
            <Toast key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
          ))}
        </div>

        {/* Password Modal */}
        <PasswordModal
          isOpen={showPasswordModal}
          onClose={() => setShowPasswordModal(false)}
          onSuccess={() => addToast({
            type: 'success',
            title: 'Password Updated',
            message: 'Your password has been changed successfully.'
          })}
          onError={(message) => addToast({
            type: 'error',
            title: 'Password Update Failed',
            message
          })}
        />

        {/* Delete Confirmation Modal */}
        <ConfirmModal
          isOpen={showDeleteConfirm}
          title="Delete Account"
          message="Are you sure you want to permanently delete your account? This action cannot be undone and all your data will be lost."
          confirmText="Delete Permanently"
          onConfirm={handleDeleteAccount}
          onCancel={() => setShowDeleteConfirm(false)}
          isDanger={true}
        />

        {/* Unsaved Changes Modal */}
        <ConfirmModal
          isOpen={showUnsavedConfirm}
          title="Unsaved Changes"
          message="You have unsaved changes. Are you sure you want to leave without saving?"
          confirmText="Leave Without Saving"
          cancelText="Stay"
          onConfirm={() => {
            setShowUnsavedConfirm(false);
            window.history.back();
          }}
          onCancel={() => setShowUnsavedConfirm(false)}
        />

        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
                Settings
              </h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1">
                Manage your account preferences and information
              </p>
            </div>
            
            {/* Save Button */}
            {hasChanges && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all"
              >
                {isSaving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                Save Changes
              </button>
            )}
          </div>
        </div>

        <div className="max-w-4xl space-y-6">
          
          {/* 1. Profile Information */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
              <div className="flex items-center gap-2">
                <User size={18} className="text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">Profile Information</h2>
              </div>
              <p className="text-sm text-gray-600 mt-1">Update your name and email address</p>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Your full name"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="your@email.com"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Changing your email will require verification
                </p>
              </div>
            </div>
          </div>

          {/* 2. Subjects They Teach */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
              <div className="flex items-center gap-2">
                <BookOpen size={18} className="text-green-600" />
                <h2 className="text-lg font-semibold text-gray-900">Subjects You Teach</h2>
              </div>
              <p className="text-sm text-gray-600 mt-1">Add or remove subjects from your profile</p>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Subject List */}
              {formData.subjects.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.subjects.map((subject) => (
                    <span
                      key={subject}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-sm"
                    >
                      {subject}
                      <button
                        onClick={() => handleRemoveSubject(subject)}
                        className="hover:bg-blue-200 rounded p-0.5"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Add Subject */}
              <div className="flex gap-2 max-w-md">
                <input
                  type="text"
                  value={formData.newSubject}
                  onChange={(e) => setFormData({ ...formData, newSubject: e.target.value })}
                  placeholder="Enter a subject"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddSubject()}
                />
                <button
                  onClick={handleAddSubject}
                  disabled={!formData.newSubject.trim()}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* 3. Qualifications (Simplified - String Array) */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
              <div className="flex items-center gap-2">
                <GraduationCap size={18} className="text-purple-600" />
                <h2 className="text-lg font-semibold text-gray-900">Qualifications & Credentials</h2>
              </div>
              <p className="text-sm text-gray-600 mt-1">Add your qualifications (e.g., Bachelor of Education, Diploma in Teaching)</p>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Qualifications List */}
              {formData.qualifications.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.qualifications.map((qual, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-100 text-purple-800 rounded-lg text-sm"
                    >
                      {qual}
                      <button
                        onClick={() => handleRemoveQualification(qual)}
                        className="hover:bg-purple-200 rounded p-0.5"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Add Qualification */}
              <div className="flex gap-2 max-w-md">
                <input
                  type="text"
                  value={formData.newQualification}
                  onChange={(e) => setFormData({ ...formData, newQualification: e.target.value })}
                  placeholder="Enter a qualification"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddQualification()}
                />
                <button
                  onClick={handleAddQualification}
                  disabled={!formData.newQualification.trim()}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* 4. Password Update */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Lock size={18} className="text-amber-600" />
                <h2 className="text-lg font-semibold text-gray-900">Security</h2>
              </div>
              <p className="text-sm text-gray-600 mt-1">Update your password</p>
            </div>
            
            <div className="p-6">
              <button
                onClick={() => setShowPasswordModal(true)}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 flex items-center gap-2"
              >
                <Key size={16} />
                Change Password
              </button>
            </div>
          </div>

          {/* 5. Delete Account */}
          <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-red-50 to-white border-b border-red-200">
              <div className="flex items-center gap-2">
                <Trash2 size={18} className="text-red-600" />
                <h2 className="text-lg font-semibold text-gray-900">Danger Zone</h2>
              </div>
              <p className="text-sm text-gray-600 mt-1">Permanently delete your account</p>
            </div>
            
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">
                Once you delete your account, there is no going back. All your data will be permanently removed.
              </p>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
              >
                <Trash2 size={16} />
                Delete Account
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}