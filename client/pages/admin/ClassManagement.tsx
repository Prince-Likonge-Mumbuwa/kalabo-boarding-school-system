// @/pages/admin/ClassManagement.tsx
import { DashboardLayout } from '@/components/DashboardLayout';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useSchoolTeachers } from '@/hooks/useSchoolTeachers';
import { useAuth } from '@/hooks/useAuth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
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
  AlertCircle,
  ChevronDown,
  X,
} from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { Class } from '@/types/school';

// Import modal components
import { CreateClassModal } from '@/components/CreateClassModal';
import { CSVImportModal } from '@/components/CSVImportModal';
import { IndividualLearnerModal } from '@/components/IndividualLearnerModal';
import { LearnersListView } from '@/components/LearnersListView';
import { TeachersListView } from '@/components/TeachersListView';
import { SuccessModal } from '@/components/SuccessModal';
import { EditLearnerModal } from '@/components/EditLearnerModal';
import { PDFDownloadModal } from '@/components/PDFDownloadModal';

// Type assertion for classes with stats
type ClassWithStats = Class & {
  learnerStats?: {
    classPrefix?: string;
    nextStudentIndex?: number;
    total?: number;
    byGender?: { boys: number; girls: number };
  };
  genderStats?: {
    boys: number;
    girls: number;
    unspecified: number;
    boysPercentage: number;
    girlsPercentage: number;
  };
};

