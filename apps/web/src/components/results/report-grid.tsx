'use client';

import { Fragment, useState, useTransition } from 'react';
import type { ReportGrid, ReportGridChild } from '@poetree/shared';
import { publishAction, saveReportCardAction, unpublishAction } from '@/lib/results-actions';
import { Toast } from '@/components/ui/toast';

/**
 * The report card grid: children down the side, what they are graded on
 * across the top, a grade in every box.
 *
 * Saves one child at a time, the moment a grade is picked or a remark is left,
 * so nothing is lost to a closed tab. Used by the class teacher and the office
 * alike; what differs is which cards are still theirs to change — a teacher's
 * drafts, or anything the office has not yet sent home.
 */

const STATUS = {
  NOT_STARTED: { label: 'Not started', tone: 'bg-slate-100 text-slate-600' },
  DRAFT: { label: 'Draft', tone: 'bg-gold-50 text-gold-800' },
  SUBMITTED: { label: 'With the office', tone: 'bg-navy-50 text-navy-700' },
  PUBLISHED: { label: 'Published', tone: 'bg-leaf-50 text-leaf-800' },
} as const;

/** Best grade green, through to the last in amber: a glance shows the class. */
function gradeTone(index: number, count: number): string {
  if (index < 0) return 'bg-white text-slate-400';
  const position = count <= 1 ? 0 : index / (count - 1);
  if (position < 0.34) return 'bg-leaf-50 text-leaf-800';
  if (position < 0.67) return 'bg-navy-50 text-navy-800';
  return 'bg-gold-50 text-gold-800';
}

function byStudent(grid: ReportGrid): Record<string, ReportGridChild> {
  return Object.fromEntries(grid.children.map((child) => [child.studentId, child]));
}

