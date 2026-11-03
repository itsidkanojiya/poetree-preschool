import type { Metadata } from 'next';
import Link from 'next/link';
import { OwnerContact } from '../policy-owner';
import { DeleteAccountForm } from './delete-account-form';

export const metadata: Metadata = {
  title: 'Delete your account · Poetree Kids',
  description: 'How to delete a Poetree Kids account, and what deleting it removes.',
};

/**
 * Google Play's account-deletion page for Poetree Kids.
 *
 * Play requires a way to delete an account that does not need the app, for a
 * family who has already uninstalled it, and it requires the page to say what
 * is deleted and what is kept. Both halves are here; the form signs nobody in,
 * it only proves the account is theirs.
 */
export default function DeleteAccountPage() {
  return (
    <div className="space-y-10 text-[15px] leading-relaxed text-slate-700">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-navy-950">
          Delete your Poetree Kids account
        </h1>
        <p className="mt-4">
          Parents and guardians can delete their Poetree Kids account at any time. It takes effect
          straight away.
        </p>
      </header>

      <section>
        <h2 className="text-xl font-semibold tracking-tight text-navy-950">In the app</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5">
          <li>Sign in to Poetree Kids.</li>
          <li>
            On the home screen, open <strong>App Settings</strong>.
          </li>
          <li>
            Choose <strong>Delete account</strong>, type your password and confirm.
          </li>
        </ol>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight text-navy-950">
          Here, without the app
        </h2>
        <p className="mt-3">
          Enter the phone number or email address and the password you sign in with. If you sent the
          school a registration that it has not approved yet, this withdraws it.
        </p>
        <div className="mt-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
          <DeleteAccountForm />
        </div>
        <p className="mt-4 text-sm text-slate-500">
          Forgotten your password? Ask your school office to set a new one, then come back here — or
          contact us using the details at the bottom of this page.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight text-navy-950">What is deleted</h2>
        <p className="mt-3">Straight away, and permanently:</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>your name, mobile number, email address, address and password;</li>
          <li>your link to your children, so their records no longer name you;</li>
          <li>your sign-ins on every phone, and your notification tokens;</li>
          <li>your notifications and which notices you have read;</li>
          <li>the registration you sent the school, and the codes that confirmed your number;</li>
          <li>your personal details in our security records.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight text-navy-950">What is kept</h2>
        <p className="mt-3">
          Your child&rsquo;s school record — enrolment, attendance, homework, fees and payments,
          report cards, certificates and learning progress — belongs to the school, which keeps it
          as part of its own records about its pupils. It stays with the school without your name on
          it. To have it corrected or removed, ask the school office. The{' '}
          <Link href="/privacy" className="text-navy-700 underline">
            privacy policy
          </Link>{' '}
          explains how long information is kept.
        </p>
        <p className="mt-3">
          Staff accounts are managed by each school; teachers should ask their school office to
          close theirs.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight text-navy-950">Contact</h2>
        <OwnerContact />
      </section>
    </div>
  );
}
