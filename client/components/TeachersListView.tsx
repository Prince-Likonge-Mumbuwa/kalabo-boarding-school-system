import { useState, useMemo } from 'react';
import {
  Search,
  Mail,
  Phone,
  BookOpen,
  X,
  Users,
  Loader2
} from 'lucide-react';
import { Teacher } from '@/types/school';
import { useDebounce } from '@/hooks/useDebounce';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface TeachersListViewProps {
  classId: string;
  className: string;
  teachers: Teacher[];
  isLoading: boolean;
  onClose: () => void;
}

export const TeachersListView = ({
  classId,
  className,
  teachers,
  isLoading,
  onClose
}: TeachersListViewProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const isMobile = useMediaQuery('(max-width: 640px)');

  const filteredTeachers = useMemo(() => {
    return teachers.filter(teacher =>
      !debouncedSearch ||
      teacher.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      teacher.email.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      (teacher.department && teacher.department.toLowerCase().includes(debouncedSearch.toLowerCase()))
    );
  }, [teachers, debouncedSearch]);

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
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      
      <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[80vh] animate-in fade-in zoom-in duration-200">
          
          {/* ===== HEADER - Compact on mobile ===== */}
          <div className="p-4 sm:p-6 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                  {className}
                </h2>
                <p className="text-sm text-gray-600 mt-0.5 sm:mt-1">
                  {teachers.length} teacher{teachers.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2.5 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                title="Close"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder={isMobile ? "Search teachers..." : "Search teachers by name, email, or department..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
              />
            </div>
            
            {/* Info Note - Simplified on mobile */}
            <div className="mt-4 p-3 bg-blue-50/80 text-blue-700 rounded-xl text-xs sm:text-sm border border-blue-100">
              <p className="flex items-start gap-2">
                <span className="mt-0.5">ℹ️</span>
                <span>
                  {isMobile 
                    ? 'Teachers are managed in Teacher Management'
                    : 'Teachers are assigned to classes in the Teacher Management module.'
                  }
                </span>
              </p>
            </div>
          </div>

          {/* ===== TEACHERS GRID - Responsive: 1 column mobile, 2 columns desktop ===== */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {filteredTeachers.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                  <Users className="text-gray-400" size={32} />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchTerm ? 'No teachers found' : 'No teachers assigned'}
                </h3>
                <p className="text-gray-600 text-sm sm:text-base">
                  {searchTerm 
                    ? 'Try a different search term' 
                    : 'No teachers are currently assigned to this class'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {filteredTeachers.map((teacher) => (
                  <div
                    key={teacher.id}
                    className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all hover:border-gray-300"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-purple-50 to-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Users size={20} className="text-purple-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-gray-900 text-base sm:text-lg truncate">
                          {teacher.name}
                        </h3>
                        <p className="text-xs sm:text-sm text-gray-600 truncate">
                          {teacher.department || 'General'}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0">
                        <Mail size={14} className="text-gray-400 flex-shrink-0" />
                        <span className="text-gray-700 truncate">{teacher.email}</span>
                      </div>
                      
                      {teacher.phone && (
                        <div className="flex items-center gap-2 text-xs sm:text-sm">
                          <Phone size={14} className="text-gray-400 flex-shrink-0" />
                          <span className="text-gray-700 truncate">{teacher.phone}</span>
                        </div>
                      )}
                      
                      {teacher.subjects && teacher.subjects.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-gray-100">
                          <div className="flex items-center gap-2 mb-2">
                            <BookOpen size={14} className="text-gray-400" />
                            <span className="text-xs font-medium text-gray-700">Subjects</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {teacher.subjects.slice(0, isMobile ? 3 : 4).map((subject, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-lg"
                              >
                                {subject}
                              </span>
                            ))}
                            {teacher.subjects.length > (isMobile ? 3 : 4) && (
                              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg">
                                +{teacher.subjects.length - (isMobile ? 3 : 4)}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ===== FOOTER - Simple, responsive ===== */}
          <div className="p-4 sm:p-6 border-t border-gray-200 bg-gray-50/50 flex-shrink-0">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs sm:text-sm text-gray-600 truncate">
                {filteredTeachers.length} of {teachers.length} teachers
                {searchTerm && ` matching "${searchTerm}"`}
              </p>
              <button
                onClick={onClose}
                className="px-3 sm:px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm sm:text-base transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};