// @/components/IndividualLearnerModal.tsx
import { useState, useEffect, useRef } from 'react';
import {
  X,
  User,
  Phone,
  Hash,
  Loader2,
  AlertCircle,
  Users,
  MapPin,
  Calendar,
  HandHeart,
  Copy,
  Check,
  Upload,
  Download,
  ChevronDown,
  ChevronUp,
  HelpCircle,
} from 'lucide-react';

interface IndividualLearnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    fullName: string;
    address: string;
    dateOfFirstEntry: string;
    gender: 'male' | 'female';
    guardian: string;
    sponsor: string;
    guardianPhone: string;
    dateOfBirth?: string;   // ✅ Preferred (ISO "YYYY-MM-DD")
    birthYear?: number;     // ⚠️ Legacy fallback
    preferredName?: string;
    alternativeGuardian?: string;
    alternativeGuardianPhone?: string;
    previousSchool?: string;
    medicalNotes?: string;
    allergies?: string[];
  }) => Promise<{ studentId: string }>;
  onSubmitBulk?: (students: any[]) => Promise<{ success: boolean; count: number }>;
  className: string;
  classId: string;
  classPrefix?: string;
  nextStudentIndex?: number;
  isLoading?: boolean;
}

// Field mapping interface
interface FieldMapping {
  csvField: string;
  systemField: string;
  required: boolean;
  sample: string;
}

// Available system fields for mapping
const SYSTEM_FIELDS = [
  { value: 'fullName',         label: 'Full Name *',            required: true  },
  { value: 'gender',           label: 'Gender *',               required: true  },
  { value: 'dateOfBirth',      label: 'Date of Birth *',        required: true  }, // ✅ NEW
  { value: 'address',          label: 'Address',                required: false },
  { value: 'dateOfFirstEntry', label: 'Date of First Entry',    required: false },
  { value: 'guardian',         label: 'Guardian Name',          required: false },
  { value: 'guardianPhone',    label: 'Guardian Phone',         required: false },
  { value: 'sponsor',          label: 'Sponsor',                required: false },
  // Legacy support — old templates that only have a Birth Year column
  { value: 'birthYear',        label: 'Birth Year (legacy)',    required: false },
];

// ==================== DOB NORMALIZATION (mirrors schoolService) ====================
/**
 * Normalize a DOB-ish value to "YYYY-MM-DD".
 * Accepts: ISO, DD/MM/YYYY, DD-MM-YYYY, YYYY/MM/DD, year-only, number, Date.
 */
const normalizeDateOfBirth = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().split('T')[0];
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const y = Math.trunc(value);
    if (y >= 1900 && y <= 2200) return `${y}-01-01`;
    return null;
  }

  const str = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str + 'T00:00:00');
    return isNaN(d.getTime()) ? null : str;
  }

  const dmy = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  }

  const ymd = str.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (ymd) {
    const [, yyyy, mm, dd] = ymd;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  }

  if (/^\d{4}$/.test(str)) return `${str}-01-01`;

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
};

