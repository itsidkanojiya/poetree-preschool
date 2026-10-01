import Link from 'next/link';
import type { GradeLevelSummary, ReportAreaSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { loadTerms } from '@/lib/results';
import { Card, Notice, PageHeader } from '@/components/ui/layout';
import { ResultsTabs } from '../tabs';
import { AreasEditor, ScaleEditor, TermsEditor } from './forms';

/**
 * Everything a report card is made of, set up once: the grades, the terms of
 * the year, and what each class level is graded on.
 */
export default async function ResultsSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>;
}) {
  const { level } = await searchParams;

  const [scale, { terms, problem }, levels] = await Promise.all([
    apiFetch<GradeLevelSummary[]>('/results/scale'),
    loadTerms(),
    apiFetch<Array<{ id: string; name: string }>>('/class-levels'),
  ]);

  const selected = levels.find((l) => l.id === level) ?? levels[0];
  const areas = selected
    ? await apiFetch<ReportAreaSummary[]>('/results/areas', {
        query: { classLevelId: selected.id },
      })
    : [];

  return (
    <>
      <PageHeader
        title="Results"
        description="Set up once: your grades, this year’s terms, and what each class is graded on."
      />
      <ResultsTabs current="setup" />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card
          title="Grades"
          description="The words a report card uses, best first. Families see what each one means."
        >
          <ScaleEditor scale={scale} />
        </Card>

        <Card
          title="Terms"
          description={terms[0] ? `For ${terms[0].academicYearName}` : 'For this academic year'}
        >
          {problem ? <Notice tone="warning">{problem}</Notice> : <TermsEditor terms={terms} />}
        </Card>
      </div>

      <Card
        className="mt-5"
        title="What each class is graded on"
        description="Subjects from the books and areas of development, under headings of your choosing."
      >
        {!selected ? (
          <p className="text-sm text-slate-500">Add class levels first.</p>
        ) : (
          <>
            <nav className="mb-5 flex flex-wrap gap-1.5" aria-label="Class level">
              {levels.map((l) => (
                <Link
                  key={l.id}
                  href={`/school/results/setup?level=${l.id}`}
                  aria-current={l.id === selected.id ? 'page' : undefined}
                  className={`rounded-xl px-3.5 py-2 text-sm font-medium ${
                    l.id === selected.id
                      ? 'bg-navy-900 text-white'
                      : 'text-navy-900 ring-1 ring-inset ring-navy-950/15 hover:bg-navy-50'
                  }`}
                >
                  {l.name}
                </Link>
              ))}
            </nav>
            <AreasEditor
              key={selected.id}
              classLevelId={selected.id}
              classLevelName={selected.name}
              areas={areas}
            />
          </>
        )}
      </Card>
    </>
  );
}
