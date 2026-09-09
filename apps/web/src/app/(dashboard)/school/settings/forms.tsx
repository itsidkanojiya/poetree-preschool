'use client';

import { useActionState } from 'react';
import { ID_CARD_SIZES, ID_CARD_SIZE_CODES, type SchoolProfile } from '@poetree/shared';
import { Field, FieldSet, FormError, Input, Select, SubmitButton } from '@/components/ui/form';
import { Toast } from '@/components/ui/toast';
import {
  updateIdCardAction,
  updateSchoolProfileAction,
  uploadSchoolLogoAction,
  type SettingsState,
} from './actions';

/** The school's own name and address — what it prints on everything it issues. */
export function SchoolDetailsForm({ school }: { school: SchoolProfile }) {
  const [state, formAction] = useActionState<SettingsState, FormData>(
    updateSchoolProfileAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <Toast message={state.success} />

      <FieldSet>
        <Field label="School name">
          <Input name="name" defaultValue={school.name} />
        </Field>
        {/* Shown because people look for it, disabled because the mobile app
            build is keyed on it and changing it would orphan every install. */}
        <Field label="School code" hint="Fixed — the mobile app is built against it.">
          <Input value={school.code} disabled readOnly />
        </Field>
        <Field label="Principal">
          <Input name="principalName" defaultValue={school.principalName ?? ''} />
        </Field>
        <Field label="Colour" hint="Used on the sign-in screen and ID cards.">
          <Input
            name="primaryColor"
            type="color"
            defaultValue={school.primaryColor ?? '#16307C'}
            className="h-11 w-24 p-1"
          />
        </Field>
        <Field label="Phone">
          <Input name="phone" defaultValue={school.phone ?? ''} />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" defaultValue={school.email ?? ''} />
        </Field>
      </FieldSet>

      <FieldSet legend="Address">
        <Field label="Address line 1">
          <Input name="addressLine1" defaultValue={school.addressLine1 ?? ''} />
        </Field>
        <Field label="Address line 2">
          <Input name="addressLine2" defaultValue={school.addressLine2 ?? ''} />
        </Field>
        <Field label="City">
          <Input name="city" defaultValue={school.city ?? ''} />
        </Field>
        <Field label="State">
          <Input name="state" defaultValue={school.state ?? ''} />
        </Field>
        <Field label="Postal code">
          <Input name="postalCode" defaultValue={school.postalCode ?? ''} />
        </Field>
      </FieldSet>

      <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>
    </form>
  );
}

/** The logo, which the sign-in screen shows before anybody has signed in. */
export function LogoForm({ school }: { school: SchoolProfile }) {
  const [state, formAction] = useActionState<SettingsState, FormData>(
    uploadSchoolLogoAction,
    {},
  );

  const fileId = school.logoUrl?.split('/').pop();

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <Toast message={state.success} />

      <div className="flex items-start gap-4">
        {fileId ? (
          /* A plain img: one small picture from our own API, and next/image
             would want a loader configured for the host. */
          <img
            src={`/attachments?id=${fileId}`}
            alt=""
            className="h-20 w-20 shrink-0 rounded-xl object-contain ring-1 ring-navy-950/10"
          />
        ) : (
          <span className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-slate-100 text-center text-[10px] text-slate-400 ring-1 ring-navy-950/10">
            no logo
          </span>
        )}

        <div className="min-w-0 flex-1 space-y-3">
          <Input
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="School logo"
          />
          <SubmitButton variant="secondary" pendingLabel="Uploading…">
            {school.logoUrl ? 'Replace' : 'Upload'}
          </SubmitButton>
          <p className="text-xs text-slate-500">
            A square PNG reads best.{' '}
            {school.logoUrl && 'Submit with nothing chosen to take it off again.'}
            {' '}ID cards can only print PNG or JPEG — a WebP logo is left off the card.
          </p>
        </div>
      </div>
    </form>
  );
}

/** What size the cards are, and what goes on them. */
export function IdCardForm({ school }: { school: SchoolProfile }) {
  const [state, formAction] = useActionState<SettingsState, FormData>(updateIdCardAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <Toast message={state.success} />

      <Field label="Card size" hint="Cards are generated at exactly this size, ready to print.">
        <Select name="idCardSize" defaultValue={school.idCardSize}>
          {ID_CARD_SIZE_CODES.map((code) => (
            <option key={code} value={code}>
              {ID_CARD_SIZES[code].label} — {ID_CARD_SIZES[code].widthMm} ×{' '}
              {ID_CARD_SIZES[code].heightMm} mm
            </option>
          ))}
        </Select>
      </Field>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
          What goes on the card
        </legend>
        <p className="mb-2 text-xs text-slate-500">
          The child’s name, photograph, class and admission number are always on it. These are
          the ones schools disagree about — a card goes home in a bag with a four-year-old.
        </p>

        <Toggle
          name="idCardShowBloodGroup"
          label="Blood group"
          hint="Useful in an emergency, and personal."
          defaultChecked={school.idCardShowBloodGroup}
        />
        <Toggle
          name="idCardShowGuardianPhone"
          label="Guardian’s phone number"
          hint="So a lost child can be got home."
          defaultChecked={school.idCardShowGuardianPhone}
        />
        <Toggle
          name="idCardShowAddress"
          label="Home address"
          hint="Off by default — a card with an address on it is a map to a child’s house."
          defaultChecked={school.idCardShowAddress}
        />
      </fieldset>

      <SubmitButton pendingLabel="Saving…">Save card settings</SubmitButton>
    </form>
  );
}

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-2.5 text-sm text-navy-950">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 rounded border-navy-300 text-navy-900"
      />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );
}
