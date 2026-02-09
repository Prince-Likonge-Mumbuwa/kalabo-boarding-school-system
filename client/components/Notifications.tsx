import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

// Success Notification Component
interface SuccessNotificationProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
}

export const SuccessNotification = ({ isOpen, onClose, title, message }: SuccessNotificationProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-slideIn">
      <div className="bg-green-50 border border-green-200 rounded-xl shadow-lg p-4 max-w-sm">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-green-800 text-sm">{title}</h3>
            <p className="text-green-700 text-sm mt-1">{message}</p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-green-500 hover:text-green-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="h-1 w-full bg-green-200 rounded-full mt-3 overflow-hidden">
          <div className="h-full bg-green-500 animate-progressBar"></div>
        </div>
      </div>
    </div>
  );
};

// Error Notification Component
interface ErrorNotificationProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
}

export const ErrorNotification = ({ isOpen, onClose, title, message }: ErrorNotificationProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-slideIn">
      <div className="bg-red-50 border border-red-200 rounded-xl shadow-lg p-4 max-w-sm">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-red-800 text-sm">{title}</h3>
            <p className="text-red-700 text-sm mt-1">{message}</p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-red-500 hover:text-red-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="h-1 w-full bg-red-200 rounded-full mt-3 overflow-hidden">
          <div className="h-full bg-red-500 animate-progressBar"></div>
        </div>
      </div>
    </div>
  );
};

// Info Notification Component
interface InfoNotificationProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
}

export const InfoNotification = ({ isOpen, onClose, title, message }: InfoNotificationProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-slideIn">
      <div className="bg-blue-50 border border-blue-200 rounded-xl shadow-lg p-4 max-w-sm">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <Info className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-blue-800 text-sm">{title}</h3>
            <p className="text-blue-700 text-sm mt-1">{message}</p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-blue-500 hover:text-blue-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="h-1 w-full bg-blue-200 rounded-full mt-3 overflow-hidden">
          <div className="h-full bg-blue-500 animate-progressBar"></div>
        </div>
      </div>
    </div>
  );
};

// Confirmation Modal Component
interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

export const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'warning'
}: ConfirmationModalProps) => {
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: AlertCircle,
      iconColor: 'text-red-600',
      button: 'bg-red-600 hover:bg-red-700 text-white',
      border: 'border-red-200'
    },
    warning: {
      icon: AlertCircle,
      iconColor: 'text-amber-600',
      button: 'bg-amber-600 hover:bg-amber-700 text-white',
      border: 'border-amber-200'
    },
    info: {
      icon: Info,
      iconColor: 'text-blue-600',
      button: 'bg-blue-600 hover:bg-blue-700 text-white',
      border: 'border-blue-200'
    }
  };

  const { icon: Icon, iconColor, button, border } = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className={`relative bg-white rounded-2xl w-full max-w-md shadow-2xl border ${border}`}>
          <div className="p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className={`flex-shrink-0 p-2 rounded-lg ${iconColor.replace('text', 'bg')}50`}>
                <Icon className={`w-5 h-5 ${iconColor}`} />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                <p className="text-gray-600 mt-2">{message}</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                {cancelText}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors ${button}`}
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

