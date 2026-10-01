import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReportGrid } from '@poetree/shared';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { loadTerms, pickTerm, termTitle } from '@/lib/results';
import { publishAction, returnClassAction } from '@/lib/results-actions';
import { Card, EmptyState, Notice, PageHeader, Pill } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { ReportGridTable } from '@/components/results/report-grid';
import { StepButton } from '@/components/results/step-button';

/**
 * One class's report cards as the office sees them: the same grid the
 * teacher fills in, with the office's steps on top — publish the class or one
 * child, hand it back, take a published card back to correct it.
 */
export default async function ClassResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ classroomId: string }>;
  searchParams: Promise<{ term?: string }>;
}) {
  const { classroomId } = await params;
  const { term: termId } = await searchParams;

  const { terms } = await loadTerms();
  const term = pickTerm(terms, termId);
  if (!term) notFound();

  let grid: ReportGrid;
  try {
    grid = await apiFetch<ReportGrid>(`/results/classrooms/${classroomId}/terms/${term.id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }

  const { counts } = grid;
  const total = grid.children.length;
  const ready = counts.draft + counts.submitted;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={`/school/results?term=${term.id}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-navy-900"
          >
            <IconArrowLeft size={15} /> Results
          </Link>
        }
        title={grid.classroom.label}
        description={termTitle(term)}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/school/documents?kind=report-cards&id=${classroomId}&term=${term.id}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 hover:bg-navy-50"
            >
              Print class
            </a>
            {/* Disabled rather than hidden once used, so its toast is not
                unmounted along with it. */}
            <StepButton
              action={returnClassAction.bind(null, classroomId, term.id)}
              label="Hand back to teacher"
              confirm="Yes, hand it back"
              variant="secondary"
              disabled={counts.submitted === 0}
            />
            <StepButton
              action={publishAction.bind(null, classroomId, term.id, undefined)}
              label="Publish class"
              confirm={`Yes, send ${ready} ${ready === 1 ? 'card' : 'cards'} to families`}
              variant="gold"
              disabled={ready === 0}
            />
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Pill>{counts.notStarted} not started</Pill>
        <Pill tone="gold">{counts.draft} draft</Pill>
        <Pill tone="brand">{counts.submitted} handed over</Pill>
        <Pill>{counts.published} published</Pill>
      </div>

      {counts.draft > 0 && (
        <div className="mb-4">
          <Notice tone="warning">
            {counts.draft} {counts.draft === 1 ? 'card is' : 'cards are'} still in draft — the class
            teacher has not handed {counts.draft === 1 ? 'it' : 'them'} over. Publishing the class
            sends drafts too.
          </Notice>
        </div>
      )}

      <Card>
        {total === 0 ? (
          <EmptyState title="No children in this class" />
        ) : (
          <ReportGridTable grid={grid} mode="office" pdfBase="/school/documents" />
        )}
      </Card>
    </>
  );
}