export const IndividualLearnerModal = ({
  isOpen,
  onClose,
  onSubmit,
  onSubmitBulk,
  className,
  classId,
  classPrefix,
  nextStudentIndex = 1,
  isLoading = false,
}: IndividualLearnerModalProps) => {
  const currentYear = new Date().getFullYear();
  const minDobYear = 1990;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');

  // Single entry form state — ✅ dateOfBirth replaces birthYear
  const [formData, setFormData] = useState({
    fullName: '',
    preferredName: '',
    address: '',
    dateOfFirstEntry: '',
    gender: '' as 'male' | 'female' | '',
    guardian: '',
    guardianPhone: '',
    alternativeGuardian: '',
    alternativeGuardianPhone: '',
    sponsor: '',
    dateOfBirth: '',   // ✅ ISO "YYYY-MM-DD"
    previousSchool: '',
    medicalNotes: '',
    allergies: '',
  });

  // Bulk import state
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [mappingErrors, setMappingErrors] = useState<string[]>([]);
  const [isMappingValid, setIsMappingValid] = useState(false);
  const [showMappingHelp, setShowMappingHelp] = useState(false);
  const [bulkPreviewData, setBulkPreviewData] = useState<any[]>([]);
  const [bulkImportErrors, setBulkImportErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);

  // Preview student ID
  const previewStudentId = classPrefix
    ? `${classPrefix}_${nextStudentIndex.toString().padStart(3, '0')}`
    : null;

  // Min/max for date inputs
  const minDob = `${minDobYear}-01-01`;
  const maxDob = `${currentYear}-12-31`;
  const today = new Date().toISOString().split('T')[0];

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading && !isImporting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isLoading, isImporting, onClose]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setFormData({
        fullName: '',
        preferredName: '',
        address: '',
        dateOfFirstEntry: '',
        gender: '',
        guardian: '',
        guardianPhone: '',
        alternativeGuardian: '',
        alternativeGuardianPhone: '',
        sponsor: '',
        dateOfBirth: '',
        previousSchool: '',
        medicalNotes: '',
        allergies: '',
      });
      setErrors({});
      setShowAdvanced(false);
      setCopied(false);
      setActiveTab('single');
      resetBulkImport();
    }
  }, [isOpen]);

  const resetBulkImport = () => {
    setCsvData([]);
    setCsvHeaders([]);
    setFieldMappings([]);
    setMappingErrors([]);
    setIsMappingValid(false);
    setBulkPreviewData([]);
    setBulkImportErrors([]);
    setImportProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ==================== VALIDATION ====================
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (activeTab === 'single') {
      // Full name
      if (!formData.fullName.trim()) {
        newErrors.fullName = 'Full name is required';
      } else if (formData.fullName.trim().length < 2) {
        newErrors.fullName = 'Name must be at least 2 characters';
      }

      // Gender
      if (!formData.gender) {
        newErrors.gender = 'Please select gender';
      }

      // ✅ Date of birth
      if (!formData.dateOfBirth) {
        newErrors.dateOfBirth = 'Date of birth is required';
      } else {
        const dob = new Date(formData.dateOfBirth + 'T00:00:00');
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);

        if (isNaN(dob.getTime())) {
          newErrors.dateOfBirth = 'Enter a valid date';
        } else if (dob > todayDate) {
          newErrors.dateOfBirth = 'Date of birth cannot be in the future';
        } else {
          const y = dob.getFullYear();
          if (y < minDobYear || y > currentYear) {
            newErrors.dateOfBirth = `Year must be between ${minDobYear} and ${currentYear}`;
          }
        }
      }

      // Guardian phone (optional but validated if present)
      if (formData.guardianPhone) {
        const digits = formData.guardianPhone.replace(/\D/g, '');
        if (digits.length < 9 || digits.length > 15) {
          newErrors.guardianPhone = 'Enter a valid phone number (9-15 digits)';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (activeTab === 'single') {
      await handleSingleSubmit();
    } else {
      await handleBulkSubmit();
    }
  };

  // ==================== SINGLE SUBMIT ====================
  const handleSingleSubmit = async () => {
    if (!validateForm()) return;

    try {
      const allergiesArray = formData.allergies
        ? formData.allergies.split(',').map((a) => a.trim()).filter((a) => a)
        : [];

      const result = await onSubmit({
        fullName: formData.fullName.trim(),
        preferredName: formData.preferredName.trim() || undefined,
        address: formData.address.trim(),
        dateOfFirstEntry: formData.dateOfFirstEntry,
        gender: formData.gender as 'male' | 'female',
        guardian: formData.guardian.trim(),
        guardianPhone: formData.guardianPhone,
        alternativeGuardian: formData.alternativeGuardian.trim() || undefined,
        alternativeGuardianPhone: formData.alternativeGuardianPhone || undefined,
        sponsor: formData.sponsor.trim(),
        dateOfBirth: formData.dateOfBirth,   // ✅ replaces birthYear
        previousSchool: formData.previousSchool.trim() || undefined,
        medicalNotes: formData.medicalNotes.trim() || undefined,
        allergies: allergiesArray,
      });

      console.log(`✅ Learner added with ID: ${result.studentId}`);
      resetForm();
      onClose();
    } catch (error) {
      console.error('Error adding learner:', error);
      setErrors({ submit: 'Failed to add learner. Please try again.' });
    }
  };

  // ==================== BULK SUBMIT ====================
  const handleBulkSubmit = async () => {
    if (!isMappingValid) {
      setBulkImportErrors(['Please map required fields before importing']);
      return;
    }

    setIsImporting(true);
    setBulkImportErrors([]);
    setImportProgress(0);

    try {
      // Transform CSV data using field mappings
      const transformedStudents = csvData.map((row, rowIdx) => {
        const student: any = { _rowIndex: rowIdx };

        fieldMappings.forEach((mapping) => {
          if (mapping.csvField && mapping.systemField) {
            let value = row[mapping.csvField];

            // Gender normalization
            if (mapping.systemField === 'gender' && value) {
              const norm = String(value).toLowerCase().trim();
              if (norm === 'm' || norm === 'male') value = 'male';
              else if (norm === 'f' || norm === 'female') value = 'female';
            }

            // ✅ DOB normalization — accept ISO, DD/MM/YYYY, year-only, etc.
            if (mapping.systemField === 'dateOfBirth' && value) {
              value = normalizeDateOfBirth(value) || value;
            }

            // ⚠️ Legacy: Birth Year → normalize to dateOfBirth if no DOB mapped yet
            if (mapping.systemField === 'birthYear' && value) {
              const num = parseInt(String(value), 10);
              if (!isNaN(num) && num >= minDobYear && num <= currentYear) {
                // Only set dateOfBirth if not already set from a proper DOB column
                if (!student.dateOfBirth) {
                  student.dateOfBirth = `${num}-01-01`;
                }
              }
              student.birthYear = num;
            }

            student[mapping.systemField] = value;
          }
        });

        // Fallbacks
        if (!student.gender) student.gender = 'male';
        if (!student.dateOfBirth) {
          // Last-resort fallback: today minus 10 years
          const fallback = new Date();
          fallback.setFullYear(fallback.getFullYear() - 10);
          student.dateOfBirth = fallback.toISOString().split('T')[0];
        }

        return student;
      });

      setImportProgress(30);

      let successCount = 0;

      if (onSubmitBulk) {
        const result = await onSubmitBulk(transformedStudents);
        setImportProgress(100);

        if (result.success) {
          console.log(`✅ Successfully imported ${result.count} learners`);
          resetBulkImport();
          onClose();
        }
      } else {
        // Fallback: submit one by one
        for (let i = 0; i < transformedStudents.length; i++) {
          const student = transformedStudents[i];
          try {
            await onSubmit({
              fullName: student.fullName || '',
              address: student.address || '',
              dateOfFirstEntry: student.dateOfFirstEntry || '',
              gender: student.gender || 'male',
              guardian: student.guardian || '',
              sponsor: student.sponsor || '',
              guardianPhone: student.guardianPhone || '',
              dateOfBirth: student.dateOfBirth,   // ✅
            });
            successCount++;
          } catch (error) {
            console.error(`Failed to import student at row ${i + 1}:`, error);
            setBulkImportErrors((prev) => [
              ...prev,
              `Failed to import row ${i + 1}: ${student.fullName || 'Unknown'}`,
            ]);
          }

          setImportProgress(Math.round(((i + 1) / transformedStudents.length) * 100));
        }

        if (successCount > 0) {
          console.log(`✅ Successfully imported ${successCount} out of ${transformedStudents.length} learners`);
          resetBulkImport();
          onClose();
        }
      }
    } catch (error) {
      console.error('Error in bulk import:', error);
      setBulkImportErrors(['Failed to import learners. Please check your data and try again.']);
    } finally {
      setIsImporting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      fullName: '',
      preferredName: '',
      address: '',
      dateOfFirstEntry: '',
      gender: '',
      guardian: '',
      guardianPhone: '',
      alternativeGuardian: '',
      alternativeGuardianPhone: '',
      sponsor: '',
      dateOfBirth: '',
      previousSchool: '',
      medicalNotes: '',
      allergies: '',
    });
    setErrors({});
  };

  // ==================== CSV PARSER ====================
  const parseCSV = (file: File): Promise<{ data: any[]; headers: string[] }> => {
    return new Promise((resolve, reject) => {
      const results: any[] = [];
      const headers: string[] = [];
      const reader = new FileReader();

      reader.onload = (event) => {
        const csvText = event.target?.result as string;
        const lines = csvText.split('\n');

        if (lines.length > 0) {
          const headerLine = lines[0].trim();
          const headerColumns = headerLine
            .split(',')
            .map((h) => h.trim().replace(/^["']|["']$/g, ''));
          headers.push(...headerColumns);

          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
              const values = line.split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''));
              const row: any = {};
              headers.forEach((header, index) => {
                row[header] = values[index] || '';
              });
              results.push(row);
            }
          }
        }

        resolve({ data: results, headers });
      };

      reader.onerror = (error) => reject(error);
      reader.readAsText(file);
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const { data, headers } = await parseCSV(file);

      if (data.length > 0) {
        setCsvData(data);
        setCsvHeaders(headers);

        const initialMappings: FieldMapping[] = SYSTEM_FIELDS.map((systemField) => ({
          csvField: '',
          systemField: systemField.value,
          required: systemField.required,
          sample: '',
        }));

        // Auto-map: try to match header names to system fields.
        // Handles common variants like "Date of Birth", "DOB", "Birth Year".
        const autoMappings = initialMappings.map((mapping) => {
          const target = mapping.systemField.toLowerCase();
          const aliases: Record<string, string[]> = {
            fullname: ['fullname', 'name', 'studentname'],
            gender: ['gender', 'sex'],
            dateofbirth: ['dateofbirth', 'dob', 'birthdate', 'birthday'],
            birthyear: ['birthyear', 'yearofbirth', 'yob'],
            address: ['address', 'homeaddress', 'residence'],
            dateoffirstentry: ['dateoffirstentry', 'firstentry', 'enrollmentdate', 'dateofentry'],
            guardian: ['guardian', 'guardianname', 'parentname'],
            guardianphone: ['guardianphone', 'parentphone', 'phone', 'contact'],
            sponsor: ['sponsor', 'sponsorname', 'sponsorship'],
          };

          const candidates = aliases[target] || [target];
          const matchingHeader = headers.find((h) => {
            const norm = h.toLowerCase().replace(/\s+/g, '');
            return candidates.some((c) => norm === c || norm.includes(c));
          });

          return {
            ...mapping,
            csvField: matchingHeader || '',
            sample: matchingHeader ? data[0][matchingHeader] : '',
          };
        });

        setFieldMappings(autoMappings);
        validateMappings(autoMappings);
        setBulkPreviewData(data.slice(0, 5));
      }
    } catch (error) {
      console.error('Error parsing CSV:', error);
      setMappingErrors([
        `Error parsing CSV: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ]);
    }
  };

  const validateMappings = (mappings: FieldMapping[]) => {
    const errs: string[] = [];

    const requiredMappings = mappings.filter((m) => m.required);
    const unmappedRequired = requiredMappings.filter((m) => !m.csvField);

    // Special case: dateOfBirth is required, but a mapped legacy birthYear column satisfies it.
    const birthYearMapped = mappings.some(
      (m) => m.systemField === 'birthYear' && m.csvField
    );

    const trulyUnmapped = unmappedRequired.filter((m) => {
      if (m.systemField === 'dateOfBirth' && birthYearMapped) return false;
      return true;
    });

    if (trulyUnmapped.length > 0) {
      errs.push(
        `Required fields not mapped: ${trulyUnmapped
          .map((m) => {
            const field = SYSTEM_FIELDS.find((f) => f.value === m.systemField);
            return field?.label || m.systemField;
          })
          .join(', ')}`
      );
    }

    setMappingErrors(errs);
    setIsMappingValid(errs.length === 0);
  };

  const handleMappingChange = (systemField: string, csvField: string) => {
    const updatedMappings = fieldMappings.map((mapping) => {
      if (mapping.systemField === systemField) {
        const sample = csvField ? csvData[0]?.[csvField] : '';
        return { ...mapping, csvField, sample };
      }
      return mapping;
    });

    setFieldMappings(updatedMappings);
    validateMappings(updatedMappings);
  };

  // ==================== TEMPLATE DOWNLOAD ====================
  const downloadTemplate = () => {
    // Include both Date of Birth (new) and Birth Year (legacy) columns
    const headers = [
      'Full Name',
      'Gender',
      'Date of Birth',
      'Address',
      'Date of First Entry',
      'Guardian Name',
      'Guardian Phone',
      'Sponsor',
      'Birth Year (legacy)',
    ];
    const sampleRow = [
      'John Banda',
      'Male',
      '2010-05-14',
      'Plot 123, Libala, Lusaka',
      '2024-01-15',
      'Mary Banda',
      '0971234567',
      'Government Bursary',
      '',
    ];

    const csvContent = [
      headers.join(','),
      sampleRow.map((c) => `"${c}"`).join(','),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'learner_import_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handlePhoneChange = (value: string, field: 'guardianPhone' | 'alternativeGuardianPhone') => {
    const digits = value.replace(/\D/g, '').slice(0, 15);
    setFormData((prev) => ({ ...prev, [field]: digits }));
  };

  const copyStudentIdPreview = () => {
    if (previewStudentId) {
      navigator.clipboard.writeText(previewStudentId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-2 sm:p-4">
      <div
        ref={modalRef}
        className="relative bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[98vh] sm:max-h-[95vh]"
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-200 bg-white rounded-t-2xl flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                Add Learners
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-1 truncate">
                Class: {className}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg ml-2 flex-shrink-0"
              disabled={isLoading || isImporting}
              aria-label="Close"
            >
              <X size={18} className="sm:w-5 sm:h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 sm:gap-2 mt-3 sm:mt-4 border-b border-gray-200">
            <button
              type="button"
              onClick={() => setActiveTab('single')}
              className={`px-3 sm:px-4 py-2 font-medium text-xs sm:text-sm transition-colors relative flex-1 sm:flex-none ${
                activeTab === 'single'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Single Entry
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bulk')}
              className={`px-3 sm:px-4 py-2 font-medium text-xs sm:text-sm transition-colors relative flex-1 sm:flex-none ${
                activeTab === 'bulk'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Bulk Import
            </button>
          </div>

          {/* Student ID Preview */}
          {activeTab === 'single' && previewStudentId && (
            <div className="mt-3 sm:mt-4 p-2 sm:p-3 bg-blue-50 rounded-lg border border-blue-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-blue-700 font-medium">Next Student ID:</p>
                  <p className="text-base sm:text-lg font-mono font-bold text-blue-800 break-all">
                    {previewStudentId}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copyStudentIdPreview}
                  className="p-1.5 sm:p-2 bg-white rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors self-start sm:self-center"
                  title="Copy ID"
                >
                  {copied ? (
                    <Check size={14} className="sm:w-4 sm:h-4 text-green-600" />
                  ) : (
                    <Copy size={14} className="sm:w-4 sm:h-4 text-blue-600" />
                  )}
                </button>
              </div>
            </div>
          )}

          {errors.submit && (
            <div className="p-2 sm:p-3 bg-red-50 text-red-700 rounded-lg text-xs sm:text-sm flex items-start gap-2 mt-3 sm:mt-4">
              <AlertCircle size={14} className="sm:w-4 sm:h-4 flex-shrink-0 mt-0.5" />
              <span className="break-words flex-1">{errors.submit}</span>
            </div>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === 'single' ? (
            /* ============ SINGLE ENTRY ============ */
            <div className="space-y-4 sm:space-y-5">
              <div className="space-y-4 sm:space-y-5">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <span className="w-1 h-4 bg-blue-600 rounded-full"></span>
                  Basic Information
                </h3>

                {/* Full Name */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <User size={14} className="sm:w-4 sm:h-4 text-gray-400" />
                      Full Name *
                    </div>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., John Banda"
                    value={formData.fullName}
                    onChange={(e) => setFormData((prev) => ({ ...prev, fullName: e.target.value }))}
                    className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.fullName ? 'border-red-300' : 'border-gray-300'
                    }`}
                    disabled={isLoading}
                  />
                  {errors.fullName && (
                    <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.fullName}</p>
                  )}
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <Users size={14} className="sm:w-4 sm:h-4 text-gray-400" />
                      Gender *
                    </div>
                  </label>
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, gender: 'male' }))}
                      className={`
                        px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm border rounded-lg font-medium transition-all
                        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                        ${formData.gender === 'male'
                          ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}
                        ${errors.gender ? 'border-red-300' : ''}
                      `}
                      disabled={isLoading}
                    >
                      Male
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, gender: 'female' }))}
                      className={`
                        px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm border rounded-lg font-medium transition-all
                        focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2
                        ${formData.gender === 'female'
                          ? 'bg-pink-600 text-white border-pink-600 hover:bg-pink-700'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}
                        ${errors.gender ? 'border-red-300' : ''}
                      `}
                      disabled={isLoading}
                    >
                      Female
                    </button>
                  </div>
                  {errors.gender && (
                    <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.gender}</p>
                  )}
                </div>
              </div>

              {/* Other Fields */}
              <div className="space-y-3 sm:space-y-4 pt-3 sm:pt-4">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <span className="w-1 h-4 bg-gray-400 rounded-full"></span>
                  Additional Information
                </h3>

                {/* Address */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <MapPin size={14} className="sm:w-4 sm:h-4 text-gray-400" />
                      Address
                    </div>
                  </label>
                  <textarea
                    placeholder="e.g., Plot 123, Libala, Lusaka"
                    value={formData.address}
                    onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                    rows={2}
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    disabled={isLoading}
                  />
                </div>

                {/* Date of First Entry & Date of Birth */}
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <div className="flex-1">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                      <div className="flex items-center gap-1 sm:gap-2">
                        <Calendar size={14} className="sm:w-4 sm:h-4 text-gray-400" />
                        First School Entry
                      </div>
                    </label>
                    <input
                      type="date"
                      value={formData.dateOfFirstEntry}
                      max={today}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, dateOfFirstEntry: e.target.value }))
                      }
                      className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={isLoading}
                    />
                  </div>

                  <div className="flex-1">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                      <div className="flex items-center gap-1 sm:gap-2">
                        <Calendar size={14} className="sm:w-4 sm:h-4 text-gray-400" />
                        Date of Birth *
                      </div>
                    </label>
                    <input
                      type="date"
                      value={formData.dateOfBirth}
                      min={minDob}
                      max={maxDob}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, dateOfBirth: e.target.value }))
                      }
                      className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.dateOfBirth ? 'border-red-300' : 'border-gray-300'
                      }`}
                      disabled={isLoading}
                    />
                    {errors.dateOfBirth && (
                      <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.dateOfBirth}</p>
                    )}
                  </div>
                </div>

                {/* Guardian & Sponsor */}
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <div className="flex-1">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                      <div className="flex items-center gap-1 sm:gap-2">
                        <User size={14} className="sm:w-4 sm:h-4 text-gray-400" />
                        Guardian Name
                      </div>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Mary Banda"
                      value={formData.guardian}
                      onChange={(e) => setFormData((prev) => ({ ...prev, guardian: e.target.value }))}
                      className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={isLoading}
                    />
                  </div>

                  <div className="flex-1">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                      <div className="flex items-center gap-1 sm:gap-2">
                        <HandHeart size={14} className="sm:w-4 sm:h-4 text-gray-400" />
                        Sponsor
                      </div>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Govt. Bursary"
                      value={formData.sponsor}
                      onChange={(e) => setFormData((prev) => ({ ...prev, sponsor: e.target.value }))}
                      className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {/* Guardian Phone */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <Phone size={14} className="sm:w-4 sm:h-4 text-gray-400" />
                      Guardian Phone Number
                    </div>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                      +26
                    </span>
                    <input
                      type="tel"
                      placeholder="097 123 4567"
                      value={formData.guardianPhone}
                      onChange={(e) => handlePhoneChange(e.target.value, 'guardianPhone')}
                      className={`w-full pl-12 pr-3 sm:pr-4 py-2 sm:py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.guardianPhone ? 'border-red-300' : 'border-gray-300'
                      }`}
                      disabled={isLoading}
                    />
                  </div>
                  {errors.guardianPhone ? (
                    <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.guardianPhone}</p>
                  ) : (
                    <p className="mt-1 text-xs text-gray-500">
                      9–15 digits after +26 (e.g., 971234567)
                    </p>
                  )}
                </div>

                {/* Advanced Fields Toggle */}
                <div className="pt-1 sm:pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                  >
                    {showAdvanced ? (
                      <>
                        <ChevronUp size={14} className="sm:w-4 sm:h-4" />
                        Hide Advanced Fields
                      </>
                    ) : (
                      <>
                        <ChevronDown size={14} className="sm:w-4 sm:h-4" />
                        Show Advanced Fields
                      </>
                    )}
                  </button>
                </div>

                {/* Advanced Fields */}
                {showAdvanced && (
                  <div className="space-y-3 sm:space-y-4 pt-2 sm:pt-3 border-t border-gray-100">
                    {/* Preferred Name */}
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                        Preferred Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., Johnny"
                        value={formData.preferredName}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, preferredName: e.target.value }))
                        }
                        className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isLoading}
                      />
                    </div>

                    {/* Alternative Guardian */}
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                      <div className="flex-1">
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                          Alternative Guardian
                        </label>
                        <input
                          type="text"
                          placeholder="e.g., Peter Banda"
                          value={formData.alternativeGuardian}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              alternativeGuardian: e.target.value,
                            }))
                          }
                          className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          disabled={isLoading}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                          Alternative Guardian Phone
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                            +26
                          </span>
                          <input
                            type="tel"
                            placeholder="097 123 4567"
                            value={formData.alternativeGuardianPhone}
                            onChange={(e) =>
                              handlePhoneChange(e.target.value, 'alternativeGuardianPhone')
                            }
                            className="w-full pl-12 pr-3 sm:pr-4 py-2 sm:py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            disabled={isLoading}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Previous School */}
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                        Previous School
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., Libala Primary"
                        value={formData.previousSchool}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, previousSchool: e.target.value }))
                        }
                        className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isLoading}
                      />
                    </div>

                    {/* Medical Notes */}
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                        Medical Notes
                      </label>
                      <textarea
                        placeholder="e.g., Allergies, medical conditions, etc."
                        value={formData.medicalNotes}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, medicalNotes: e.target.value }))
                        }
                        rows={2}
                        className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                        disabled={isLoading}
                      />
                    </div>

                    {/* Allergies */}
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                        Allergies (comma-separated)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., Peanuts, Dust, Penicillin"
                        value={formData.allergies}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, allergies: e.target.value }))
                        }
                        className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ============ BULK IMPORT ============ */
            <div className="space-y-4 sm:space-y-6">
              {/* Upload Section */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 sm:p-6">
                <div className="text-center">
                  <Upload className="mx-auto h-8 w-8 sm:h-12 sm:w-12 text-gray-400" />
                  <div className="mt-2 sm:mt-4 flex flex-col sm:flex-row items-center justify-center text-xs sm:text-sm leading-6 text-gray-600">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer rounded-md bg-white font-semibold text-blue-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-600 focus-within:ring-offset-2 hover:text-blue-500"
                    >
                      <span>Upload a CSV file</span>
                      <input
                        id="file-upload"
                        ref={fileInputRef}
                        type="file"
                        className="sr-only"
                        accept=".csv"
                        onChange={handleFileUpload}
                        disabled={isImporting}
                      />
                    </label>
                    <p className="sm:pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs leading-5 text-gray-500">CSV files only</p>
                </div>
              </div>

              {/* Template Download */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <Download size={14} className="sm:w-4 sm:h-4" />
                  Download Template
                </button>
              </div>

              {/* Field Mapping Section */}
              {csvHeaders.length > 0 && (
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">Map CSV Fields</h3>
                    <button
                      type="button"
                      onClick={() => setShowMappingHelp(!showMappingHelp)}
                      className="text-gray-500 hover:text-gray-700"
                      aria-label="Toggle mapping help"
                    >
                      <HelpCircle size={16} />
                    </button>
                  </div>

                  {showMappingHelp && (
                    <div className="p-2 sm:p-3 bg-blue-50 rounded-lg text-xs sm:text-sm text-blue-700">
                      <p>
                        Map your CSV columns to system fields. <strong>Full Name</strong>,{' '}
                        <strong>Gender</strong>, and <strong>Date of Birth</strong> are required —
                        but a legacy <em>Birth Year</em> column can substitute for Date of Birth.
                      </p>
                    </div>
                  )}

                  {/* Mapping Table */}
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            System Field
                          </th>
                          <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            CSV Column
                          </th>
                          <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">
                            Sample
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {fieldMappings.map((mapping) => (
                          <tr key={mapping.systemField}>
                            <td className="px-2 sm:px-4 py-2">
                              <span className="text-xs sm:text-sm">
                                {SYSTEM_FIELDS.find((f) => f.value === mapping.systemField)?.label}
                                {mapping.required && <span className="text-red-500 ml-1">*</span>}
                              </span>
                            </td>
                            <td className="px-2 sm:px-4 py-2">
                              <select
                                value={mapping.csvField}
                                onChange={(e) =>
                                  handleMappingChange(mapping.systemField, e.target.value)
                                }
                                className="w-full px-1 sm:px-2 py-1 text-xs sm:text-sm border border-gray-300 rounded"
                                disabled={isImporting}
                              >
                                <option value="">-- Select --</option>
                                {csvHeaders.map((header) => (
                                  <option key={header} value={header} className="text-xs sm:text-sm">
                                    {header.length > 15
                                      ? `${header.substring(0, 15)}...`
                                      : header}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm text-gray-600 hidden sm:table-cell">
                              {mapping.sample || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mapping Errors */}
                  {mappingErrors.length > 0 && (
                    <div className="p-2 sm:p-3 bg-red-50 rounded-lg">
                      {mappingErrors.map((error, index) => (
                        <p
                          key={index}
                          className="text-xs sm:text-sm text-red-600 flex items-start gap-2"
                        >
                          <AlertCircle size={14} className="sm:w-4 sm:h-4 flex-shrink-0 mt-0.5" />
                          <span className="break-words flex-1">{error}</span>
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Data Preview */}
                  {bulkPreviewData.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs sm:text-sm font-medium text-gray-700">
                        Preview (First 5 rows)
                      </h4>
                      <div className="border rounded-lg overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              {fieldMappings
                                .filter((m) => m.csvField)
                                .map((mapping) => (
                                  <th
                                    key={mapping.systemField}
                                    className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap"
                                  >
                                    {mapping.systemField}
                                  </th>
                                ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {bulkPreviewData.map((row, idx) => (
                              <tr key={idx}>
                                {fieldMappings
                                  .filter((m) => m.csvField)
                                  .map((mapping) => (
                                    <td
                                      key={mapping.systemField}
                                      className="px-2 sm:px-4 py-2 text-xs sm:text-sm text-gray-600 whitespace-nowrap"
                                    >
                                      {row[mapping.csvField] || '-'}
                                    </td>
                                  ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Bulk Import Errors */}
                  {bulkImportErrors.length > 0 && (
                    <div className="p-2 sm:p-3 bg-red-50 rounded-lg">
                      {bulkImportErrors.map((error, index) => (
                        <p
                          key={index}
                          className="text-xs sm:text-sm text-red-600 flex items-start gap-2"
                        >
                          <AlertCircle size={14} className="sm:w-4 sm:h-4 flex-shrink-0 mt-0.5" />
                          <span className="break-words flex-1">{error}</span>
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Import Progress */}
                  {isImporting && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs sm:text-sm">
                        <span>Importing...</span>
                        <span>{importProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
                        <div
                          className="bg-blue-600 h-1.5 sm:h-2 rounded-full transition-all duration-300"
                          style={{ width: `${importProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </form>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl flex-shrink-0">
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium text-sm disabled:opacity-50 transition-colors w-full sm:w-auto order-1 sm:order-none"
              disabled={isLoading || isImporting}
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={
                isLoading ||
                isImporting ||
                (activeTab === 'bulk' && (!csvData.length || !isMappingValid))
              }
              className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm disabled:opacity-50 flex items-center justify-center transition-colors w-full sm:w-auto"
            >
              {isLoading || isImporting ? (
                <>
                  <Loader2 className="animate-spin mr-2" size={16} />
                  {activeTab === 'bulk' ? 'Importing...' : 'Adding...'}
                </>
              ) : activeTab === 'bulk' ? (
                'Import Learners'
              ) : (
                'Add Learner'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};