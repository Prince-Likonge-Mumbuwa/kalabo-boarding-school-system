// Timetable Builder for HoDs an admin allowed to generate timetables.
// Same screens as the admin's; publishing stays with the admin.
import { CalendarRange, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useMyHodRole } from '@/hooks/useDepartments';
import { useTimetablerRole } from '@/hooks/useTimetableBuilder';
import TimetableBuilder from '@/pages/admin/TimetableBuilder';

export default function TimetableBuilderPage() {
  const { role, isLoading: hodLoading } = useMyHodRole();
  const { isTimetabler, isLoading } = useTimetablerRole();
  return (
    <DashboardLayout activeTab="timetable-builder">
      {isLoading || hodLoading ? (
        <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Loading…</p>
      ) : role && isTimetabler ? (
        <TimetableBuilder />
      ) : (
        <div className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center">
          <CalendarRange className="mx-auto mb-2 text-gray-400" size={32} />
          <h1 className="font-semibold text-gray-900">Timetable Builder</h1>
          <p className="mt-1 text-sm text-gray-600">Only administrators and the Heads of Department they choose can generate timetables.</p>
        </div>
      )}
    </DashboardLayout>
  );
}
