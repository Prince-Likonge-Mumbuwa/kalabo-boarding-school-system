// @/components/results/BulkResultsEntryModal.tsx
//
// Bulk marks entry for one class / subject / exam.
//   1. Teacher pastes columns from Excel, or uploads a CSV (or the class template).
//   2. Rows are matched to learners by Student ID, then by name,
//      or by class-list order when the file only has a marks column.
//   3. A preview flags blanks, invalid marks, unknown learners and duplicates.
//   4. "Apply" puts the marks into the entry table ONLY. The teacher still
//      clicks Save / Overwrite, so the existing save + overwrite-confirm flow
//      is reused unchanged and nothing hits Firestore from this modal.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Upload,
  ClipboardPaste,
  Download,
  AlertCircle,
  CheckCircle,
  FileSpreadsheet,
} from 'lucide-react';

// ==================== TYPES ====================

export interface BulkRosterStudent {
  id: string;        // learner document id
  studentId: string; // e.g. G12A_025
  name: string;
  marks: string;     // current value in the entry table: '' | digits | 'x'
}

export type BulkApplyMode = 'overwrite' | 'fillEmpty';

interface BulkResultsEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: BulkRosterStudent[];
  totalMarks: number;
  classLabel: string;
  subject: string;
  examLabel: string;
  /** learner document id → new marks ('' never sent; 'x' = absent) */
  onApply: (updates: Record<string, string>) => void;
}

type RowStatus =
  | 'new'
  | 'changed'
  | 'unchanged'
  | 'blank'
  | 'invalid'
  | 'unmatched'
  | 'ambiguous'
  | 'duplicate';

interface PreviewRow {
  line: number;
  rawId: string;
  rawName: string;
  rawMarks: string;
  learner: BulkRosterStudent | null;
  matchedBy: 'id' | 'name' | 'order' | null;
  newMarks: string | null;
  status: RowStatus;
  note?: string;
}

interface ColumnMap {
  id: number;
  name: number;
  marks: number;
  hasHeader: boolean;
}

interface PreviewResult {
  rows: PreviewRow[];
  orderMode: boolean;
  error?: string;
  warning?: string;
}

// ==================== PARSING HELPERS ====================

const HEADER_ALIASES = {
  id: [
    'studentid', 'id', 'learnerid', 'examno', 'examnumber', 'admissionno',
    'admissionnumber', 'regno', 'registrationnumber', 'studentno', 'studentnumber',
  ],
  name: ['name', 'names', 'studentname', 'learnername', 'fullname', 'learner', 'student'],
  marks: ['marks', 'mark', 'score', 'scores', 'result', 'results', 'total', 'points'],
};

const ABSENT_TOKENS = new Set(['x', 'abs', 'absent', 'a']);
const PROBLEM_STATUSES: RowStatus[] = ['invalid', 'unmatched', 'ambiguous', 'duplicate'];

const normHeader = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const normId = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '');
// Order-insensitive so "Banda Mary" matches "Mary Banda"
const normName = (s: string) =>
  s.toLowerCase().replace(/[^a-z]+/g, ' ').trim().split(' ').filter(Boolean).sort().join(' ');

const isMarksLike = (v: string) => {
  const t = v.trim();
  return t === '' || t === '-' || /^\d+(\.\d+)?$/.test(t) || ABSENT_TOKENS.has(t.toLowerCase());
};

const splitLine = (line: string, delim: string): string[] => {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delim && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
};

/** Handles Excel paste (tabs), CSV (commas) and European CSV (semicolons). */
const parseTable = (text: string): string[][] => {
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/);
  // Trim leading/trailing blank lines but KEEP internal blanks:
  // in a single marks column, an empty cell still occupies a learner's slot.
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  while (lines.length && !lines[0].trim()) lines.shift();

  const first = lines[0] ?? '';
  const delim = first.includes('\t')
    ? '\t'
    : first.split(';').length > first.split(',').length
      ? ';'
      : ',';

  return lines.map(l => splitLine(l, delim));
};

