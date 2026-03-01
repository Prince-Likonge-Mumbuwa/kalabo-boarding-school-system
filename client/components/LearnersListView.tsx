import { useState, useMemo } from 'react';
import {
  Search,
  UserPlus,
  X,
  Users,
  Phone,
  Calendar,
  Loader2,
  Trash2,
  Plus,
  Filter,
  ChevronDown,
  User,
  CheckCircle2,
  AlertCircle,
  Hash,
  ChevronRight,
  Download
} from 'lucide-react';
import { Learner } from '@/types/school';
import { useDebounce } from '@/hooks/useDebounce';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface LearnersListViewProps {
  classId: string;
  className: string;
  learners: Learner[];
  isLoading: boolean;
  onAddLearner: () => void;
  onEditLearner?: (learner: Learner) => void;
  onRemoveLearner: (learnerId: string) => Promise<void>;
  onDownloadPDF?: () => void;
  onClose: () => void;
}

// ==================== GENDER BADGE COMPONENT ====================
const GenderBadge = ({ gender }: { gender?: 'male' | 'female' }) => {
  if (!gender) {
    return (
      <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
        Not set
      </span>
    );
  }
  
  return gender === 'male' ? (
    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium inline-flex items-center gap-1">
      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
      Male
    </span>
  ) : (
    <span className="px-2 py-1 bg-pink-100 text-pink-700 rounded-full text-xs font-medium inline-flex items-center gap-1">
      <span className="w-1.5 h-1.5 bg-pink-500 rounded-full"></span>
      Female
    </span>
  );
};

// ==================== AGE BADGE COMPONENT ====================
const AgeBadge = ({ age }: { age: number }) => {
  let color = 'bg-green-100 text-green-700';
  if (age >= 18) color = 'bg-blue-100 text-blue-700';
  if (age >= 20) color = 'bg-purple-100 text-purple-700';
  
  return (
    <span className={`px-2 py-1 ${color} rounded-full text-xs font-medium whitespace-nowrap`}>
      {age} {age === 1 ? 'yr' : 'yrs'}
    </span>
  );
};

