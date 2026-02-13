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
  Plus
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
  const debouncedSearch = useDebounce(searchTerm, 300);
  const isMobile = useMediaQuery('(max-width: 640px)');

  const filteredLearners = useMemo(() => {
    return learners.filter(learner =>
      !debouncedSearch ||
      learner.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      learner.studentId.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      learner.parentPhone.includes(debouncedSearch)
    );
  }, [learners, debouncedSearch]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 shadow-2xl">
            <Loader2 className="animate-spin text-blue-600" size={32} />
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
          
          {/* ===== HEADER - Compact on mobile ===== */}
          <div className="p-4 sm:p-6 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                  {className}
                </h2>
                <p className="text-sm text-gray-600 mt-0.5 sm:mt-1">
                  {learners.length} learner{learners.length !== 1 ? 's' : ''}
                </p>
              </div>
              
              {/* Action Buttons - Adaptive: icons only on mobile, full on desktop */}
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

            {/* Search Bar - Always full width */}
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder={isMobile ? "Search name, ID, phone..." : "Search learners by name, ID, or parent phone..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
              />
            </div>
          </div>

          {/* ===== LEARNERS LIST - THREE COLUMNS ONLY, PURELY HORIZONTAL ===== */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {filteredLearners.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                  <Users className="text-gray-400" size={32} />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchTerm ? 'No learners found' : 'No learners in this class'}
                </h3>
                <p className="text-gray-600 mb-4">
                  {searchTerm ? 'Try a different search term' : 'Add learners to get started'}
                </p>
                <button
                  onClick={onAddLearner}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <UserPlus size={16} />
                  Add First Learner
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Header - Only visible on desktop */}
                {!isMobile && (
                  <div className="grid grid-cols-[1fr,1fr,80px] px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                    <div>Learner</div>
                    <div>Parent Contact</div>
                    <div className="text-right">Actions</div>
                  </div>
                )}
                
                {/* Learner Rows - Pure horizontal, never vertical */}
                {filteredLearners.map((learner) => (
                  <div
                    key={learner.id}
                    className={`
                      grid grid-cols-[1fr,1fr,80px] gap-3 sm:gap-4
                      px-3 sm:px-4 py-3 sm:py-3.5
                      bg-white rounded-xl border border-gray-100
                      hover:border-gray-200 hover:bg-gray-50/50
                      transition-all duration-150
                      items-center
                    `}
                  >
                    {/* Column 1: Learner - Pure horizontal, no wrapping */}
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-50 to-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Users size={14} className="sm:w-4 sm:h-4 text-blue-600" />
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

                    {/* Column 2: Parent Contact - Pure horizontal */}
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <Phone size={14} className="text-gray-400 flex-shrink-0 sm:w-4 sm:h-4" />
                      <span className="text-sm sm:text-base text-gray-700 truncate">
                        {learner.parentPhone}
                      </span>
                    </div>

                    {/* Column 3: Actions - Right aligned */}
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

          {/* ===== FOOTER - Compact on mobile ===== */}
          <div className="p-4 sm:p-6 border-t border-gray-200 bg-gray-50/50 flex-shrink-0">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs sm:text-sm text-gray-600 truncate">
                {filteredLearners.length} of {learners.length} learners
                {searchTerm && ` matching "${searchTerm}"`}
              </p>
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