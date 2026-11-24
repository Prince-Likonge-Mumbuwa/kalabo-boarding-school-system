// @/pages/teacher/ai/EFileDocument.tsx — one document from the teacher's
// eFile on school letterhead: print / PDF, download for Word, copy, delete,
// or make another of the same kind. A lesson plan also offers "Evaluate
// lesson" for after it has been taught (LessonEvaluationDialog), which writes
// the plan's Lesson Evaluation section; when the evaluation shows the lesson
// was not fully delivered, FollowUpPanel offers the remedial or continuation lesson.
// "PDF" downloads it with pdf-lib (services/pdf/efileExport.ts).
// Address: /dashboard/teacher/ai/efile/<id>
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ClipboardCheck, Download, FileX, Loader2, Plus, Trash2 } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { AiGate } from '@/components/ai/AiGate';
import { featureByKey } from '@/components/ai/aiFeatures';
import { DocumentActions, DocumentPaper, headerFrom, type DocumentPaperHandle } from '@/components/ai/DocumentPaper';
import { Card, EmptyState, Skeleton } from '@/components/ai/ui';
import { LessonEvaluationDialog } from '@/components/ai/LessonEvaluationDialog';
import { FollowUpPanel } from '@/components/ai/FollowUpPanel';
import { sectionOfFeature, type EFileDocument } from '@/types/ai';
import { Button } from '@/components/ui/button';
import { teacherAi } from '@/services/aiApi';
import { cn } from '@/lib/utils';

function Document({ id }: { id: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const paper = useRef<DocumentPaperHandle>(null);
  const [error, setError] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const { data, isLoading, error: loadError } = useQuery({ queryKey: ['efile', id], queryFn: () => teacherAi.efileGet(id), retry: false });

  const remove = async () => {
    if (!data || !window.confirm(`Delete "${data.title}" from your eFile? This cannot be undone.`)) return;
    try {
      await teacherAi.efileDelete(id);
      await queryClient.invalidateQueries({ queryKey: ['efile'] });
      navigate(`/dashboard/teacher/ai/efile?section=${sectionOfFeature(data.feature).id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (isLoading)
    return <div className="mx-auto mt-6 max-w-[860px] rounded-2xl bg-white p-10 ring-1 ring-gray-200"><Skeleton className="h-14 w-2/3" /><Skeleton className="mt-6 h-20 w-full" /><Skeleton className="mt-6 h-40 w-full" /></div>;
  if (loadError || !data)
    return <Card padded={false} className="mt-6"><EmptyState icon={<FileX size={22} />} title="Document not found">{(loadError as Error)?.message ?? 'It may have been deleted.'}</EmptyState></Card>;

  const tool = featureByKey(data.feature);
  // A PDF made with pdf-lib, like the report cards (letterhead, tables, figures and maths as on screen).
  const downloadPdf = async () => {
    setPdfBusy(true); setError('');
    try { await (await import('@/services/pdf/efileExport')).downloadDocumentPdf(data); } catch (err) { setError((err as Error).message || 'The PDF could not be made.'); } finally { setPdfBusy(false); }
  };
  const isPlan = data.feature === 'lessonPlan';
  const saved = (document: EFileDocument) => {
    queryClient.setQueryData(['efile', id], document);
    void queryClient.invalidateQueries({ queryKey: ['efile'] });
  };
  const Icon = tool.icon;
  return (
    <div className="mt-2 space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', tool.tone.icon)}><Icon size={22} /></span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-snug tracking-tight text-gray-900 sm:text-2xl">{data.title}</h1>
            <p className="mt-1 text-sm text-gray-500">{tool.label} · generated {new Date(data.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={downloadPdf} disabled={pdfBusy} className="h-9 rounded-xl bg-blue-600 font-semibold hover:bg-blue-700">
            {pdfBusy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Download size={16} className="mr-2" />} PDF
          </Button>
          <DocumentActions paper={paper} content={data.content} />
          <Link to={`/dashboard/teacher/ai/${tool.slug}`} className="inline-flex h-9 items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 hover:bg-gray-50"><Plus size={16} /> Another</Link>
          <Button size="sm" variant="ghost" onClick={remove} className="h-9 rounded-xl text-red-700 hover:bg-red-50 hover:text-red-800"><Trash2 size={16} className="mr-2" /> Delete</Button>
        </div>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</p>}
      {isPlan && (
        <div className={cn('flex flex-col gap-3 rounded-2xl px-4 py-3.5 ring-1 ring-inset sm:flex-row sm:items-center',
          data.evaluation ? 'bg-emerald-50/70 ring-emerald-200' : 'bg-blue-50/70 ring-blue-200')}>
          <ClipboardCheck size={20} className={cn('hidden shrink-0 sm:block', data.evaluation ? 'text-emerald-600' : 'text-blue-600')} />
          <p className="flex-1 text-sm text-gray-800">
            {data.evaluation
              ? <>Evaluated on {new Date(data.evaluation.evaluatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. The evaluation is in the plan below.</>
              : <><strong className="font-semibold">Taught this lesson?</strong> Answer a few quick questions and the AI writes the Lesson Evaluation for you.</>}
          </p>
          <Button onClick={() => setEvaluating(true)} variant={data.evaluation ? 'outline' : 'default'}
            className={cn('h-10 rounded-xl', !data.evaluation && 'bg-blue-600 font-semibold hover:bg-blue-700')}>
            {data.evaluation ? 'Evaluate again' : 'Evaluate lesson'}
          </Button>
        </div>
      )}
      {/* After the evaluation: remedial or continuation lesson, if it calls for one. */}
      {isPlan && <FollowUpPanel document={data} />}
      {isPlan && evaluating && <LessonEvaluationDialog document={data} open={evaluating} onOpenChange={setEvaluating} onSaved={saved} />}
      <DocumentPaper ref={paper} header={headerFrom(data.feature, data.title, data.inputs)} content={data.content} sources={data.sources} />
    </div>
  );
}

export default function EFileDocument() {
  const { id = '' } = useParams();
  return (
    <DashboardLayout activeTab="ai-tools">
      <div className="mx-auto max-w-7xl">
        <Link to="/dashboard/teacher/ai/efile" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
          <ArrowLeft size={16} /> eFile
        </Link>
        {/* Reading saved documents needs access, not the eFile switch (see AiGate). */}
        <AiGate>{() => <Document id={id} />}</AiGate>
      </div>
    </DashboardLayout>
  );
}