export const LearnersListView = ({
  classId,
  className,
  learners,
  isLoading,
  onAddLearner,
  onEditLearner,
  onRemoveLearner,
  onDownloadPDF,
  onClose
}: LearnersListViewProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [expandedLearnerId, setExpandedLearnerId] = useState<string | null>(null);
  const debouncedSearch = useDebounce(searchTerm, 300);
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isTablet = useMediaQuery('(min-width: 641px) and (max-width: 1024px)');

  // Calculate gender statistics
  const genderStats = useMemo(() => {
    const boys = learners.filter(l => l.gender === 'male').length;
    const girls = learners.filter(l => l.gender === 'female').length;
    const unspecified = learners.filter(l => !l.gender).length;
    
    return { boys, girls, unspecified };
  }, [learners]);

  // Filter learners by search term and gender
  const filteredLearners = useMemo(() => {
    return learners.filter(learner => {
      const matchesSearch = !debouncedSearch ||
        (learner.fullName || learner.name || '').toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        learner.studentId.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (learner.guardianPhone || learner.parentPhone || '').includes(debouncedSearch);
      
      const matchesGender = genderFilter === 'all' || learner.gender === genderFilter;
      
      return matchesSearch && matchesGender;
    });
  }, [learners, debouncedSearch, genderFilter]);

  // Clear filters
  const clearFilters = () => {
    setSearchTerm('');
    setGenderFilter('all');
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-blue-600" size={32} />
            <p className="text-sm text-gray-600">Loading learners...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      
      <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[98vh] sm:max-h-[90vh] animate-in fade-in zoom-in duration-200">
          
          {/* ===== HEADER ===== */}
          <div className="p-4 sm:p-6 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg sm:text-2xl font-bold text-gray-900 truncate pr-2">
                  {className}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <p className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">
                    <Users size={14} className="inline mr-1" />
                    {learners.length} {learners.length === 1 ? 'learner' : 'learners'}
                  </p>
                  
                  {/* Gender Stats - Compact on mobile */}
                  <div className="flex flex-wrap items-center gap-1">
                    {genderStats.boys > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                        {genderStats.boys}
                      </span>
                    )}
                    {genderStats.girls > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-pink-50 text-pink-700 rounded-full text-xs">
                        <span className="w-1.5 h-1.5 bg-pink-500 rounded-full"></span>
                        {genderStats.girls}
                      </span>
                    )}
                    {genderStats.unspecified > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
                        <AlertCircle size={10} />
                        {genderStats.unspecified}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                {/* Download PDF Button */}
                {onDownloadPDF && (
                  <button
                    onClick={onDownloadPDF}
                    className="inline-flex items-center justify-center p-2 sm:px-4 sm:py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                    title="Download PDF"
                  >
                    <Download size={18} className="sm:mr-2" />
                    <span className="hidden sm:inline">Download PDF</span>
                  </button>
                )}
                
                <button
                  onClick={onAddLearner}
                  className="inline-flex items-center justify-center p-2 sm:px-4 sm:py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  title="Add learner"
                >
                  <UserPlus size={18} className="sm:mr-2" />
                  <span className="hidden sm:inline">Add Learner</span>
                </button>
                
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Close"
                >
                  <X size={18} className="text-gray-600" />
                </button>
              </div>
            </div>

            {/* Search and Filter Bar */}
            <div className="mt-4 space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder={isMobile ? "Search name or phone..." : "Search by name, ID, or parent phone..."}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>

              {/* Mobile Filter Toggle */}
              {isMobile && (
                <button
                  onClick={() => setShowMobileFilters(!showMobileFilters)}
                  className="w-full flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex items-center gap-2">
                    <Filter size={16} className="text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">
                      {genderFilter !== 'all' ? `Filter: ${genderFilter}` : 'Filter by gender'}
                    </span>
                  </div>
                  <ChevronDown 
                    size={16} 
                    className={`text-gray-500 transition-transform ${showMobileFilters ? 'rotate-180' : ''}`} 
                  />
                </button>
              )}

              {/* Gender Filter Pills */}
              <div className={`flex items-center gap-2 ${isMobile && !showMobileFilters ? 'hidden' : 'flex flex-wrap'}`}>
                <span className="text-xs font-medium text-gray-500">Gender:</span>
                <button
                  onClick={() => setGenderFilter('all')}
                  className={`
                    px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                    ${genderFilter === 'all'
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }
                  `}
                >
                  All
                </button>
                <button
                  onClick={() => setGenderFilter('male')}
                  className={`
                    px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                    ${genderFilter === 'male'
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }
                  `}
                >
                  Male
                </button>
                <button
                  onClick={() => setGenderFilter('female')}
                  className={`
                    px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                    ${genderFilter === 'female'
                      ? 'bg-pink-600 text-white'
                      : 'bg-pink-50 text-pink-700 hover:bg-pink-100'
                    }
                  `}
                >
                  Female
                </button>
                
                {(searchTerm || genderFilter !== 'all') && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-gray-500 hover:text-gray-700 underline ml-auto"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ===== LEARNERS LIST - RESPONSIVE DESIGN ===== */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-6">
            {filteredLearners.length === 0 ? (
              <div className="text-center py-8 sm:py-12">
                <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-full mb-3 sm:mb-4">
                  <Users className="text-gray-400" size={isMobile ? 24 : 32} />
                </div>
                <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">
                  {searchTerm || genderFilter !== 'all' ? 'No learners found' : 'No learners in this class'}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  {searchTerm || genderFilter !== 'all' 
                    ? 'Try adjusting your search or filters' 
                    : 'Add learners to get started'}
                </p>
                <div className="space-x-2">
                  {(searchTerm || genderFilter !== 'all') && (
                    <button
                      onClick={clearFilters}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
                    >
                      Clear Filters
                    </button>
                  )}
                  <button
                    onClick={onAddLearner}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    <UserPlus size={16} />
                    Add Learner
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Mobile View - Card Layout */}
                {isMobile ? (
                  <div className="space-y-2">
                    {filteredLearners.map((learner) => (
                      <div
                        key={learner.id}
                        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                      >
                        {/* Main Card Content - Always Visible */}
                        <div className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className="w-8 h-8 bg-gradient-to-br from-blue-50 to-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <User size={14} className="text-blue-600" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-gray-900 text-sm truncate">
                                  {learner.fullName || learner.name || 'N/A'}
                                </p>
                                <p className="text-xs text-gray-500">
                                  ID: {learner.studentId}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => setExpandedLearnerId(expandedLearnerId === learner.id ? null : learner.id)}
                              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <ChevronRight 
                                size={16} 
                                className={`text-gray-500 transition-transform ${expandedLearnerId === learner.id ? 'rotate-90' : ''}`} 
                              />
                            </button>
                          </div>

                          {/* Quick Info Row */}
                          <div className="flex items-center gap-2 ml-10">
                            <GenderBadge gender={learner.gender} />
                            <AgeBadge age={learner.age} />
                          </div>
                        </div>

                        {/* Expanded Details */}
                        {expandedLearnerId === learner.id && (
                          <div className="px-3 pb-3 pt-1 ml-10 border-t border-gray-100">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Phone size={14} className="text-gray-400" />
                                <span className="text-sm text-gray-700">
                                  {learner.guardianPhone || learner.parentPhone || 'N/A'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Hash size={14} className="text-gray-400" />
                                <span className="text-sm text-gray-700">
                                  Student ID: {learner.studentId}
                                </span>
                              </div>
                              <button
                                onClick={() => {
                                  if (confirm(`Remove ${learner.fullName || learner.name} from this class?`)) {
                                    onRemoveLearner(learner.id);
                                  }
                                }}
                                className="w-full mt-2 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium"
                              >
                                Remove from class
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Tablet/Desktop View - Grid Layout */
                  <div className="space-y-2">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-3 px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                      <div className="col-span-4">Learner</div>
                      <div className="col-span-2">Gender</div>
                      <div className="col-span-2">Age</div>
                      <div className="col-span-3">Parent Contact</div>
                      <div className="col-span-1 text-right">Actions</div>
                    </div>
                    
                    {/* Rows */}
                    {filteredLearners.map((learner) => (
                      <div
                        key={learner.id}
                        className="grid grid-cols-12 gap-3 px-4 py-3 bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50/50 transition-all duration-150 items-center"
                      >
                        {/* Learner Info */}
                        <div className="col-span-4 flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 bg-gradient-to-br from-blue-50 to-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <User size={14} className="text-blue-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 text-sm truncate">
                              {learner.fullName || learner.name || 'N/A'}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              ID: {learner.studentId}
                            </p>
                          </div>
                        </div>

                        {/* Gender */}
                        <div className="col-span-2">
                          <GenderBadge gender={learner.gender} />
                        </div>

                        {/* Age */}
                        <div className="col-span-2">
                          <AgeBadge age={learner.age} />
                        </div>

                        {/* Parent Contact */}
                        <div className="col-span-3 flex items-center gap-2 min-w-0">
                          <Phone size={14} className="text-gray-400 flex-shrink-0" />
                          <span className="text-sm text-gray-700 truncate">
                            {learner.guardianPhone || learner.parentPhone || 'N/A'}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="col-span-1 flex items-center justify-end gap-1">
                          {onEditLearner && (
                            <button
                              onClick={() => onEditLearner(learner)}
                              className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit learner"
                            >
                              <UserPlus size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (confirm(`Remove ${learner.fullName || learner.name} from this class?`)) {
                                onRemoveLearner(learner.id);
                              }
                            }}
                            className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove from class"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ===== FOOTER ===== */}
          <div className="p-3 sm:p-6 border-t border-gray-200 bg-gray-50/50 flex-shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-xs sm:text-sm text-gray-600">
                Showing {filteredLearners.length} of {learners.length} learners
                {(searchTerm || genderFilter !== 'all') && (
                  <span className="text-gray-500">
                    {' '}(filtered)
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 sm:flex-none px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
                >
                  Close
                </button>
                <button
                  onClick={onAddLearner}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  <UserPlus size={16} />
                  <span>Add Learner</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};