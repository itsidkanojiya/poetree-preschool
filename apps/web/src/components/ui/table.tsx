import type { ReactNode } from 'react';

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function THead({ columns }: { columns: string[] }) {
  return (
    <thead>
      <tr className="border-b border-slate-200">
        {columns.map((column) => (
          <th
            key={column}
            scope="col"
            className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {column}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function TRow({ children }: { children: ReactNode }) {
  return <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">{children}</tr>;
}

export function TCell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-3 py-3 align-middle text-slate-700 ${className}`}>{children}</td>;
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
  if (totalPages <= 1) {
    return <p className="mt-4 text-xs text-slate-500">{total} record(s)</p>;
  }

  const separator = basePath.includes('?') ? '&' : '?';

  return (
    <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
      <span className="text-xs text-slate-500">
        Page {page} of {totalPages} · {total} record(s)
      </span>
      <span className="flex gap-2">
        {page > 1 && (
          <a
            className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
            href={`${basePath}${separator}page=${page - 1}`}
          >
            Previous
          </a>
        )}
        {page < totalPages && (
          <a
            className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
            href={`${basePath}${separator}page=${page + 1}`}
          >
            Next
          </a>
        )}
      </span>
    </nav>
  );
}
