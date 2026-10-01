'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, errorMessage } from '@/lib/api';
import { chosenFile, uploadFile } from '@/lib/upload';

export interface SettingsState {
  error?: string;
  success?: string;
}

/** Trimmed, and absent rather than empty — an empty string is not a value. */
function text(formData: FormData, key: string): string | undefined {
  const value = String(formData.get(key) ?? '').trim();
  return value === '' ? undefined : value;
}

/**
 * The school's own record.
 *
 * Everything here is what the school prints on things: the address on a
 * letterhead, the name and logo on an ID card. It cannot reach the school code,
 * the status or the validity — see updateSchoolProfileSchema for why each one
 * is out of reach.
 */
export async function updateSchoolProfileAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  try {
    await apiFetch('/school/profile', {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: {
        name: text(formData, 'name'),
        email: text(formData, 'email'),
        phone: text(formData, 'phone'),
        addressLine1: text(formData, 'addressLine1'),
        addressLine2: text(formData, 'addressLine2'),
        city: text(formData, 'city'),
        state: text(formData, 'state'),
        postalCode: text(formData, 'postalCode'),
        principalName: text(formData, 'principalName'),
        primaryColor: text(formData, 'primaryColor'),
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save the school details.') };
  }

  refresh();
  return { success: 'Saved.' };
}

export async function updateIdCardAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  try {
    await apiFetch('/school/profile', {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: {
        idCardSize: text(formData, 'idCardSize'),
        idCardLayout: text(formData, 'idCardLayout'),
        // Checkboxes: absent means off, and every one is sent so unticking works.
        idCardShowBloodGroup: formData.get('idCardShowBloodGroup') === 'on',
        idCardShowGuardianPhone: formData.get('idCardShowGuardianPhone') === 'on',
        idCardShowAddress: formData.get('idCardShowAddress') === 'on',
        idCardShowDateOfBirth: formData.get('idCardShowDateOfBirth') === 'on',
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save the card settings.') };
  }

  refresh();
  return { success: 'Saved. New cards use these settings.' };
}

/**
 * The logo, in the two steps every attachment here uses.
 *
 * The upload route owns the sniffing and the size caps; this only records which
 * file the school wears. An empty submit clears it.
 */
export async function uploadSchoolLogoAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const file = chosenFile(formData, 'logo');

  try {
    const fileId = file ? await uploadFile(file) : null;
    await apiFetch('/school/logo', {
      method: 'PUT',
      redirectOnAuthFailure: false,
      body: { fileId },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save the logo.') };
  }

  refresh();
  return {
    success: file
      ? 'Logo saved. It appears on the sign-in screen and on ID cards.'
      : 'Logo removed.',
  };
}

/**
 * The principal's signature, printed on report cards and certificates. Same
 * two steps as the logo; an empty submit takes it off.
 */
export async function uploadPrincipalSignatureAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const file = chosenFile(formData, 'signature');

  try {
    const fileId = file ? await uploadFile(file) : null;
    await apiFetch('/school/principal-signature', {
      method: 'PUT',
      redirectOnAuthFailure: false,
      body: { fileId },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save the signature.') };
  }

  refresh();
  return {
    success: file
      ? 'Signature saved. Report cards and certificates carry it from now on.'
      : 'Signature removed.',
  };
}

/**
 * The sign-in screen reads the logo and colour by school code and caches them,
 * and an ID card is drawn from the same row.
 */
function refresh(): void {
  revalidatePath('/school/settings');
  revalidatePath('/school');
}
