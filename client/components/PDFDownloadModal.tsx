// @/components/PDFDownloadModal.tsx
import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Download,
  Check,
  FileSpreadsheet,
  FileBarChart,
  Loader2
} from 'lucide-react';

interface PDFDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDownload: (format: 'simple' | 'detailed' | 'summary', includeStats: boolean) => Promise<void>;
  className: string;
  learnerCount: number;
}

export const PDFDownloadModal = ({
  isOpen,
  onClose,
  onDownload,
  className,
  learnerCount
}: PDFDownloadModalProps) => {
  const [selectedFormat, setSelectedFormat] = useState<'simple' | 'detailed' | 'summary'>('simple');
  const [includeStats, setIncludeStats] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await onDownload(selectedFormat, includeStats);
      onClose();
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const formats = [
    {
      id: 'simple',
      name: 'Simple List',
      description: 'Basic list with names and IDs',
      icon: FileText,
      color: 'blue'
    },
    {
      id: 'detailed',
      name: 'Detailed Report',
      description: 'Complete learner information',
      icon: FileSpreadsheet,
      color: 'purple'
    },
    {
      id: 'summary',
      name: 'Summary Sheet',
      description: 'Compact view for quick reference',
      icon: FileBarChart,
      color: 'green'
    }
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={isDownloading ? undefined : onClose}
      />
      
      {/* Modal - Responsive Container */}
      <div className={`
        relative bg-white rounded-2xl shadow-2xl 
        w-full max-w-lg mx-auto
        max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)]
        flex flex-col
        animate-in fade-in zoom-in duration-200
      `}>
        {/* Header - Fixed */}
        <div className="flex-none px-4 sm:px-6 py-4 border-b border-gray-200">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                Download Class List
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-1 truncate">
                {className} • {learnerCount} learner{learnerCount !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isDownloading}
              className="flex-none p-2 hover:bg-gray-100 rounded-lg transition-colors 
                       disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Close modal"
            >
              <X size={20} className="sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
          <div className="space-y-4 sm:space-y-6">
            {/* Format Selection */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2 sm:mb-3">
                Select Format
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:gap-3">
                {formats.map((format) => {
                  const Icon = format.icon;
                  const isSelected = selectedFormat === format.id;
                  
                  return (
                    <button
                      key={format.id}
                      onClick={() => setSelectedFormat(format.id)}
                      disabled={isDownloading}
                      className={`
                        flex items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border-2 
                        transition-all w-full text-left
                        ${isSelected 
                          ? `border-${format.color}-500 bg-${format.color}-50/50` 
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                        }
                        ${isDownloading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                      `}
                    >
                      <div className={`
                        flex-none p-1.5 sm:p-2 rounded-lg
                        ${isSelected ? `bg-${format.color}-100` : 'bg-gray-100'}
                      `}>
                        <Icon 
                          size={20} 
                          className={`sm:w-6 sm:h-6 ${isSelected ? `text-${format.color}-600` : 'text-gray-600'}`} 
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`
                          text-sm sm:text-base font-medium truncate
                          ${isSelected ? `text-${format.color}-700` : 'text-gray-900'}
                        `}>
                          {format.name}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1 line-clamp-2">
                          {format.description}
                        </p>
                      </div>
                      {isSelected && (
                        <div className={`flex-none p-0.5 sm:p-1 rounded-full bg-${format.color}-500`}>
                          <Check size={14} className="sm:w-4 sm:h-4 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Options */}
            <div className="border-t border-gray-200 pt-3 sm:pt-4">
              <label className="flex items-start sm:items-center gap-2 sm:gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeStats}
                  onChange={(e) => setIncludeStats(e.target.checked)}
                  disabled={isDownloading}
                  className="flex-none mt-0.5 sm:mt-0 w-4 h-4 text-blue-600 border-gray-300 
                           rounded focus:ring-blue-500 disabled:opacity-50"
                />
                <span className="text-xs sm:text-sm text-gray-700 leading-relaxed">
                  Include class statistics (gender breakdown, totals)
                </span>
              </label>
            </div>

            {/* Preview Note */}
            <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
              <p className="text-xs sm:text-sm font-medium text-gray-700 mb-1">
                📄 Preview
              </p>
              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                {selectedFormat === 'simple' && 'Simple list with student IDs, names, and guardians.'}
                {selectedFormat === 'detailed' && 'Comprehensive report with all learner information including address, contacts, and medical notes.'}
                {selectedFormat === 'summary' && 'Compact view with student IDs and names for quick reference.'}
                {includeStats && ' Class statistics will be included at the top.'}
              </p>
            </div>
          </div>
        </div>

        {/* Actions - Fixed */}
        <div className="flex-none px-4 sm:px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={onClose}
              disabled={isDownloading}
              className="w-full sm:flex-1 px-4 py-2.5 sm:py-2 border border-gray-300 
                       text-gray-700 rounded-lg hover:bg-gray-100 font-medium 
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                       text-sm sm:text-base"
            >
              Cancel
            </button>
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="w-full sm:flex-1 px-4 py-2.5 sm:py-2 bg-blue-600 text-white 
                       rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 
                       disabled:cursor-not-allowed flex items-center justify-center 
                       gap-2 transition-colors text-sm sm:text-base"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  <span className="hidden xs:inline">Generating...</span>
                  <span className="xs:hidden">Loading...</span>
                </>
              ) : (
                <>
                  <Download size={18} />
                  <span className="hidden xs:inline">Download PDF</span>
                  <span className="xs:hidden">Download</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};