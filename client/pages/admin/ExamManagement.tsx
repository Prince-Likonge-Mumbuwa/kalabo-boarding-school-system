// @/pages/admin/ExamManagement.tsx
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Plus,
  Save,
  X,
  Edit,
  Trash2,
  Check,
  AlertCircle,
  Loader2,
  Copy,
  Clock,
  BookOpen,
  Ban,
  CheckCircle,
  XCircle,
  ChevronDown,
  Filter
} from 'lucide-react';
import { useExamConfig } from '@/hooks/useExamConfig';

// Exam types
const EXAM_TYPES = [
  { id: 'week4', label: 'Week 4 Test', shortLabel: 'W4' },
  { id: 'week8', label: 'Week 8 Test', shortLabel: 'W8' },
  { id: 'endOfTerm', label: 'End of Term Exam', shortLabel: 'EOT' }
] as const;

type ExamType = 'week4' | 'week8' | 'endOfTerm';

interface ExamConfig {
  id: string;
  term: string;
  year: number;
  examTypes: {
    week4: boolean;
    week8: boolean;
    endOfTerm: boolean;
  };
  week4Date?: string;
  week8Date?: string;
  endOfTermDate?: string;
  week4TotalMarks?: number;
  week8TotalMarks?: number;
  endOfTermTotalMarks?: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface TermConfig {
  term: string;
  year: number;
  configs: ExamConfig[];
}

export default function ExamManagement() {
  const { user } = useAuth();
  const isUserAdmin = user?.userType === 'admin';
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  // State
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedTerm, setSelectedTerm] = useState<string>('Term 1');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ExamConfig | null>(null);
  const [copyFromYear, setCopyFromYear] = useState<number | ''>('');
  const [copyFromTerm, setCopyFromTerm] = useState<string>('');
  const [showCopyModal, setShowCopyModal] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    term: 'Term 1',
    year: new Date().getFullYear(),
    week4: true,
    week8: true,
    endOfTerm: true,
    week4Date: '',
    week8Date: '',
    endOfTermDate: '',
    week4TotalMarks: 100,
    week8TotalMarks: 100,
    endOfTermTotalMarks: 100
  });

  // Mock hook - replace with actual implementation
  const {
    configs,
    isLoading,
    isError,
    error,
    createConfig,
    updateConfig,
    deleteConfig,
    copyConfigs,
    refetch
  } = useExamConfig({ year: selectedYear });

  // Filter configs for selected term
  const currentConfig = useMemo(() => {
    if (!configs) return null;
    return configs.find((c: ExamConfig) => c.term === selectedTerm) || null;
  }, [configs, selectedTerm]);

  // Group configs by term for display
  const groupedConfigs = useMemo(() => {
    if (!configs) return [];
    
    const terms = ['Term 1', 'Term 2', 'Term 3'];
    return terms.map(term => {
      const termConfigs = configs.filter((c: ExamConfig) => c.term === term);
      return {
        term,
        year: selectedYear,
        configs: termConfigs.sort((a: ExamConfig, b: ExamConfig) => 
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        )
      };
    });
  }, [configs, selectedYear]);

  // Years for filter
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  }, []);

  // Handle form change
  const handleFormChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Handle exam type toggle
  const handleExamTypeToggle = (examType: ExamType) => {
    setFormData(prev => ({ ...prev, [examType]: !prev[examType] }));
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      term: selectedTerm,
      year: selectedYear,
      week4: true,
      week8: true,
      endOfTerm: true,
      week4Date: '',
      week8Date: '',
      endOfTermDate: '',
      week4TotalMarks: 100,
      week8TotalMarks: 100,
      endOfTermTotalMarks: 100
    });
    setEditingConfig(null);
  };

  // Load config into form for editing
  const handleEditConfig = (config: ExamConfig) => {
    setEditingConfig(config);
    setFormData({
      term: config.term,
      year: config.year,
      week4: config.examTypes.week4,
      week8: config.examTypes.week8,
      endOfTerm: config.examTypes.endOfTerm,
      week4Date: config.week4Date || '',
      week8Date: config.week8Date || '',
      endOfTermDate: config.endOfTermDate || '',
      week4TotalMarks: config.week4TotalMarks || 100,
      week8TotalMarks: config.week8TotalMarks || 100,
      endOfTermTotalMarks: config.endOfTermTotalMarks || 100
    });
    setShowConfigModal(true);
  };

  // Handle save config
  const handleSaveConfig = async () => {
    if (!isUserAdmin) {
      alert('Only administrators can manage exam configurations');
      return;
    }

    try {
      const configData = {
        term: formData.term,
        year: formData.year,
        examTypes: {
          week4: formData.week4,
          week8: formData.week8,
          endOfTerm: formData.endOfTerm
        },
        week4Date: formData.week4Date || undefined,
        week8Date: formData.week8Date || undefined,
        endOfTermDate: formData.endOfTermDate || undefined,
        week4TotalMarks: formData.week4 ? formData.week4TotalMarks : undefined,
        week8TotalMarks: formData.week8 ? formData.week8TotalMarks : undefined,
        endOfTermTotalMarks: formData.endOfTerm ? formData.endOfTermTotalMarks : undefined,
        isActive: true
      };

      if (editingConfig) {
        await updateConfig({ configId: editingConfig.id, updates: configData });
        alert('Exam configuration updated successfully!');
      } else {
        await createConfig(configData);
        alert('Exam configuration created successfully!');
      }

      setShowConfigModal(false);
      resetForm();
      refetch();
    } catch (error: any) {
      console.error('Error saving config:', error);
      alert(`Error: ${error.message || 'Failed to save configuration'}`);
    }
  };

  // Handle delete config
  const handleDeleteConfig = async (configId: string) => {
    if (!isUserAdmin) {
      alert('Only administrators can delete exam configurations');
      return;
    }

    if (!confirm('Are you sure you want to delete this configuration? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteConfig(configId);
      alert('Configuration deleted successfully!');
      refetch();
    } catch (error: any) {
      console.error('Error deleting config:', error);
      alert(`Error: ${error.message || 'Failed to delete configuration'}`);
    }
  };

  // Handle copy from previous year/term
  const handleCopyConfigs = async () => {
    if (!copyFromYear || !copyFromTerm) {
      alert('Please select both year and term to copy from');
      return;
    }

    try {
      await copyConfigs({
        fromYear: copyFromYear as number,
        fromTerm: copyFromTerm,
        toYear: selectedYear,
        toTerm: selectedTerm
      });
      
      alert(`Configuration copied from ${copyFromTerm} ${copyFromYear} to ${selectedTerm} ${selectedYear} successfully!`);
      setShowCopyModal(false);
      setCopyFromYear('');
      setCopyFromTerm('');
      refetch();
    } catch (error: any) {
      console.error('Error copying configs:', error);
      alert(`Error: ${error.message || 'Failed to copy configuration'}`);
    }
  };

  // Get status badge
  const getStatusBadge = (config: ExamConfig) => {
    const activeCount = Object.values(config.examTypes).filter(Boolean).length;
    
    if (activeCount === 0) {
      return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">No Exams</span>;
    }
    if (activeCount === 3) {
      return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Full Term</span>;
    }
    return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">Partial</span>;
  };

  // Get exam type icon
  const getExamTypeIcon = (type: ExamType, config: ExamConfig) => {
    const isActive = config.examTypes[type];
    if (!isActive) {
      return <Ban size={14} className="text-gray-400" />;
    }
    return <CheckCircle size={14} className="text-green-600" />;
  };

  if (!isUserAdmin) {
    return (
      <DashboardLayout activeTab="exams">
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
          <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-red-200 p-8 text-center shadow-lg">
            <AlertCircle className="text-red-600 mx-auto mb-4" size={48} />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h3>
            <p className="text-gray-600 mb-6">Only administrators can access exam management.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="exams">
      <div className="min-h-screen bg-gray-50/80 p-3 sm:p-6 lg:p-8 transition-all duration-200">
        
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
                Exam Management
              </h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1 sm:mt-2">
                Configure which tests are conducted each term. This controls the number of windows in Results Entry.
              </p>
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => setShowCopyModal(true)}
                className={`
                  inline-flex items-center justify-center
                  border border-gray-300 text-gray-700 rounded-xl
                  hover:bg-gray-50 font-medium transition-all
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                  ${isMobile ? 'p-2.5' : 'px-4 py-2.5 gap-2'}
                `}
                title={isMobile ? 'Copy config' : undefined}
              >
                <Copy size={isMobile ? 18 : 16} />
                {!isMobile && 'Copy from Previous'}
              </button>
              
              <button
                onClick={() => {
                  resetForm();
                  setShowConfigModal(true);
                }}
                className={`
                  inline-flex items-center justify-center
                  bg-blue-600 text-white rounded-xl hover:bg-blue-700
                  font-medium transition-all active:scale-[0.98]
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                  ${isMobile ? 'p-2.5' : 'px-4 py-2.5 gap-2'}
                `}
                title={isMobile ? 'New config' : undefined}
              >
                <Plus size={isMobile ? 18 : 20} />
                {!isMobile && 'New Configuration'}
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Year Filter */}
            <div className="relative sm:w-48">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="w-full pl-10 pr-8 py-2.5 border border-gray-300 rounded-lg 
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         appearance-none bg-white cursor-pointer text-sm
                         hover:border-gray-400 transition-colors"
              >
                {years.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                <ChevronDown size={16} className="text-gray-400" />
              </div>
            </div>

            {/* Term Filter */}
            <div className="relative sm:w-48">
              <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
              <select
                value={selectedTerm}
                onChange={(e) => setSelectedTerm(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 border border-gray-300 rounded-lg 
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         appearance-none bg-white cursor-pointer text-sm
                         hover:border-gray-400 transition-colors"
              >
                <option value="Term 1">Term 1</option>
                <option value="Term 2">Term 2</option>
                <option value="Term 3">Term 3</option>
              </select>
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                <ChevronDown size={16} className="text-gray-400" />
              </div>
            </div>

            {/* Current Config Summary */}
            {currentConfig && (
              <div className="flex-1 flex items-center gap-3 px-4 py-2 bg-blue-50 rounded-lg">
                <BookOpen size={16} className="text-blue-600" />
                <span className="text-sm text-blue-800">
                  Current configuration: {Object.values(currentConfig.examTypes).filter(Boolean).length} of 3 exams
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Configurations Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : isError ? (
          <div className="bg-white rounded-xl border border-red-200 p-8 text-center">
            <AlertCircle className="text-red-600 mx-auto mb-4" size={48} />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to load configurations</h3>
            <p className="text-gray-600 mb-4">{error?.message || 'An error occurred'}</p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Try Again
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedConfigs.map(({ term, year, configs }) => (
              <div key={term} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Term Header */}
                <div className="px-4 sm:px-6 py-4 bg-gray-50 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">{term} {year}</h2>
                </div>

                {/* Config Cards */}
                {configs.length > 0 ? (
                  <div className="divide-y divide-gray-200">
                    {configs.map((config: ExamConfig, index: number) => (
                      <div key={config.id} className="p-4 sm:p-6 hover:bg-gray-50 transition-colors">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                          {/* Left side - Config info */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium text-gray-500">
                                Version {configs.length - index}
                              </span>
                              {getStatusBadge(config)}
                              {index === 0 && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                                  Current
                                </span>
                              )}
                            </div>

                            {/* Exam Types */}
                            <div className="flex flex-wrap gap-3">
                              {EXAM_TYPES.map(type => (
                                <div
                                  key={type.id}
                                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${
                                    config.examTypes[type.id] 
                                      ? 'bg-green-50 text-green-700' 
                                      : 'bg-gray-50 text-gray-400'
                                  }`}
                                >
                                  {getExamTypeIcon(type.id as ExamType, config)}
                                  <span className="text-xs font-medium">{type.shortLabel}</span>
                                  {config.examTypes[type.id] && config[`${type.id}TotalMarks`] && (
                                    <span className="text-xs text-gray-500 ml-1">
                                      ({config[`${type.id}TotalMarks`]} marks)
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>

                            {/* Dates */}
                            <div className="flex flex-wrap gap-3 text-xs text-gray-600">
                              {config.week4Date && config.examTypes.week4 && (
                                <span>Week 4: {new Date(config.week4Date).toLocaleDateString()}</span>
                              )}
                              {config.week8Date && config.examTypes.week8 && (
                                <span>Week 8: {new Date(config.week8Date).toLocaleDateString()}</span>
                              )}
                              {config.endOfTermDate && config.examTypes.endOfTerm && (
                                <span>EOT: {new Date(config.endOfTermDate).toLocaleDateString()}</span>
                              )}
                            </div>

                            {/* Timestamps */}
                            <div className="text-xs text-gray-400">
                              Created: {config.createdAt ? new Date(config.createdAt).toLocaleDateString() : 'N/A'}
                              {config.updatedAt && ` • Updated: ${new Date(config.updatedAt).toLocaleDateString()}`}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 sm:self-center">
                            <button
                              onClick={() => handleEditConfig(config)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit configuration"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteConfig(config.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete configuration"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <p className="text-gray-500 mb-2">No configurations for {term} {year}</p>
                    <button
                      onClick={() => {
                        setFormData(prev => ({ ...prev, term, year: selectedYear }));
                        setShowConfigModal(true);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg text-sm font-medium"
                    >
                      <Plus size={16} />
                      Add Configuration
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => {
            setShowConfigModal(false);
            resetForm();
          }} />
          
          <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
            <div className="relative bg-white rounded-2xl w-full max-w-2xl shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
              
              {/* Header */}
              <div className="p-5 sm:p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-bold text-gray-900">
                      {editingConfig ? 'Edit Exam Configuration' : 'New Exam Configuration'}
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      Configure which tests are conducted for this term
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowConfigModal(false);
                      resetForm();
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                  >
                    <X size={18} className="text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-5 sm:p-6 space-y-6">
                
                {/* Term & Year */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Term
                    </label>
                    <select
                      value={formData.term}
                      onChange={(e) => handleFormChange('term', e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    >
                      <option value="Term 1">Term 1</option>
                      <option value="Term 2">Term 2</option>
                      <option value="Term 3">Term 3</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Year
                    </label>
                    <select
                      value={formData.year}
                      onChange={(e) => handleFormChange('year', parseInt(e.target.value))}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    >
                      {years.map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Exam Types */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Tests to Conduct
                  </label>
                  <div className="space-y-4">
                    {EXAM_TYPES.map((type, index) => (
                      <div key={type.id} className="p-4 border border-gray-200 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              id={type.id}
                              checked={formData[type.id as ExamType]}
                              onChange={() => handleExamTypeToggle(type.id as ExamType)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <label htmlFor={type.id} className="text-sm font-medium text-gray-700">
                              {type.label}
                            </label>
                          </div>
                          {formData[type.id as ExamType] && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                              Will be conducted
                            </span>
                          )}
                        </div>

                        {formData[type.id as ExamType] && (
                          <div className="mt-4 pl-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Date */}
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">
                                Date (Optional)
                              </label>
                              <input
                                type="date"
                                value={formData[`${type.id}Date` as keyof typeof formData] as string}
                                onChange={(e) => handleFormChange(`${type.id}Date`, e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                              />
                            </div>

                            {/* Total Marks */}
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">
                                Total Marks
                              </label>
                              <input
                                type="number"
                                value={formData[`${type.id}TotalMarks` as keyof typeof formData] as number}
                                onChange={(e) => handleFormChange(`${type.id}TotalMarks`, parseInt(e.target.value) || 100)}
                                min="1"
                                max="500"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-blue-50 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-blue-800 mb-2">Summary</h3>
                  <p className="text-sm text-blue-700">
                    {Object.values({
                      week4: formData.week4,
                      week8: formData.week8,
                      endOfTerm: formData.endOfTerm
                    }).filter(Boolean).length} of 3 tests will be conducted.
                    {!formData.week4 && !formData.week8 && !formData.endOfTerm && (
                      <span className="block mt-1 text-amber-600">
                        Warning: No tests selected. Teachers will see no exam windows.
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="p-5 sm:p-6 border-t border-gray-200 bg-gray-50">
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowConfigModal(false);
                      resetForm();
                    }}
                    className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveConfig}
                    className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors text-sm flex items-center gap-2"
                  >
                    <Save size={16} />
                    {editingConfig ? 'Update Configuration' : 'Save Configuration'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Copy Modal */}
      {showCopyModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowCopyModal(false)} />
          
          <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
            <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Copy Configuration</h2>
              
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Copy exam configuration from another term/year to {selectedTerm} {selectedYear}
                </p>

                {/* From Year */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    From Year
                  </label>
                  <select
                    value={copyFromYear}
                    onChange={(e) => setCopyFromYear(e.target.value ? parseInt(e.target.value) : '' as '')}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    <option value="">Select year...</option>
                    {years.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>

                {/* From Term */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    From Term
                  </label>
                  <select
                    value={copyFromTerm}
                    onChange={(e) => setCopyFromTerm(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    <option value="">Select term...</option>
                    <option value="Term 1">Term 1</option>
                    <option value="Term 2">Term 2</option>
                    <option value="Term 3">Term 3</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowCopyModal(false)}
                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCopyConfigs}
                    disabled={!copyFromYear || !copyFromTerm}
                    className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    <Copy size={16} />
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}