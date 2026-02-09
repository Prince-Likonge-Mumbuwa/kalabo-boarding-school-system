import { DashboardLayout } from '@/components/DashboardLayout';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useSchoolTeachers } from '@/hooks/useSchoolTeachers';
import { useAuth } from '@/hooks/useAuth';
import { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Users,
  GraduationCap,
  Upload,
  Calendar,
  Loader2,
  Eye,
  AlertCircle
} from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { Class } from '@/types/school';

// Import modal components
import { CreateClassModal } from '@/components/CreateClassModal';
import { CSVImportModal } from '@/components/CSVImportModal';
import { IndividualLearnerModal } from '@/components/IndividualLearnerModal';
import { LearnersListView } from '@/components/LearnersListView';
import { TeachersListView } from '@/components/TeachersListView';

export default function ClassManagement() {
  const { user } = useAuth();
  const isUserAdmin = user?.userType === 'admin';
  
  // State for search and filters
  const [searchTerm, setSearchTerm] = useState('');
  const [yearFilter, setYearFilter] = useState<number | null>(null); // Show all years by default

  // State for modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCSVImportModal, setShowCSVImportModal] = useState(false);
  const [showIndividualLearnerModal, setShowIndividualLearnerModal] = useState(false);
  const [showLearnersListModal, setShowLearnersListModal] = useState(false);
  const [showTeachersListModal, setShowTeachersListModal] = useState(false);
  
  // State for selected items
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [csvImportType, setCSVImportType] = useState<'learners' | 'classes'>('classes');

  // Build filters object
  const filters = useMemo(() => {
    const baseFilters: any = {
      isActive: true,
    };
    
    // Only add year filter if it's actually set
    if (yearFilter !== null) {
      baseFilters.year = yearFilter;
    }
    
    return baseFilters;
  }, [yearFilter]);

  // Use the hooks with proper filters
  const {
    classes,
    isLoading: classesLoading,
    isFetching: classesFetching,
    isError: classesError,
    error: classesErrorMessage,
    isCreatingClass,
    isImportingClasses,
    createClass,
    bulkImportClasses,
    refetch: refetchClasses
  } = useSchoolClasses(filters);

  const {
    learners: classLearners,
    isLoading: learnersLoading,
    isAddingLearner,
    isImportingLearners,
    addLearner,
    bulkImportLearners,
    removeLearner,
    refetch: refetchLearners
  } = useSchoolLearners(selectedClass?.id);

  const {
    classTeachers,
    isLoading: teachersLoading,
    refetchClassTeachers
  } = useSchoolTeachers(selectedClass?.id);

  const debouncedSearch = useDebounce(searchTerm, 300);

  // Filter classes client-side for search
  const filteredClasses = useMemo(() => {
    if (!debouncedSearch) return classes;
    
    return classes.filter(cls => 
      cls.name.toLowerCase().includes(debouncedSearch.toLowerCase())
    );
  }, [classes, debouncedSearch]);

  // Handle viewing class learners
  const handleViewClassLearners = (classId: string) => {
    const selected = classes.find(c => c.id === classId) || null;
    setSelectedClass(selected);
    setShowLearnersListModal(true);
  };

  // Handle viewing class teachers
  const handleViewClassTeachers = (classId: string) => {
    const selected = classes.find(c => c.id === classId) || null;
    setSelectedClass(selected);
    setShowTeachersListModal(true);
  };

  // Handle class creation
  const handleCreateClass = async (data: { name: string; year: number }) => {
    try {
      if (!isUserAdmin) {
        alert('Only administrators can create classes.');
        return;
      }

      console.log('Creating class:', data);
      await createClass(data);
      
      // Update year filter to show the newly created class
      setYearFilter(data.year);
      
      alert(`${data.name} has been created successfully!`);
      setShowCreateModal(false);
      
    } catch (error: any) {
      console.error('Error creating class:', error);
      alert(`Error: ${error.message || 'Failed to create class'}`);
    }
  };

  // Handle CSV import
  const handleCSVImport = async (data: any[]) => {
    try {
      if (!isUserAdmin) {
        alert('Only administrators can import data.');
        return;
      }

      if (csvImportType === 'classes') {
        const result = await bulkImportClasses(data);
        alert(`Successfully imported ${result.success} classes. ${result.failed > 0 ? `Failed: ${result.failed}` : ''}`);
        setShowCSVImportModal(false);
        
        // Clear year filter to show all imported classes
        setYearFilter(null);
        
      } else if (csvImportType === 'learners' && selectedClass) {
        const result = await bulkImportLearners({ classId: selectedClass.id, learnersData: data });
        alert(`Successfully imported ${result.success} learners into ${selectedClass.name}. ${result.failed > 0 ? `Failed: ${result.failed}` : ''}`);
        setShowCSVImportModal(false);
      }
    } catch (error: any) {
      console.error('Import error:', error);
      alert(`Import failed: ${error.message || 'Failed to import data'}`);
    }
  };

  // Handle individual learner addition
  const handleAddIndividualLearner = async (data: { name: string; age: number; parentPhone: string }) => {
    if (!selectedClass) return;
    
    try {
      if (!isUserAdmin) {
        alert('Only administrators can add learners.');
        return;
      }

      await addLearner({
        ...data,
        classId: selectedClass.id
      });
      
      alert(`${data.name} has been added to ${selectedClass.name} successfully!`);
      setShowIndividualLearnerModal(false);
      
    } catch (error: any) {
      console.error('Add learner error:', error);
      alert(`Error: ${error.message || 'Failed to add learner'}`);
    }
  };

  // Handle learner removal
  const handleRemoveLearner = async (learnerId: string) => {
    if (!selectedClass) return;
    
    const learner = classLearners.find(l => l.id === learnerId);
    const learnerName = learner?.name || 'this learner';
    
    if (!confirm(`Remove ${learnerName} from ${selectedClass.name}?`)) {
      return;
    }

    try {
      await removeLearner({ learnerId, classId: selectedClass.id });
      alert('Learner removed successfully!');
    } catch (error: any) {
      console.error('Remove learner error:', error);
      alert(`Error: ${error.message || 'Failed to remove learner'}`);
    }
  };

  // Generate years for filter
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  // Debug logging
  console.log('ClassManagement Debug:', {
    filters,
    totalClasses: classes.length,
    filteredClasses: filteredClasses.length,
    selectedClass: selectedClass?.name,
    searchTerm: debouncedSearch,
    yearFilter,
    isLoading: classesLoading,
    isFetching: classesFetching,
  });

  // Error state
  if (classesError) {
    return (
      <DashboardLayout activeTab="classes">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <AlertCircle className="mx-auto mb-4 text-red-500" size={48} />
            <h3 className="text-lg font-semibold text-red-900 mb-2">Failed to load classes</h3>
            <p className="text-red-700 mb-4">
              {classesErrorMessage?.message || 'An error occurred while fetching classes'}
            </p>
            <button
              onClick={() => refetchClasses()}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
            >
              Try Again
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Loading state
  if (classesLoading) {
    return (
      <DashboardLayout activeTab="classes">
        <div className="p-4 sm:p-6 lg:p-8 space-y-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-pulse">
            <div>
              <div className="h-8 bg-gray-200 rounded w-48 mb-2"></div>
              <div className="h-4 bg-gray-100 rounded w-64"></div>
            </div>
            <div className="h-10 bg-gray-200 rounded w-40"></div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 h-10 bg-gray-200 rounded"></div>
              <div className="w-full sm:w-48 h-10 bg-gray-200 rounded"></div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-100 rounded w-1/2 mb-4"></div>
                <div className="h-10 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <DashboardLayout activeTab="classes">
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl lg:text-4xl">
                  Class Management
                </h1>
                <p className="text-gray-600 mt-2 text-sm sm:text-base">
                  {classes.length} classes • {classes.reduce((sum, cls) => sum + cls.students, 0)} total learners
                  {classesFetching && <span className="ml-2 text-blue-600">(updating...)</span>}
                </p>
              </div>
              {isUserAdmin && (
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => {
                      setCSVImportType('classes');
                      setShowCSVImportModal(true);
                    }}
                    disabled={isImportingClasses}
                    className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isImportingClasses ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Upload size={18} />
                    )}
                    Bulk Import
                  </button>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    disabled={isCreatingClass}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreatingClass ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <Plus size={20} />
                    )}
                    Create Class
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Filters and Search */}
          <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Search classes by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div className="flex gap-3">
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
                  <select
                    value={yearFilter ?? ''}
                    onChange={(e) => setYearFilter(e.target.value ? parseInt(e.target.value) : null)}
                    className="pl-10 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white cursor-pointer"
                  >
                    <option value="">All Years</option>
                    {years.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            
            {/* Active filters indicator */}
            {(searchTerm || yearFilter) && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="text-gray-600">Active filters:</span>
                {searchTerm && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md">
                    Search: "{searchTerm}"
                  </span>
                )}
                {yearFilter && (
                  <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-md">
                    Year: {yearFilter}
                  </span>
                )}
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setYearFilter(null);
                  }}
                  className="ml-2 text-blue-600 hover:text-blue-700 font-medium"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          {/* Classes Grid */}
          {filteredClasses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredClasses.map((cls) => (
                <div
                  key={cls.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all duration-200"
                >
                  <div className="mb-3">
                    <h3 className="font-bold text-lg text-gray-900">{cls.name}</h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-sm text-gray-600">Year: {cls.year}</span>
                      {cls.type === 'grade' && (
                        <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                          Grade
                        </span>
                      )}
                      {cls.type === 'form' && (
                        <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded-full">
                          Form
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center gap-2">
                      <Users size={18} className="text-gray-400" />
                      <span className="font-medium text-gray-900">{cls.students} learners</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleViewClassLearners(cls.id)}
                      className="flex-1 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium text-sm flex items-center justify-center gap-2 transition-colors"
                    >
                      <Eye size={16} />
                      <span className="hidden sm:inline">Learners</span>
                    </button>
                    <button
                      onClick={() => handleViewClassTeachers(cls.id)}
                      className="flex-1 py-2 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 font-medium text-sm flex items-center justify-center gap-2 transition-colors"
                    >
                      <GraduationCap size={16} />
                      <span className="hidden sm:inline">Teachers</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Empty State */
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                <Users className="text-gray-400" size={32} />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No classes found</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || yearFilter
                  ? 'Try adjusting your filters or search term'
                  : 'Get started by creating your first class'}
              </p>
              {isUserAdmin && !searchTerm && !yearFilter && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  <Plus size={18} />
                  Create First Class
                </button>
              )}
            </div>
          )}
        </div>
      </DashboardLayout>

      {/* ==================== MODALS ==================== */}

      {/* Create Class Modal */}
      <CreateClassModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateClass}
        isLoading={isCreatingClass}
      />

      {/* CSV Import Modal */}
      <CSVImportModal
        isOpen={showCSVImportModal}
        onClose={() => {
          setShowCSVImportModal(false);
          setSelectedClass(null);
        }}
        onImport={handleCSVImport}
        type={csvImportType}
        currentClass={selectedClass?.name}
        isLoading={csvImportType === 'classes' ? isImportingClasses : isImportingLearners}
      />

      {/* Individual Learner Modal */}
      {selectedClass && (
        <IndividualLearnerModal
          isOpen={showIndividualLearnerModal}
          onClose={() => setShowIndividualLearnerModal(false)}
          onSubmit={handleAddIndividualLearner}
          className={selectedClass.name}
          isLoading={isAddingLearner}
        />
      )}

      {/* Learners List View Modal */}
      {selectedClass && showLearnersListModal && (
        <LearnersListView
          classId={selectedClass.id}
          className={selectedClass.name}
          learners={classLearners}
          isLoading={learnersLoading}
          onAddLearner={() => {
            setShowLearnersListModal(false);
            setShowIndividualLearnerModal(true);
          }}
          onRemoveLearner={handleRemoveLearner}
          onClose={() => setShowLearnersListModal(false)}
        />
      )}

      {/* Teachers List View Modal */}
      {selectedClass && showTeachersListModal && (
        <TeachersListView
          classId={selectedClass.id}
          className={selectedClass.name}
          teachers={classTeachers}
          isLoading={teachersLoading}
          onClose={() => setShowTeachersListModal(false)}
        />
      )}
    </>
  );
}