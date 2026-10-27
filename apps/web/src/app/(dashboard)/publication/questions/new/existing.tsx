import Link from 'next/link';
import { ACTIVITY_TYPE_LABELS, type CatalogueActivity, type QuestionRow } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, Pill } from '@/components/ui/layout';

/**
 * What a chapter already holds, shown before anything new is added — so the
 * author sees the "Fruits we eat" page that is there instead of writing a
 * second one, and can add to it or open any of its activities to change it.
 */
export async function ExistingPages({
  pages,
  title,
  description,
}: {
  pages: CatalogueActivity[];
  title: string;
  description?: string;
}) {
  if (pages.length === 0) return null;

  const rows = await Promise.all(
    pages.map((page) => apiFetch<QuestionRow[]>(`/publication/activities/${page.id}/questions`)),
  );

  return (
    <Card title={title} description={description}>
      <div className="space-y-5">
        {pages.map((page, index) => (
          <section key={page.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h3 className="font-medium text-navy-950">{page.title}</h3>
              <span className="text-xs text-slate-500">
                {ACTIVITY_TYPE_LABELS[page.type as keyof typeof ACTIVITY_TYPE_LABELS]?.label ??
                  page.type}
              </span>
              <Link
                href={`/publication/questions/new?activityId=${page.id}`}
                className="ml-auto rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
              >
                + Add to this page
              </Link>
            </div>
            <QuestionList questions={rows[index] ?? []} />
          </section>
        ))}
      </div>
    </Card>
  );
}

/** A page's activities, each opening to be changed. */
export function QuestionList({ questions }: { questions: QuestionRow[] }) {
  if (questions.length === 0) {
    return <p className="text-sm text-slate-500">Nothing written on this page yet.</p>;
  }

  return (
    <ol className="divide-y divide-navy-950/[0.06] rounded-xl ring-1 ring-navy-950/[0.08]">
      {questions.map((question, index) => {
        const picture = question.promptImageUrl?.split('/').pop();
        return (
          <li key={question.id}>
            <Link
              href={`/publication/questions/${question.id}`}
              className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-navy-50/60"
            >
              <span className="w-5 shrink-0 text-xs font-semibold text-slate-400">{index + 1}</span>
              {picture ? (
                <img
                  src={`/attachments?kind=catalogue&id=${picture}`}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-md object-contain ring-1 ring-navy-950/10"
                />
              ) : question.promptGlyph ? (
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-navy-50 text-base">
                  {question.promptGlyph}
                </span>
              ) : null}
              <span className="min-w-0 flex-1 truncate text-navy-950">{question.say}</span>
              {question.problem ? (
                <Pill tone="neutral">{question.problem}</Pill>
              ) : (
                <span className="shrink-0 text-xs font-medium text-navy-700">Edit</span>
              )}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
