// @/pages/admin/workspaces/ResultsSba.tsx
//
// Admin: "Results & SBA" — three views of assessment, each its own tab:
//
//   Results Monitor   /dashboard/admin/results-monitor   who has entered marks
//   Results Analysis  /dashboard/admin/results-analysis  how learners performed
//   SBA Overview      /dashboard/admin/sba-overview      School-Based Assessment
//
// Each tab is the existing page with its own data and filters; nothing is
// shared between them (they read different data). Results Data Check (linked
// from the monitor), Report Cards and Exam Management stay separate pages.

import { lazy } from 'react';
import { Activity, BarChart3, ClipboardCheck } from 'lucide-react';
import { TabbedWorkspace, type WorkspaceTab } from '@/components/workspace/TabbedWorkspace';

const ResultsEntryMonitor = lazy(() => import('../ResultsEntryMonitor'));
const AdminResultsAnalysis = lazy(() => import('../AdminResultsAnalysis'));
const SbaSchoolOverview = lazy(() => import('../SbaSchoolOverview'));

export const RESULTS_SBA_PATHS = {
  monitor: '/dashboard/admin/results-monitor',
  analysis: '/dashboard/admin/results-analysis',
  sba: '/dashboard/admin/sba-overview',
} as const;

const tabs: WorkspaceTab[] = [
  { id: 'monitor', label: 'Results Monitor', icon: Activity, paths: [RESULTS_SBA_PATHS.monitor], render: () => <ResultsEntryMonitor /> },
  { id: 'analysis', label: 'Results Analysis', icon: BarChart3, paths: [RESULTS_SBA_PATHS.analysis], render: () => <AdminResultsAnalysis /> },
  { id: 'sba', label: 'SBA Overview', icon: ClipboardCheck, paths: [RESULTS_SBA_PATHS.sba], render: () => <SbaSchoolOverview /> },
];

export default function ResultsSbaWorkspace() {
  return (
    <TabbedWorkspace
      navId="results-sba"
      title="Results & SBA"
      description="Track which marks are still to be entered, analyse term results, and follow School-Based Assessment."
      tabs={tabs}
    />
  );
}
