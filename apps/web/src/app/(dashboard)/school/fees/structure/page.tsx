import Link from 'next/link';
import type { Metadata } from 'next';
import type { AcademicYearSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { Card, EmptyState, Notice, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { DeleteButton } from '@/components/ui/delete-button';
import { AddHeadForm, StructureForm, type SavedItem } from './forms';
import { deleteFeeHeadAction } from './actions';
import { FREQUENCIES, type FrequencyValue } from './frequencies';

export const metadata: Metadata = { title: 'Fee structure · Poetree' };

interface FeeHeadRow {
  id: string;
  name: string;
  isActive: boolean;
}

interface StructureRow {
  academicYearId: string;
  classLevelId: string;
  isActive: boolean;
  items: Array<{ feeHeadId: string; amountInPaise: number; frequency: FrequencyValue }>;
  installments: Array<{ dueDate: string; amountInPaise: number }>;
  payInFullEnabled: boolean;
  payInFullDiscountKind: 'FIXED' | 'PERCENT';
  payInFullDiscountValue: number;
}

const perYear = (frequency: FrequencyValue) =>
  FREQUENCIES.find((f) => f.value === frequency)?.perYear ?? 1;

/**
 * What each standard pays, year by year, and how families pay it.
 *
 * Every standard has its own yearly amounts and its own installments, typed
 * as dates and amounts. A fee for new children only — admission — is billed
 * only in a child's first year at the school, whole, with the first
 * installment. A standard can also offer a discount for paying in full.
 */
export default async function FeeStructurePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const [{ year }, years, standards, heads, structures] = await Promise.all([
    searchParams,
    apiFetch<AcademicYearSummary[]>('/academic-years'),
    apiFetch<Array<{ id: string; name: string }>>('/class-levels'),
    apiFetch<FeeHeadRow[]>('/fees/heads'),
    apiFetch<StructureRow[]>('/fees/structures'),
  ]);

  const selected = years.find((y) => y.id === year) ?? years.find((y) => y.isCurrent) ?? years[0];
  const activeHeads = heads.filter((head) => head.isActive).map(({ id, name }) => ({ id, name }));

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
        title="Fee structure"
        description="What each standard pays this year, its installments, and any discount for paying in full. A fee for new children only is added to their first installment."
      />

      {!selected ? (
        <Notice tone="info" title="Create an academic year first">
          Fees belong to a year. Add one under Classrooms.
        </Notice>
      ) : (
        <>
          {years.length > 1 && (
            <nav className="mb-5 flex flex-wrap gap-1.5" aria-label="Academic year">
              {years.map((y) => (
                <Link
                  key={y.id}
                  href={`/school/fees/structure?year=${y.id}`}
                  aria-current={y.id === selected.id ? 'page' : undefined}
                  className={`rounded-xl px-3.5 py-2 text-sm font-medium ${
                    y.id === selected.id
                      ? 'bg-navy-900 text-white'
                      : 'text-navy-900 ring-1 ring-inset ring-navy-950/15 hover:bg-navy-50'
                  }`}
                >
                  {y.name}
                  {y.isCurrent ? ' (current)' : ''}
                </Link>
              ))}
            </nav>
          )}

          <div className="mb-5">
            <Card
              title="Fee heads"
              description="The kinds of fee the school charges. Each standard sets its own amount for each."
            >
              {activeHeads.length > 0 && (
                <ul className="mb-4 flex flex-wrap gap-2">
                  {activeHeads.map((head) => (
                    <li
                      key={head.id}
                      data-fee-head
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 py-1 pl-2.5 pr-1 text-sm text-navy-950"
                    >
                      {head.name}
                      <DeleteButton
                        action={deleteFeeHeadAction.bind(null, head.id)}
                        label="✕"
                        title={`Remove ${head.name}?`}
                        body={
                          <p>
                            {head.name} is taken off every standard. A fee already billed to
                            families cannot be removed.
                          </p>
                        }
                        confirmLabel="Remove for good"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-xs text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
                      />
                    </li>
                  ))}
                </ul>
              )}
              <AddHeadForm />
            </Card>
          </div>

          {activeHeads.length === 0 ? (
            <Card>
              <EmptyState
                title="Add your first fee head"
                description="Start with Tuition, and Admission if new children pay one. Then set each standard's amounts here."
              />
            </Card>
          ) : (
            <div className="grid items-start gap-5 xl:grid-cols-2">
              {standards.map((standard) => {
                const structure = structures.find(
                  (s) =>
                    s.academicYearId === selected.id &&
                    s.classLevelId === standard.id &&
                    s.isActive,
                );
                // A yearly amount each; a fee once set as monthly or quarterly
                // shows as what it comes to in a year, and is saved that way.
                const saved: Record<string, SavedItem> = Object.fromEntries(
                  (structure?.items ?? []).map((item) => [
                    item.feeHeadId,
                    {
                      yearlyInPaise:
                        item.frequency === 'ONE_TIME'
                          ? item.amountInPaise
                          : item.amountInPaise * perYear(item.frequency),
                      newChildrenOnly: item.frequency === 'ONE_TIME',
                    },
                  ]),
                );
                const items = structure?.items ?? [];
                const yearly = items
                  .filter((i) => i.frequency !== 'ONE_TIME')
                  .reduce((sum, i) => sum + i.amountInPaise * perYear(i.frequency), 0);
                const once = items
                  .filter((i) => i.frequency === 'ONE_TIME')
                  .reduce((sum, i) => sum + i.amountInPaise, 0);

                return (
                  <Card
                    key={standard.id}
                    title={standard.name}
                    description={
                      structure
                        ? `${formatPrice(yearly)} a year${once > 0 ? ` · ${formatPrice(once)} more for new children` : ''}${
                            structure.installments.length > 0
                              ? ` · ${structure.installments.length} installment${structure.installments.length === 1 ? '' : 's'}`
                              : ' · installments not set'
                          }`
                        : 'Not set for this year yet.'
                    }
                  >
                    <StructureForm
                      // A new fee head adds a row; a save keeps the form (and its "saved" message).
                      key={`${selected.id}-${standard.id}-${activeHeads.map((h) => h.id).join('.')}`}
                      academicYearId={selected.id}
                      classLevelId={standard.id}
                      standardName={standard.name}
                      heads={activeHeads}
                      saved={saved}
                      savedInstallments={(structure?.installments ?? []).map((i) => ({
                        dueDate: i.dueDate.slice(0, 10),
                        amountInPaise: i.amountInPaise,
                      }))}
                      savedPayInFull={{
                        enabled: structure?.payInFullEnabled ?? false,
                        discountKind: structure?.payInFullDiscountKind ?? 'FIXED',
                        discountValue: structure?.payInFullDiscountValue ?? 0,
                      }}
                    />
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
