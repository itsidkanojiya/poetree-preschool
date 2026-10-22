'use server';

import type { AppPicturesImport } from '@poetree/shared';
import { apiFetch, errorMessage } from '@/lib/api';

/**
 * Brings the app's own letter and number pictures into the library. Safe to
 * press twice: the API adds nothing it already has.
 */
export async function importAppPicturesAction(): Promise<
  { result: AppPicturesImport } | { error: string }
> {
  try {
    const result = await apiFetch<AppPicturesImport>('/publication/assets/app-pictures', {
      method: 'POST',
      redirectOnAuthFailure: false,
    });
    return { result };
  } catch (error) {
    return { error: errorMessage(error, 'The app’s pictures could not be added.') };
  }
}
