import Link from 'next/link';
import type { ClassroomSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { Table, TCell, THead, TPrimary, TRow } from '@/components/ui/table';
import { IconArrowLeft, IconSpark } from '@/components/icons';
import { formatDate } from '@/lib/format';

/**
 * What each child can actually do, and the evidence for it.
 *
 * Every figure on this screen is shown with its basis, never alone. "80%" is a
 * verdict a parent can only accept or argue with; "80% — 8 of 10 questions
 * across 2 attempts" is something a teacher and a parent can look at together.
 *
 * There is no ranking, no leaderboard and no comparison between children by
 * design. The question this screen answers is "what does this child need next",
 * not "who is ahead".
 */

interface SkillRow {
  skillId: string;
  skillCode: string;
  skillName: string;
  masteryPercent: number;
  correctCount: number;
  totalCount: number;
  attemptsCount: number;
  lastAssessedAt: string | null;
  basis: string;
}

interface ClassroomRow {
  studentId: string;
  fullName: string;
  skillsAttempted: number;
  averageMastery: number;
  needsAttention: string[];
}

/** Mastery bands. The wording is what a teacher would say out loud. */
function band(percent: number, attempts: number): { label: string; tone: string; bar: string } {
  if (attempts === 0) {
    return { label: 'Not started', tone: 'text-slate-400', bar: 'bg-slate-200' };
  }
  if (percent >= 80) return { label: 'Confident', tone: 'text-leaf-600', bar: 'bg-leaf-500' };
  if (percent >= 50) return { label: 'Getting there', tone: 'text-gold-700', bar: 'bg-gold-400' };
  return { label: 'Needs practice', tone: 'text-rose-600', bar: 'bg-rose-400' };
}

function MasteryBar({ percent, attempts }: { percent: number; attempts: number }) {
  const { bar } = band(percent, attempts);
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-navy-950/[0.07]"
      role="presentation"
    >
      <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(percent, 2)}%` }} />
    </div>
  );
}

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const single = (key: string): string | undefined => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const classrooms = await apiFetch<ClassroomSummary[]>('/classrooms');
  const studentId = single('studentId');
  const classroomId = single('classroomId') || classrooms[0]?.id;

  if (classrooms.length === 0) {
    return (
      <>
        <PageHeader title="Progress" description="What each child can do, and how we know." />
        <Card>
          <EmptyState
            title="No classes yet"
            description="Create a class and enrol children before progress has anything to measure."
          />
        </Card>
      </>
    );
  }

  if (studentId) {
    return <StudentView studentId={studentId} classroomId={classroomId} />;
  }

  const { students } = await apiFetch<{ students: ClassroomRow[] }>(
    `/progress/classrooms/${classroomId}`,
  );

  const selected = classrooms.find((c) => c.id === classroomId);
  const started = students.filter((s) => s.skillsAttempted > 0);

  return (
    <>
      <PageHeader
        title="Progress"
        description="What each child can do, and how we know. No rankings — this is about what to teach next."
      />

      <Card className="mb-5">
        <form className="flex flex-wrap items-end gap-3" action="/school/progress">
          <div className="min-w-[15rem]">
            <label htmlFor="classroomId" className="mb-1.5 block text-sm font-medium text-navy-950">
              Class
            </label>
            <select
              id="classroomId"
              name="classroomId"
              defaultValue={classroomId}
              className="w-full rounded-xl border-0 bg-white px-3 py-2.5 text-sm text-navy-950 ring-1 ring-inset ring-navy-950/15 focus:ring-2 focus:ring-navy-700"
            >
              {classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.classLevel.name} — {classroom.section}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800"
          >
            Show
          </button>
        </form>
      </Card>

      <Card
        title={selected ? `${selected.classLevel.name} — ${selected.section}` : 'Class'}
        description="Open a child to see the skill-by-skill picture."
        action={
          <Pill tone="neutral">
            {started.length} of {students.length} started
          </Pill>
        }
      >
        {students.length === 0 ? (
          <EmptyState
            title="Nobody enrolled in this class"
            description="Enrol children first, then their activity attempts appear here."
          />
        ) : (
          <Table>
            <THead
              columns={[
                'Child',
                { label: 'Skills tried', numeric: true },
                { label: 'Average', numeric: true },
                'Needs practice',
                { label: 'Open', hidden: true },
              ]}
            />
            <tbody>
              {students.map((row) => {
                const tone = band(row.averageMastery, row.skillsAttempted);
                return (
                  <TRow key={row.studentId}>
                    <TCell>
                      <TPrimary>{row.fullName}</TPrimary>
                    </TCell>
                    <TCell numeric>{row.skillsAttempted}</TCell>
                    <TCell numeric className={`font-medium ${tone.tone}`}>
                      {row.skillsAttempted === 0 ? '—' : `${row.averageMastery}%`}
                    </TCell>
                    <TCell>
                      {row.needsAttention.length === 0 ? (
                        <span className="text-xs text-slate-400">
                          {row.skillsAttempted === 0 ? 'Not started' : 'Nothing flagged'}
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {row.needsAttention.map((skill) => (
                            <Pill key={skill} tone="gold">
                              {skill}
                            </Pill>
                          ))}
                        </div>
                      )}
                    </TCell>
                    <TCell>
                      <Link
                        href={`/school/progress?classroomId=${classroomId}&studentId=${row.studentId}`}
                        className="text-sm font-medium text-navy-900 hover:text-navy-700"
                      >
                        Open
                      </Link>
                    </TCell>
                  </TRow>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

async function StudentView({
  studentId,
  classroomId,
}: {
  studentId: string;
  classroomId?: string;
}) {
  const { skills } = await apiFetch<{ skills: SkillRow[] }>(`/progress/students/${studentId}`);

  const attempted = skills.filter((s) => s.attemptsCount > 0);
  const average =
    attempted.length === 0
      ? 0
      : Math.round(attempted.reduce((sum, s) => sum + s.masteryPercent, 0) / attempted.length);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={`/school/progress${classroomId ? `?classroomId=${classroomId}` : ''}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-navy-900"
          >
            <IconArrowLeft size={16} />
            Back to the class
          </Link>
        }
        title="Skill by skill"
        description={
          attempted.length === 0
            ? 'This child has not attempted any activities yet.'
            : `Averaging ${average}% across ${attempted.length} skill${attempted.length === 1 ? '' : 's'} tried.`
        }
      />

      <Card
        title="Skills"
        description="Mastery is the child’s ten most recent attempts, so an early struggle stops counting once they have moved on."
      >
        {skills.length === 0 ? (
          <EmptyState
            title="No skills defined yet"
            description="Learning content has not been published, so there is nothing to measure against."
          />
        ) : (
          <ul className="space-y-3">
            {skills.map((skill) => {
              const tone = band(skill.masteryPercent, skill.attemptsCount);
              return (
                <li
                  key={skill.skillId}
                  className="rounded-xl px-3.5 py-3 ring-1 ring-navy-950/[0.06] transition-colors hover:bg-navy-50"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={tone.tone}>
                        <IconSpark size={15} />
                      </span>
                      <span className="text-sm font-medium text-navy-950">{skill.skillName}</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-sm font-semibold ${tone.tone}`}>
                        {skill.attemptsCount === 0 ? '—' : `${skill.masteryPercent}%`}
                      </span>
                      <span className="text-xs text-slate-400">{tone.label}</span>
                    </div>
                  </div>

                  <div className="mt-2">
                    <MasteryBar percent={skill.masteryPercent} attempts={skill.attemptsCount} />
                  </div>

                  {/* The percentage never travels without its working. */}
                  <p className="mt-1.5 text-xs text-slate-500">
                    {skill.basis}
                    {skill.lastAssessedAt && ` · last on ${formatDate(skill.lastAssessedAt)}`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
