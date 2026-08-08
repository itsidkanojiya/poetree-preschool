'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, errorMessage } from '@/lib/api';
import type { ActionState } from '../schools/actions';

function optionalNumber(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? '').trim();
  if (raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createPlanAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const rupees = Number(String(formData.get('priceInRupees') ?? '0'));

  try {
    await apiFetch('/publication/plans', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        code: String(formData.get('code') ?? '').trim(),
        name: String(formData.get('name') ?? '').trim(),
        description: String(formData.get('description') ?? '').trim() || undefined,
        maxStudents: optionalNumber(formData, 'maxStudents'),
        maxTeachers: optionalNumber(formData, 'maxTeachers'),
        // The API stores paise so nothing rounds through a float.
        priceInPaise: Math.round((Number.isFinite(rupees) ? rupees : 0) * 100),
        billingPeriodMonths: optionalNumber(formData, 'billingPeriodMonths') ?? 12,
        features: String(formData.get('features') ?? '')
          .split(',')
          .map((feature) => feature.trim())
          .filter(Boolean),
        isActive: true,
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not create the plan.') };
  }

  revalidatePath('/publication/plans');
  return { success: 'Plan created.' };
}

export async function togglePlanAction(planId: string, isActive: boolean): Promise<void> {
  await apiFetch(`/publication/plans/${planId}`, {
    method: 'PATCH',
    body: { isActive },
  });
  revalidatePath('/publication/plans');
}
