'use client';

import { useMemo, useState } from 'react';
import type { GlobalExportFilters, GlobalExportType } from '@poetree/shared';
import { IconDownload } from '@/components/icons';
import { Field, Input, Select } from '@/components/ui/form';
import { downloadExport } from '@/lib/download-export';

const TYPES: Array<{ value: GlobalExportType; label: string; text: string }> = [
  { value: 'students', label: 'Students', text: 'Every child, with their class and parents.' },
  { value: 'teachers', label: 'Teachers', text: 'Staff accounts, with their classes.' },
  { value: 'parents', label: 'Parents', text: 'Family accounts, with their children.' },
  { value: 'schools', label: 'Schools', text: 'Each school with its plan and counts.' },
];

/** The statuses each kind of record can have. */
const STATUSES: Record<GlobalExportType, Array<{ value: string; label: string }>> = {
  students: [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
    { value: 'GRADUATED', label: 'Graduated' },
    { value: 'WITHDRAWN', label: 'Withdrawn' },
  ],
  teachers: [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
    { value: 'SUSPENDED', label: 'Suspended' },
  ],
  parents: [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
    { value: 'SUSPENDED', label: 'Suspended' },
  ],
  schools: [
    { value: 'TRIAL', label: 'Trial' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'SUSPENDED', label: 'Suspended' },
    { value: 'EXPIRED', label: 'Expired' },
  ],
};

/**
 * Schools named in one go, at most. Every school is "All schools", which
 * names none; this keeps the request a size every proxy on the way accepts.
 */
const MAX_CHOSEN = 200;

/**
 * Exporting across schools: what, from which schools, and narrowed how.
 *
 * Every file carries School and School ID columns, so rows from several
 * schools stay told apart once they are in one spreadsheet.
 */
export function GlobalExportForm({ filters }: { filters: GlobalExportFilters }) {
  const [type, setType] = useState<GlobalExportType>('students');
  const [allSchools, setAllSchools] = useState(true);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [schoolSearch, setSchoolSearch] = useState('');
  const [classLevelId, setClassLevelId] = useState('');
  const [section, setSection] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const byClass = type === 'students' || type === 'teachers' || type === 'parents';

  const visibleSchools = useMemo(() => {
    const term = schoolSearch.trim().toLowerCase();
    return term
      ? filters.schools.filter(
          (school) =>
            school.name.toLowerCase().includes(term) || school.code.toLowerCase().includes(term),
        )
      : filters.schools;
  }, [filters.schools, schoolSearch]);

  function toggle(id: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function download() {
    setError(null);
    setDone(null);
    if (!allSchools && chosen.size === 0) {
      setError('Choose at least one school, or export from all schools.');
      return;
    }
    if (!allSchools && chosen.size > MAX_CHOSEN) {
      setError(`Choose up to ${MAX_CHOSEN} schools at a time, or export from all schools.`);
      return;
    }

    const query = new URLSearchParams({ type });
    if (!allSchools) query.set('schoolIds', [...chosen].join(','));
    if (byClass && classLevelId) query.set('classLevelId', classLevelId);
    if (byClass && section) query.set('section', section);
    if (byClass && academicYear) query.set('academicYear', academicYear);
    if (status) query.set('status', status);

    setBusy(true);
    const result = await downloadExport(`/publication/exports/download?${query.toString()}`);
    setBusy(false);
    if (result.ok) setDone(`Downloaded ${result.file}.`);
    else setError(result.error);
  }

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          What to export
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {TYPES.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 transition-colors ${
                type === option.value
                  ? 'bg-navy-50 ring-navy-300'
                  : 'ring-navy-950/10 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="type"
                className="mt-1"
                checked={type === option.value}
                onChange={() => {
                  setType(option.value);
                  setStatus('');
                }}
              />
              <span>
                <span className="block text-sm font-medium text-navy-950">{option.label}</span>
                <span className="block text-xs text-slate-500">{option.text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Schools
        </legend>
        <label className="flex items-center gap-2 text-sm text-navy-950">
          <input
            type="checkbox"
            checked={allSchools}
            onChange={(event) => setAllSchools(event.target.checked)}
          />
          All schools ({filters.schools.length})
        </label>
        {!allSchools && (
          <div className="mt-3 rounded-xl p-3 ring-1 ring-navy-950/10">
            <Input
              placeholder="Find a school by name or School ID"
              value={schoolSearch}
              onChange={(event) => setSchoolSearch(event.target.value)}
              aria-label="Find a school"
            />
            <p className="mt-2 text-xs text-slate-500">{chosen.size} chosen</p>
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
              {visibleSchools.map((school) => (
                <li key={school.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={chosen.has(school.id)}
                      onChange={() => toggle(school.id)}
                    />
                    <span className="text-navy-950">{school.name}</span>
                    <span className="text-xs text-slate-500">
                      {school.code} · {school.status.toLowerCase()}
                    </span>
                  </label>
                </li>
              ))}
              {visibleSchools.length === 0 && (
                <li className="px-2 py-1 text-sm text-slate-500">No school matches that.</li>
              )}
            </ul>
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Narrow it down
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {byClass && (
            <>
              <Field label="Standard">
                <Select
                  value={classLevelId}
                  onChange={(event) => setClassLevelId(event.target.value)}
                >
                  <option value="">All standards</option>
                  {filters.standards.map((standard) => (
                    <option key={standard.id} value={standard.id}>
                      {standard.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Section">
                <Select value={section} onChange={(event) => setSection(event.target.value)}>
                  <option value="">All sections</option>
                  {filters.sections.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Academic year" hint="Matched by name at every school.">
                <Select
                  value={academicYear}
                  onChange={(event) => setAcademicYear(event.target.value)}
                >
                  <option value="">All years</option>
                  {filters.academicYears.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          <Field label="Status">
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Any status</option>
              {STATUSES[type].map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="rounded-xl bg-leaf-50 px-3 py-2 text-sm text-leaf-800">
          {done}
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => void download()}
        className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
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
  );
}
