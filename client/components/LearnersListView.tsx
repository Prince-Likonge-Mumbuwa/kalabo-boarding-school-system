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
  AlertCircle
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
  onRemoveLearner: (learnerId: string) => void;
  onClose: () => void;
}

// ==================== GENDER BADGE COMPONENT ====================
const GenderBadge = ({ gender }: { gender?: 'male' | 'female' }) => {
  if (!gender) {
    return (
      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">
        Not set
      </span>
    );
  }
  
  return gender === 'male' ? (
    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium flex items-center gap-1">
      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
      Male
    </span>
  ) : (
    <span className="px-2 py-0.5 bg-pink-100 text-pink-700 rounded-full text-xs font-medium flex items-center gap-1">
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
    <span className={`px-2 py-0.5 ${color} rounded-full text-xs font-medium`}>
      {age} yrs
    </span>
  );
};

export const LearnersListView = ({
  classId,
  className,
  learners,
  isLoading,
  onAddLearner,
  onRemoveLearner,
  onClose
}: LearnersListViewProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const debouncedSearch = useDebounce(searchTerm, 300);
  const isMobile = useMediaQuery('(max-width: 640px)');

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
      // Search filter
      const matchesSearch = !debouncedSearch ||
        learner.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        learner.studentId.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        learner.parentPhone.includes(debouncedSearch);
      
      // Gender filter
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
      {/* Backdrop with subtle blur */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      
      <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[90vh] animate-in fade-in zoom-in duration-200">
          
          {/* ===== HEADER ===== */}
          <div className="p-4 sm:p-6 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                  {className}
                </h2>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <p className="text-sm text-gray-600">
                    {learners.length} learner{learners.length !== 1 ? 's' : ''}
                  </p>
                  
                  {/* Gender Stats Pills */}
                  {genderStats.boys > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">
                      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                      Boys: {genderStats.boys}
                    </span>
                  )}
                  {genderStats.girls > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-pink-50 text-pink-700 rounded-full text-xs">
                      <span className="w-1.5 h-1.5 bg-pink-500 rounded-full"></span>
                      Girls: {genderStats.girls}
                    </span>
                  )}
                  {genderStats.unspecified > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
                      <AlertCircle size={10} />
                      Unspecified: {genderStats.unspecified}
                    </span>
                  )}
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={onAddLearner}
                  className={`
                    inline-flex items-center justify-center
                    bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                    transition-all active:scale-95
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                    ${isMobile 
                      ? 'p-2.5' 
                      : 'px-4 py-2.5 gap-2'
                    }
                  `}
                  title={isMobile ? 'Add learner' : undefined}
                >
                  {isMobile ? <Plus size={18} /> : <><UserPlus size={18} /> Add Learner</>}
                </button>
                
                <button
                  onClick={onClose}
                  className="p-2.5 hover:bg-gray-100 rounded-lg transition-colors"
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
                  placeholder={isMobile ? "Search name, ID, phone..." : "Search learners by name, ID, or parent phone..."}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
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
                      {genderFilter !== 'all' ? `Gender: ${genderFilter}` : 'Filter by gender'}
                    </span>
                  </div>
                  <ChevronDown 
                    size={16} 
                    className={`text-gray-500 transition-transform ${showMobileFilters ? 'rotate-180' : ''}`} 
                  />
                </button>
              )}

              {/* Gender Filter Pills */}
              <div className={`flex items-center gap-2 ${isMobile && !showMobileFilters ? 'hidden' : 'flex'}`}>
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
                    className="text-xs text-gray-500 hover:text-gray-700 underline ml-2"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ===== LEARNERS LIST - FIVE COLUMNS NOW ===== */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {filteredLearners.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                  <Users className="text-gray-400" size={32} />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchTerm || genderFilter !== 'all' ? 'No learners found' : 'No learners in this class'}
                </h3>
                <p className="text-gray-600 mb-4">
                  {searchTerm || genderFilter !== 'all' 
                    ? 'Try adjusting your filters' 
                    : 'Add learners to get started'}
                </p>
                {(searchTerm || genderFilter !== 'all') && (
                  <button
                    onClick={clearFilters}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 mb-3"
                  >
                    Clear Filters
                  </button>
                )}
                <div>
                  <button
                    onClick={onAddLearner}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <UserPlus size={16} />
                    Add First Learner
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Header - Only visible on desktop */}
                {!isMobile && (
                  <div className="grid grid-cols-[2fr,1fr,1fr,1fr,80px] px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                    <div>Learner</div>
                    <div>Gender</div>
                    <div>Age</div>
                    <div>Parent Contact</div>
                    <div className="text-right">Actions</div>
                  </div>
                )}
                
                {/* Learner Rows - FIVE COLUMNS NOW */}
                {filteredLearners.map((learner) => (
                  <div
                    key={learner.id}
                    className={`
                      grid grid-cols-[2fr,1fr,1fr,1fr,80px] gap-3 sm:gap-4
                      px-3 sm:px-4 py-3 sm:py-3.5
                      bg-white rounded-xl border border-gray-100
                      hover:border-gray-200 hover:bg-gray-50/50
                      transition-all duration-150
                      items-center
                    `}
                  >
                    {/* Column 1: Learner Info */}
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-50 to-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <User size={14} className="sm:w-4 sm:h-4 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 text-sm sm:text-base truncate">
                          {learner.name}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          ID: {learner.studentId}
                        </p>
                      </div>
                    </div>

                    {/* Column 2: Gender */}
                    <div className="min-w-0">
                      <GenderBadge gender={learner.gender} />
                    </div>

                    {/* Column 3: Age */}
                    <div className="min-w-0">
                      <AgeBadge age={learner.age} />
                    </div>

                    {/* Column 4: Parent Contact */}
                    <div className="flex items-center gap-2 min-w-0">
                      <Phone size={14} className="text-gray-400 flex-shrink-0" />
                      <span className="text-sm text-gray-700 truncate">
                        {learner.parentPhone}
                      </span>
                    </div>

                    {/* Column 5: Actions */}
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${learner.name} from this class?`)) {
                            onRemoveLearner(learner.id);
                          }
                        }}
                        className={`
                          p-2 text-red-600 hover:text-red-700 
                          hover:bg-red-50 rounded-lg
                          transition-colors
                          ${isMobile ? 'p-2.5' : ''}
                        `}
                        title="Remove from class"
                      >
                        <Trash2 size={isMobile ? 18 : 16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ===== FOOTER ===== */}
          <div className="p-4 sm:p-6 border-t border-gray-200 bg-gray-50/50 flex-shrink-0">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs sm:text-sm text-gray-600 truncate">
                  Showing {filteredLearners.length} of {learners.length} learners
                  {searchTerm && ` matching "${searchTerm}"`}
                  {genderFilter !== 'all' && ` (${genderFilter})`}
                </p>
                
                {/* Mobile gender stats */}
                {isMobile && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="text-blue-600">♂ {genderStats.boys}</span>
                    <span className="text-pink-600">♀ {genderStats.girls}</span>
                    {genderStats.unspecified > 0 && (
                      <span className="text-gray-500">? {genderStats.unspecified}</span>
                    )}
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={onClose}
                  className="px-3 sm:px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm sm:text-base"
                >
                  Close
                </button>
                <button
                  onClick={onAddLearner}
                  className={`
                    inline-flex items-center justify-center gap-2
                    bg-blue-600 text-white rounded-lg hover:bg-blue-700
                    px-3 sm:px-4 py-2 text-sm sm:text-base
                  `}
                >
                  {isMobile ? <Plus size={16} /> : <UserPlus size={16} />}
                  <span className={isMobile ? 'hidden sm:inline' : ''}>
                    {isMobile ? 'Add' : 'Add Learner'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};