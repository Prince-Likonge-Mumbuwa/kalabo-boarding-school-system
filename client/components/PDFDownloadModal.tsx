// @/components/PDFDownloadModal.tsx
import React, { useState } from 'react';
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

  if (!isOpen) return null;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await onDownload(selectedFormat, includeStats);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Download Class List</h2>
              <p className="text-sm text-gray-600 mt-1">
                {className} • {learnerCount} learner{learnerCount !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={isDownloading}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Format Selection */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Select Format</h3>
            <div className="grid grid-cols-1 gap-3">
              {formats.map((format) => {
                const Icon = format.icon;
                const isSelected = selectedFormat === format.id;
                
                return (
                  <button
                    key={format.id}
                    onClick={() => setSelectedFormat(format.id)}
                    className={`
                      flex items-start gap-4 p-4 rounded-xl border-2 transition-all
                      ${isSelected 
                        ? `border-${format.color}-500 bg-${format.color}-50` 
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                      }
                    `}
                  >
                    <div className={`
                      p-2 rounded-lg
                      ${isSelected ? `bg-${format.color}-100` : 'bg-gray-100'}
                    `}>
                      <Icon 
                        size={24} 
                        className={isSelected ? `text-${format.color}-600` : 'text-gray-600'} 
                      />
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`font-medium ${isSelected ? `text-${format.color}-700` : 'text-gray-900'}`}>
                        {format.name}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        {format.description}
                      </p>
                    </div>
                    {isSelected && (
                      <div className={`p-1 rounded-full bg-${format.color}-500`}>
                        <Check size={16} className="text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Options */}
          <div className="border-t border-gray-200 pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeStats}
                onChange={(e) => setIncludeStats(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                Include class statistics (gender breakdown, totals)
              </span>
            </label>
          </div>

          {/* Preview Note */}
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
            <p className="font-medium mb-1">📄 Preview</p>
            <p>
              {selectedFormat === 'simple' && 'Simple list with student IDs, names, and guardians.'}
              {selectedFormat === 'detailed' && 'Comprehensive report with all learner information including address, contacts, and medical notes.'}
              {selectedFormat === 'summary' && 'Compact view with student IDs and names for quick reference.'}
              {includeStats && ' Class statistics will be included at the top.'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium transition-colors"
              disabled={isDownloading}
            >
              Cancel
            </button>
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Generating...
                </>
              ) : (
                <>
                  <Download size={18} />
                  Download PDF
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};