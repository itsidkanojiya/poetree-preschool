import type { Metadata } from 'next';
import type { SubjectSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, Notice, PageHeader, Pill } from '@/components/ui/layout';
import { TCell, THead, TRow, Table } from '@/components/ui/table';
import { ClassSetupTabs } from '../tabs';
import { NewSubjectForm, RetireSubjectButton, SubjectRow } from './forms';

export const metadata: Metadata = { title: 'Subjects · Poetree' };

/**
 * What a period can be about.
 *
 * The timetable has always offered a subject picker and there was nothing to
 * put in it: no school owned any subjects and the publication defaults were
 * never written, so every cell read "—" and the grid could not be filled. This
 * is where a school writes its own.
 */
export default async function SubjectsPage() {
  const subjects = await apiFetch<SubjectSummary[]>('/subjects');

  return (
    <>
      <PageHeader
        title="Subjects"
        description="What a period on the timetable can be about — Circle time, Letters, Numbers, Play."
      />

      <ClassSetupTabs current="subjects" />

      <div className="grid items-start gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          {subjects.length === 0 ? (
            <EmptyState
              title="No subjects yet"
              description="Until there is at least one, every subject box on the timetable is empty."
            />
          ) : (
            <Table>
              <THead
                columns={['Subject', { label: 'On the timetable', numeric: true }, '']}
              />
              <tbody>
                {subjects.map((subject) => (
                  <TRow key={subject.id}>
                    <TCell>
                      <SubjectRow subject={subject} />
                    </TCell>
                    {/* Periods across every class that use it. Shown before
                        somebody removes one, not after. */}
                    <TCell numeric>
                      {subject.timetableCount > 0 ? (
                        <Pill tone="brand">{subject.timetableCount}</Pill>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TCell>
                    <TCell>{subject.isOwn && <RetireSubjectButton subject={subject} />}</TCell>
                  </TRow>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Add a subject">
            <NewSubjectForm />
          </Card>

          {subjects.length === 0 && (
            <Notice tone="info" title="The timetable needs these">
              A period can have a teacher without a subject, but the grid reads as empty until the
              subjects exist. Most preschools need five or six: circle time, letters, numbers,
              rhymes, play.
            </Notice>
          )}
        </div>
      </div>
    </>
  );
}