const parseMarks = (raw: string, totalMarks: number): { value: string | null; error?: string } => {
  const v = raw.trim();
  if (v === '' || v === '-') return { value: null };
  if (ABSENT_TOKENS.has(v.toLowerCase())) return { value: 'x' };
  if (/^\d+\.\d+$/.test(v)) return { value: null, error: `${v}: whole numbers only` };
  if (!/^\d+$/.test(v)) return { value: null, error: `"${v}" is not a mark` };
  const n = parseInt(v, 10);
  if (n > totalMarks) return { value: null, error: `${n} is more than ${totalMarks}` };
  return { value: String(n) };
};

const detectColumns = (rows: string[][], roster: BulkRosterStudent[]): ColumnMap | string => {
  // 1. Header row?
  const header = rows[0].map(normHeader);
  const findCol = (aliases: string[]) => header.findIndex(h => aliases.includes(h));
  const hId = findCol(HEADER_ALIASES.id);
  const hName = findCol(HEADER_ALIASES.name);
  const hMarks = findCol(HEADER_ALIASES.marks);

  if (hId >= 0 || hName >= 0 || hMarks >= 0) {
    if (hMarks < 0) {
      return 'The header row has no marks column. Name the column with the marks "Marks".';
    }
    return { id: hId, name: hName, marks: hMarks, hasHeader: true };
  }

  // 2. No header — infer from the values.
  const width = Math.max(...rows.map(r => r.length));
  if (width === 1) return { id: -1, name: -1, marks: 0, hasHeader: false };

  const nonEmpty = rows.filter(r => r.some(c => c));
  const share = (col: number, test: (v: string) => boolean) =>
    nonEmpty.filter(r => test(r[col] ?? '')).length / Math.max(nonEmpty.length, 1);

  const rosterIds = new Set(roster.map(s => normId(s.studentId)));
  let id = -1;
  for (let c = 0; c < width; c++) {
    if (share(c, v => rosterIds.has(normId(v))) >= 0.5) { id = c; break; }
  }

  // Marks = right-most numeric-looking column (skips a leading "No." column)
  let marks = -1;
  for (let c = width - 1; c >= 0; c--) {
    if (c === id) continue;
    if (share(c, isMarksLike) >= 0.8) { marks = c; break; }
  }
  if (marks < 0) {
    return 'Could not find a column of marks. Add a header row: Student ID, Name, Marks.';
  }

  let name = -1;
  for (let c = 0; c < width; c++) {
    if (c === id || c === marks) continue;
    if (share(c, v => /[a-z]/i.test(v)) >= 0.5) { name = c; break; }
  }
  if (id < 0 && name < 0) {
    return 'Could not tell which column identifies the learner. Add a header row: Student ID, Name, Marks.';
  }
  return { id, name, marks, hasHeader: false };
};