export default function ClassManagement() {
  const { user } = useAuth();
  const isUserAdmin = user?.userType === 'admin';
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');
  
  // State for search and filters
  const [searchTerm, setSearchTerm] = useState('');
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // State for modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCSVImportModal, setShowCSVImportModal] = useState(false);
  const [showIndividualLearnerModal, setShowIndividualLearnerModal] = useState(false);
  const [showLearnersListModal, setShowLearnersListModal] = useState(false);
  const [showTeachersListModal, setShowTeachersListModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showEditLearnerModal, setShowEditLearnerModal] = useState(false);
  const [showPDFModal, setShowPDFModal] = useState(false);
  
  // State for selected items
  const [selectedClass, setSelectedClass] = useState<ClassWithStats | null>(null);
  const [selectedLearner, setSelectedLearner] = useState<any>(null);
  const [csvImportType, setCSVImportType] = useState<'learners' | 'classes'>('classes');
  
  // State for success modal data
  const [successData, setSuccessData] = useState<{
    title: string;
    message: string;
    studentId?: string;
    studentName?: string;
    className?: string;
    actionType: 'add' | 'import' | 'update' | 'edit';
    importedCount?: number;
    studentIds?: string[];
  } | null>(null);

  // Build filters object
  const filters = useMemo(() => {
    const baseFilters: any = {
      isActive: true,
    };
    
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
    refetch: refetchClasses,
    previewNextStudentId
  } = useSchoolClasses(filters);

  // Cast classes to include stats
  const classesWithStats = classes as ClassWithStats[];

  const {
    learners: classLearners,
    isLoading: learnersLoading,
    isAddingLearner,
    isImportingLearners,
    // Temporarily comment out until hook is updated
    // isUpdatingLearner,
    addEnhancedLearner,
    bulkImportLearners,
    removeLearner,
    // updateLearner,
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
    if (!debouncedSearch) return classesWithStats;
    return classesWithStats.filter(cls => 
      cls.name.toLowerCase().includes(debouncedSearch.toLowerCase())
    );
  }, [classesWithStats, debouncedSearch]);

  // Calculate total learners
  const totalLearners = useMemo(() => {
    return classesWithStats.reduce((sum, cls) => sum + cls.students, 0);
  }, [classesWithStats]);

  // Handle viewing class learners
  const handleViewClassLearners = (classId: string) => {
    const selected = classesWithStats.find(c => c.id === classId) || null;
    setSelectedClass(selected);
    setShowLearnersListModal(true);
  };

  // Handle viewing class teachers
  const handleViewClassTeachers = (classId: string) => {
    const selected = classesWithStats.find(c => c.id === classId) || null;
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

      await createClass(data);
      setYearFilter(data.year);
      
      setSuccessData({
        title: 'Class Created Successfully!',
        message: `${data.name} has been created for the year ${data.year}.`,
        actionType: 'add',
        className: data.name
      });
      setShowSuccessModal(true);
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
        setSuccessData({
          title: 'Classes Imported Successfully!',
          message: `Successfully imported ${result.success} classes.`,
          actionType: 'import',
          importedCount: result.success,
          studentIds: []
        });
        setShowSuccessModal(true);
        setShowCSVImportModal(false);
        setYearFilter(null);
        
      } else if (csvImportType === 'learners' && selectedClass) {
        const result = await bulkImportLearners({ 
          classId: selectedClass.id, 
          learnersData: data 
        });
        
        setSuccessData({
          title: 'Learners Imported Successfully!',
          message: `Successfully imported ${result.success} learners into ${selectedClass.name}.`,
          actionType: 'import',
          importedCount: result.success,
          className: selectedClass.name,
          studentIds: result.studentIds || []
        });
        setShowSuccessModal(true);
        setShowCSVImportModal(false);
      }
    } catch (error: any) {
      console.error('Import error:', error);
      alert(`Import failed: ${error.message || 'Failed to import data'}`);
    }
  };

  // Handle individual learner addition - FIXED return type
  const handleAddIndividualLearner = async (data: { 
    fullName: string;
    address: string;
    dateOfFirstEntry: string;
    gender: 'male' | 'female';
    guardian: string;
    sponsor: string;
    guardianPhone: string;
    birthYear: number;
  }): Promise<{ studentId: string }> => {
    if (!selectedClass) throw new Error('No class selected');
    
    try {
      if (!isUserAdmin) {
        throw new Error('Only administrators can add learners.');
      }

      const result = await addEnhancedLearner({
        ...data,
        classId: selectedClass.id
      });
      
      setSuccessData({
        title: 'Learner Added Successfully!',
        message: `${data.fullName} has been added to ${selectedClass.name}.`,
        studentId: result.studentId,
        studentName: data.fullName,
        className: selectedClass.name,
        actionType: 'add'
      });
      setShowSuccessModal(true);
      setShowIndividualLearnerModal(false);
      
      return result;
    } catch (error: any) {
      console.error('Add learner error:', error);
      throw error;
    }
  };

  // Handle learner update - Temporarily disabled
  const handleUpdateLearner = async (learnerId: string, data: any) => {
    alert('Edit functionality is being updated. Please try again later.');
    // Comment out until hook is updated
    /*
    try {
      await updateLearner({ learnerId, updates: data });
      
      setSuccessData({
        title: 'Learner Updated Successfully!',
        message: `${data.fullName || 'Learner'} information has been updated.`,
        actionType: 'edit',
        studentName: data.fullName
      });
      setShowSuccessModal(true);
      setShowEditLearnerModal(false);
      setSelectedLearner(null);
      
      await refetchLearners();
    } catch (error: any) {
      console.error('Update learner error:', error);
      alert(`Error: ${error.message || 'Failed to update learner'}`);
    }
    */
  };

  // Handle learner removal
  const handleRemoveLearner = async (learnerId: string) => {
    if (!selectedClass) return;
    
    const learner = classLearners.find(l => l.id === learnerId);
    const learnerName = learner?.fullName || learner?.name || 'this learner';
    
    if (!confirm(`Remove ${learnerName} from ${selectedClass.name}?`)) {
      return;
    }

    try {
      await removeLearner({ learnerId, classId: selectedClass.id });
      
      setSuccessData({
        title: 'Learner Removed',
        message: `${learnerName} has been removed from ${selectedClass.name}.`,
        actionType: 'update'
      });
      setShowSuccessModal(true);
    } catch (error: any) {
      console.error('Remove learner error:', error);
      alert(`Error: ${error.message || 'Failed to remove learner'}`);
    }
  };

  // Handle edit learner click
  const handleEditLearner = (learner: any) => {
    setSelectedLearner(learner);
    setShowEditLearnerModal(true);
  };

  // Handle PDF download
  const handleDownloadPDF = async (format: 'simple' | 'detailed' | 'summary', includeStats: boolean) => {
    if (!selectedClass) return;
    
    try {
      // Dynamic import of PDF generation
      const { generateClassListPDF } = await import('@/utils/pdfGenerator');
      
      await generateClassListPDF({
        classId: selectedClass.id,
        className: selectedClass.name,
        learners: classLearners,
        format,
        includeStats,
        schoolName: 'Your School Name',
        academicYear: selectedClass.year.toString()
      });
      
      setShowPDFModal(false);
    } catch (error) {
      console.error('PDF generation error:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  // Generate years for filter
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  // Clear all filters
  const clearFilters = () => {
    setSearchTerm('');
    setYearFilter(null);
    setShowMobileFilters(false);
  };

  // Preview next student ID
  const getNextStudentIdPreview = (cls: ClassWithStats) => {
    if (!cls.learnerStats?.classPrefix) return null;
    const nextIndex = cls.learnerStats.nextStudentIndex || 1;
    return `${cls.learnerStats.classPrefix}_${nextIndex.toString().padStart(3, '0')}`;
  };

  // Error state
  if (classesError) {
    return (
      <DashboardLayout activeTab="classes">
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
          <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-red-200 p-8 text-center shadow-lg">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <AlertCircle className="text-red-600" size={32} />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Failed to load classes</h3>
            <p className="text-gray-600 mb-6">
              {classesErrorMessage?.message || 'An error occurred while fetching classes'}
            </p>
            <button
              onClick={() => refetchClasses()}
              className="px-6 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 font-medium transition-colors"
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
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
          {/* Skeleton Header */}
          <div className="mb-8 animate-pulse">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="h-8 sm:h-9 lg:h-10 bg-gray-200 rounded w-48 sm:w-56 lg:w-64 mb-2"></div>
                <div className="h-4 sm:h-5 bg-gray-100 rounded w-64 sm:w-72"></div>
              </div>
              <div className="h-10 sm:h-11 bg-gray-200 rounded w-32 sm:w-36"></div>
            </div>
          </div>

          {/* Skeleton Filter Bar */}
          <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 h-11 bg-gray-200 rounded-lg"></div>
              <div className="w-full sm:w-48 h-11 bg-gray-200 rounded-lg"></div>
            </div>
          </div>

          {/* Skeleton Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: isMobile ? 2 : 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
                <div className="mb-3">
                  <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-gray-100 rounded w-1/2"></div>
                </div>
                <div className="mb-4">
                  <div className="h-5 bg-gray-200 rounded w-2/3"></div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 h-9 bg-gray-200 rounded-lg"></div>
                  <div className="flex-1 h-9 bg-gray-200 rounded-lg"></div>
                </div>
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
        <div className="min-h-screen bg-gray-50/80 p-3 sm:p-6 lg:p-8 transition-all duration-200">
          
          {/* ===== HEADER ===== */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
                  Class Management
                </h1>
                <p className="text-sm sm:text-base text-gray-600 mt-1 sm:mt-2 flex items-center gap-2 flex-wrap">
                  <span>{classesWithStats.length} class{classesWithStats.length !== 1 ? 'es' : ''}</span>
                  <span className="text-gray-300">•</span>
                  <span>{totalLearners} total learner{totalLearners !== 1 ? 's' : ''}</span>
                  {classesFetching && (
                    <span className="inline-flex items-center gap-1.5 text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full text-xs">
                      <Loader2 size={12} className="animate-spin" />
                      updating
                    </span>
                  )}
                </p>
              </div>
              
              {/* Admin Actions - Adaptive */}
              {isUserAdmin && (
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    onClick={() => {
                      setCSVImportType('classes');
                      setShowCSVImportModal(true);
                    }}
                    disabled={isImportingClasses}
                    className={`
                      inline-flex items-center justify-center
                      border border-gray-300 text-gray-700 rounded-xl
                      hover:bg-gray-50 font-medium transition-all
                      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                      disabled:opacity-50 disabled:cursor-not-allowed
                      ${isMobile 
                        ? 'p-2.5' 
                        : 'px-4 py-2.5 gap-2'
                      }
                    `}
                    title={isMobile ? 'Import classes' : undefined}
                  >
                    {isImportingClasses ? (
                      <Loader2 size={isMobile ? 18 : 16} className="animate-spin" />
                    ) : (
                      <Upload size={isMobile ? 18 : 16} />
                    )}
                    {!isMobile && 'Bulk Import'}
                  </button>
                  
                  <button
                    onClick={() => setShowCreateModal(true)}
                    disabled={isCreatingClass}
                    className={`
                      inline-flex items-center justify-center
                      bg-blue-600 text-white rounded-xl hover:bg-blue-700
                      font-medium transition-all active:scale-[0.98]
                      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                      disabled:opacity-50 disabled:cursor-not-allowed
                      ${isMobile 
                        ? 'p-2.5' 
                        : 'px-4 py-2.5 gap-2'
                      }
                    `}
                    title={isMobile ? 'Create class' : undefined}
                  >
                    {isCreatingClass ? (
                      <Loader2 size={isMobile ? 18 : 20} className="animate-spin" />
                    ) : (
                      <Plus size={isMobile ? 18 : 20} />
                    )}
                    {!isMobile && 'Create Class'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ===== FILTERS SECTION ===== */}
          <div className="mb-6 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            
            {/* Mobile Filter Toggle */}
            {isMobile && (
              <button
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                className="w-full flex items-center justify-between p-4 bg-white"
              >
                <div className="flex items-center gap-2">
                  <Search size={18} className="text-gray-400" />
                  <span className="font-medium text-gray-700">
                    {searchTerm || yearFilter ? 'Filters active' : 'Search & filters'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {(searchTerm || yearFilter) && (
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  )}
                  <ChevronDown 
                    size={18} 
                    className={`text-gray-500 transition-transform duration-200 ${showMobileFilters ? 'rotate-180' : ''}`} 
                  />
                </div>
              </button>
            )}

            {/* Filter Content - Always visible on desktop, toggle on mobile */}
            <div className={`
              ${isMobile ? 'px-4 pb-4' : 'p-4'}
              ${isMobile && !showMobileFilters ? 'hidden' : 'block'}
            `}>
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Search Input */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    placeholder={isMobile ? "Search classes..." : "Search classes by name..."}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             text-sm sm:text-base transition-shadow"
                  />
                </div>
                
                {/* Year Filter */}
                <div className="relative sm:w-48">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
                  <select
                    value={yearFilter ?? ''}
                    onChange={(e) => setYearFilter(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full pl-10 pr-8 py-2.5 border border-gray-300 rounded-lg 
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             appearance-none bg-white cursor-pointer text-sm sm:text-base
                             hover:border-gray-400 transition-colors"
                  >
                    <option value="">All Years</option>
                    {years.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    <ChevronDown size={16} className="text-gray-400" />
                  </div>
                </div>
              </div>
              
              {/* Active Filters */}
              {(searchTerm || yearFilter) && (
                <div className="mt-3 flex items-center gap-2 text-sm flex-wrap">
                  <span className="text-gray-600">Active filters:</span>
                  {searchTerm && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs sm:text-sm">
                      <span>Search: "{searchTerm}"</span>
                      <button
                        onClick={() => setSearchTerm('')}
                        className="hover:bg-blue-100 rounded p-0.5"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  )}
                  {yearFilter && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 text-purple-700 rounded-lg text-xs sm:text-sm">
                      <span>Year: {yearFilter}</span>
                      <button
                        onClick={() => setYearFilter(null)}
                        className="hover:bg-purple-100 rounded p-0.5"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  )}
                  <button
                    onClick={clearFilters}
                    className="text-blue-600 hover:text-blue-700 font-medium text-xs sm:text-sm hover:underline ml-1"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ===== CLASSES GRID ===== */}
          {filteredClasses.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
              {filteredClasses.map((cls) => (
                <div
                  key={cls.id}
                  className="group bg-white rounded-xl border border-gray-200 p-5 
                           shadow-sm hover:shadow-lg transition-all duration-300 
                           hover:border-gray-300 hover:-translate-y-0.5"
                >
                  {/* Class Header */}
                  <div className="mb-3">
                    <div className="flex items-start justify-between">
                      <h3 className="font-bold text-lg text-gray-900 truncate flex-1">
                        {cls.name}
                      </h3>
                      <div className="flex items-center gap-1 ml-2">
                        {cls.type === 'grade' && (
                          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full font-medium">
                            Grade
                          </span>
                        )}
                        {cls.type === 'form' && (
                          <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded-full font-medium">
                            Form
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Year {cls.year}
                    </p>
                    {cls.learnerStats?.classPrefix && (
                      <p className="text-xs font-mono text-gray-500 mt-1">
                        ID Prefix: {cls.learnerStats.classPrefix}
                      </p>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="mb-4 p-3 bg-gray-50/80 rounded-lg border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Users size={16} className="text-gray-500" />
                        <span className="text-sm text-gray-700">Learners</span>
                      </div>
                      <span className="font-semibold text-gray-900 text-lg">
                        {cls.students}
                      </span>
                    </div>
                    
                    {/* Gender Stats */}
                    {cls.genderStats && (
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>Boys: {cls.genderStats.boys}</span>
                        <span>Girls: {cls.genderStats.girls}</span>
                      </div>
                    )}
                    
                    {/* Next Student ID Preview */}
                    {cls.learnerStats?.classPrefix && (
                      <div className="mt-2 text-xs font-mono bg-blue-50 text-blue-700 p-1 rounded">
                        Next ID: {getNextStudentIdPreview(cls)}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleViewClassLearners(cls.id)}
                      className="flex-1 py-2.5 bg-blue-50 text-blue-700 
                               rounded-lg hover:bg-blue-100 
                               font-medium text-sm flex items-center justify-center gap-2 
                               transition-all hover:shadow-sm active:scale-[0.98]
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                    >
                      <Eye size={15} />
                      <span className={isMobile && !isTablet ? 'hidden sm:inline' : ''}>
                        Learners
                      </span>
                    </button>
                    <button
                      onClick={() => handleViewClassTeachers(cls.id)}
                      className="flex-1 py-2.5 bg-purple-50 text-purple-700 
                               rounded-lg hover:bg-purple-100 
                               font-medium text-sm flex items-center justify-center gap-2 
                               transition-all hover:shadow-sm active:scale-[0.98]
                               focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1"
                    >
                      <GraduationCap size={15} />
                      <span className={isMobile && !isTablet ? 'hidden sm:inline' : ''}>
                        Teachers
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* ===== EMPTY STATE ===== */
            <div className="text-center py-16 sm:py-20 bg-white rounded-2xl border border-gray-200 shadow-sm">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
                <Users className="text-gray-400" size={36} />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No classes found
              </h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                {searchTerm || yearFilter
                  ? 'Try adjusting your filters or search term to find what you\'re looking for.'
                  : 'Get started by creating your first class to begin organizing learners and teachers.'}
              </p>
              {isUserAdmin && !searchTerm && !yearFilter && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 
                           text-white rounded-xl hover:bg-blue-700 font-medium 
                           transition-all hover:shadow-md active:scale-[0.98]
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <Plus size={18} />
                  Create First Class
                </button>
              )}
              {(searchTerm || yearFilter) && (
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-2 px-6 py-3 border border-gray-300 
                           text-gray-700 rounded-xl hover:bg-gray-50 font-medium 
                           transition-all focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}

          {/* ===== BOTTOM METADATA ===== */}
          {filteredClasses.length > 0 && (
            <div className="mt-6 text-xs sm:text-sm text-gray-500 text-center sm:text-left">
              Showing {filteredClasses.length} of {classesWithStats.length} classes
              {searchTerm && ` matching "${searchTerm}"`}
              {yearFilter && ` in year ${yearFilter}`}
            </div>
          )}
        </div>
      </DashboardLayout>

      {/* ==================== MODALS ==================== */}
      <CreateClassModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateClass}
        isLoading={isCreatingClass}
      />

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

      {selectedClass && (
        <IndividualLearnerModal
          isOpen={showIndividualLearnerModal}
          onClose={() => setShowIndividualLearnerModal(false)}
          onSubmit={handleAddIndividualLearner}
          className={selectedClass.name}
          classId={selectedClass.id}
          classPrefix={selectedClass.learnerStats?.classPrefix}
          nextStudentIndex={selectedClass.learnerStats?.nextStudentIndex}
          isLoading={isAddingLearner}
        />
      )}

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
          // onEditLearner={handleEditLearner} // Temporarily disabled
          onRemoveLearner={handleRemoveLearner}
          onDownloadPDF={() => {
            setShowLearnersListModal(false);
            setShowPDFModal(true);
          }}
          onClose={() => setShowLearnersListModal(false)}
        />
      )}

      {selectedClass && showTeachersListModal && (
        <TeachersListView
          classId={selectedClass.id}
          className={selectedClass.name}
          teachers={classTeachers}
          isLoading={teachersLoading}
          onClose={() => setShowTeachersListModal(false)}
        />
      )}

      {selectedClass && showEditLearnerModal && selectedLearner && (
        <EditLearnerModal
          isOpen={showEditLearnerModal}
          onClose={() => {
            setShowEditLearnerModal(false);
            setSelectedLearner(null);
          }}
          onSubmit={(data) => handleUpdateLearner(selectedLearner.id, data)}
          learner={selectedLearner}
          className={selectedClass.name}
          isLoading={false} // Temporarily set to false
        />
      )}

      {selectedClass && showPDFModal && (
        <PDFDownloadModal
          isOpen={showPDFModal}
          onClose={() => setShowPDFModal(false)}
          onDownload={handleDownloadPDF}
          className={selectedClass.name}
          learnerCount={classLearners.length}
        />
      )}

      <SuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        title={successData?.title || 'Success!'}
        message={successData?.message || 'Operation completed successfully.'}
        studentId={successData?.studentId}
        studentName={successData?.studentName}
        className={successData?.className}
        actionType={successData?.actionType || 'add'}
        importedCount={successData?.importedCount}
        studentIds={successData?.studentIds}
      />
    </>
  );
}