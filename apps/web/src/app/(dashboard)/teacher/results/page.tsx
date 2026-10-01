import type { ReportGrid } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { loadTerms, pickTerm, termTitle } from '@/lib/results';
import { submitClassAction } from '@/lib/results-actions';
import { Card, EmptyState, Notice, PageHeader } from '@/components/ui/layout';
import { ReportGridTable } from '@/components/results/report-grid';
import { StepButton } from '@/components/results/step-button';

interface MyClassroom {
  id: string;
  label: string;
  studentCount: number;
}

const PICKER =
  'w-full rounded-xl border-0 bg-white py-2.5 pl-3.5 pr-9 text-sm text-navy-950 shadow-sm ring-1 ring-inset ring-navy-950/15 focus:ring-2 focus:ring-inset focus:ring-navy-600';

/**
 * The class teacher's report cards: one class, one term, every child's grades
 * in a grid. When they are done, the class goes to the office, which checks
 * and sends the cards to families.
 */
export default async function TeacherResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ classroomId?: string; term?: string }>;
}) {
  const { classroomId, term: termId } = await searchParams;

  const [classrooms, { terms, problem }] = await Promise.all([
    apiFetch<MyClassroom[]>('/me/classrooms'),
    loadTerms(),
  ]);

  if (classrooms.length === 0) {
    return (
      <>
        <PageHeader title="Report cards" />
        <EmptyState
          title="You are not assigned to a class yet"
          description="Ask the school office to assign you as a class teacher."
        />
      </>
    );
  }

  const term = pickTerm(terms, termId);
  if (!term) {
    return (
      <>
        <PageHeader title="Report cards" />
        <EmptyState
          title="No terms yet"
          description={
            problem ?? 'The office sets up the terms for this year. Ask them to add one.'
          }
        />
      </>
    );
  }

  const selected = classrooms.find((c) => c.id === classroomId) ?? classrooms[0]!;
  const grid = await apiFetch<ReportGrid>(`/results/classrooms/${selected.id}/terms/${term.id}`);
  const { counts } = grid;
  const total = grid.children.length;

  return (
    <>
      <PageHeader
        title="Report cards"
        description="Pick a grade for each child. Everything saves as you go; hand the class to the office when you are done."
      />

      <Card className="mb-5">
        <form className="flex flex-wrap items-end gap-3" action="/teacher/results">
          <div className="min-w-[13rem]">
            <label htmlFor="classroomId" className="mb-1.5 block text-sm font-medium text-navy-950">
              Class
            </label>
            <select
              id="classroomId"
              name="classroomId"
              defaultValue={selected.id}
              className={PICKER}
            >
              {classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.label} ({classroom.studentCount})
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[11rem]">
            <label htmlFor="term" className="mb-1.5 block text-sm font-medium text-navy-950">
              Term
            </label>
            <select id="term" name="term" defaultValue={term.id} className={PICKER}>
              {terms
                .filter((t) => t.isActive)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 hover:bg-navy-50"
          >
            Show
          </button>
        </form>
      </Card>

      <div className="mb-5">
        {total > 0 && counts.published === total ? (
          <Notice tone="success" title="Sent to families">
            Every card in this class has been published.
          </Notice>
        ) : counts.submitted > 0 && counts.draft === 0 ? (
          <Notice tone="info" title="With the office">
            The office is checking these cards. If something needs changing, ask them to hand the
            class back to you.
          </Notice>
        ) : counts.submitted > 0 || counts.published > 0 ? (
          <Notice tone="warning" title="Partly handed over">
            {counts.submitted + counts.published} of {total} cards are with the office or sent. The
            rest are still yours to finish.
          </Notice>
        ) : null}
      </div>

      <Card
        title={`${grid.classroom.label} — ${termTitle(term)}`}
        description={`${total - counts.notStarted} of ${total} started · ${counts.draft} in draft`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/teacher/documents?kind=report-cards&id=${selected.id}&term=${term.id}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl px-3 py-2.5 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 hover:bg-navy-50"
            >
              Print class
            </a>
            <StepButton
              action={submitClassAction.bind(null, selected.id, term.id)}
              label="Send to office"
              confirm={
                counts.notStarted > 0
                  ? `Send — ${counts.notStarted} not started`
                  : `Yes, send ${counts.draft} cards`
              }
              disabled={counts.draft === 0}
            />
          </div>
        }
      >
        {total === 0 ? (
          <EmptyState title="No children in this class" />
        ) : (
          <ReportGridTable grid={grid} mode="teacher" pdfBase="/teacher/documents" />
        )}
      </Card>
    </>
  );
}
