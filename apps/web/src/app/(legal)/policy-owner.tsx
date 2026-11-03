/**
 * Who the privacy policy and the deletion page name as responsible for Poetree
 * Kids, and how to reach them.
 *
 * TODO before these pages go live: the contact details below are not recorded
 * anywhere in this repository and must not be guessed. Indian law expects a
 * named person who answers privacy complaints, and Google Play expects a way
 * to reach the developer. Until each is filled in, the pages show a marked gap
 * rather than an address nobody reads.
 */
export const POLICY_OWNER = {
  name: 'Poetree Publications',
  /** The address privacy requests and complaints go to. */
  email: null as string | null,
  /** Registered or business address, one line. */
  postalAddress: null as string | null,
  /** The person who answers privacy complaints (grievance officer). */
  grievanceOfficer: null as string | null,
};

/** The date the policy text last changed. Change it with the text. */
export const POLICY_UPDATED = '3 November 2026';

/** A detail still to be supplied, shown so that nobody mistakes it for done. */
export function Missing({ what }: { what: string }) {
  return (
    <mark className="rounded bg-gold-100 px-1.5 py-0.5 font-medium text-gold-900">
      [{what} to be added]
    </mark>
  );
}

/** The contact details, each one or its marked gap. */
export function OwnerContact() {
  return (
    <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
      <dt className="font-medium text-navy-950">Organisation</dt>
      <dd>{POLICY_OWNER.name}</dd>
      <dt className="font-medium text-navy-950">Email</dt>
      <dd>
        {POLICY_OWNER.email ? (
          <a className="text-navy-700 underline" href={`mailto:${POLICY_OWNER.email}`}>
            {POLICY_OWNER.email}
          </a>
        ) : (
          <Missing what="privacy contact email" />
        )}
      </dd>
      <dt className="font-medium text-navy-950">Address</dt>
      <dd>{POLICY_OWNER.postalAddress ?? <Missing what="postal address" />}</dd>
      <dt className="font-medium text-navy-950">Grievance officer</dt>
      <dd>{POLICY_OWNER.grievanceOfficer ?? <Missing what="grievance officer's name" />}</dd>
    </dl>
  );
}