export function ReportGridTable({
  grid,
  mode,
  pdfBase,
}: {
  grid: ReportGrid;
  mode: 'teacher' | 'office';
  /** Where one child's PDF opens: "/teacher/documents" or "/school/documents". */
  pdfBase: string;
}) {
  const [rows, setRows] = useState(() => byStudent(grid));
  // A publish or a return re-renders the page with a fresh grid; take it, or
  // the statuses shown here would be the ones from before the click.
  const [source, setSource] = useState(grid);
  if (source !== grid) {
    setSource(grid);
    setRows(byStudent(grid));
  }
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [openRemarks, setOpenRemarks] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const [, startTransition] = useTransition();

  const groups: Array<{ group: string; areas: ReportGrid['areas'] }> = [];
  for (const area of grid.areas) {
    const last = groups[groups.length - 1];
    if (last && last.group === area.group) last.areas.push(area);
    else groups.push({ group: area.group, areas: [area] });
  }

  const locked = (child: ReportGridChild) =>
    child.status === 'PUBLISHED' || (mode === 'teacher' && child.status === 'SUBMITTED');

  function save(
    studentId: string,
    change: { areaId?: string; gradeLevelId?: string | null; remarks?: string },
  ) {
    const child = rows[studentId]!;
    const grades = { ...child.grades };
    if (change.areaId) grades[change.areaId] = change.gradeLevelId ?? null;
    const remarks = change.remarks !== undefined ? change.remarks : child.remarks;

    setRows((current) => ({ ...current, [studentId]: { ...child, grades, remarks } }));
    setSaving((current) => ({ ...current, [studentId]: true }));
    setErrors((current) => ({ ...current, [studentId]: undefined }));

    startTransition(async () => {
      const result = await saveReportCardAction({
        termId: grid.term.id,
        studentId,
        grades: Object.entries(grades).map(([areaId, gradeLevelId]) => ({ areaId, gradeLevelId })),
        remarks,
      });
      setSaving((current) => ({ ...current, [studentId]: false }));
      if (result.error) {
        setErrors((current) => ({ ...current, [studentId]: result.error }));
      } else if (result.child) {
        setRows((current) => ({ ...current, [studentId]: result.child! }));
      }
    });
  }

  function act(run: () => Promise<{ error?: string; success?: string }>) {
    startTransition(async () => {
      const result = await run();
      setMessage(
        result.error
          ? { text: result.error, good: false }
          : result.success
            ? { text: result.success, good: true }
            : null,
      );
    });
  }

  if (grid.areas.length === 0) {
    return (
      <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
        Nothing is set up to grade for this class yet.{' '}
        {mode === 'office'
          ? 'Add subjects and development areas under Results → Setup.'
          : 'Ask the office to set up the report card for this class.'}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <Toast message={message?.text} tone={message?.good === false ? 'bad' : 'good'} />
      <div className="overflow-x-auto rounded-2xl ring-1 ring-navy-950/10">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th
                rowSpan={2}
                className="sticky left-0 z-10 min-w-[14rem] border-b border-navy-950/10 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Child
              </th>
              {groups.map((group) => (
                <th
                  key={group.group}
                  colSpan={group.areas.length}
                  className="border-b border-l border-navy-950/10 px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wider text-navy-700"
                >
                  {group.group}
                </th>
              ))}
              <th
                rowSpan={2}
                className="border-b border-l border-navy-950/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Remarks
              </th>
            </tr>
            <tr className="bg-slate-50">
              {grid.areas.map((area) => (
                <th
                  key={area.id}
                  className="min-w-[8.5rem] border-b border-l border-navy-950/10 px-2 py-2 text-left text-xs font-medium text-navy-950"
                >
                  {area.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.children.map(({ studentId }) => {
              const child = rows[studentId]!;
              const isLocked = locked(child);
              const status = STATUS[child.status];
              return (
                <Fragment key={studentId}>
                  <tr className="align-top">
                    <td className="sticky left-0 z-10 border-b border-navy-950/5 bg-white px-3 py-2">
                      <p className="font-medium text-navy-950">{child.fullName}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${status.tone}`}
                        >
                          {status.label}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {child.graded}/{grid.areas.length}
                        </span>
                        {saving[studentId] && (
                          <span className="text-[11px] text-slate-400">Saving…</span>
                        )}
                      </div>
                      {errors[studentId] && (
                        <p className="mt-1 text-[11px] text-rose-700">{errors[studentId]}</p>
                      )}
                      <div className="mt-1.5 flex flex-wrap gap-2 text-[11px]">
                        {child.reportCardId && (
                          <a
                            href={`${pdfBase}?kind=report-card&id=${child.reportCardId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-navy-700 hover:underline"
                          >
                            PDF
                          </a>
                        )}
                        {mode === 'office' &&
                          (child.status === 'DRAFT' || child.status === 'SUBMITTED') &&
                          child.graded > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                act(() =>
                                  publishAction(grid.classroom.id, grid.term.id, [studentId]),
                                )
                              }
                              className="font-medium text-leaf-800 hover:underline"
                            >
                              Publish
                            </button>
                          )}
                        {mode === 'office' &&
                          child.status === 'PUBLISHED' &&
                          child.reportCardId && (
                            <button
                              type="button"
                              onClick={() => act(() => unpublishAction(child.reportCardId!))}
                              className="font-medium text-rose-700 hover:underline"
                            >
                              Take back
                            </button>
                          )}
                      </div>
                    </td>
                    {grid.areas.map((area) => {
                      const value = child.grades[area.id] ?? '';
                      const index = grid.scale.findIndex((level) => level.id === value);
                      return (
                        <td
                          key={area.id}
                          className="border-b border-l border-navy-950/5 px-1.5 py-1.5"
                        >
                          <select
                            aria-label={`${child.fullName} — ${area.name}`}
                            value={value}
                            disabled={isLocked}
                            onChange={(event) =>
                              save(studentId, {
                                areaId: area.id,
                                gradeLevelId: event.target.value || null,
                              })
                            }
                            className={`w-full rounded-lg border-0 py-1.5 pl-2 pr-7 text-xs font-medium ring-1 ring-inset ring-navy-950/10 disabled:opacity-70 ${gradeTone(index, grid.scale.length)}`}
                          >
                            <option value="">—</option>
                            {grid.scale.map((level) => (
                              <option key={level.id} value={level.id}>
                                {level.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                    <td className="border-b border-l border-navy-950/5 px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => setOpenRemarks(openRemarks === studentId ? null : studentId)}
                        className="whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium text-navy-700 ring-1 ring-navy-950/10 hover:bg-navy-50"
                      >
                        {child.remarks ? 'Edit remarks' : 'Add remarks'}
                      </button>
                    </td>
                  </tr>
                  {openRemarks === studentId && (
                    <tr>
                      <td
                        colSpan={grid.areas.length + 2}
                        className="border-b border-navy-950/5 bg-slate-50 px-3 py-2"
                      >
                        <textarea
                          defaultValue={child.remarks ?? ''}
                          disabled={isLocked}
                          rows={3}
                          maxLength={1500}
                          placeholder={`A few words about ${child.fullName.split(' ')[0]} this term`}
                          onBlur={(event) => {
                            if (event.target.value !== (child.remarks ?? '')) {
                              save(studentId, { remarks: event.target.value });
                            }
                          }}
                          className="w-full rounded-xl border-0 bg-white p-3 text-sm ring-1 ring-inset ring-navy-950/15 focus:ring-2 focus:ring-navy-600"
                        />
                        <p className="mt-1 text-[11px] text-slate-500">
                          Saved when you click away.
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Grades save as you pick them. {grid.scale.map((level) => level.label).join(' · ')}
      </p>
    </div>
  );
}
