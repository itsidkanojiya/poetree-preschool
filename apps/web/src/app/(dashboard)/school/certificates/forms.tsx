'use client';

import { useActionState, useState } from 'react';
import {
  CERTIFICATE_DESIGNS,
  CERTIFICATE_DESIGN_LABELS,
  type CertificateDesign,
  type CertificateDetail,
} from '@poetree/shared';
import { Field, FormError, Input, SubmitButton, Textarea } from '@/components/ui/form';
import { Toast } from '@/components/ui/toast';
import { CertificateThumb } from '@/components/certificates/thumb';
import {
  createCertificateAction,
  setRecipientsAction,
  updateCertificateAction,
  type CertificateState,
} from './actions';

/** Ideas for the office, which mostly awards the same handful of things. */
const TITLES = [
  'Star of the Month',
  'Certificate of Appreciation',
  'Sports Day Winner',
  'Best Attendance',
  'Little Artist',
  'Kindness Award',
];

function DesignPicker({ brand, value }: { brand: string; value: CertificateDesign }) {
  const [design, setDesign] = useState(value);
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-navy-950">Design</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CERTIFICATE_DESIGNS.map((option) => (
          <label
            key={option}
            className={`cursor-pointer rounded-xl p-2 ring-2 transition-colors ${
              design === option ? 'bg-navy-50 ring-navy-600' : 'ring-transparent hover:bg-slate-50'
            }`}
          >
            <input
              type="radio"
              name="design"
              value={option}
              checked={design === option}
              onChange={() => setDesign(option)}
              className="sr-only"
            />
            <CertificateThumb design={option} brand={brand} />
            <span className="mt-1.5 block text-center text-xs font-medium text-navy-950">
              {CERTIFICATE_DESIGN_LABELS[option]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * What the certificate says and how it looks. New, it creates a draft and goes
 * on to pick the children; on a draft, it saves the changes.
 */
export function CertificateForm({
  brand,
  certificate,
}: {
  brand: string;
  certificate?: CertificateDetail;
}) {
  const [state, formAction] = useActionState<CertificateState, FormData>(
    certificate ? updateCertificateAction.bind(null, certificate.id) : createCertificateAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <Toast message={state.success} />

      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <Field label="Title">
          <Input
            name="title"
            list="certificate-titles"
            defaultValue={certificate?.title ?? ''}
            placeholder="Star of the Month"
            required
            minLength={2}
            maxLength={120}
          />
          <datalist id="certificate-titles">
            {TITLES.map((title) => (
              <option key={title} value={title} />
            ))}
          </datalist>
        </Field>
        <Field label="Date on it">
          <Input
            name="issuedOn"
            type="date"
            required
            defaultValue={(certificate?.issuedOn ?? new Date().toISOString()).slice(0, 10)}
          />
        </Field>
      </div>

      <Field label="The line under the child’s name" hint="Optional. Up to 400 characters.">
        <Textarea
          name="body"
          rows={2}
          maxLength={400}
          defaultValue={certificate?.body ?? ''}
          placeholder="for always helping friends and sharing with a smile"
        />
      </Field>

      <DesignPicker brand={brand} value={certificate?.design ?? 'CLASSIC'} />

      <SubmitButton>{certificate ? 'Save' : 'Create and choose children'}</SubmitButton>
    </form>
  );
}

/**
 * The children of one class, ticked or not. Everyone already chosen from
 * other classes rides along unseen, so switching class loses no one.
 */
export function RecipientsForm({
  certificateId,
  roster,
  others,
}: {
  certificateId: string;
  roster: Array<{ id: string; fullName: string; rollNo: string | null; chosen: boolean }>;
  /** Already on the certificate, from classes not shown. */
  others: string[];
}) {
  const [state, formAction] = useActionState<CertificateState, FormData>(
    setRecipientsAction.bind(null, certificateId),
    {},
  );
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(roster.filter((c) => c.chosen).map((c) => c.id)),
  );

  const all = roster.length > 0 && ticked.size === roster.length;
  const toggle = (id: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form action={formAction} className="space-y-3">
      <FormError message={state.error} />
      <Toast message={state.success} />
      {others.map((id) => (
        <input key={id} type="hidden" name="keep" value={id} />
      ))}

      <label className="flex items-center gap-2 text-sm font-medium text-navy-950">
        <input
          type="checkbox"
          checked={all}
          onChange={() => setTicked(all ? new Set() : new Set(roster.map((c) => c.id)))}
          className="h-4 w-4 rounded border-navy-300 text-navy-900"
        />
        The whole class
      </label>

      <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {roster.map((child) => (
          <li key={child.id}>
            <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
              <input
                type="checkbox"
                name="studentId"
                value={child.id}
                checked={ticked.has(child.id)}
                onChange={() => toggle(child.id)}
                className="h-4 w-4 rounded border-navy-300 text-navy-900"
              />
              <span className="text-navy-950">{child.fullName}</span>
              {child.rollNo && <span className="text-xs text-slate-400">#{child.rollNo}</span>}
            </label>
          </li>
        ))}
      </ul>

      <SubmitButton variant="secondary">Save children</SubmitButton>
    </form>
  );
}
