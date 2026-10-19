import type { Metadata } from 'next';
import type { BookSubjectSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, PageHeader } from '@/components/ui/layout';
import { CatalogueTabs } from '../tabs';
import { NewSubjectForm, SubjectRow } from './forms';

export const metadata: Metadata = { title: 'Subjects · Poetree Admin' };

/**
 * What books are filed under — English, Maths, EVS.
 *
 * In the app a child opens a subject, then its books to read — and in 2D & 3D
 * Animation, its videos.
 * A subject only appears to a child if they have a book in it, so adding one
 * here changes nothing in any school until a book is filed under it.
 */
export default async function SubjectsPage() {
  const subjects = await apiFetch<BookSubjectSummary[]>('/publication/book-subjects');

  return (
    <>
      <PageHeader
        title="Subjects"
        description="What the app groups books and videos under. Children open a subject, then its books to read — or, in 2D & 3D Animation, its videos."
      />

      <CatalogueTabs current="subjects" />

      <div className="space-y-5">
        <Card title="Add a subject">
          <NewSubjectForm />
        </Card>

        <Card
          title="Subjects"
          description="Click a subject’s square to give it a picture — children see it on the subject’s tile, in place of the icon. Switching one off keeps its books; they show under “More books” until filed elsewhere."
        >
          {subjects.length === 0 ? (
            <EmptyState
              title="No subjects yet"
              description="Add English, Maths and the rest, then file each book under one."
            />
          ) : (
            <div className="divide-y divide-navy-950/5">
              {subjects.map((subject) => (
                <SubjectRow key={subject.id} subject={subject} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
