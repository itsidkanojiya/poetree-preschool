'use client';

import { useActionState } from 'react';
import {
  ID_CARD_SIZES,
  ID_CARD_SIZE_CODES,
  type IdCardLayout,
  type SchoolProfile,
} from '@poetree/shared';
import { Field, FieldSet, FormError, Input, Select, SubmitButton } from '@/components/ui/form';
import { Toast } from '@/components/ui/toast';
import {
  updateAdmissionNoModeAction,
  updateBirthdayWishesAction,
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
        <Field
          label="School ID"
          hint="Parents and teachers type this into the Poetree Kids app to sign in. It cannot be changed."
        >
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

/**
 * The four kinds of card a school orders from a print shop: one side or front
 * and back, each landscape or upright. Each is a design and a way up.
 */
const CARD_TYPES = [
  {
    value: 'SINGLE_HORIZONTAL',
    label: 'Single side',
    way: 'Horizontal',
    layout: 'CLASSIC',
    orientation: 'HORIZONTAL',
  },
  {
    value: 'SINGLE_VERTICAL',
    label: 'Single side',
    way: 'Vertical',
    layout: 'BANNER',
    orientation: 'VERTICAL',
  },
  {
    value: 'FRONT_BACK_HORIZONTAL',
    label: 'Front & back',
    way: 'Horizontal',
    layout: 'FRONT_BACK',
    orientation: 'HORIZONTAL',
  },
  {
    value: 'FRONT_BACK_VERTICAL',
    label: 'Front & back',
    way: 'Vertical',
    layout: 'FRONT_BACK',
    orientation: 'VERTICAL',
  },
] as const;

/** The type a school's saved settings amount to. */
function cardTypeOf(school: SchoolProfile): (typeof CARD_TYPES)[number]['value'] {
  const vertical = school.idCardOrientation === 'VERTICAL';
  if (school.idCardLayout === 'FRONT_BACK') {
    return vertical ? 'FRONT_BACK_VERTICAL' : 'FRONT_BACK_HORIZONTAL';
  }
  return vertical ? 'SINGLE_VERTICAL' : 'SINGLE_HORIZONTAL';
}

/** The sizes, named the same either way up; A6 is half A5 stood upright. */
const CARD_SIZES = ID_CARD_SIZE_CODES.filter((code) => code !== 'A6');

/** Which of the four kinds of card, what size, and what goes on it. */
export function IdCardForm({ school }: { school: SchoolProfile }) {
  const [state, formAction] = useActionState<SettingsState, FormData>(updateIdCardAction, {});
  const colour = school.primaryColor ?? '#16307C';
  const size = school.idCardSize === 'A6' ? 'HALF_A5' : school.idCardSize;

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <Toast message={state.success} />

      <fieldset>
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Card type
        </legend>
        <div className="grid grid-cols-2 gap-2.5">
          {CARD_TYPES.map((type) => (
            <label
              key={type.value}
              className="flex cursor-pointer flex-col gap-2 rounded-xl p-2.5 ring-1 ring-navy-950/10 transition has-[:checked]:bg-navy-50 has-[:checked]:ring-2 has-[:checked]:ring-navy-900"
            >
              <CardTypeThumb
                layout={type.layout}
                vertical={type.orientation === 'VERTICAL'}
                colour={colour}
              />
              <span className="flex items-start gap-2">
                <input
                  type="radio"
                  name="cardType"
                  value={type.value}
                  defaultChecked={cardTypeOf(school) === type.value}
                  className="mt-0.5 h-4 w-4 border-navy-300 text-navy-900"
                />
                <span>
                  <span className="block text-sm font-medium text-navy-950">{type.label}</span>
                  <span className="block text-xs text-slate-500">{type.way}</span>
                </span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Front &amp; back prints two pages per child, front then back — print it double-sided.
        </p>
      </fieldset>

      <Field
        label="Card size"
        hint="Vertical stands the same card upright: a standard card becomes 54 × 85.6 mm."
      >
        <Select name="idCardSize" defaultValue={size}>
          {CARD_SIZES.map((code) => (
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
        <p className="text-sm text-navy-950">
          On every card: Name · Grade · Address · Mobile · Birth date · Batch
        </p>
        <p className="mb-1 text-xs text-slate-500">
          Mobile is the main parent’s number. Also show:
        </p>
        <Toggle
          name="idCardShowAdmissionNo"
          label="Admission No."
          hint="The school’s own number for the child."
          defaultChecked={school.idCardShowAdmissionNo}
        />
        <Toggle
          name="idCardShowGrNo"
          label="GR No."
          hint="From the General Register, where the child has one."
          defaultChecked={school.idCardShowGrNo}
        />
        <Toggle
          name="idCardShowBloodGroup"
          label="Blood group"
          hint="Useful in an emergency."
          defaultChecked={school.idCardShowBloodGroup}
        />
      </fieldset>

      <SubmitButton pendingLabel="Saving…">Save card settings</SubmitButton>
    </form>
  );
}

/** A message to parents on their child's birthday, from the school. */
export function BirthdayWishesForm({ school }: { school: SchoolProfile }) {
  const [state, formAction] = useActionState<SettingsState, FormData>(
    updateBirthdayWishesAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <Toast message={state.success} />
      <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-sm text-navy-950">
        <input
          type="checkbox"
          name="birthdayWishesEnabled"
          defaultChecked={school.birthdayWishesEnabled}
          className="mt-0.5 h-5 w-5 rounded border-navy-300 text-amber-500 focus:ring-amber-400"
        />
        <span>
          <span className="block font-semibold">Send birthday wishes</span>
          <span className="block text-xs text-slate-500">
            On a child’s birthday their parents get a message at 9:00 am.
          </span>
        </span>
      </label>
      <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-100">
        🎂 “Happy birthday, Aarav! Warm wishes from everyone at {school.name}.”
      </p>
      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}

/**
 * How children's admission numbers are given: by the school's series, or typed
 * by the office every time.
 */
export function AdmissionNoForm({
  school,
  next,
}: {
  school: SchoolProfile;
  next: string;
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(
    updateAdmissionNoModeAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <Toast message={state.success} />
      {(
        [
          [
            'AUTO',
            'Automatic',
            `The next number is issued: ${next}. The office can still type its own for a child, such as one joining from another school.`,
          ],
          ['MANUAL', 'Manual', 'The office types every admission number.'],
        ] as const
      ).map(([value, label, hint]) => (
        <label key={value} className="flex min-h-[44px] items-start gap-2.5 text-sm text-navy-950">
          <input
            type="radio"
            name="admissionNoMode"
            value={value}
            defaultChecked={school.admissionNoMode === value}
            className="mt-0.5 h-4 w-4 border-navy-300 text-navy-900"
          />
          <span>
            <span className="block font-medium">{label}</span>
            <span className="block text-xs text-slate-500">{hint}</span>
          </span>
        </label>
      ))}
      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}

/** A small sketch of a card type, upright or on its side, in the school's colour. */
function CardTypeThumb({
  layout,
  vertical,
  colour,
}: {
  layout: IdCardLayout;
  vertical: boolean;
  colour: string;
}) {
  if (!vertical) return <LayoutThumb layout={layout} colour={colour} />;

  const ink = '#1A1D29';
  const pale = `${colour}22`;
  const card = (x: number, back: boolean) => (
    <g key={x} transform={`translate(${x} 0)`}>
      <rect x="0.5" y="0.5" width="52" height="79" rx="4" fill="#fff" stroke="#0001" />
      {back ? (
        <>
          <circle cx="26" cy="17" r="11" fill={colour} opacity="0.8" />
          <rect x="5" y="34" width="42" height="34" rx="3" fill={pale} />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x="9" y={39 + i * 7} width={32 - (i % 2) * 8} height="2.4" rx="1.2" fill={ink} opacity="0.55" />
          ))}
        </>
      ) : (
        <>
          <rect x="0.5" y="0.5" width="52" height="15" rx="4" fill={colour} />
          <rect x="10" y="6" width="32" height="3.5" rx="1.75" fill="#fff" />
          <circle cx="26" cy="29" r="10" fill="#c9d6e8" stroke={colour} strokeWidth="1.5" />
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x="7" y={45 + i * 5} width={36 - (i % 2) * 9} height="2.2" rx="1.1" fill={ink} opacity="0.55" />
          ))}
        </>
      )}
      <rect x="0.5" y="73" width="52" height="6.5" fill={colour} />
    </g>
  );

  return (
    <svg viewBox="0 0 120 80" className="h-auto w-full" aria-hidden="true">
      {layout === 'FRONT_BACK' ? [card(5, false), card(62, true)] : card(33.5, false)}
    </svg>
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
