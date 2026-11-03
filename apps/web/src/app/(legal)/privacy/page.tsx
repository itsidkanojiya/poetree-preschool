import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { OwnerContact, POLICY_OWNER, POLICY_UPDATED } from '../policy-owner';

export const metadata: Metadata = {
  title: 'Privacy policy · Poetree Kids',
  description: 'How the Poetree Kids app collects, uses, shares and deletes information.',
};

/**
 * The Poetree Kids privacy policy.
 *
 * Written from what the code actually does — the registration form, the
 * Prisma schema, the services the API calls and the permissions the Android
 * build merges in. When any of those change, this page changes with them, and
 * so does the Data safety form in Play Console, which must say the same thing.
 */
export default function PrivacyPolicyPage() {
  return (
    <article className="space-y-10 text-[15px] leading-relaxed text-slate-700">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-navy-950">
          Poetree Kids privacy policy
        </h1>
        <p className="mt-2 text-sm text-slate-500">Last updated {POLICY_UPDATED}</p>
        <p className="mt-5">
          Poetree Kids is a preschool app for families and teachers. Children learn with films,
          activities, tracing and games; parents see their child&rsquo;s attendance, homework, fees,
          report cards and the school&rsquo;s notices; teachers mark attendance and set homework.
          This policy explains what information the app and this website collect, why, who it is
          shared with, how long it is kept, and the choices you have — including how to{' '}
          <Link href="/delete-account" className="text-navy-700 underline">
            delete your account
          </Link>
          .
        </p>
      </header>

      <Section title="1. Who is responsible">
        <p>
          Poetree Kids is provided by {POLICY_OWNER.name} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) to
          preschools that use it. Each school decides what it records about its pupils, and the
          school&rsquo;s staff add and manage that information. We run the app and the servers
          behind it, use the information only to provide the service to the school and to you, and
          are responsible for this policy. Contact details are at the end.
        </p>
      </Section>

      <Section title="2. Who uses the app">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Parents and guardians</strong> sign in with their mobile number or email address
            and a password. A parent can register in the app; the school checks the request before
            an account is opened.
          </li>
          <li>
            <strong>Teachers</strong> are given accounts by their school.
          </li>
          <li>
            <strong>Children do not have accounts.</strong> A child uses the learning parts of the
            app on a parent&rsquo;s phone, signed in as that parent. Children cannot post, chat or
            contact anyone in the app, and the app contains no advertising and no in-app purchases.
          </li>
        </ul>
      </Section>

      <Section title="3. Information we collect">
        <SubSection title="When a parent registers">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              The parent&rsquo;s name, relationship to the child, mobile number, email address and
              password (stored only in scrambled, hashed form — nobody can read it back).
            </li>
            <li>
              The mother&rsquo;s mobile number, and optionally her name and the family&rsquo;s
              address.
            </li>
            <li>
              The child&rsquo;s name and date of birth, and optionally their blood group and an
              emergency contact&rsquo;s name and number.
            </li>
            <li>A one-time code, sent by SMS, confirms that the mobile number belongs to you.</li>
          </ul>
        </SubSection>

        <SubSection title="Information the school adds">
          <p>
            The child&rsquo;s admission number, class, gender, photograph, address, emergency
            contacts, allergies and medical notes (for staff to see), attendance, homework, fees,
            payments and receipts the school records, report cards, certificates, documents, the
            timetable, notices, and photos and videos of school events.
          </p>
        </SubSection>

        <SubSection title="Information created as the app is used">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Photos of homework that a parent or teacher chooses to upload.</li>
            <li>A photograph of the child, if a parent chooses to set one.</li>
            <li>
              Learning progress: which films have been watched, activity answers and results,
              tracing practice and games played — shown to the child&rsquo;s parent and school.
            </li>
            <li>
              Which notices have been read, a fee plan a parent chooses, and the notifications sent
              to you.
            </li>
            <li>
              For teachers: their name, contact details, employee code, qualification, a signature
              image printed on report cards, and the attendance and homework they record.
            </li>
          </ul>
        </SubSection>

        <SubSection title="Technical information">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              A push notification token for your phone, if notifications are allowed, and the
              phone&rsquo;s platform (Android).
            </li>
            <li>
              Sign-in records — when you signed in, your IP address and your device&rsquo;s browser
              or app identifier — kept to protect accounts from misuse. Our web server also keeps
              routine access logs.
            </li>
          </ul>
        </SubSection>

        <SubSection title="What we do not collect">
          <p>
            The app does not ask for your location, contacts or microphone. It does not use the
            advertising ID, and it contains no advertising, analytics or tracking tools. Location
            details that phones store inside photos are removed when a photo is uploaded.
          </p>
        </SubSection>
      </Section>

      <Section title="4. Permissions on your phone">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Camera and photos</strong> — only when you choose to take or attach a photo.
            Photos are picked with Android&rsquo;s own photo picker, so the app does not get access
            to the rest of your gallery.
          </li>
          <li>
            <strong>Notifications</strong> — to tell you about attendance, homework, notices, fees,
            results and certificates. You can turn them off in your phone&rsquo;s settings.
          </li>
          <li>
            <strong>Storage</strong> — only on Android 10 and older, to save a gallery photo you
            chose to save.
          </li>
        </ul>
        <p className="mt-3">
          Reading activities aloud uses the text-to-speech engine already installed on your phone.
          The words read aloud are the activity&rsquo;s own instructions.
        </p>
      </Section>

      <Section title="5. How we use information">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            To run the service: signing in, showing each family their own children&rsquo;s
            information, and letting school staff manage their pupils, classes, homework,
            attendance, fees, results and notices.
          </li>
          <li>
            To confirm a new parent&rsquo;s phone number, and to let you sign in with your phone
            number or email address.
          </li>
          <li>To send notifications about your child and your school.</li>
          <li>
            To keep accounts secure and the service working: limiting repeated sign-in attempts,
            keeping records of important changes, and fixing problems.
          </li>
        </ul>
        <p className="mt-3">
          We do not sell information, use it for advertising, or build profiles of children or
          parents for marketing. Learning progress is recorded only so that the child&rsquo;s parent
          and teachers can see it.
        </p>
      </Section>

      <Section title="6. Children's privacy">
        <p>
          Poetree Kids is designed for preschool children (Play Group to Senior KG) using the app
          with a parent, and for the adults around them. Children never sign up or sign in
          themselves: a parent registers and confirms their own phone number, and the school checks
          the request before an account is opened. Information about a child is seen only by that
          child&rsquo;s parents and guardians and by staff of the child&rsquo;s school. There is no
          advertising, no in-app purchase and no tracking for marketing, and children cannot share
          information with other users.
        </p>
      </Section>

      <Section title="7. Who information is shared with">
        <ul className="list-disc space-y-3 pl-5">
          <li>
            <strong>Your child&rsquo;s school.</strong> The school&rsquo;s staff see the information
            about their own pupils and families. Schools cannot see each other&rsquo;s information.
          </li>
          <li>
            <strong>Service providers who work for us</strong>, each receiving only what it needs:
            <ul className="mt-2 list-[circle] space-y-1.5 pl-5">
              <li>
                <strong>Hostinger</strong> — provides the servers where the information is stored.
              </li>
              <li>
                <strong>Google Firebase Cloud Messaging</strong> — delivers notifications to your
                phone. It receives your phone&rsquo;s notification token and the notification
                itself, which can include your child&rsquo;s first name (for example, &ldquo;Aarav
                was marked absent&rdquo;).
              </li>
              <li>
                <strong>MSG91</strong> — sends the one-time code by SMS when a parent registers. It
                receives the mobile number and the code.
              </li>
              <li>
                <strong>Google Drive</strong> — a school can connect its own Google Drive to store
                photos and videos of school events. They are shown in the app through our servers,
                not through public links.
              </li>
              <li>
                <strong>YouTube</strong> — learning films and lesson videos are hosted on YouTube
                and played inside the app. When a video plays, YouTube receives technical
                information such as your phone&rsquo;s IP address and which video was played, under{' '}
                <a
                  className="text-navy-700 underline"
                  href="https://policies.google.com/privacy"
                  rel="noreferrer"
                  target="_blank"
                >
                  Google&rsquo;s privacy policy
                </a>
                . We do not send YouTube your name or your child&rsquo;s name.
              </li>
            </ul>
          </li>
          <li>
            <strong>When the law requires it</strong>, or where it is necessary to protect a
            child&rsquo;s safety.
          </li>
        </ul>
        <p className="mt-3">
          Some of these providers, such as Google, may process information in other countries. When
          you choose to share or save a photo, certificate or document from the app, it goes to the
          app you choose on your phone.
        </p>
      </Section>

      <Section title="8. How information is protected">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Information travels between the app and our servers encrypted (HTTPS).</li>
          <li>Passwords and one-time codes are stored only in hashed form.</li>
          <li>
            On the phone, sign-in tokens are kept in Android&rsquo;s secure storage (Keystore).
          </li>
          <li>
            Each school&rsquo;s information is kept separate, and every request is checked against
            who is signed in and what their role allows.
          </li>
          <li>
            Uploaded files are private and are only served to signed-in users allowed to see them.
          </li>
          <li>Repeated sign-in attempts are limited, and important changes are logged.</li>
        </ul>
      </Section>

      <Section title="9. How long information is kept">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Your account</strong> is kept while it is open. When you delete it, your
            personal details are erased straight away (see section 11).
          </li>
          <li>
            <strong>Your child&rsquo;s school record</strong> — enrolment, attendance, homework,
            fees, report cards, certificates and learning progress — is part of the school&rsquo;s
            own records about its pupils, and is kept for as long as the school needs it. Ask the
            school if you want it corrected or removed.
          </li>
          <li>One-time registration codes expire after a few minutes.</li>
          <li>Sign-ins expire after a period without use.</li>
          <li>
            Security records are kept to protect the service. When an account is deleted, the
            personal details in them are removed.
          </li>
          <li>
            If a school stops using Poetree Kids, we keep its information only as long as needed to
            return it to the school or as the law requires, and then delete it.
          </li>
        </ul>
      </Section>

      <Section title="10. Your rights and choices">
        <p>
          Under India&rsquo;s Digital Personal Data Protection Act, 2023 and other applicable law,
          you can:
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>see the information held about you and your child — most of it is in the app;</li>
          <li>have it corrected or completed — ask your school office, or contact us;</li>
          <li>have it erased, including by deleting your account at any time;</li>
          <li>withdraw your consent, by deleting your account or asking your school;</li>
          <li>nominate someone to act for you if you are unable to;</li>
          <li>
            complain to us (see the contact details below) and, if you are not satisfied, to the
            Data Protection Board of India.
          </li>
        </ul>
        <p className="mt-3">
          You can also turn notifications, camera and photo access off at any time in your
          phone&rsquo;s settings.
        </p>
      </Section>

      <Section title="11. Deleting your account">
        <p>
          In the app, open <strong>App Settings</strong> and choose <strong>Delete account</strong>.
          Without the app, use the{' '}
          <Link href="/delete-account" className="text-navy-700 underline">
            account deletion page
          </Link>
          .
        </p>
        <p className="mt-3">
          Deleting your account erases, straight away and permanently: your name, mobile number,
          email address, password and address; your link to your children; your sign-ins and
          notification tokens; your notifications; the registration you sent the school; and your
          personal details in our security records. Your child&rsquo;s school record stays with the
          school, as described in section 9, without your name on it.
        </p>
      </Section>

      <Section title="12. Changes to this policy">
        <p>
          When this policy changes, the date at the top changes too. If a change is significant, we
          will let families know through their school or in the app.
        </p>
      </Section>

      <Section title="13. Contact us">
        <p>
          For questions, requests or complaints about privacy, contact your school office or us:
        </p>
        <OwnerContact />
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight text-navy-950">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <h3 className="font-semibold text-navy-900">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
