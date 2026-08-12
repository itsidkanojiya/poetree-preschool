import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/api';
import { Avatar, Card, Notice, PageHeader, Pill } from '@/components/ui/layout';
import { PasswordForm } from './password-form';

export const metadata: Metadata = { title: 'Your account · Poetree Admin' };

const ROLE_LABELS: Record<string, string> = {
  PUBLICATION_ADMIN: 'Super Admin',
  SCHOOL_ADMIN: 'School Admin',
  TEACHER: 'Teacher',
  PARENT: 'Parent',
};

export default async function AccountPage() {
  const user = await getCurrentUser();

  return (
    <>
      <PageHeader title="Your account" description="Sign-in details and password." />

      {user.mustChangePassword && (
        <div className="mb-5">
          <Notice tone="warning" title="Choose your own password">
            The one you signed in with was set for you by somebody else, so they know it
            too. Nothing else in the portal will open until you have changed it.
          </Notice>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Profile">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} />
            <div className="min-w-0">
              <p className="font-medium text-navy-950">{user.name}</p>
              <p className="text-sm text-slate-500">{user.email ?? user.phone}</p>
            </div>
          </div>

          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Role</dt>
              <dd>
                <Pill tone="brand">{ROLE_LABELS[user.role] ?? user.role}</Pill>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">School</dt>
              <dd className="font-medium text-navy-950">
                {user.school?.name ?? 'Poetree Publication'}
              </dd>
            </div>
          </dl>
        </Card>

        <Card title="Change password">
          <PasswordForm />
        </Card>
      </div>
    </>
  );
}
