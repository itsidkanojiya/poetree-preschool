'use server';

import type { Paginated, StudentSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';

export interface SearchHit {
  id: string;
  name: string;
  admissionNo: string;
  classroom: string | null;
  parent: string | null;
}

/**
 * A child, found by their name, admission or GR number, or a parent's name or
 * mobile — the same search the Students page runs, a few results at a time.
 */
export async function searchChildrenAction(query: string): Promise<SearchHit[]> {
  const search = query.trim().slice(0, 80);
  if (search.length < 2) return [];
  try {
    const found = await apiFetch<Paginated<StudentSummary>>('/students', {
      query: { search, pageSize: 8 },
      redirectOnAuthFailure: false,
    });
    return found.items.map((student) => {
      const parent = student.guardians.find((g) => g.isPrimary) ?? student.guardians[0];
      return {
        id: student.id,
        name: student.fullName,
        admissionNo: student.admissionNo,
        classroom: student.classroom
          ? `${student.classroom.standard} ${student.classroom.section}`
          : null,
        parent: parent ? `${parent.name}${parent.phone ? ` · ${parent.phone}` : ''}` : null,
      };
    });
  } catch {
    return [];
  }
}
