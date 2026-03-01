// @/components/SuccessModal.tsx
import React from 'react';
import { CheckCircle, X, Copy, Download } from 'lucide-react';

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  studentId?: string;
  studentName?: string;
  className?: string;
  actionType: 'add' | 'import' | 'update' | 'edit';
  importedCount?: number;
  studentIds?: string[];
}

export const SuccessModal = ({
  isOpen,
  onClose,
  title,
  message,
  studentId,
  studentName,
  className,
  actionType,
  importedCount,
  studentIds
}: SuccessModalProps) => {
  if (!isOpen) return null;

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
  };

  const handleCopyAllIds = () => {
    if (studentIds && studentIds.length > 0) {
      navigator.clipboard.writeText(studentIds.join('\n'));
    }
  };

  const handleDownloadIds = () => {
    if (studentIds && studentIds.length > 0) {
      const blob = new Blob([studentIds.join('\n')], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `student_ids_${new Date().toISOString().split('T')[0]}.txt`;
      a.click();
      window.URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 animate-in fade-in zoom-in duration-200">
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={20} />
        </button>
        
        {/* Success Icon */}
        <div className="text-center mb-4">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          
          <h3 className="text-xl font-bold text-gray-900 mb-1">
            {title}
          </h3>
          
          <p className="text-sm text-gray-600">
            {message}
          </p>
        </div>

        {/* Content based on action type */}
        {actionType === 'add' && studentId && studentName && className && (
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Student ID Generated</p>
              <div className="flex items-center justify-center gap-2 mb-2">
                <code className="text-lg font-mono font-bold bg-white px-3 py-1 rounded-lg border border-gray-200">
                  {studentId}
                </code>
                <button
                  onClick={() => handleCopyId(studentId)}
                  className="p-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  title="Copy ID"
                >
                  <Copy size={16} className="text-gray-600" />
                </button>
              </div>
              <p className="text-sm">
                <span className="font-medium">{studentName}</span> added to{' '}
                <span className="font-medium">{className}</span>
              </p>
            </div>
          </div>
        )}

        {actionType === 'import' && importedCount !== undefined && studentIds && studentIds.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <div className="text-center mb-3">
              <p className="text-lg font-semibold text-gray-900">
                {importedCount} Learner{importedCount !== 1 ? 's' : ''} Imported
              </p>
              <p className="text-sm text-gray-600">
                Successfully added to {className}
              </p>
            </div>
            
            {/* Student IDs Preview */}
            {studentIds.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-500 mb-2">
                  Generated Student IDs ({studentIds.length}):
                </p>
                <div className="bg-white rounded-lg p-2 max-h-24 overflow-y-auto border border-gray-200">
                  <div className="grid grid-cols-2 gap-1">
                    {studentIds.slice(0, 6).map((id, idx) => (
                      <code key={idx} className="text-xs font-mono bg-gray-50 px-1.5 py-0.5 rounded">
                        {id}
                      </code>
                    ))}
                    {studentIds.length > 6 && (
                      <code className="text-xs font-mono bg-gray-50 px-1.5 py-0.5 rounded text-gray-500">
                        +{studentIds.length - 6} more
                      </code>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* Bulk Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleCopyAllIds}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Copy size={14} />
                Copy All IDs
              </button>
              <button
                onClick={handleDownloadIds}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Download size={14} />
                Download IDs
              </button>
            </div>
          </div>
        )}

        {actionType === 'edit' && (
          <div className="bg-blue-50 rounded-xl p-4 mb-4">
            <p className="text-sm text-blue-800 text-center">
              Learner information has been updated successfully.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Close
          </button>
          <button
            onClick={() => {
              onClose();
              // You can add navigation logic here if needed
            }}
            className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};