const buildPreview = (
  text: string,
  roster: BulkRosterStudent[],
  totalMarks: number
): PreviewResult => {
  if (!text.trim()) return { rows: [], orderMode: false };

  const table = parseTable(text);
  const cols = detectColumns(table, roster);
  if (typeof cols === 'string') return { rows: [], orderMode: false, error: cols };

  const orderMode = cols.id < 0 && cols.name < 0;
  const dataRows = cols.hasHeader ? table.slice(1) : table;
  const firstLine = cols.hasHeader ? 2 : 1;

  const byId = new Map(roster.map(s => [normId(s.studentId), s]));
  const byName = new Map<string, BulkRosterStudent[]>();
  roster.forEach(s => {
    const k = normName(s.name);
    byName.set(k, [...(byName.get(k) ?? []), s]);
  });

  const seen = new Set<string>();
  const rows: PreviewRow[] = [];

  dataRows.forEach((cells, i) => {
    if (!orderMode && !cells.some(c => c)) return; // ignore empty lines in multi-column files

    const row: PreviewRow = {
      line: i + firstLine,
      rawId: cols.id >= 0 ? cells[cols.id] ?? '' : '',
      rawName: cols.name >= 0 ? cells[cols.name] ?? '' : '',
      rawMarks: cells[cols.marks] ?? '',
      learner: null,
      matchedBy: null,
      newMarks: null,
      status: 'unmatched',
    };

    // ---- 1. Match the learner ----
    if (orderMode) {
      if (i < roster.length) {
        row.learner = roster[i];
        row.matchedBy = 'order';
      } else {
        row.note = 'More rows than learners in the class';
      }
    } else {
      const idHit = row.rawId ? byId.get(normId(row.rawId)) : undefined;
      if (idHit) {
        row.learner = idHit;
        row.matchedBy = 'id';
        if (row.rawName && normName(row.rawName) !== normName(idHit.name)) {
          row.note = `Name differs from class list (${idHit.name})`;
        }
      } else if (row.rawName) {
        const hits = byName.get(normName(row.rawName)) ?? [];
        if (hits.length === 1) {
          row.learner = hits[0];
          row.matchedBy = 'name';
          if (row.rawId) row.note = `ID "${row.rawId}" not found, matched by name`;
        } else if (hits.length > 1) {
          rows.push({ ...row, status: 'ambiguous', note: `${hits.length} learners have this name. Add the Student ID.` });
          return;
        }
      }
    }

    if (!row.learner) {
      rows.push({ ...row, status: 'unmatched', note: row.note ?? 'Not in this class' });
      return;
    }

    // ---- 2. Duplicates ----
    if (seen.has(row.learner.id)) {
      rows.push({ ...row, status: 'duplicate', note: 'Learner already appears above. This row is ignored.' });
      return;
    }
    seen.add(row.learner.id);

    // ---- 3. Marks ----
    const parsed = parseMarks(row.rawMarks, totalMarks);
    if (parsed.error) {
      rows.push({ ...row, status: 'invalid', note: parsed.error });
      return;
    }
    if (parsed.value === null) {
      rows.push({ ...row, status: 'blank', note: row.note ?? 'Blank, box left as it is' });
      return;
    }

    const current = (row.learner.marks || '').toLowerCase();
    row.newMarks = parsed.value;
    row.status = current === '' ? 'new' : current === parsed.value ? 'unchanged' : 'changed';
    rows.push(row);
  });

  const warning = orderMode
    ? `No Student ID or Name column, so marks are matched in class-list order (${dataRows.length} rows for ${roster.length} learners). Check each name below before applying.`
    : undefined;

  return { rows, orderMode, warning };
};

const csvCell = (v: string | number) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const displayMark = (v: string | null | undefined) =>
  !v ? '—' : v.toLowerCase() === 'x' ? 'ABS' : v;

const STATUS_STYLE: Record<RowStatus, { label: string; cls: string }> = {
  new:       { label: 'New',       cls: 'bg-green-100 text-green-700' },
  changed:   { label: 'Changed',   cls: 'bg-amber-100 text-amber-700' },
  unchanged: { label: 'Same',      cls: 'bg-gray-100 text-gray-600' },
  blank:     { label: 'Blank',     cls: 'bg-gray-100 text-gray-500' },
  invalid:   { label: 'Invalid',   cls: 'bg-red-100 text-red-700' },
  unmatched: { label: 'Not found', cls: 'bg-red-100 text-red-700' },
  ambiguous: { label: 'Unclear',   cls: 'bg-red-100 text-red-700' },
  duplicate: { label: 'Duplicate', cls: 'bg-orange-100 text-orange-700' },
};

// ==================== COMPONENT ====================

