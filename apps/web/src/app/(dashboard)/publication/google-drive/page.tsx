import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { GoogleDriveSettings } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, Notice, PageHeader, Pill } from '@/components/ui/layout';
import { TCell, THead, TRow, Table } from '@/components/ui/table';
import { GoogleDriveForm } from './forms';

export const metadata: Metadata = { title: 'Google Drive · Poetree' };

/** This portal's own callback page, as the browser reached it. */
async function callbackAddress(): Promise<string> {
  const incoming = await headers();
  const host = incoming.get('x-forwarded-host') ?? incoming.get('host') ?? 'localhost:3200';
  const protocol =
    incoming.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${protocol}://${host}/school/gallery/drive/callback`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Every school keeps its gallery photos in its own Google Drive. What is set
 * here is Poetree's Google sign-in, once for the whole platform — it tells
 * Google "this is Poetree" — and each school then connects its own Drive
 * through it from its Gallery page. The schools that have are listed below.
 */
export default async function GoogleDrivePage() {
  const [settings, suggestedRedirectUri] = await Promise.all([
    apiFetch<GoogleDriveSettings>('/publication/google-drive'),
    callbackAddress(),
  ]);

  return (
    <>
      <PageHeader
        title="Google Drive"
        description="Each school keeps its gallery photos in its own Google Drive. Set up Poetree’s Google sign-in once, here."
      />

      <div className="mb-5">
        {settings.configured ? (
          <Notice tone="success" title="Set up">
            {settings.schools.length === 0
              ? 'No school has connected its Drive yet. Each school does it from Gallery → Connect Google Drive.'
              : `${settings.schools.length} ${
                  settings.schools.length === 1 ? 'school has' : 'schools have'
                } connected their own Drive.`}
          </Notice>
        ) : (
          <Notice tone="info" title="Not set up yet">
            Gallery photos are kept on Poetree’s server until this is set up and each school
            connects its Drive.
          </Notice>
        )}
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Card
          title="Poetree’s Google sign-in"
          description="One for every school. It tells Google this is Poetree; each school still uses its own Google account and its own Drive."
        >
          <GoogleDriveForm settings={settings} suggestedRedirectUri={suggestedRedirectUri} />
        </Card>

        <Card
          title="Getting these from Google"
          description="Once, in Google Cloud. All of it is free."
        >
          <ol className="list-decimal space-y-2.5 pl-5 text-sm text-slate-600">
            <li>
              Open{' '}
              <a
                href="https://console.cloud.google.com/"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-navy-700 underline"
              >
                Google Cloud Console
              </a>{' '}
              and create a project, for example “Poetree”.
            </li>
            <li>
              <span className="font-medium text-navy-950">APIs &amp; Services → Library</span>: find{' '}
              <span className="font-medium text-navy-950">Google Drive API</span> and enable it.
            </li>
            <li>
              <span className="font-medium text-navy-950">OAuth consent screen</span>: External, app
              name Poetree. Add the scopes <code className="text-xs">openid</code>,{' '}
              <code className="text-xs">email</code> and{' '}
              <code className="text-xs">…/auth/drive.file</code>. Then{' '}
              <span className="font-medium text-navy-950">Publish app</span> — left in Testing,
              schools lose access after 7 days.
            </li>
            <li>
              <span className="font-medium text-navy-950">
                Credentials → Create credentials → OAuth client ID
              </span>
              , type Web application. Under Authorized redirect URIs, paste the address from the
              form.
            </li>
            <li>Copy the Client ID and Client secret it shows into the form, and save.</li>
          </ol>
        </Card>
      </div>

      <Card
        title="Schools’ Google Drives"
        description="Each school’s own Drive, connected by its office from the Gallery page."
        className="mt-5"
      >
        {settings.schools.length === 0 ? (
          <EmptyState
            title="No school has connected a Drive"
            description="Once this is set up, a school’s office connects its Drive from Gallery → Connect Google Drive."
          />
        ) : (
          <Table>
            <THead
              columns={[
                'School',
                'Google account',
                { label: 'Photos in Drive', numeric: true },
                'Connected',
                'State',
              ]}
            />
            <tbody>
              {settings.schools.map((school) => (
                <TRow key={school.schoolId}>
                  <TCell className="font-medium text-navy-950">{school.schoolName}</TCell>
                  <TCell>{school.googleEmail}</TCell>
                  <TCell numeric>{school.photos.toLocaleString('en-IN')}</TCell>
                  <TCell>{formatDate(school.connectedAt)}</TCell>
                  <TCell>
                    {school.broken ? (
                      <Pill tone="gold">Needs connecting again</Pill>
                    ) : (
                      <Pill tone="brand">Connected</Pill>
                    )}
                  </TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
        {settings.photosOnServer > 0 && (
          <p className="mt-4 text-xs text-slate-500">
            {settings.photosOnServer.toLocaleString('en-IN')} gallery photos are still on Poetree’s
            server. Each school moves its own from its Gallery page once its Drive is connected.
          </p>
        )}
      </Card>
    </>
  );
}
