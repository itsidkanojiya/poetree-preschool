import Link from 'next/link';
import type { Metadata } from 'next';
import type { ChapterOption } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { NewActivityForm } from '../forms';

export const metadata: Metadata = { title: 'Add a question type · Poetree Admin' };

interface Skill {
  id: string;
  code: string;
  name: string;
}

interface ClassLevel {
  id: string;
  code: string;
  name: string;
}

interface BookOption {
  id: string;
  name: string;
  classLevel: { name: string };
}

export default async function NewActivityPage() {
  const [skills, classLevels, books, chapters] = await Promise.all([
    apiFetch<Skill[]>('/publication/skills'),
    apiFetch<ClassLevel[]>('/publication/class-levels'),
    apiFetch<BookOption[]>('/publication/books'),
    apiFetch<ChapterOption[]>('/publication/chapters'),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/publication/question-types"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
          >
            <IconArrowLeft size={16} />
            All question types
          </Link>
        }
        title="Add a question type"
        description="The instruction at the top of a page — “Circle the correct letter”. Its questions are written next."
      />
      <div className="max-w-3xl">
        <Card>
          <NewActivityForm
            skills={skills}
            classLevels={classLevels}
            books={books}
            chapters={chapters}
          />
        </Card>
      </div>
    </>
  );
}
