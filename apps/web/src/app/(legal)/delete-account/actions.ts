'use server';

import { isApiErrorBody, type AccountDeletedResponse } from '@poetree/shared';
import { API_BASE_URL } from '@/lib/api';

export interface DeleteAccountState {
  error?: string;
  /** Kept so the form does not empty itself after a refusal. */
  identifier?: string;
  /**
   * The schools this login exists at, when the API cannot tell which account
   * is meant — as on the sign-in page.
   */
  schoolCodes?: string[];
  deleted?: Pick<AccountDeletedResponse, 'schoolName' | 'registrationOnly'>;
}

export async function deleteAccountAction(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const identifier = String(formData.get('identifier') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const schoolCode = String(formData.get('schoolCode') ?? '').trim();
  const confirmed = formData.get('confirm') === 'on';

  if (!identifier || !password) {
    return {
      identifier,
      error: 'Enter the phone number or email address you sign in with, and your password.',
    };
  }
  if (!confirmed) {
    return { identifier, error: 'Tick the box to confirm that you want the account deleted.' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/public/account-deletion`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier, password, ...(schoolCode ? { schoolCode } : {}) }),
      cache: 'no-store',
    });

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message = isApiErrorBody(payload)
        ? payload.error.message
        : 'The account could not be deleted. Please try again.';

      const codes =
        isApiErrorBody(payload) && response.status === 409
          ? (payload.error.details as { schoolCodes?: unknown })?.schoolCodes
          : undefined;

      return {
        identifier,
        error: message,
        ...(Array.isArray(codes) && codes.length > 0 ? { schoolCodes: codes.map(String) } : {}),
      };
    }

    const data = payload as AccountDeletedResponse;
    return { deleted: { schoolName: data.schoolName, registrationOnly: data.registrationOnly } };
  } catch {
    return { identifier, error: 'Cannot reach the server. Please try again in a moment.' };
  }
}
