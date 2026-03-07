// @/components/ConfirmationModal.tsx
import { X, AlertTriangle, Trash2, Archive, AlertCircle } from 'lucide-react';
import { useState } from 'react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
  message: string;
  type?: 'delete' | 'archive' | 'transfer' | 'hardDelete';
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
}

export const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = 'delete',
  confirmText,
  cancelText = 'Cancel',
  isLoading = false
}: ConfirmationModalProps) => {
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleConfirm = async () => {
    try {
      setError('');
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  // Determine styles based on type
  const getTypeStyles = () => {
    switch (type) {
      case 'delete':
      case 'hardDelete':
        return {
          icon: <Trash2 className="text-red-600" size={24} />,
          iconBg: 'bg-red-100',
          buttonBg: 'bg-red-600 hover:bg-red-700',
          buttonText: confirmText || 'Delete',
          title: title || 'Confirm Delete'
        };
      case 'archive':
        return {
          icon: <Archive className="text-yellow-600" size={24} />,
          iconBg: 'bg-yellow-100',
          buttonBg: 'bg-yellow-600 hover:bg-yellow-700',
          buttonText: confirmText || 'Archive',
          title: title || 'Confirm Archive'
        };
      case 'transfer':
        return {
          icon: <AlertCircle className="text-blue-600" size={24} />,
          iconBg: 'bg-blue-100',
          buttonBg: 'bg-blue-600 hover:bg-blue-700',
          buttonText: confirmText || 'Transfer',
          title: title || 'Confirm Transfer'
        };
      default:
        return {
          icon: <AlertTriangle className="text-red-600" size={24} />,
          iconBg: 'bg-red-100',
          buttonBg: 'bg-red-600 hover:bg-red-700',
          buttonText: confirmText || 'Confirm',
          title: title || 'Confirm Action'
        };
    }
  };

  const styles = getTypeStyles();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6 animate-in fade-in zoom-in duration-200">
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={20} />
        </button>

        {/* Icon */}
        <div className="text-center mb-4">
          <div className={`mx-auto flex items-center justify-center h-16 w-16 rounded-full ${styles.iconBg} mb-4`}>
            {styles.icon}
          </div>
          
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            {styles.title}
          </h3>
          
          <p className="text-sm text-gray-600">
            {message}
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600 flex items-center gap-2">
              <AlertTriangle size={16} />
              {error}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className={`flex-1 py-2.5 text-white rounded-lg transition-colors disabled:opacity-50 ${styles.buttonBg}`}
          >
            {isLoading ? 'Processing...' : styles.buttonText}
          </button>
        </div>
      </div>
    </div>
  );
};