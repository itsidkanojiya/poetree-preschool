import type { ReactNode } from 'react';
import Link from 'next/link';

export interface Column {
  label: string;
  /** Right-aligns and switches the column to tabular figures so digits line up. */
  numeric?: boolean;
  /** Header is present for screen readers but visually hidden (action columns). */
  hidden?: boolean;
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left text-sm">
        {children}
      </table>
    </div>
  );
}

export function THead({ columns }: { columns: Array<string | Column> }) {
  return (
    <thead>
      <tr>
        {columns.map((column, index) => {
          const col: Column = typeof column === 'string' ? { label: column } : column;
          return (
            <th
              key={`${col.label}-${index}`}
              scope="col"
              data-numeric={col.numeric ? '' : undefined}
              className={`sticky top-0 z-10 border-b border-navy-950/[0.08] bg-white px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400 ${
                col.numeric ? 'text-right' : ''
              }`}
            >
              {col.hidden ? <span className="sr-only">{col.label}</span> : col.label}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

export function TRow({ children }: { children: ReactNode }) {
  return <tr className="group transition-colors hover:bg-navy-50/50">{children}</tr>;
}

export function TCell({
  children,
  className = '',
  numeric,
}: {
  children: ReactNode;
  className?: string;
  numeric?: boolean;
}) {
  return (
    <td
      data-numeric={numeric ? '' : undefined}
      className={`border-b border-navy-950/[0.05] px-3 py-3 align-middle text-slate-600 ${
        numeric ? 'text-right' : ''
      } ${className}`}
    >
      {children}
    </td>
  );
}

/** Primary identity cell — name in ink, supporting detail beneath. */
export function TPrimary({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium text-navy-950">{children}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  basePath,
}: {
  page: number;
  totalPages: number;
  total: number;
  basePath: string;
}) {
  const noun = total === 1 ? 'record' : 'records';

  if (totalPages <= 1) {
    return (
      <p className="mt-4 text-xs text-slate-500">
        {total.toLocaleString('en-IN')} {noun}
      </p>
    );
  }

  const separator = basePath.includes('?') ? '&' : '?';
  const linkClass =
    'rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 hover:bg-navy-50';

  return (
    <nav className="mt-5 flex items-center justify-between gap-4" aria-label="Pagination">
      <p className="text-xs text-slate-500">
        Page {page} of {totalPages} · {total.toLocaleString('en-IN')} {noun}
      </p>
      <div className="flex gap-2">
        {page > 1 && (
          <Link className={linkClass} href={`${basePath}${separator}page=${page - 1}`}>
            Previous
          </Link>
        )}
        {page < totalPages && (
          <Link className={linkClass} href={`${basePath}${separator}page=${page + 1}`}>
            Next
          </Link>
        )}
      </div>
    </nav>
  );
}
