import { useState, useRef } from 'react';
import {
  X,
  FileSpreadsheet,
  AlertCircle,
  Loader2
} from 'lucide-react';

interface CSVImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: any[]) => Promise<void>;
  type: 'learners' | 'classes';
  currentClass?: string;
  isLoading?: boolean;
}

export const CSVImportModal = ({ 
  isOpen, 
  onClose, 
  onImport,
  type = 'learners',
  currentClass,
  isLoading = false
}: CSVImportModalProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setError('');
    setPreview([]);
    setHeaders([]);
    setIsParsing(true);

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a CSV file');
      setIsParsing(false);
      return;
    }

    const reader = new FileReader();
    const results: any[] = [];
    let firstFiveRows: any[] = [];
    let fileHeaders: string[] = [];

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length === 0) {
          setError('CSV file is empty');
          setIsParsing(false);
          return;
        }

        // Parse headers from first line
        fileHeaders = lines[0].split(',').map(h => h.trim());
        setHeaders(fileHeaders);

        // Validate required columns
        if (type === 'learners') {
          const requiredColumns = ['name', 'age', 'parentPhone'];
          const missingColumns = requiredColumns.filter(col => 
            !fileHeaders.includes(col)
          );
          
          if (missingColumns.length > 0) {
            setError(`Missing required columns: ${missingColumns.join(', ')}`);
            setIsParsing(false);
            return;
          }
        } else {
          const requiredColumns = ['name', 'year'];
          const missingColumns = requiredColumns.filter(col => 
            !fileHeaders.includes(col)
          );
          
          if (missingColumns.length > 0) {
            setError(`Missing required columns: ${missingColumns.join(', ')}`);
            setIsParsing(false);
            return;
          }
        }

        // Parse data rows (skip header row)
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          const values = parseCSVLine(line);
          const row: any = {};
          
          fileHeaders.forEach((header, index) => {
            row[header] = values[index] || '';
          });
          
          results.push(row);
          
          // Collect first 5 rows for preview
          if (i <= 5) {
            firstFiveRows.push(row);
          }
        }

        setPreview(firstFiveRows);
        setIsParsing(false);
      } catch (error) {
        console.error('Error parsing CSV:', error);
        setError('Error parsing CSV file. Please check the format.');
        setIsParsing(false);
      }
    };

    reader.onerror = () => {
      setError('Error reading CSV file');
      setIsParsing(false);
    };

    reader.readAsText(selectedFile);
  };

  // Helper function to parse CSV line with quoted fields
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let currentField = '';
    let insideQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i++; // Skip next quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        result.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }
    
    // Add the last field
    result.push(currentField.trim());
    return result;
  };

  const handleImport = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setIsParsing(true);
    try {
      const results = await new Promise<any[]>((resolve, reject) => {
        const reader = new FileReader();
        const results: any[] = [];

        reader.onload = (event) => {
          try {
            const text = event.target?.result as string;
            const lines = text.split('\n').filter(line => line.trim() !== '');
            
            if (lines.length < 2) {
              reject(new Error('CSV file must have at least one data row'));
              return;
            }

            const headers = lines[0].split(',').map(h => h.trim());

            // Parse all rows
            for (let i = 1; i < lines.length; i++) {
              const line = lines[i];
              const values = parseCSVLine(line);
              const row: any = {};
              
              headers.forEach((header, index) => {
                row[header] = values[index] || '';
              });
              
              // Convert age to number if present
              if (row.age) {
                row.age = parseInt(row.age) || 0;
              }
              
              // Convert year to number if present
              if (row.year) {
                row.year = parseInt(row.year) || new Date().getFullYear();
              }
              
              results.push(row);
            }
            
            resolve(results);
          } catch (error) {
            reject(error);
          }
        };

        reader.onerror = () => {
          reject(new Error('Error reading CSV file'));
        };

        reader.readAsText(file);
      });

      await onImport(results);
      onClose();
      setFile(null);
      setPreview([]);
      setHeaders([]);
    } catch (error: any) {
      setError('Error importing data: ' + error.message);
    } finally {
      setIsParsing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-2xl shadow-2xl">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                {type === 'learners' ? 'Import Learners' : 'Import Classes'}
              </h2>
              <button 
                onClick={onClose}
                disabled={isLoading || isParsing}
                className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>
            {type === 'learners' && currentClass && (
              <p className="text-sm text-gray-600">
                Importing into: <span className="font-medium">{currentClass}</span>
              </p>
            )}
            
            <div className="mt-3 text-sm text-gray-500">
              {type === 'learners' 
                ? 'Required columns: name, age, parentPhone'
                : 'Required columns: name, year'
              }
            </div>
          </div>

          <div className="p-6">
            <div className="mb-6">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <FileSpreadsheet className="mx-auto mb-4 text-gray-400" size={48} />
                <p className="text-gray-600 mb-2">
                  {file ? file.name : 'Drag & drop CSV file or click to browse'}
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isParsing}
                  className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium disabled:opacity-50"
                >
                  Browse Files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      handleFileSelect(e.target.files[0]);
                    }
                  }}
                  disabled={isLoading || isParsing}
                />
                {isParsing && (
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <Loader2 className="animate-spin text-blue-600" size={20} />
                    <span className="text-sm text-gray-600">Parsing CSV...</span>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  <AlertCircle className="inline mr-2" size={16} />
                  {error}
                </div>
              )}

              {headers.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Detected Columns:</h4>
                  <div className="flex flex-wrap gap-2">
                    {headers.map((header, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-gray-100 text-gray-800 text-sm rounded-full"
                      >
                        {header}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {preview.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Preview (first {preview.length} rows)</h3>
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {headers.map((header) => (
                            <th key={header} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {preview.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            {headers.map((header) => (
                              <td key={`${i}-${header}`} className="px-3 py-2 text-sm text-gray-900 max-w-xs truncate">
                                {row[header] || ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Total rows in file: {preview.length} shown (full file will be imported)
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={isLoading || isParsing}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!file || isLoading || isParsing}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={20} />
                    Importing...
                  </>
                ) : isParsing ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={20} />
                    Processing...
                  </>
                ) : (
                  'Import Data'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};