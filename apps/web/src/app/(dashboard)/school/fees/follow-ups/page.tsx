import Link from 'next/link';
import type { Metadata } from 'next';
import type { FeeFollowUpView, OverdueFamily } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { TCell, THead, TPrimary, TRow, Table, type Column } from '@/components/ui/table';
import { IconArrowLeft } from '@/components/icons';
import { formatDay, formatMoment } from '../calendar';
import { CloseFollowUp, FamilyRow } from './forms';
import { OUTCOME_LABELS, STATE_LABELS } from './labels';

export const metadata: Metadata = { title: 'Fee follow-ups · Poetree' };

const FAMILY_COLUMNS: Array<string | Column> = [
  'Child',
  'Overdue installments',
  { label: 'Outstanding', numeric: true },
  'Guardians',
  'Next follow-up',
  { label: 'Log a follow-up', hidden: true },
];

function relation(value: string | null): string {
  return value ? value.charAt(0) + value.slice(1).toLowerCase() : '';
}

/** Whether the family was, or will be, reminded about this follow-up. */
function reminderText(followUp: FeeFollowUpView): string {
  if (!followUp.remindParent) return 'Not asked for';
  if (followUp.reminderSentAt) return `Sent ${formatMoment(followUp.reminderSentAt)}`;
  if (followUp.state === 'PENDING' || followUp.state === 'OVERDUE') {
    return `Due ${formatDay(followUp.followUpOn)}`;
  }
  return 'Not sent';
}

/**
 * Families behind on an installment, and the office's record of chasing them.
 *
 * A call is logged here by whoever made it; nothing records one on its own.
 * Each follow-up carries the date to try again, and the family can be
 * reminded in the app that day.
 */
export default async function FeeFollowUpsPage() {
  const [families, followUps] = await Promise.all([
    apiFetch<OverdueFamily[]>('/fees/overdue'),
    apiFetch<FeeFollowUpView[]>('/fees/follow-ups'),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/school/fees"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
          >
            <IconArrowLeft size={16} />
            Fees
          </Link>
        }
        title="Follow-ups"
        description="Families behind on an installment, the calls made about it, and when to try again."
      />

      <div className="space-y-5">
        <Card
          title="Overdue families"
          description="Most owed first. Log what was said after each call."
        >
          {families.length === 0 ? (
            <EmptyState
              title="Nobody is overdue"
              description="Every installment past its due date has been paid."
            />
          ) : (
            <Table>
              <THead columns={FAMILY_COLUMNS} />
              <tbody>
                {families.map((family) => (
                  <FamilyRow key={family.studentId} family={family} columns={FAMILY_COLUMNS.length}>
                    <TCell>
                      <TPrimary
                        sub={[family.admissionNo, family.classroomLabel]
                          .filter(Boolean)
                          .join(' · ')}
                      >
                        <Link
                          href={`/school/students/${family.studentId}`}
                          className="hover:text-navy-700"
                        >
                          {family.studentName}
                        </Link>
                      </TPrimary>
                    </TCell>
                    <TCell>
                      <ul className="space-y-1">
                        {family.invoices.map((invoice) => (
                          <li key={invoice.id} className="text-xs">
                            <span className="font-medium text-navy-950">{invoice.periodLabel}</span>{' '}
                            · {invoice.invoiceNo} · due {formatDay(invoice.dueDate)} ·{' '}
                            {formatPrice(invoice.outstandingInPaise)}
                          </li>
                        ))}
                      </ul>
                    </TCell>
                    <TCell numeric className="font-medium text-navy-950">
                      {formatPrice(family.outstandingInPaise)}
                    </TCell>
                    <TCell>
                      {family.guardians.length === 0 ? (
                        <span className="text-xs text-slate-400">No guardian linked</span>
                      ) : (
                        <ul className="space-y-1">
                          {family.guardians.map((guardian, index) => (
                            <li
                              key={`${guardian.name}-${index}`}
                              className="flex flex-wrap items-center gap-x-2 text-xs"
                            >
                              <span className="text-navy-950">
                                {guardian.name}
                                {guardian.relation && (
                                  <span className="text-slate-500">
                                    {' '}
                                    ({relation(guardian.relation)})
                                  </span>
                                )}
                              </span>
                              {/* Only opens the phone. Tapping Call is not a
                                  logged contact; the office logs one with
                                  "Log follow-up" once it has spoken to them. */}
                              {guardian.phone && (
                                <a
                                  href={`tel:${guardian.phone.replace(/[^\d+]/g, '')}`}
                                  className="font-medium text-navy-700 underline"
                                  title={guardian.phone}
                                >
                                  Call
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </TCell>
                    <TCell>
                      {family.nextFollowUp ? (
                        formatDay(family.nextFollowUp.followUpOn)
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TCell>
                  </FamilyRow>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card
          title="Follow-ups"
          description="Open ones first, soonest date first; then those closed in the last 30 days."
        >
          {followUps.length === 0 ? (
            <EmptyState
              title="No follow-ups yet"
              description="Log one against an overdue family above after calling them."
            />
          ) : (
            <Table>
              <THead
                columns={[
                  'Child',
                  'Installment',
                  'Follow-up date',
                  'State',
                  'Outcome',
                  'Note',
                  'Logged by',
                  'Reminder',
                  { label: 'Close', hidden: true },
                ]}
              />
              <tbody>
                {followUps.map((followUp) => {
                  const state = STATE_LABELS[followUp.state];
                  const open = followUp.state === 'PENDING' || followUp.state === 'OVERDUE';
                  return (
                    <TRow key={followUp.id}>
                      <TCell>
                        <TPrimary
                          sub={[followUp.student.admissionNo, followUp.student.classroomLabel]
                            .filter(Boolean)
                            .join(' · ')}
                        >
                          {followUp.student.name}
                        </TPrimary>
                      </TCell>
                      <TCell>
                        <TPrimary
                          sub={`due ${formatDay(followUp.invoice.dueDate)} · ${formatPrice(
                            followUp.invoice.outstandingInPaise,
                          )} left`}
                        >
                          {followUp.invoice.periodLabel} · {followUp.invoice.invoiceNo}
                        </TPrimary>
                      </TCell>
                      <TCell className="whitespace-nowrap">{formatDay(followUp.followUpOn)}</TCell>
                      <TCell>
                        <Pill tone={state.tone}>{state.label}</Pill>
                        {followUp.closedReason && (
                          <p className="mt-1 text-xs text-slate-500">{followUp.closedReason}</p>
                        )}
                      </TCell>
                      <TCell>
                        {followUp.outcome ? OUTCOME_LABELS[followUp.outcome] : '—'}
                        {followUp.contactedAt && (
                          <p className="mt-0.5 text-xs text-slate-500">
                            {formatMoment(followUp.contactedAt)}
                          </p>
                        )}
                      </TCell>
                      <TCell className="max-w-[16rem] text-xs">{followUp.note ?? '—'}</TCell>
                      <TCell>{followUp.loggedBy}</TCell>
                      <TCell className="text-xs">{reminderText(followUp)}</TCell>
                      <TCell>{open && <CloseFollowUp followUpId={followUp.id} />}</TCell>
                    </TRow>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
