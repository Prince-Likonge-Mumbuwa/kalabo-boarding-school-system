// Timetable builder → Curriculum → Bulk import: the class allocation (which
// subjects each class takes) from a CSV file or rows pasted from Excel —
// just two columns, Class and Subject. Periods and other settings are set in
// the Curriculum tab. The result is shown first; applying it puts it in the
// tab as unsaved changes to review and save.
import { useRef, useState } from 'react';
import { Download, FileUp, Upload, X } from 'lucide-react';
import {
  DEFAULT_REQUIREMENT,
  curriculumTemplateRows,
  importCurriculum,
  parseTable,
  toCsv,
  type ImportMode,
  type ImportResult,
} from '@/services/timetableGenerator/curriculumImport';
import type { TimetableConfig } from '@/services/timetableGenerator/types';
import { Btn, Card, Notice, useBuilder } from './shared';

export function CurriculumImportCard({
  cfg,
  onApply,
  onClose,
}: {
  cfg: TimetableConfig;
  onApply: (next: TimetableConfig, result: ImportResult) => void;
  onClose: () => void;
}) {
  const { inputs } = useBuilder();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<ImportMode>('replace');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [readError, setReadError] = useState('');

  const ctx = { config: cfg, classes: inputs.classes, subjectNames: inputs.subjectNames };
  const check = (t = text, m = mode) => {
    setResult(t.trim() ? importCurriculum(parseTable(t), ctx, m) : null);
  };

  const onFile = (f: File | undefined) => {
    setReadError('');
    if (!f) return;
    if (!/\.(csv|txt|tsv)$/i.test(f.name)) {
      setReadError('Choose a CSV file. In Excel: File → Save As → CSV (Comma delimited). Or copy the rows and paste them below.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const t = String(reader.result ?? '');
      setText(t);
      setFileName(f.name);
      check(t);
    };
    reader.onerror = () => setReadError('Could not read the file.');
    reader.readAsText(f);
  };

  const downloadTemplate = () => {
    const rows = curriculumTemplateRows({ ...ctx, slots: inputs.slots });
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'class-allocation-curriculum.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const canApply = !!result && result.rowsUsed > 0;

  return (
    <Card
      title="Bulk import — class allocation"
      actions={
        <button type="button" aria-label="Close bulk import" onClick={onClose} className="rounded p-1.5 text-gray-500 hover:bg-gray-100">
          <X size={16} />
        </button>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-gray-700">
          One row per class and subject, with two columns: <span className="font-medium">Class</span> and{' '}
          <span className="font-medium">Subject</span>.
        </p>
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-gray-600">
          <li>A class takes the subjects listed for it. A whole level (<em>Form 1</em>, <em>Grade 10</em>) can be named instead of a class.</li>
          <li>
            Periods a week, doubles, time of day and room are set in the table below after applying: a subject keeps the setting it has
            now; a new subject starts at {DEFAULT_REQUIREMENT.min} periods a week.
          </li>
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          <Btn onClick={downloadTemplate}><Download size={14} /> Download template (current classes)</Btn>
          <Btn onClick={() => fileRef.current?.click()}><FileUp size={14} /> Choose CSV file</Btn>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.tsv,text/csv"
            aria-label="CSV file"
            className="hidden"
            onChange={e => {
              onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {fileName && <span className="text-xs text-gray-600">{fileName}</span>}
        </div>
        {readError && <Notice tone="error">{readError}</Notice>}

        <label className="block">
          <span className="mb-1 block text-xs text-gray-600">…or paste the rows from Excel / Google Sheets (with the heading row)</span>
          <textarea
            aria-label="Paste rows"
            value={text}
            onChange={e => {
              setText(e.target.value);
              setFileName('');
              setResult(null);
            }}
            rows={6}
            spellCheck={false}
            placeholder={'Class\tSubject\nForm 1A\tEnglish\nForm 1A\tMathematics\nForm 1B\tFrench'}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 font-mono text-xs"
          />
        </label>

        <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
          <legend className="sr-only">Import mode</legend>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => { setMode('replace'); if (result) check(text, 'replace'); }} />
            Replace the curriculum of the levels in the file
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="import-mode" checked={mode === 'merge'} onChange={() => { setMode('merge'); if (result) check(text, 'merge'); }} />
            Only add or update the subjects in the file
          </label>
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => check()} disabled={!text.trim()}><Upload size={14} /> Check rows</Btn>
          <Btn variant="primary" disabled={!canApply} onClick={() => result && onApply(result.config, result)}>
            Apply to curriculum
          </Btn>
        </div>

        {result && (
          <div className="space-y-2" aria-live="polite">
            <Notice tone={result.errors.length ? (result.rowsUsed ? 'warn' : 'error') : 'ok'}>
              {result.rowsUsed} of {result.rowsRead} row{result.rowsRead === 1 ? '' : 's'} can be imported
              {result.errors.length > 0 && ` — ${result.errors.length} with problems will be skipped`}.
            </Notice>
            {result.levels.length > 0 && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left uppercase text-gray-500">
                    <th className="py-1 pr-2">Level</th>
                    <th className="px-2">Classes</th>
                    <th className="px-2">Subjects</th>
                    <th className="px-2">Class exceptions</th>
                  </tr>
                </thead>
                <tbody>
                  {result.levels.map(l => (
                    <tr key={l.key} className="border-t border-gray-100">
                      <td className="py-1 pr-2 font-medium text-gray-900">{l.label}</td>
                      <td className="px-2">{l.classes}</td>
                      <td className="px-2">{l.subjects}</td>
                      <td className="px-2">{l.exceptions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {result.newRooms.length > 0 && <p className="text-xs text-gray-700">New special rooms: {result.newRooms.join(', ')}.</p>}
            {result.errors.length > 0 && (
              <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800" aria-label="Rows with problems">
                {result.errors.map((e, i) => <li key={i}>Line {e.line}: {e.message}</li>)}
              </ul>
            )}
            {result.warnings.length > 0 && (
              <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900" aria-label="Notes">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
