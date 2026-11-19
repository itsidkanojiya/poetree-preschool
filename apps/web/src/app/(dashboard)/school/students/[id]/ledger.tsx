import { Card, EmptyState, Pill } from '@/components/ui/layout';
import { DeleteButton } from '@/components/ui/delete-button';
import { formatDate, formatPrice } from '@/lib/format';
import { deleteInvoiceAction, deletePaymentAction } from '../../delete-actions';

export interface Ledger {
  invoices: Array<{
    id: string;
    invoiceNo: string;
    periodLabel: string;
    academicYearName: string;
    dueDate: string;
    netInPaise: number;
    paidInPaise: number;
    outstandingInPaise: number;
    status: string;
  }>;
  payments: Array<{
    id: string;
    receiptNo: string;
    amountInPaise: number;
    paidOn: string;
    method: string;
  }>;
  totals: { billed: number; paid: number; outstanding: number };
}

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

/**
 * Every invoice and payment on this child, with the two permanent deletes the
 * school chose: a payment (what it paid is owed again, its refund goes with it)
 * and an invoice once no payment is on it.
 */
export function LedgerCard({ studentId, ledger }: { studentId: string; ledger: Ledger }) {
  return (
    <Card
      title="Invoices and payments"
      description={`Billed ${formatPrice(ledger.totals.billed)} · paid ${formatPrice(
        ledger.totals.paid,
      )} · owed ${formatPrice(ledger.totals.outstanding)}`}
    >
      {ledger.invoices.length === 0 && ledger.payments.length === 0 ? (
        <EmptyState title="Nothing billed yet" description="Invoices appear here once raised." />
      ) : (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Invoices
            </h3>
            <ul className="divide-y divide-navy-950/[0.06]">
              {ledger.invoices.map((invoice) => (
                <li key={invoice.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-navy-950">
                      {invoice.invoiceNo} · {invoice.periodLabel}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {invoice.academicYearName} · due {formatDate(invoice.dueDate)} ·{' '}
                      {formatPrice(invoice.netInPaise)}, paid {formatPrice(invoice.paidInPaise)}
                    </span>
                  </span>
                  <Pill tone={invoice.status === 'PAID' ? 'brand' : 'neutral'}>
                    {titleCase(invoice.status)}
                  </Pill>
                  <DeleteButton
                    action={deleteInvoiceAction.bind(null, studentId, invoice.id)}
                    title={`Delete invoice ${invoice.invoiceNo}?`}
                    body={
                      invoice.paidInPaise > 0
                        ? 'A payment is on this invoice, so it will be refused: delete that payment first.'
                        : `The ${formatPrice(invoice.netInPaise)} it billed is no longer owed, and it leaves the fee card and every report.`
                    }
                  />
                </li>
              ))}
            </ul>
          </section>

          {ledger.payments.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Payments
              </h3>
              <ul className="divide-y divide-navy-950/[0.06]">
                {ledger.payments.map((payment) => {
                  const refund = payment.amountInPaise < 0;
                  return (
                    <li key={payment.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-navy-950">
                          {payment.receiptNo}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {formatDate(payment.paidOn)} · {titleCase(payment.method)}
                        </span>
                      </span>
                      <span
                        className={`text-sm font-medium tabular-nums ${
                          refund ? 'text-rose-700' : 'text-navy-950'
                        }`}
                      >
                        {refund ? '−' : ''}
                        {formatPrice(Math.abs(payment.amountInPaise))}
                      </span>
                      {refund ? (
                        <span className="text-xs text-slate-400">Refund</span>
                      ) : (
                        <DeleteButton
                          action={deletePaymentAction.bind(null, studentId, payment.id)}
                          title={`Delete payment ${payment.receiptNo}?`}
                          body={`The ${formatPrice(
                            payment.amountInPaise,
                          )} it paid is owed again on the invoices it settled. If it was refunded, the refund is deleted with it.`}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </Card>
  );
}
