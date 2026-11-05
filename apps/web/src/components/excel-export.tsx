'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconDownload } from '@/components/icons';
import { Field, Select } from '@/components/ui/form';
import { downloadExport } from '@/lib/download-export';

/** One filter in the dialog: a choice, with "All" meaning no filter. */
export interface ExportFilter {
  /** The query key the export reads. */
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  /** What leaving it unchosen means. "All" unless said otherwise. */
  allLabel?: string;
  /** Chosen when the dialog opens — the current year, say. */
  initial?: string;
}

/**
 * "Export to Excel", with the filters chosen first.
 *
 * The file is built by the API from the filters given — none at all is every
 * record the admin can see — and comes through `endpoint`, the portal's own
 * pass-through, which is the only thing that can attach their session.
 */
export function ExcelExportButton({
  endpoint,
  type,
  title,
  filters,
}: {
  endpoint: string;
  type: string;
  title: string;
  filters: ExportFilter[];
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(filters.map((filter) => [filter.name, filter.initial ?? ''])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy]);

  async function download() {
    setBusy(true);
    setError(null);
    setDone(null);

    const query = new URLSearchParams({ type });
    for (const [name, value] of Object.entries(values)) {
      if (value) query.set(name, value);
    }

    const result = await downloadExport(`${endpoint}?${query.toString()}`);
    setBusy(false);
    if (result.ok) setDone(`Downloaded ${result.file}.`);
    else setError(result.error);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(null);
          setDone(null);
        }}
        className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
      >
        <IconDownload size={17} />
        Export to Excel
      </button>

      {open &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-navy-950/40 p-4"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget && !busy) setOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="export-title"
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-navy-950/10"
            >
              <h2 id="export-title" className="text-lg font-semibold text-navy-950">
                {title}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Choose what to include. Leave a filter on its first option to include everyone.
              </p>

              <div className="mt-4 space-y-3">
                {filters.map((filter) => (
                  <Field key={filter.name} label={filter.label}>
                    <Select
                      value={values[filter.name] ?? ''}
                      disabled={busy}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [filter.name]: event.target.value }))
                      }
                    >
                      <option value="">{filter.allLabel ?? 'All'}</option>
                      {filter.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ))}
              </div>

              {error && (
                <p
                  role="alert"
                  className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800"
                >
                  {error}
                </p>
              )}
              {done && (
                <p
                  role="status"
                  className="mt-4 rounded-xl bg-leaf-50 px-3 py-2 text-sm text-leaf-800"
                >
                  {done}
                </p>
              )}

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-60"
                >
                  {done ? 'Close' : 'Cancel'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void download()}
                  className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
                >
                  {busy ? (
                    <>
                      <span
                        className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                        aria-hidden
                      />
                      Preparing your file…
                    </>
                  ) : (
                    <>
                      <IconDownload size={16} />
                      Download Excel
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
