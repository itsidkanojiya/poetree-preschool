'use client';

import { useActionState } from 'react';
import type { GoogleDriveSettings } from '@poetree/shared';
import { Field, FormError, Input, PasswordInput, SubmitButton } from '@/components/ui/form';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Toast } from '@/components/ui/toast';
import { clearGoogleDriveAction, saveGoogleDriveAction, type GoogleDriveState } from './actions';

/**
 * Poetree's Google sign-in: the OAuth client from Poetree's Google Cloud
 * project. Entered once; every school connects its own Drive through it.
 */
export function GoogleDriveForm({
  settings,
  suggestedRedirectUri,
}: {
  settings: GoogleDriveSettings;
  /** This portal's own callback page, for a first setup. */
  suggestedRedirectUri: string;
}) {
  const [state, formAction] = useActionState<GoogleDriveState, FormData>(saveGoogleDriveAction, {});

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <Toast message={state.success} />

      <Field
        label="Authorized redirect URI"
        required
        hint="Copy this into the OAuth client in Google Cloud exactly as it is."
      >
        <Input
          name="redirectUri"
          required
          defaultValue={settings.redirectUri ?? suggestedRedirectUri}
          className="font-mono text-xs"
        />
      </Field>

      <Field label="Client ID" required hint="Ends in .apps.googleusercontent.com">
        <Input
          name="clientId"
          required
          defaultValue={settings.clientId ?? ''}
          placeholder="1234567890-abc….apps.googleusercontent.com"
          className="font-mono text-xs"
          autoComplete="off"
        />
      </Field>

      <Field
        label="Client secret"
        required={!settings.clientSecretSet}
        hint={
          settings.clientSecretSet
            ? 'A secret is saved. Leave this blank to keep it.'
            : 'Shown next to the Client ID in Google Cloud. Kept sealed; never shown again.'
        }
      >
        <PasswordInput
          name="clientSecret"
          required={!settings.clientSecretSet}
          placeholder={settings.clientSecretSet ? '••••••••  saved' : 'GOCSPX-…'}
          autoComplete="new-password"
        />
      </Field>

      {settings.configured && settings.schools.length > 0 && (
        <p className="text-xs text-slate-500">
          Changing the Client ID means every school connects its Drive again — their access was
          given to the old one. Their photos stay in their Drives.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
        {settings.configured && (
          <ConfirmButton
            action={clearGoogleDriveAction}
            label="Turn off"
            title="Turn off Google Drive?"
            body="New gallery photos will be kept on Poetree’s server again. Photos already in schools’ Drives stay there, but the app cannot show them until this is set up again with the same Client ID."
            confirmLabel="Turn it off"
          />
        )}
      </div>
    </form>
  );
}
