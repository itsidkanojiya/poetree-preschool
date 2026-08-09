'use client';

import { useActionState } from 'react';
import type { AcademicYearSummary, Paginated, StudentSummary } from '@poetree/shared';
import {
  Field,
  FieldSet,
  FormError,
  FormSuccess,
  Input,
  Select,
  SubmitButton,
} from '@/components/ui/form';
import { Notice } from '@/components/ui/layout';
import { generateInvoicesAction, recordPaymentAction, type FeeState } from './actions';

const METHODS = ['CASH', 'UPI', 'CHEQUE', 'BANK_TRANSFER', 'CARD'] as const;

const today = () => new Date().toISOString().slice(0, 10);

export function RecordPaymentForm({ students }: { students: StudentSummary[] }) {
  const [state, formAction] = useActionState<FeeState, FormData>(recordPaymentAction, {});

  if (students.length === 0) {
    return <Notice tone="info" title="No children enrolled yet">Add students before taking fees.</Notice>;
  }

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <FieldSet>
        <Field label="Child" required>
          <Select name="studentId" required defaultValue="">
            <option value="" disabled>
              Choose a child
            </option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.fullName} ({student.admissionNo})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Amount (₹)" required hint="Applied to the oldest unpaid invoice first.">
          <Input name="amount" type="number" min="1" step="1" required placeholder="2500" />
        </Field>

        <Field label="Method" required>
          <Select name="method" defaultValue="CASH">
            {METHODS.map((method) => (
              <option key={method} value={method}>
                {method.replace('_', ' ')}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Received on" required>
          <Input name="paidOn" type="date" required defaultValue={today()} max={today()} />
        </Field>

        <Field label="Reference" hint="Cheque number, UPI reference.">
          <Input name="reference" />
        </Field>

        <Field label="Note">
          <Input name="note" />
        </Field>
      </FieldSet>

      <SubmitButton pendingLabel="Recording…">Record payment &amp; issue receipt</SubmitButton>
    </form>
  );
}

export function GenerateInvoicesForm({ years }: { years: AcademicYearSummary[] }) {
  const [state, formAction] = useActionState<FeeState, FormData>(generateInvoicesAction, {});

  if (years.length === 0) {
    return <Notice tone="info" title="Create an academic year first">Invoices belong to a year.</Notice>;
  }

  const current = years.find((y) => y.isCurrent) ?? years[0];

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <Notice tone="info">
        Safe to run twice. A child who already has an invoice for the period is left alone rather
        than charged again.
      </Notice>

      <FieldSet>
        <Field label="Academic year" required>
          <Select name="academicYearId" required defaultValue={current?.id}>
            {years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name}
                {year.isCurrent ? ' (current)' : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Period"
          required
          hint="Match the cadence of your fee structure: Annual, H1, Q1, or 2026-07."
        >
          <Input name="periodLabel" required placeholder="Q1" />
        </Field>

        <Field label="Due date" required>
          <Input name="dueDate" type="date" required />
        </Field>
      </FieldSet>

      <SubmitButton variant="secondary" pendingLabel="Generating…">
        Generate invoices
      </SubmitButton>
    </form>
  );
}

export type { Paginated };
