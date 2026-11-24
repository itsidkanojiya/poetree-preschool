import Link from 'next/link';
import type { Metadata } from 'next';
import type { PaymentProofView } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { formatDate, formatPrice } from '@/lib/format';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { OutcomeToast, type Outcome } from '../../outcome-toast';
import { ReviewProof } from './review';

export const metadata: Metadata = { title: 'Payments to approve · Poetree' };

const METHOD = { UPI: 'UPI', BANK_TRANSFER: 'Bank transfer' } as const;

function Screenshot({ fileId, name }: { fileId: string; name: string }) {
  return (
    <a
      href={`/attachments?id=${fileId}`}
      target="_blank"
      rel="noreferrer"
      className="block h-40 w-28 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-navy-950/10 transition hover:ring-navy-600"
      aria-label={`Open ${name}’s payment screenshot full size`}
    >
      <img
        src={`/attachments?id=${fileId}`}
        alt={`Payment screenshot from ${name}’s family`}
        className="h-full w-full object-cover object-top"
        loading="lazy"
      />
    </a>
  );
}

/**
 * Screenshots families have sent from the app. Nothing is paid until it is
 * approved here: approving records the payment with a receipt; rejecting
 * tells the family why.
 */
export default async function ToApprovePage({ searchParams }: { searchParams: Promise<Outcome> }) {
  const [outcome, waiting, all] = await Promise.all([
    searchParams,
    apiFetch<PaymentProofView[]>('/fees/proofs', { query: { status: 'WAITING' } }),
    apiFetch<PaymentProofView[]>('/fees/proofs'),
  ]);
  const checked = all.filter((p) => p.status !== 'WAITING').slice(0, 20);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/school/fees"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
          >
            <IconArrowLeft size={16} aria-hidden="true" />
            Fees
          </Link>
        }
        title="Payments to approve"
        description="Parents paid by UPI or bank transfer and sent a screenshot. Check it against your account, then approve or reject."
      />

      <OutcomeToast
        outcome={outcome}
        removed={(who) => who}
        restored={(who) => who}
        messages={{
          approved: (who) => `Approved: ${who}. The receipt is in the family’s app.`,
          rejected: (who) => `Rejected: ${who}. The family has been told why.`,
        }}
      />

      <div className="space-y-6">
        <Card title={`Waiting (${waiting.length})`} description="Oldest first.">
          {waiting.length === 0 ? (
            <EmptyState
              title="Nothing to approve"
              description="When a parent sends a screenshot from the app, it appears here."
            />
          ) : (
            <ul className="divide-y divide-navy-950/[0.06]">
              {waiting.map((proof) => (
                <li key={proof.id} className="flex flex-col gap-4 py-4 sm:flex-row">
                  <Screenshot fileId={proof.screenshotFileId} name={proof.student.name} />
                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <p className="font-semibold text-navy-950">
                        <Link
                          href={`/school/students/${proof.student.id}`}
                          className="hover:underline"
                        >
                          {proof.student.name}
                        </Link>
                        {proof.student.classroomLabel && (
                          <span className="font-normal text-slate-500">
                            {' '}
                            · {proof.student.classroomLabel}
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-slate-600">
                        {proof.label} · {formatPrice(proof.amountInPaise)} · {METHOD[proof.method]}{' '}
                        · sent {formatDate(proof.createdAt)}
                      </p>
                      {proof.reference && (
                        <p className="text-sm text-slate-600">
                          Reference: <span className="font-mono">{proof.reference}</span>
                        </p>
                      )}
                    </div>
                    <ReviewProof
                      proofId={proof.id}
                      who={proof.student.name}
                      amountInPaise={proof.amountInPaise}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {checked.length > 0 && (
          <Card title="Recently checked">
            <ul className="divide-y divide-navy-950/[0.06] text-sm">
              {checked.map((proof) => (
                <li key={proof.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <span className="font-medium text-navy-950">{proof.student.name}</span>
                  <span className="text-slate-600">
                    {proof.label} · {formatPrice(proof.amountInPaise)}
                  </span>
                  {proof.status === 'APPROVED' ? (
                    <Pill tone="brand">
                      Approved{proof.receiptNo ? ` · ${proof.receiptNo}` : ''}
                    </Pill>
                  ) : (
                    <Pill tone="gold">Rejected: {proof.rejectReason}</Pill>
                  )}
                  <span className="ml-auto text-xs text-slate-500">
                    {formatDate(proof.reviewedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
