/**
 * Who the privacy policy and the deletion page name as responsible for Poetree
 * Kids, and how to reach them. Supplied by Poetree Publications; never guess
 * one of these.
 *
 * Still to come: a privacy email address and the name of the grievance officer
 * (the person who answers privacy complaints, which Indian law expects to be
 * named). Each line appears on the pages as soon as it is filled in here.
 */
export const POLICY_OWNER = {
  name: 'Poetree Publications',
  postalAddress:
    'Shed-4, Vande Mataram-3 Estate, Kathwada–Singarva Road, opp. VR Estate, Kathwada, Ahmedabad, Gujarat 382430, India',
  /** Shown as written; dialled as `phoneDial`. */
  phone: '+91 96013 08871',
  phoneDial: '+919601308871',
  /** The address privacy requests and complaints go to. */
  email: null as string | null,
  /** The person who answers privacy complaints (grievance officer). */
  grievanceOfficer: null as string | null,
};

/** The date the policy text last changed. Change it with the text. */
export const POLICY_UPDATED = '4 November 2026';

/** The contact details: the ones on record, and none that are not. */
export function OwnerContact() {
  const { email, grievanceOfficer } = POLICY_OWNER;
  return (
    <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
      <dt className="font-medium text-navy-950">Organisation</dt>
      <dd>{POLICY_OWNER.name}</dd>
      <dt className="font-medium text-navy-950">Address</dt>
      <dd>{POLICY_OWNER.postalAddress}</dd>
      <dt className="font-medium text-navy-950">Phone</dt>
      <dd>
        <a className="text-navy-700 underline" href={`tel:${POLICY_OWNER.phoneDial}`}>
          {POLICY_OWNER.phone}
        </a>
      </dd>
      {email && (
        <>
          <dt className="font-medium text-navy-950">Email</dt>
          <dd>
            <a className="text-navy-700 underline" href={`mailto:${email}`}>
              {email}
            </a>
          </dd>
        </>
      )}
      {grievanceOfficer && (
        <>
          <dt className="font-medium text-navy-950">Grievance officer</dt>
          <dd>{grievanceOfficer}</dd>
        </>
      )}
    </dl>
  );
}
