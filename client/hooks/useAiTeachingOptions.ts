// @/hooks/useAiTeachingOptions.ts — the classes and subjects a teacher can
// pick in the AI Tools forms. They come from useTeacherClasses, the same
// Firebase data Results Entry uses (class slots), so a teacher only sees the
// classes and subjects they are assigned.
//
// For each class it works out the curriculum level from the class name
// ("Form 3A" -> "Form 3") and marks which subjects have curriculum material
// on the AI server, so subjects without material can be shown but not chosen.
import { useMemo } from 'react';
import { useTeacherClasses } from '@/hooks/useTeacherClasses';
import { looseSubjectKey } from '@/services/subjectMatch';
import { levelOfClass, type CatalogEntry, type Level } from '@/types/ai';

const FORM_TEACHER = 'form-teacher'; // the Form Teacher slot is a duty, not a subject

export interface AiSubjectOption {
  /** The school's standard subject name, e.g. "ICT" (what curriculum documents are labelled with). */
  subject: string;
  /** True when the AI server has a curriculum document for this subject at this class's level. */
  hasMaterial: boolean;
}

export interface AiClassOption {
  classId: string;
  className: string;
  /** null when the class name does not say which form or grade it is. */
  level: Level | null;
  subjects: AiSubjectOption[];
}

export function useAiTeachingOptions(catalog: CatalogEntry[]) {
  const { data, isLoading, error } = useTeacherClasses();

  const classes = useMemo<AiClassOption[]>(() => {
    // Subject + level pairs the AI server can serve, compared the forgiving way (case, "&", spaces).
    const available = new Set(catalog.map((c) => `${looseSubjectKey(c.subject)}|${c.level}`));
    return (data ?? [])
      .map((c) => {
        const level = levelOfClass(c.className);
        const seen = new Set<string>();
        const subjects: AiSubjectOption[] = [];
        for (const s of c.subjects) {
          if (s.normalizedSubjectId === FORM_TEACHER) continue;
          // normalizedSubjectId is the standard name ("Computer Studies" is stored as "ICT").
          const subject = s.normalizedSubjectId || s.subject;
          if (!subject || seen.has(subject)) continue; // owner and cover of the same subject
          seen.add(subject);
          subjects.push({ subject, hasMaterial: !!level && available.has(`${looseSubjectKey(subject)}|${level}`) });
        }
        return { classId: c.classId, className: c.className, level, subjects };
      })
      .filter((c) => c.subjects.length > 0)
      // A to Z, with classes whose level can't be read from the name at the end.
      .sort((a, b) => Number(!a.level) - Number(!b.level) || a.className.localeCompare(b.className, undefined, { numeric: true }));
  }, [data, catalog]);

  return { classes, isLoading, error };
}
