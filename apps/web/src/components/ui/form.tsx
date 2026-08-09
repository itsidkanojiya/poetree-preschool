'use client';

import { useFormStatus } from 'react-dom';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { IconAlert, IconCheck } from '@/components/icons';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'gold';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-navy-900 text-white hover:bg-navy-800 active:bg-navy-950 disabled:bg-navy-300',
  gold: 'bg-gold-400 text-navy-950 hover:bg-gold-300 active:bg-gold-500 disabled:bg-gold-200',
  secondary:
    'bg-white text-navy-900 ring-1 ring-inset ring-navy-950/15 hover:bg-navy-50 disabled:text-slate-400',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 disabled:bg-rose-300',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-navy-900',
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Disables itself and shows progress while the enclosing server action runs. */
export function SubmitButton({
  children,
  variant = 'primary',
  pendingLabel,
  className = '',
}: {
  children: ReactNode;
  variant?: Variant;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} disabled={pending} className={className}>
      {pending && <Spinner />}
      {pending ? (pendingLabel ?? 'Working…') : children}
    </Button>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-navy-950">
        {label}
        {required && (
          <span className="ml-1 text-rose-600" aria-label="required">
            *
          </span>
        )}
      </span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1.5 block text-xs text-rose-600">{error}</span>}
    </label>
  );
}

const CONTROL =
  'w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm text-navy-950 shadow-sm ring-1 ring-inset ring-navy-950/15 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-navy-600 disabled:bg-slate-50 disabled:text-slate-500';

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CONTROL} ${className}`} {...props} />;
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${CONTROL} pr-9 ${className}`} {...props} />;
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${CONTROL} ${className}`} rows={3} {...props} />;
}

/** Groups related fields inside a long form so it reads as sections, not a wall. */
export function FieldSet({ legend, children }: { legend?: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      {legend && (
        <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {legend}
        </legend>
      )}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-800 ring-1 ring-inset ring-rose-200"
    >
      <IconAlert size={17} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

export function FormSuccess({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-xl bg-leaf-50 px-3.5 py-3 text-sm text-leaf-900 ring-1 ring-inset ring-leaf-200"
    >
      <IconCheck size={17} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}
