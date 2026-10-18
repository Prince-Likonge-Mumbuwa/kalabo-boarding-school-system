/** A teacher as the HoD screens need them (from the teachers list). */
export interface HodMember {
  id: string;
  name: string;
  email?: string;
  departments?: string[];
  subjects?: string[];
  status?: string;
  /** Form class (users.formClassId). */
  assignedClassId?: string | null;
  assignedClassName?: string | null;
}
