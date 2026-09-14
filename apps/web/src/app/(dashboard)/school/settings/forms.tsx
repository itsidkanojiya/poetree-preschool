'use client';

import { useActionState } from 'react';
import {
  ID_CARD_LAYOUTS,
  ID_CARD_LAYOUT_CODES,
  ID_CARD_SIZES,
  ID_CARD_SIZE_CODES,
  type IdCardLayout,
  type SchoolProfile,
} from '@poetree/shared';
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

/** How the cards look, what size they are, and what goes on them. */
export function IdCardForm({ school }: { school: SchoolProfile }) {
  const [state, formAction] = useActionState<SettingsState, FormData>(updateIdCardAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <Toast message={state.success} />

      <fieldset>
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Layout
        </legend>
        <div className="grid gap-2.5 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
          {ID_CARD_LAYOUT_CODES.map((code) => (
            <label
              key={code}
              className="flex cursor-pointer flex-col gap-2 rounded-xl p-2.5 ring-1 ring-navy-950/10 transition has-[:checked]:bg-navy-50 has-[:checked]:ring-2 has-[:checked]:ring-navy-900"
            >
              <LayoutThumb layout={code} colour={school.primaryColor ?? '#16307C'} />
              <span className="flex items-start gap-2">
                <input
                  type="radio"
                  name="idCardLayout"
                  value={code}
                  defaultChecked={school.idCardLayout === code}
                  className="mt-0.5 h-4 w-4 border-navy-300 text-navy-900"
                />
                <span>
                  <span className="block text-sm font-medium text-navy-950">
                    {ID_CARD_LAYOUTS[code].label}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {ID_CARD_LAYOUTS[code].description}
                  </span>
                </span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Front &amp; back prints two pages per child, front then back — print it double-sided.
        </p>
      </fieldset>

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
        <Toggle
          name="idCardShowDateOfBirth"
          label="Date of birth"
          hint="Off by default — with a name, it is most of what it takes to pass as a parent on a phone call."
          defaultChecked={school.idCardShowDateOfBirth}
        />
      </fieldset>

      <SubmitButton pendingLabel="Saving…">Save card settings</SubmitButton>
    </form>
  );
}

/**
 * A sketch of each layout in the school's own colour, so the choice is made by
 * looking rather than by reading a description of a card.
 */
function LayoutThumb({ layout, colour }: { layout: IdCardLayout; colour: string }) {
  const ink = '#1A1D29';
  const pale = `${colour}22`;
  const lines = (x: number, y: number, count: number, width: number) =>
    Array.from({ length: count }, (_, i) => (
      <rect key={i} x={x} y={y + i * 6} width={width - (i % 2) * 8} height="2.4" rx="1.2" fill={ink} opacity="0.55" />
    ));

  if (layout === 'FRONT_BACK') {
    return (
      <svg viewBox="0 0 120 80" className="h-auto w-full" aria-hidden="true">
        {[0, 62].map((x, side) => (
          <g key={side} transform={`translate(${x} 0)`}>
            <rect x="0.5" y="0.5" width="57" height="79" rx="4" fill="#fff" stroke="#0001" />
            <polygon points="0.5,12 57.5,40 57.5,68 0.5,40" fill={pale} />
            <rect x="0.5" y="72" width="57" height="7.5" fill={colour} />
            {side === 0 ? (
              <>
                <circle cx="9" cy="8" r="4.5" fill={colour} opacity="0.8" />
                <rect x="16" y="6" width="34" height="4" rx="2" fill={colour} />
                <rect x="18" y="17" width="22" height="25" fill="#c9d6e8" stroke={ink} strokeWidth="1.2" />
                <rect x="10" y="47" width="38" height="3" rx="1.5" fill={ink} />
                {lines(12, 54, 2, 30)}
                <rect x="0.5" y="63" width="25" height="7" fill="#fff" />
                <rect x="4" y="65.5" width="16" height="2.4" rx="1.2" fill={colour} />
                <line x1="32" y1="67" x2="53" y2="67" stroke={ink} strokeWidth="0.7" />
              </>
            ) : (
              <>
                <circle cx="29" cy="18" r="12" fill={colour} opacity="0.8" />
                <rect x="6" y="36" width="46" height="32" rx="3" fill="#fff" opacity="0.95" />
                {lines(10, 41, 4, 38)}
                <rect x="12" y="75" width="34" height="2" rx="1" fill="#FFE66D" />
              </>
            )}
          </g>
        ))}
      </svg>
    );
  }

  if (layout === 'BANNER') {
    return (
      <svg viewBox="0 0 120 80" className="h-auto w-full" aria-hidden="true">
        <rect x="0.5" y="0.5" width="119" height="79" rx="5" fill="#fff" stroke="#0001" />
        <rect x="0.5" y="0.5" width="119" height="79" rx="5" fill={pale} />
        <rect x="42" y="4" width="74" height="24" rx="4" fill={colour} />
        <circle cx="52" cy="16" r="6" fill="#fff" opacity="0.85" />
        <rect x="62" y="12" width="48" height="7" rx="2" fill="#fff" />
        <circle cx="22" cy="36" r="16" fill={colour} />
        <circle cx="22" cy="36" r="13.5" fill="#fff" />
        <circle cx="22" cy="36" r="12" fill="#c9d6e8" />
        {lines(45, 34, 5, 66)}
        <rect x="0.5" y="69" width="119" height="10.5" fill={colour} />
        <rect x="18" y="73" width="84" height="2.4" rx="1.2" fill="#fff" opacity="0.9" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 120 80" className="h-auto w-full" aria-hidden="true">
      <rect x="0.5" y="0.5" width="119" height="79" rx="5" fill="#fff" stroke="#0001" />
      <path d="M5.5 0.5h109a5 5 0 0 1 5 5V20H0.5V5.5a5 5 0 0 1 5-5z" fill={colour} />
      <circle cx="108" cy="2" r="16" fill="#fff" opacity="0.14" />
      <rect x="6" y="4" width="12" height="12" rx="3" fill="#fff" />
      <rect x="22" y="6" width="44" height="5" rx="2" fill="#fff" opacity="0.95" />
      <rect x="22" y="13" width="26" height="2" rx="1" fill="#fff" opacity="0.7" />
      <rect x="6" y="25" width="31" height="38" rx="5" fill={`${colour}55`} />
      <rect x="8" y="27" width="27" height="34" rx="4" fill="#c9d6e8" />
      <rect x="44" y="26" width="40" height="5" rx="2" fill={ink} />
      <rect x="44" y="34" width="22" height="5" rx="2.5" fill={`${colour}40`} />
      {[0, 1].map((row) =>
        [44, 82].map((x) => (
          <g key={`${row}-${x}`}>
            <rect x={x} y={44 + row * 10} width="16" height="1.8" rx="0.9" fill={ink} opacity="0.3" />
            <rect x={x} y={47 + row * 10} width="28" height="2.6" rx="1.3" fill={ink} opacity="0.7" />
          </g>
        )),
      )}
      <rect x="0.5" y="70" width="119" height="9.5" fill={colour} />
      <rect x="30" y="74" width="60" height="2" rx="1" fill="#fff" opacity="0.85" />
    </svg>
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
