import Link from 'next/link';
import type { Metadata } from 'next';
import type { AcademicYearSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { Card, EmptyState, Notice, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { AddHeadForm, StructureForm, type SavedItem } from './forms';
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
}

const perYear = (frequency: FrequencyValue) =>
  FREQUENCIES.find((f) => f.value === frequency)?.perYear ?? 1;

/**
 * What each standard pays, year by year.
 *
 * Every standard has its own amounts, and every school its own structure. A
 * fee charged "Once, for new children" — admission — is billed only in a
 * child's first year at the school, whole, with the first installment. The
 * installment plans divide the rest of the year between them.
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
        description="What each standard pays this year. Installment plans divide it; an admission fee is charged once, to children new to the school, with the first installment."
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
                      className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm text-navy-950"
                    >
                      {head.name}
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
                const saved: Record<string, SavedItem> = Object.fromEntries(
                  (structure?.items ?? []).map((item) => [
                    item.feeHeadId,
                    { amountInPaise: item.amountInPaise, frequency: item.frequency },
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
                        ? `${formatPrice(yearly)} a year${once > 0 ? ` · ${formatPrice(once)} admission (new children)` : ''}`
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
