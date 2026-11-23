'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, errorMessage } from '@/lib/api';
import { ID } from '@/lib/document-proxy';
import { isFrequency, type FrequencyValue } from './frequencies';

export interface StructureState {
  error?: string;
  success?: string;
}

/** A fee head's code, made from its name: "Annual charges" → ANNUAL_CHARGES. */
const codeFrom = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);

/** A kind of fee the school charges: Tuition, Admission, Transport… */
export async function addFeeHeadAction(
  _prev: StructureState,
  formData: FormData,
): Promise<StructureState> {
  const name = String(formData.get('headName') ?? '').trim();
  if (name.length < 2) return { error: 'Give the fee a name, e.g. Tuition or Admission.' };
  const code = codeFrom(name);
  if (!code) return { error: 'Use letters or numbers in the name.' };

  try {
    await apiFetch('/fees/heads', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: { code, name },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not add that fee.') };
  }
  revalidatePath('/school/fees/structure');
  return { success: `${name} added. Set its amount for each standard below.` };
}

/**
 * What one standard pays this year: an amount and how often, per fee head.
 * A head left at 0 is not charged to this standard.
 */
export async function saveStructureAction(
  academicYearId: string,
  classLevelId: string,
  standardName: string,
  _prev: StructureState,
  formData: FormData,
): Promise<StructureState> {
  if (!ID.test(academicYearId) || !ID.test(classLevelId)) return { error: 'Not a standard.' };

  const items: Array<{ feeHeadId: string; amountInPaise: number; frequency: FrequencyValue }> = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('amount-')) continue;
    const feeHeadId = key.slice('amount-'.length);
    if (!ID.test(feeHeadId)) continue;
    const rupees = Number(String(value).trim() || '0');
    if (!Number.isFinite(rupees) || rupees < 0) {
      return { error: 'An amount has to be a number of rupees, 0 or more.' };
    }
    if (rupees === 0) continue;
    const frequency = String(formData.get(`frequency-${feeHeadId}`) ?? 'ANNUAL');
    if (!isFrequency(frequency)) {
      return { error: 'Choose how often each fee is charged.' };
    }
    items.push({ feeHeadId, amountInPaise: Math.round(rupees * 100), frequency });
  }
  if (items.length === 0) return { error: `Enter at least one amount for ${standardName}.` };

  try {
    await apiFetch('/fees/structures', {
      method: 'PUT',
      redirectOnAuthFailure: false,
      body: { academicYearId, classLevelId, name: standardName, items },
    });
  } catch (error) {
    return { error: errorMessage(error, `Could not save the ${standardName} fees.`) };
  }
  revalidatePath('/school/fees/structure');
  revalidatePath('/school/fees/plans');
  return { success: `${standardName} fees saved.` };
}
