import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { apiFetch, errorMessage } from '@/lib/api';

/**
 * Where Google sends the office back after they allow the gallery to use the
 * school's Google Drive.
 *
 * It grants nothing by itself: the API checks that this school's own
 * administrator started the round trip before it keeps anything. Registered
 * on the Google OAuth client exactly as this address, and set on the API as
 * GOOGLE_DRIVE_REDIRECT_URI.
 */
export async function GET(request: NextRequest): Promise<never> {
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const state = params.get('state');

  // "Cancel" on Google's page, or anything else that is not a yes.
  if (params.get('error') || !code || !state) {
    redirect('/school/gallery?drive=cancelled');
  }

  let outcome: string;
  try {
    await apiFetch('/gallery/drive/callback', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: { code, state },
    });
    outcome = 'drive=connected';
  } catch (error) {
    const message = errorMessage(error, 'Google Drive could not be connected.').slice(0, 300);
    outcome = `drive=error&message=${encodeURIComponent(message)}`;
  }

  redirect(`/school/gallery?${outcome}`);
}