export const BulkResultsEntryModal = ({
  isOpen,
  onClose,
  students,
  totalMarks,
  classLabel,
  subject,
  examLabel,
  onApply,
}: BulkResultsEntryModalProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<'paste' | 'upload'>('paste');
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [mode, setMode] = useState<BulkApplyMode>('overwrite');
  const [problemsOnly, setProblemsOnly] = useState(false);

  // Fresh state every time the modal opens
  useEffect(() => {
    if (isOpen) {
      setSource('paste');
      setRawText('');
      setFileName('');
      setFileError('');
      setMode('overwrite');
      setProblemsOnly(false);
    }
  }, [isOpen]);

  const preview = useMemo(
    () => buildPreview(rawText, students, totalMarks),
    [rawText, students, totalMarks]
  );

  const counts = useMemo(() => {
    const c = { new: 0, changed: 0, unchanged: 0, blank: 0, problems: 0 };
    preview.rows.forEach(r => {
      if (PROBLEM_STATUSES.includes(r.status)) c.problems++;
      else c[r.status as 'new' | 'changed' | 'unchanged' | 'blank']++;
    });
    return c;
  }, [preview.rows]);

  const updates = useMemo(() => {
    const out: Record<string, string> = {};
    preview.rows.forEach(r => {
      if (!r.learner || r.newMarks === null) return;
      if (r.status === 'new' || (r.status === 'changed' && mode === 'overwrite')) {
        out[r.learner.id] = r.newMarks;
      }
    });
    return out;
  }, [preview.rows, mode]);

  const notInFile = useMemo(() => {
    const matched = new Set(preview.rows.filter(r => r.learner).map(r => r.learner!.id));
    return students.filter(s => !matched.has(s.id));
  }, [preview.rows, students]);

  const applyCount = Object.keys(updates).length;

  const handleFile = (file: File) => {
    setFileError('');
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) {
      setFileError(
        'Choose a CSV file. In Excel use File > Save As > CSV, or copy the columns and use Paste instead.'
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      setRawText(String(e.target?.result ?? ''));
      setFileName(file.name);
    };
    reader.onerror = () => setFileError('Could not read that file.');
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const header = ['No', 'Student ID', 'Name', 'Marks'];
    const lines = students.map((s, i) =>
      [i + 1, s.studentId, s.name, s.marks.toLowerCase() === 'x' ? 'X' : s.marks]
        .map(csvCell)
        .join(',')
    );
    const csv = '\uFEFF' + [header.join(','), ...lines].join('\r\n'); // BOM so Excel keeps UTF-8
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${classLabel}_${subject}_${examLabel}_marks.csv`.replace(/[^\w.-]+/g, '_');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const visibleRows = problemsOnly
    ? preview.rows.filter(r => PROBLEM_STATUSES.includes(r.status))
    : preview.rows;

  const summary = [
    { label: 'New', value: counts.new, cls: 'bg-green-50 text-green-700' },
    { label: 'Changed', value: counts.changed, cls: 'bg-amber-50 text-amber-700' },
    { label: 'Same', value: counts.unchanged, cls: 'bg-gray-50 text-gray-700' },
    { label: 'Blank', value: counts.blank, cls: 'bg-gray-50 text-gray-600' },
    {
      label: 'Problems',
      value: counts.problems,
      cls: counts.problems ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl">

          {/* Header */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Bulk results entry</h2>
              <p className="text-xs sm:text-sm text-gray-600 truncate">
                {classLabel}, {subject}, {examLabel} (out of {totalMarks})
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X size={18} className="text-gray-500" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">

            {/* Source switch + template */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex bg-gray-100 rounded-lg p-1">
                {(['paste', 'upload'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setSource(s)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      source === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {s === 'paste' ? <ClipboardPaste size={14} /> : <Upload size={14} />}
                    {s === 'paste' ? 'Paste from Excel' : 'Upload CSV'}
                  </button>
                ))}
              </div>
              <button
                onClick={downloadTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
              >
                <Download size={14} />
                Download class list template
              </button>
            </div>

            {source === 'paste' ? (
              <div>
                <textarea
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                  rows={7}
                  spellCheck={false}
                  placeholder={
                    'Copy the columns in Excel and paste them here, for example:\n\n' +
                    'Student ID\tName\tMarks\nG12A_001\tBanda Mary\t67\nG12A_002\tPhiri John\tX'
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1 text-[11px] sm:text-xs text-gray-500">
                  Student ID, Name and Marks can be in any order. Type X or ABS for absent.
                  A single column of marks is matched to the class list in order.
                </p>
              </div>
            ) : (
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center"
              >
                <FileSpreadsheet className="mx-auto mb-2 text-gray-400" size={36} />
                <p className="text-sm text-gray-600 mb-3">{fileName || 'Drag a CSV file here, or browse'}</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-sm font-medium"
                >
                  Browse files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = '';
                  }}
                />
                {fileError && <p className="mt-3 text-xs text-red-600">{fileError}</p>}
              </div>
            )}

            {preview.error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm flex gap-2">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{preview.error}</span>
              </div>
            )}

            {preview.warning && (
              <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-xs sm:text-sm flex gap-2">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{preview.warning}</span>
              </div>
            )}

            {preview.rows.length > 0 && (
              <>
                {/* Summary */}
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {summary.map(s => (
                    <div key={s.label} className={`rounded-lg px-3 py-2 ${s.cls}`}>
                      <div className="text-lg font-bold leading-tight">{s.value}</div>
                      <div className="text-[11px] sm:text-xs">{s.label}</div>
                    </div>
                  ))}
                </div>

                {notInFile.length > 0 && (
                  <p className="text-xs text-gray-600">
                    {notInFile.length} learner{notInFile.length === 1 ? ' is' : 's are'} not in the file
                    and will be left as they are:{' '}
                    <span className="text-gray-800">
                      {notInFile.slice(0, 5).map(s => s.name).join(', ')}
                      {notInFile.length > 5 ? ` and ${notInFile.length - 5} more` : ''}
                    </span>
                  </p>
                )}

                {counts.problems > 0 && (
                  <label className="inline-flex items-center gap-2 text-xs sm:text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={problemsOnly}
                      onChange={e => setProblemsOnly(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Show problem rows only ({counts.problems} will be ignored)
                  </label>
                )}

                {/* Preview table */}
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="min-w-full text-xs sm:text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Row</th>
                        <th className="px-3 py-2 text-left font-medium">In file</th>
                        <th className="px-3 py-2 text-left font-medium">Learner</th>
                        <th className="px-3 py-2 text-center font-medium">Now</th>
                        <th className="px-3 py-2 text-center font-medium">New</th>
                        <th className="px-3 py-2 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {visibleRows.map(r => {
                        const skippedByMode = mode === 'fillEmpty' && r.status === 'changed';
                        const style = STATUS_STYLE[r.status];
                        const note = skippedByMode ? 'Box already has a mark, kept' : r.note;
                        return (
                          <tr key={r.line} className={PROBLEM_STATUSES.includes(r.status) ? 'bg-red-50/40' : ''}>
                            <td className="px-3 py-2 text-gray-400 font-mono">{r.line}</td>
                            <td className="px-3 py-2">
                              <div className="text-gray-800 truncate max-w-[160px]">
                                {r.rawName || r.rawId || (preview.orderMode ? `Mark ${r.rawMarks || '(blank)'}` : '—')}
                              </div>
                              {r.rawName && r.rawId && (
                                <div className="text-[11px] text-gray-400 font-mono">{r.rawId}</div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {r.learner ? (
                                <>
                                  <div className="text-gray-900 truncate max-w-[180px]">{r.learner.name}</div>
                                  <div className="text-[11px] text-gray-400">
                                    {r.learner.studentId}
                                    {r.matchedBy === 'name' && ' (by name)'}
                                    {r.matchedBy === 'order' && ' (by order)'}
                                  </div>
                                </>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center text-gray-500">{displayMark(r.learner?.marks)}</td>
                            <td className="px-3 py-2 text-center font-medium text-gray-900">
                              {r.newMarks !== null ? displayMark(r.newMarks) : r.rawMarks || '—'}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-medium ${skippedByMode ? 'bg-gray-100 text-gray-500' : style.cls}`}>
                                {skippedByMode ? 'Kept' : style.label}
                              </span>
                              {note && <div className="text-[11px] text-gray-500 mt-0.5">{note}</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 sm:px-6 py-3 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-col gap-1 text-xs sm:text-sm text-gray-700">
              <label className="inline-flex items-center gap-2">
                <input type="radio" checked={mode === 'overwrite'} onChange={() => setMode('overwrite')} />
                Replace marks already in the table
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" checked={mode === 'fillEmpty'} onChange={() => setMode('fillEmpty')} />
                Only fill empty boxes
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 sm:flex-none px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => onApply(updates)}
                disabled={applyCount === 0}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle size={16} />
                Apply {applyCount} mark{applyCount === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkResultsEntryModal;