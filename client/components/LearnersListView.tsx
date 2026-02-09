import { useState, useMemo } from 'react';
import {
  Search,
  UserPlus,
  X,
  Users,
  Phone,
  Calendar,
  Loader2,
  Trash2
} from 'lucide-react';
import { Learner } from '@/types/school';
import { useDebounce } from '@/hooks/useDebounce';

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
        <div className="relative bg-white rounded-2xl w-full max-w-6xl shadow-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Learners in {className}</h2>
                <p className="text-gray-600 mt-1">
                  {learners.length} learner{learners.length !== 1 ? 's' : ''} • Class ID: {classId}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={onAddLearner}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <UserPlus size={16} />
                  Add Learner
                </button>
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
                placeholder="Search learners by name, ID, or parent phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Learners Table */}
          <div className="flex-1 overflow-y-auto">
            {filteredLearners.length === 0 ? (
              <div className="text-center py-12">
                <Users className="mx-auto mb-4 text-gray-300" size={48} />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchTerm ? 'No learners found' : 'No learners in this class yet'}
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
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Learner</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Student ID</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Age</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Parent Contact</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Enrollment Date</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredLearners.map((learner) => (
                      <tr key={learner.id} className="hover:bg-gray-50/50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                              <Users size={18} className="text-blue-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{learner.name}</p>
                              <p className="text-xs text-gray-500">ID: {learner.id.slice(0, 8)}...</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <code className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-sm font-mono">
                            {learner.studentId}
                          </code>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                            {learner.age} years
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Phone size={14} className="text-gray-400" />
                            <span className="font-medium">{learner.parentPhone}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Calendar size={14} className="text-gray-400" />
                            <span>{new Date(learner.enrollmentDate).toLocaleDateString()}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => {
                              if (confirm(`Remove ${learner.name} from this class?`)) {
                                onRemoveLearner(learner.id);
                              }
                            }}
                            className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg"
                            title="Remove from class"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-200 bg-gray-50 flex-shrink-0">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Showing {filteredLearners.length} of {learners.length} learners
                {searchTerm && ` matching "${searchTerm}"`}
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  onClick={onAddLearner}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <UserPlus className="inline mr-2" size={16} />
                  Add New Learner
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};