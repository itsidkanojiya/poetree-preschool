import type { ReactNode } from 'react';
import type { SchoolStatus } from '@poetree/shared';
import { IconAlert, IconBan, IconCheck, IconClock, IconInbox } from '@/components/icons';

/* -------------------------------------------------------------------------- */
/* Page furniture                                                             */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5">{eyebrow}</div>}
        <h1 className="text-[1.6rem] font-semibold leading-tight tracking-tight text-navy-950">
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({
  title,
  description,
  action,
  children,
  className = '',
  tone = 'default',
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'danger' | 'accent';
}) {
  const ring =
    tone === 'danger'
      ? 'ring-1 ring-rose-200'
      : tone === 'accent'
        ? 'ring-1 ring-gold-200'
        : 'ring-1 ring-navy-950/[0.07]';

  return (
    <section className={`overflow-hidden rounded-2xl bg-white shadow-card ${ring} ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-navy-950/[0.06] px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="font-semibold text-navy-950">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Figures                                                                    */
/* -------------------------------------------------------------------------- */

/** Compact display for large counts: 1,284 · 12.9K · 1.4M */
function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString('en-IN');
}

/**
 * Stat tile: label in sentence case, value in the same sans as everything else.
 * Deliberately uses proportional figures — `tabular-nums` at display size makes
 * a number like 121 look loose. Tabular is reserved for table columns.
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: 'default' | 'good' | 'critical' | 'warning';
}) {
  const accent =
    tone === 'good'
      ? 'text-leaf-600 bg-leaf-50'
      : tone === 'critical'
        ? 'text-rose-600 bg-rose-50'
        : tone === 'warning'
          ? 'text-gold-700 bg-gold-50'
          : 'text-navy-700 bg-navy-50';

  return (
    <div className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-navy-950/[0.07]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-500">{label}</p>
        {icon && (
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${accent}`}>
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-3xl font-semibold leading-none tracking-tight text-navy-950">
        {typeof value === 'number' ? compact(value) : value}
      </p>
      {hint && <p className="mt-2 text-xs leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}

/**
 * Meter for plan seat usage. The fill carries severity; the unfilled track is a
 * lighter step of the same ramp, so the state reads across the whole bar rather
 * than only where the fill ends.
 */
export function Meter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  if (limit === null) {
    return (
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-slate-600">{label}</span>
          <span className="font-medium text-navy-950" data-numeric>
            {used.toLocaleString('en-IN')}{' '}
            <span className="font-normal text-slate-400">/ unlimited</span>
          </span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-navy-100" />
      </div>
    );
  }

  const pct = Math.min(100, Math.round((used / limit) * 100));
  const severity = pct >= 100 ? 'critical' : pct >= 85 ? 'warning' : 'ok';

  const track =
    severity === 'critical' ? 'bg-rose-100' : severity === 'warning' ? 'bg-gold-100' : 'bg-navy-100';
  const fill =
    severity === 'critical' ? 'bg-rose-600' : severity === 'warning' ? 'bg-gold-500' : 'bg-navy-600';

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-navy-950" data-numeric>
          {used.toLocaleString('en-IN')}{' '}
          <span className="font-normal text-slate-400">/ {limit.toLocaleString('en-IN')}</span>
        </span>
      </div>
      <div className={`mt-2 h-2 overflow-hidden rounded-full ${track}`}>
        <div
          className={`h-full rounded-full ${fill}`}
          style={{ width: `${Math.max(pct, 2)}%` }}
          role="progressbar"
          aria-valuenow={used}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-label={label}
        />
      </div>
      {severity !== 'ok' && (
        <p className="mt-1.5 text-xs text-slate-500">
          {severity === 'critical' ? 'Seat limit reached' : `${pct}% of the plan used`}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Status is never carried by colour alone — every badge ships an icon AND a
 * text label, so it survives colour-blindness, greyscale printing and
 * forced-colors mode.
 */
const STATUS: Record<
  SchoolStatus,
  { label: string; className: string; Icon: typeof IconCheck }
> = {
  ACTIVE: {
    label: 'Active',
    className: 'bg-leaf-50 text-leaf-800 ring-leaf-200',
    Icon: IconCheck,
  },
  TRIAL: {
    label: 'Trial',
    className: 'bg-navy-50 text-navy-800 ring-navy-200',
    Icon: IconClock,
  },
  SUSPENDED: {
    label: 'Suspended',
    className: 'bg-rose-50 text-rose-800 ring-rose-200',
    Icon: IconBan,
  },
  EXPIRED: {
    label: 'Expired',
    className: 'bg-gold-50 text-gold-800 ring-gold-200',
    Icon: IconAlert,
  },
};

export function StatusBadge({ status }: { status: SchoolStatus | string }) {
  const entry = STATUS[status as SchoolStatus];

  if (!entry) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
        {status}
      </span>
    );
  }

  const { label, className, Icon } = entry;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      <Icon size={13} strokeWidth={2} />
      {label}
    </span>
  );
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'brand' | 'gold';
}) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
    brand: 'bg-navy-50 text-navy-700 ring-navy-200',
    gold: 'bg-gold-50 text-gold-800 ring-gold-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Identity & empty states                                                    */
/* -------------------------------------------------------------------------- */

const AVATAR_TONES = [
  'bg-navy-100 text-navy-800',
  'bg-leaf-100 text-leaf-800',
  'bg-gold-100 text-gold-800',
  'bg-rose-100 text-rose-800',
  'bg-slate-200 text-slate-700',
];

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  // Deterministic tint, so the same person keeps the same colour between pages.
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i)) % AVATAR_TONES.length;

  const dimensions = size === 'sm' ? 'h-7 w-7 text-[0.65rem]' : 'h-9 w-9 text-xs';

  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${dimensions} ${AVATAR_TONES[hash]}`}
      aria-hidden="true"
    >
      {initials || '?'}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-navy-200 bg-navy-50/40 px-6 py-12 text-center">
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-white text-navy-400 ring-1 ring-navy-100">
        <IconInbox size={22} />
      </span>
      <p className="font-medium text-navy-950">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: { box: 'bg-navy-50 ring-navy-200 text-navy-900', Icon: IconClock },
    warning: { box: 'bg-gold-50 ring-gold-200 text-gold-900', Icon: IconAlert },
    danger: { box: 'bg-rose-50 ring-rose-200 text-rose-900', Icon: IconBan },
    success: { box: 'bg-leaf-50 ring-leaf-200 text-leaf-900', Icon: IconCheck },
  }[tone];

  const { Icon } = tones;

  return (
    <div className={`flex gap-3 rounded-xl px-4 py-3 text-sm ring-1 ring-inset ${tones.box}`}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? 'mt-0.5' : ''}>{children}</div>
      </div>
    </div>
  );
}
