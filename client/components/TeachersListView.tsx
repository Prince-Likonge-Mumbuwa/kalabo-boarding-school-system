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
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="fixed inset-0 bg-black/50" />
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-4xl shadow-2xl max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Teachers in {className}</h2>
                <p className="text-gray-600 mt-1">
                  {teachers.length} teacher{teachers.length !== 1 ? 's' : ''} • Class ID: {classId}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search teachers by name, email, or department..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            {/* Info Note */}
            <div className="mt-4 p-3 bg-blue-50 text-blue-700 rounded-lg text-sm">
              <p>Teachers are assigned to classes in the Teacher Management module.</p>
            </div>
          </div>

          {/* Teachers Grid */}
          <div className="flex-1 overflow-y-auto p-6">
            {filteredTeachers.length === 0 ? (
              <div className="text-center py-12">
                <Users className="mx-auto mb-4 text-gray-300" size={48} />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchTerm ? 'No teachers found' : 'No teachers assigned'}
                </h3>
                <p className="text-gray-600">
                  {searchTerm 
                    ? 'Try a different search term' 
                    : 'No teachers are currently assigned to this class'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredTeachers.map((teacher) => (
                  <div
                    key={teacher.id}
                    className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                          <Users size={20} className="text-purple-600" />
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900">{teacher.name}</h3>
                          <p className="text-sm text-gray-600">{teacher.department || 'General'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Mail size={14} className="text-gray-400" />
                        <span className="text-gray-700 truncate">{teacher.email}</span>
                      </div>
                      
                      {teacher.phone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone size={14} className="text-gray-400" />
                          <span className="text-gray-700">{teacher.phone}</span>
                        </div>
                      )}
                      
                      {teacher.subjects && teacher.subjects.length > 0 && (
                        <div className="mt-3">
                          <div className="flex items-center gap-2 mb-2">
                            <BookOpen size={14} className="text-gray-400" />
                            <span className="text-sm font-medium text-gray-700">Subjects</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {teacher.subjects.slice(0, 4).map((subject, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded"
                              >
                                {subject}
                              </span>
                            ))}
                            {teacher.subjects.length > 4 && (
                              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                                +{teacher.subjects.length - 4} more
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

          {/* Footer */}
          <div className="p-6 border-t border-gray-200 bg-gray-50 flex-shrink-0">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Showing {filteredTeachers.length} of {teachers.length} teachers
                {searchTerm && ` matching "${searchTerm}"`}
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
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