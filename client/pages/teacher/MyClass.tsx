// @/pages/teacher/MyClass.tsx
import { DashboardLayout } from '@/components/DashboardLayout';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';
import { useAuth } from '@/hooks/useAuth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Users,
  Loader2,
  AlertCircle,
  ChevronDown,
  X,
  Edit,
  Download,
  RefreshCw,
  Grid,
  List,
  BookOpen,
  User,
  Mail,
  Phone,
  MapPin,
  Award,
  UserPlus,
  FileSpreadsheet,
  Printer,
  ArrowLeftRight,
  Archive,
  Calendar,
  GraduationCap,
} from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

// Import modal components
import { IndividualLearnerModal } from '@/components/IndividualLearnerModal';
import { SuccessModal } from '@/components/SuccessModal';
import { EditLearnerModal } from '@/components/EditLearnerModal';
import { PDFDownloadModal } from '@/components/PDFDownloadModal';
import { BulkActionsModal } from '@/components/BulkActionsModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { CSVImportModal } from '@/components/CSVImportModal';

// Types
import type { EnhancedClass } from '@/hooks/useSchoolClasses';
import type { Learner } from '@/types/school';

export default function MyClass() {
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedLearners, setSelectedLearners] = useState<string[]>([]);
  const [selectedLearner, setSelectedLearner] = useState<Learner | null>(null);
  
  // Modal states
  const [showIndividualLearnerModal, setShowIndividualLearnerModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showEditLearnerModal, setShowEditLearnerModal] = useState(false);
  const [showPDFModal, setShowPDFModal] = useState(false);
  const [showBulkActionsModal, setShowBulkActionsModal] = useState(false);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [showCSVImportModal, setShowCSVImportModal] = useState(false);
  
  // Bulk transfer state
  const [bulkTransferData, setBulkTransferData] = useState<{
    learnerIds: string[];
    fromClassId: string;
  } | null>(null);
  
  // Success modal data
  const [successData, setSuccessData] = useState<{
    title: string;
    message: string;
    studentId?: string;
    studentName?: string;
    className?: string;
    actionType: 'add' | 'import' | 'update' | 'edit' | 'delete' | 'bulk' | 'hardDelete' | 'archive';
    importedCount?: number;
    studentIds?: string[];
    deletedCount?: number;
  } | null>(null);
  
  // Confirmation modal config
  const [confirmationConfig, setConfirmationConfig] = useState<{
    title: string;
    message: string;
    type: 'delete' | 'archive' | 'transfer' | 'hardDelete';
    onConfirm: () => Promise<void>;
    confirmText?: string;
    cancelText?: string;
  } | null>(null);

  // Get teacher's ID from auth
  const teacherId = user?.uid || user?.uid;

  // Fetch all classes (will be filtered client-side)
  const {
    classes: allClasses,
    isLoading: classesLoading,
    isFetching: classesFetching,
    isError: classesError,
    error: classesErrorMessage,
    refetch: refetchClasses,
    refreshLearnerStats
  } = useSchoolClasses({ isActive: true });

  // Get teacher assignments to find form teacher classes
  const {
    assignments: teacherAssignments,
    isLoading: assignmentsLoading,
    isFormTeacherForClass
  } = useTeacherAssignments(teacherId);

  // Find the class where this teacher is form teacher
  const myClass = useMemo(() => {
    if (!allClasses || !teacherAssignments) return null;
    
    // First, find which class IDs the teacher is form teacher for
    const formTeacherClassIds = teacherAssignments
      .filter(assignment => assignment.isFormTeacher)
      .map(assignment => assignment.classId);
    
    if (formTeacherClassIds.length === 0) return null;
    
    // Find the class details
    const classData = (allClasses as EnhancedClass[]).find(cls => 
      formTeacherClassIds.includes(cls.id)
    );
    
    return classData || null;
  }, [allClasses, teacherAssignments]);

  // Get learners for this class
  const {
    learners: classLearners,
    isLoading: learnersLoading,
    isAddingLearner,
    isImportingLearners,
    isUpdatingLearner,
    isRemovingLearner,
    addEnhancedLearner,
    bulkImportLearners,
    removeLearner,
    updateLearner,
    transferLearner,
    refetch: refetchLearners
  } = useSchoolLearners(myClass?.id);

  const debouncedSearch = useDebounce(searchTerm, 300);

  // Filter learners based on search
  const filteredLearners = useMemo(() => {
    if (!myClass) return [];
    if (!debouncedSearch) return classLearners;
    
    return classLearners.filter(learner => 
      learner.fullName?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      learner.studentId?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      learner.guardian?.toLowerCase().includes(debouncedSearch.toLowerCase())
    );
  }, [classLearners, debouncedSearch, myClass]);

  // Auto-refresh for real-time sync
  useEffect(() => {
    if (!myClass?.id) return;

    const interval = setInterval(() => {
      refetchLearners();
      refreshLearnerStats(myClass.id);
    }, 30000);

    return () => clearInterval(interval);
  }, [myClass?.id, refetchLearners, refreshLearnerStats]);

  // Refresh when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && myClass?.id) {
        refetchLearners();
        refreshLearnerStats(myClass.id);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [myClass?.id, refetchLearners, refreshLearnerStats]);

  // ===== LEARNER MANAGEMENT FUNCTIONS =====

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
    if (!myClass) throw new Error('No class selected');
    
    try {
      const result = await addEnhancedLearner({
        ...data,
        classId: myClass.id
      });
      
      setSuccessData({
        title: 'Learner Added Successfully!',
        message: `${data.fullName} has been added to ${myClass.name}.`,
        studentId: result.studentId,
        studentName: data.fullName,
        className: myClass.name,
        actionType: 'add'
      });
      setShowSuccessModal(true);
      setShowIndividualLearnerModal(false);
      
      await refreshLearnerStats(myClass.id);
      
      return result;
    } catch (error: any) {
      console.error('Add learner error:', error);
      throw error;
    }
  };

  const handleUpdateLearner = async (learnerId: string, data: any) => {
    if (!myClass) return;
    
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
      await refreshLearnerStats(myClass.id);
    } catch (error: any) {
      console.error('Update learner error:', error);
      alert(`Error: ${error.message || 'Failed to update learner'}`);
    }
  };

  const handleRemoveLearner = async (learnerId: string) => {
    if (!myClass) return;
    
    const learner = classLearners.find(l => l.id === learnerId);
    const learnerName = learner?.fullName || 'this learner';
    
    setConfirmationConfig({
      title: 'Archive Learner',
      message: `Are you sure you want to archive ${learnerName}? They will be removed from ${myClass.name} but their data will be preserved.`,
      type: 'archive',
      confirmText: 'Archive',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          await removeLearner({ learnerId, classId: myClass.id });
          
          setSuccessData({
            title: 'Learner Archived',
            message: `${learnerName} has been archived from ${myClass.name}.`,
            actionType: 'archive',
          });
          setShowSuccessModal(true);
          setShowConfirmationModal(false);
          
          await refetchLearners();
          await refreshLearnerStats(myClass.id);
        } catch (error: any) {
          console.error('Archive learner error:', error);
          alert(`Error: ${error.message || 'Failed to archive learner'}`);
        }
      }
    });
    setShowConfirmationModal(true);
  };

  const handleBulkArchiveLearners = async (learnerIds: string[]) => {
    if (!myClass) return;
    
    setConfirmationConfig({
      title: 'Archive Multiple Learners',
      message: `Are you sure you want to archive ${learnerIds.length} learners from ${myClass.name}?`,
      type: 'archive',
      confirmText: 'Archive',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          let successCount = 0;
          let errorCount = 0;
          
          for (const learnerId of learnerIds) {
            try {
              await removeLearner({ learnerId, classId: myClass.id });
              successCount++;
            } catch (error) {
              console.error(`Failed to archive learner ${learnerId}:`, error);
              errorCount++;
            }
          }
          
          setSuccessData({
            title: 'Learners Archived',
            message: `${successCount} learners archived successfully.${errorCount > 0 ? ` ${errorCount} failed.` : ''}`,
            actionType: 'bulk',
            deletedCount: successCount
          });
          setShowSuccessModal(true);
          setShowConfirmationModal(false);
          
          await refetchLearners();
          await refreshLearnerStats(myClass.id);
        } catch (error: any) {
          console.error('Bulk archive learners error:', error);
          alert(`Error: ${error.message || 'Failed to archive learners'}`);
        }
      }
    });
    setShowConfirmationModal(true);
  };

  const handleBulkTransferLearners = async (learnerIds: string[], targetClassId: string) => {
    if (!myClass) return;
    
    const targetClass = (allClasses as EnhancedClass[]).find(c => c.id === targetClassId);
    
    setConfirmationConfig({
      title: 'Transfer Learners',
      message: `Are you sure you want to transfer ${learnerIds.length} learners from ${myClass.name} to ${targetClass?.name}?`,
      type: 'transfer',
      confirmText: 'Transfer',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          let successCount = 0;
          let errorCount = 0;
          
          for (const learnerId of learnerIds) {
            try {
              await transferLearner({
                learnerId,
                fromClassId: myClass.id,
                toClassId: targetClassId
              });
              successCount++;
            } catch (error) {
              console.error(`Failed to transfer learner ${learnerId}:`, error);
              errorCount++;
            }
          }
          
          setSuccessData({
            title: 'Learners Transferred',
            message: `${successCount} learners transferred to ${targetClass?.name}.${errorCount > 0 ? ` ${errorCount} failed.` : ''}`,
            actionType: 'bulk',
          });
          setShowSuccessModal(true);
          setShowConfirmationModal(false);
          setShowBulkActionsModal(false);
          
          await refetchLearners();
          await refreshLearnerStats(myClass.id);
          await refreshLearnerStats(targetClassId);
        } catch (error: any) {
          console.error('Bulk transfer learners error:', error);
          alert(`Error: ${error.message || 'Failed to transfer learners'}`);
        }
      }
    });
    setShowConfirmationModal(true);
  };

  const handleCSVImport = async (data: any[]) => {
    if (!myClass) return;
    
    try {
      const result = await bulkImportLearners({ 
        classId: myClass.id, 
        learnersData: data 
      });
      
      setSuccessData({
        title: 'Learners Imported Successfully!',
        message: `Successfully imported ${result.success} learners into ${myClass.name}.`,
        actionType: 'import',
        importedCount: result.success,
        className: myClass.name,
        studentIds: result.studentIds || []
      });
      setShowSuccessModal(true);
      setShowCSVImportModal(false);
      
      await refreshLearnerStats(myClass.id);
    } catch (error: any) {
      console.error('Import error:', error);
      alert(`Import failed: ${error.message || 'Failed to import data'}`);
    }
  };

  const handleDownloadPDF = async (format: 'simple' | 'detailed' | 'summary', includeStats: boolean) => {
    if (!myClass) return;
    
    try {
      const { generateClassListPDF } = await import('@/utils/pdfGenerator');
      
      await generateClassListPDF({
        classId: myClass.id,
        className: myClass.name,
        learners: classLearners,
        format,
        includeStats,
        schoolName: 'KALABO BOARDING SECONDARY SCHOOL',
        academicYear: myClass.year.toString()
      });
      
      setShowPDFModal(false);
    } catch (error) {
      console.error('PDF generation error:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  // Selection handlers
  const toggleLearnerSelection = (learnerId: string) => {
    setSelectedLearners(prev => 
      prev.includes(learnerId) 
        ? prev.filter(id => id !== learnerId)
        : [...prev, learnerId]
    );
  };

  const toggleAllLearners = () => {
    if (selectedLearners.length === filteredLearners.length) {
      setSelectedLearners([]);
    } else {
      setSelectedLearners(filteredLearners.map(l => l.id));
    }
  };

  const clearSelection = () => {
    setSelectedLearners([]);
  };

  // Manual refresh
  const handleRefresh = async () => {
    if (myClass?.id) {
      await Promise.all([
        refetchLearners(),
        refreshLearnerStats(myClass.id),
        refetchClasses()
      ]);
    }
  };

  // Loading states
  if (classesLoading || assignmentsLoading) {
    return (
      <DashboardLayout activeTab="my-class">
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
          <div className="animate-pulse">
            <div className="mb-8">
              <div className="h-8 bg-gray-200 rounded w-48 mb-2"></div>
              <div className="h-4 bg-gray-100 rounded w-64"></div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="h-6 bg-gray-200 rounded w-48 mb-4"></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-gray-100 rounded-lg"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Error state
  if (classesError) {
    return (
      <DashboardLayout activeTab="my-class">
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
          <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-red-200 p-8 text-center shadow-lg">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <AlertCircle className="text-red-600" size={32} />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Failed to load your class</h3>
            <p className="text-gray-600 mb-6">
              {classesErrorMessage?.message || 'An error occurred while fetching your class information'}
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

  // No class assigned
  if (!myClass) {
    return (
      <DashboardLayout activeTab="my-class">
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
          <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-lg">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-amber-100 rounded-full mb-6">
              <BookOpen className="text-amber-600" size={48} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">No Class Assigned</h2>
            <p className="text-gray-600 mb-8 text-lg">
              You are not currently assigned as a form teacher to any class.
              Please contact the school administrator if you believe this is an error.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-left">
              <h3 className="font-medium text-amber-800 mb-2 flex items-center gap-2">
                <Award size={18} />
                What to do next:
              </h3>
              <ul className="text-amber-700 space-y-2 text-sm">
                <li>• Contact your school administrator to assign you as a form teacher</li>
                <li>• Check if you have been assigned to a class in the system</li>
                <li>• Verify that your teacher profile is properly set up</li>
              </ul>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <DashboardLayout activeTab="my-class">
        <div className="min-h-screen bg-gray-50/80 p-3 sm:p-6 lg:p-8 transition-all duration-200">
          
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
                  My Class
                </h1>
                <p className="text-sm sm:text-base text-gray-600 mt-1 sm:mt-2 flex items-center gap-2 flex-wrap">
                  Managing {myClass.name}
                  {classesFetching && (
                    <span className="inline-flex items-center gap-1.5 text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full text-xs">
                      <Loader2 size={12} className="animate-spin" />
                      syncing
                    </span>
                  )}
                </p>
              </div>
              
              <button
                onClick={handleRefresh}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium text-sm transition-all"
              >
                <RefreshCw size={16} className={classesFetching ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>

          {/* Class Info Card */}
          <div className="mb-6 bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg overflow-hidden">
            <div className="p-6 text-white">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold mb-2">{myClass.name}</h2>
                  <div className="flex items-center gap-4 text-blue-100 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar size={16} />
                      Year {myClass.year}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={16} />
                      {myClass.students} Learners
                    </span>
                    <span className="flex items-center gap-1">
                      <GraduationCap size={16} />
                      {myClass.type === 'grade' ? 'Grade' : 'Form'} {myClass.level}{myClass.section}
                    </span>
                    {myClass.learnerStats?.classPrefix && (
                      <span className="flex items-center gap-1 text-xs font-mono bg-white/10 px-2 py-1 rounded">
                        ID Prefix: {myClass.learnerStats.classPrefix}
                      </span>
                    )}
                  </div>
                </div>
                
                {myClass.genderStats && (
                  <div className="flex gap-4 bg-white/10 rounded-lg p-3">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{myClass.genderStats.boys}</div>
                      <div className="text-xs text-blue-100">Boys</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{myClass.genderStats.girls}</div>
                      <div className="text-xs text-blue-100">Girls</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="mb-6 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {isMobile && (
              <button
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                className="w-full flex items-center justify-between p-4 bg-white"
              >
                <div className="flex items-center gap-2">
                  <Search size={18} className="text-gray-400" />
                  <span className="font-medium text-gray-700">
                    {searchTerm ? 'Filters active' : 'Search learners'}
                  </span>
                </div>
                <ChevronDown 
                  size={18} 
                  className={`text-gray-500 transition-transform duration-200 ${showMobileFilters ? 'rotate-180' : ''}`} 
                />
              </button>
            )}

            <div className={`
              ${isMobile ? 'px-4 pb-4' : 'p-4'}
              ${isMobile && !showMobileFilters ? 'hidden' : 'block'}
            `}>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search learners by name, ID, or guardian..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg 
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           text-sm sm:text-base transition-shadow"
                />
              </div>
              
              {searchTerm && (
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <span className="text-gray-600">Active filter:</span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg">
                    <span>Search: "{searchTerm}"</span>
                    <button onClick={() => setSearchTerm('')} className="hover:bg-blue-100 rounded p-0.5">
                      <X size={14} />
                    </button>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mb-6 flex flex-wrap gap-3">
            <button
              onClick={() => setShowIndividualLearnerModal(true)}
              disabled={isAddingLearner}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-all disabled:opacity-50"
            >
              {isAddingLearner ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
              Add Learner
            </button>
            
            <button
              onClick={() => setShowCSVImportModal(true)}
              disabled={isImportingLearners}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm transition-all disabled:opacity-50"
            >
              {isImportingLearners ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
              Import CSV
            </button>
            
            <button
              onClick={() => setShowPDFModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm transition-all"
            >
              <Printer size={16} />
              Download PDF
            </button>

            {selectedLearners.length > 0 && (
              <>
                <button
                  onClick={() => handleBulkArchiveLearners(selectedLearners)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium text-sm transition-all"
                >
                  <Archive size={16} />
                  Archive ({selectedLearners.length})
                </button>
                
                <button
                  onClick={() => {
                    setBulkTransferData({ learnerIds: selectedLearners, fromClassId: myClass.id });
                    setShowBulkActionsModal(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm transition-all"
                >
                  <ArrowLeftRight size={16} />
                  Transfer ({selectedLearners.length})
                </button>

                <button
                  onClick={clearSelection}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium text-sm transition-all"
                >
                  <X size={16} />
                  Clear
                </button>
              </>
            )}
          </div>

          {/* Learners List */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <h3 className="font-semibold text-gray-900">
                    Learners ({filteredLearners.length})
                  </h3>
                  
                  {filteredLearners.length > 0 && (
                    <button
                      onClick={toggleAllLearners}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      {selectedLearners.length === filteredLearners.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>
                
                <div className="flex border border-gray-300 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 ${viewMode === 'grid' ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  >
                    <Grid size={16} />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 ${viewMode === 'list' ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  >
                    <List size={16} />
                  </button>
                </div>
              </div>
            </div>

            {learnersLoading ? (
              <div className="p-8 text-center">
                <Loader2 size={32} className="animate-spin text-blue-600 mx-auto mb-3" />
                <p className="text-gray-600">Loading learners...</p>
              </div>
            ) : filteredLearners.length > 0 ? (
              viewMode === 'grid' ? (
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredLearners.map((learner) => (
                    <div
                      key={learner.id}
                      className={`
                        border rounded-lg p-4 transition-all relative
                        ${selectedLearners.includes(learner.id)
                          ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50/30'
                          : 'border-gray-200 hover:shadow-md hover:border-gray-300'
                        }
                      `}
                    >
                      <div className="absolute top-3 right-3">
                        <input
                          type="checkbox"
                          checked={selectedLearners.includes(learner.id)}
                          onChange={() => toggleLearnerSelection(learner.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </div>

                      <div className="mb-2 pr-6">
                        <h4 className="font-medium text-gray-900">{learner.fullName}</h4>
                        <p className="text-xs text-gray-500 font-mono">{learner.studentId}</p>
                      </div>
                      
                      <div className="space-y-1 text-sm text-gray-600 mb-3">
                        {learner.gender && (
                          <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                            learner.gender === 'male' ? 'bg-blue-100 text-blue-800' : 'bg-pink-100 text-pink-800'
                          }`}>
                            {learner.gender}
                          </span>
                        )}
                        {learner.guardian && (
                          <p className="flex items-center gap-1 text-xs">
                            <User size={12} />
                            {learner.guardian}
                          </p>
                        )}
                        {learner.guardianPhone && (
                          <p className="flex items-center gap-1 text-xs">
                            <Phone size={12} />
                            {learner.guardianPhone}
                          </p>
                        )}
                        {learner.address && (
                          <p className="flex items-center gap-1 text-xs">
                            <MapPin size={12} />
                            {learner.address}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
                        <button
                          onClick={() => {
                            setSelectedLearner(learner);
                            setShowEditLearnerModal(true);
                          }}
                          className="flex-1 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center justify-center gap-1"
                        >
                          <Edit size={12} />
                          Edit
                        </button>
                        <button
                          onClick={() => handleRemoveLearner(learner.id)}
                          className="flex-1 py-1.5 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200 flex items-center justify-center gap-1"
                        >
                          <Archive size={12} />
                          Archive
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={selectedLearners.length === filteredLearners.length && filteredLearners.length > 0}
                            onChange={toggleAllLearners}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student ID</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gender</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Guardian</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredLearners.map((learner) => (
                        <tr key={learner.id} className={`hover:bg-gray-50 ${selectedLearners.includes(learner.id) ? 'bg-blue-50/30' : ''}`}>
                          <td className="px-6 py-4">
                            <input
                              type="checkbox"
                              checked={selectedLearners.includes(learner.id)}
                              onChange={() => toggleLearnerSelection(learner.id)}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-6 py-4 font-mono text-sm text-gray-600">{learner.studentId}</td>
                          <td className="px-6 py-4 font-medium text-gray-900">{learner.fullName}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              learner.gender === 'male' ? 'bg-blue-100 text-blue-800' : 'bg-pink-100 text-pink-800'
                            }`}>
                              {learner.gender}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-600">{learner.guardian || '-'}</td>
                          <td className="px-6 py-4 text-gray-600">{learner.guardianPhone || '-'}</td>
                          <td className="px-6 py-4 text-right space-x-2">
                            <button
                              onClick={() => {
                                setSelectedLearner(learner);
                                setShowEditLearnerModal(true);
                              }}
                              className="text-blue-600 hover:text-blue-800 p-1"
                              title="Edit learner"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleRemoveLearner(learner.id)}
                              className="text-amber-600 hover:text-amber-800 p-1"
                              title="Archive learner"
                            >
                              <Archive size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <div className="p-12 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                  <Users className="text-gray-400" size={32} />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No learners found</h3>
                <p className="text-gray-600 mb-6">
                  {searchTerm
                    ? 'Try adjusting your search term'
                    : 'Start by adding learners to your class'}
                </p>
                {!searchTerm && (
                  <button
                    onClick={() => setShowIndividualLearnerModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <UserPlus size={16} />
                    Add First Learner
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Bottom metadata */}
          {myClass && filteredLearners.length > 0 && (
            <div className="mt-4 text-xs sm:text-sm text-gray-500 text-center sm:text-left flex items-center justify-between">
              <span>
                Showing {filteredLearners.length} of {classLearners.length} learners
                {searchTerm && ` matching "${searchTerm}"`}
              </span>
              {selectedLearners.length > 0 && (
                <span className="text-blue-600 font-medium">
                  {selectedLearners.length} selected
                </span>
              )}
            </div>
          )}
        </div>
      </DashboardLayout>

      {/* Modals */}
      {myClass && (
        <>
          <IndividualLearnerModal
            isOpen={showIndividualLearnerModal}
            onClose={() => setShowIndividualLearnerModal(false)}
            onSubmit={handleAddIndividualLearner}
            className={myClass.name}
            classId={myClass.id}
            classPrefix={myClass.learnerStats?.classPrefix}
            nextStudentIndex={myClass.learnerStats?.nextStudentIndex}
            isLoading={isAddingLearner}
          />

          <CSVImportModal
            isOpen={showCSVImportModal}
            onClose={() => setShowCSVImportModal(false)}
            onImport={handleCSVImport}
            type="learners"
            currentClass={myClass.name}
            isLoading={isImportingLearners}
          />

          {selectedLearner && (
            <EditLearnerModal
              isOpen={showEditLearnerModal}
              onClose={() => {
                setShowEditLearnerModal(false);
                setSelectedLearner(null);
              }}
              onSubmit={(data) => handleUpdateLearner(selectedLearner.id, data)}
              learner={selectedLearner}
              className={myClass.name}
              isLoading={isUpdatingLearner}
            />
          )}

          <PDFDownloadModal
            isOpen={showPDFModal}
            onClose={() => setShowPDFModal(false)}
            onDownload={handleDownloadPDF}
            className={myClass.name}
            learnerCount={classLearners.length}
          />

          {showBulkActionsModal && bulkTransferData && (
            <BulkActionsModal
              isOpen={showBulkActionsModal}
              onClose={() => {
                setShowBulkActionsModal(false);
                setBulkTransferData(null);
              }}
              onTransfer={(targetClassId) => 
                handleBulkTransferLearners(bulkTransferData.learnerIds, targetClassId)
              }
              classes={(allClasses as EnhancedClass[]).filter(c => c.id !== myClass.id)}
              currentClass={myClass}
              learnerCount={bulkTransferData.learnerIds.length}
            />
          )}

          <ConfirmationModal
            isOpen={showConfirmationModal}
            onClose={() => setShowConfirmationModal(false)}
            onConfirm={confirmationConfig?.onConfirm || (async () => {})}
            title={confirmationConfig?.title || 'Confirm Action'}
            message={confirmationConfig?.message || 'Are you sure you want to proceed?'}
            type={confirmationConfig?.type || 'delete'}
            confirmText={confirmationConfig?.confirmText}
            cancelText={confirmationConfig?.cancelText}
            isLoading={isRemovingLearner}
          />

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
            deletedCount={successData?.deletedCount}
          />
        </>
      )}
    </>
  );
}