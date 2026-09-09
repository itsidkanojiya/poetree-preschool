import type { Metadata } from 'next';
import type { SchoolProfile } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/layout';
import { IdCardForm, LogoForm, SchoolDetailsForm } from './forms';

export const metadata: Metadata = { title: 'Settings · Poetree' };

/**
 * The school's own record.
 *
 * Until now only the publisher could change any of this, so a school that moved
 * premises had to email somebody. What it still cannot change is its code, its
 * status, or how long its access lasts.
 */
export default async function SchoolSettingsPage() {
  const school = await apiFetch<SchoolProfile>('/school/profile');

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your school’s own details, and what goes on a child’s ID card."
      />

      <div className="grid items-start gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card
          title="School details"
          description="Printed on receipts, fee cards and ID cards."
        >
          <SchoolDetailsForm school={school} />
        </Card>

        <div className="space-y-5">
          <Card title="Logo" description="Shown on the app’s sign-in screen and on ID cards.">
            <LogoForm school={school} />
          </Card>

          <Card
            title="ID cards"
            description="Generated from what the school already holds about each child."
          >
            <IdCardForm school={school} />
          </Card>
        </div>
      </div>
    </>
  );
}
