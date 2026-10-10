import type { Period } from '@/types/timetable';

const P = (order: number, name: string, kind: Period['kind'], s: string, e: string): Period => ({
  id: `p_${name}`, order, name, kind, startTime: s, endTime: e, academicYear: 2026, isActive: true,
});
/** Default bell schedule: lessons P1–P8 (40 min), one unnumbered break, ends 13:00. */
export const PERIODS: Period[] = [
  P(1, 'P1', 'lesson', '07:20', '08:00'), P(2, 'P2', 'lesson', '08:00', '08:40'),
  P(3, 'P3', 'lesson', '08:40', '09:20'), P(4, 'P4', 'lesson', '09:20', '10:00'),
  P(0, 'Break', 'break', '10:00', '10:20'),
  P(5, 'P5', 'lesson', '10:20', '11:00'), P(6, 'P6', 'lesson', '11:00', '11:40'),
  P(7, 'P7', 'lesson', '11:40', '12:20'), P(8, 'P8', 'lesson', '12:20', '13:00'),
];
