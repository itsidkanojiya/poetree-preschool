import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ACTIVITY_TYPE_LABELS,
  AUTHORED_ACTIVITY_TYPES,
  type BookSummary,
  type CatalogueActivity,
  type ChapterSummary,
  type QuestionRow,
} from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, Notice, PageHeader } from '@/components/ui/layout';
import { IconArrowLeft } from '@/components/icons';
import { AddQuestionForm } from '../../question-types/[id]/questions/forms';
import { editorDescription } from '../../question-types/[id]/questions/editors/kinds';
import { allActivities } from '../all-activities';
import { AddChapterForm, NewActivityForm } from './forms';
import { ExistingPages, QuestionList } from './existing';
import { SampleBookCard } from '../../books/sample-book';

export const metadata: Metadata = { title: 'Add an activity · Poetree Admin' };

/**
 * Adding an activity in three taps: the book, the chapter, the type — each a
 * card — then what the child does, on the same page.
 *
 * Every choice is in the address, so each step is an ordinary link: the back
 * button steps back, and a half-made activity can be reopened where it was.
 * A chapter's "+ Add activity" on a book's page arrives here with the first
 * two already chosen.
 *
 * With `activityId` it is the other door: one more question on a page that
 * exists, as the Activities list's "Add to …" has always opened.
 */
export default async function NewActivityPage({
  searchParams,
}: {
  searchParams: Promise<{
    bookId?: string;
    chapterId?: string;
    type?: string;
    activityId?: string;
    added?: string;
  }>;
}) {
  const params = await searchParams;
  if (params.activityId) {
    return <AddToPage activityId={params.activityId} added={params.added === '1'} />;
  }

  const [books, activities] = await Promise.all([
    apiFetch<BookSummary[]>('/publication/books'),
    allActivities(),
  ]);
  const book = books.find((each) => each.id === params.bookId);
  const chapters = book
    ? await apiFetch<ChapterSummary[]>(`/publication/books/${book.id}/chapters`)
    : [];
  const noChapter = params.chapterId === 'none';
  const chapter = chapters.find((each) => each.id === params.chapterId);
  const chapterChosen = Boolean(book && (chapter || noChapter));
  const type = (AUTHORED_ACTIVITY_TYPES as readonly string[]).includes(params.type ?? '')
    ? params.type!
    : undefined;

  const step = !book ? 1 : !chapterChosen ? 2 : !type ? 3 : 4;
  const base = '/publication/questions/new';
  const bookHref = book ? `${base}?bookId=${book.id}` : base;
  const chapterHref = book ? `${bookHref}&chapterId=${chapter?.id ?? 'none'}` : base;

  // The pages already in the chosen chapter, to add to instead of starting one.
  const here = book
    ? activities.items.filter(
        (activity) =>
          activity.books.some((each) => each.id === book.id) &&
          (noChapter ? activity.chapter === null : activity.chapter?.id === chapter?.id),
      )
    : [];

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/publication/questions"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
          >
            <IconArrowLeft size={16} />
            All activities
          </Link>
        }
        title="Add an activity"
        description="Choose the book, the chapter and the type. Then write it."
      />

      <div className="max-w-4xl space-y-5">
        <Steps
          step={step}
          choices={[
            { label: 'Book', value: book?.name, href: base },
            {
              label: 'Chapter',
              value: chapter ? chapterName(chapter) : noChapter ? 'Not in a chapter' : undefined,
              href: bookHref,
            },
            {
              label: 'Type',
              value: type
                ? ACTIVITY_TYPE_LABELS[type as keyof typeof ACTIVITY_TYPE_LABELS].label
                : undefined,
              href: chapterHref,
            },
          ]}
        />

        {step === 1 && <BookStep books={books} />}

        {step === 2 && book && (
          <Card title="Which chapter?" description={`In ${book.name}.`}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {chapters
                .filter((each) => each.isActive)
                .map((each) => (
                  <ChoiceCard
                    key={each.id}
                    href={`${bookHref}&chapterId=${each.id}`}
                    title={chapterName(each)}
                    detail={count(each.activityCount, 'activity page', 'activity pages')}
                  />
                ))}
              <ChoiceCard
                href={`${bookHref}&chapterId=none`}
                title="Not in a chapter"
                detail="In the book, under no chapter"
                quiet
              />
            </div>
            <div className="mt-5 border-t border-navy-950/[0.06] pt-4">
              <p className="mb-2 text-sm font-medium text-navy-950">Or start a new chapter</p>
              <AddChapterForm bookId={book.id} />
            </div>
          </Card>
        )}

        {step === 3 && (
          <>
            <Card title="Which type of activity?" description="How the child answers it.">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {AUTHORED_ACTIVITY_TYPES.map((option) => {
                  const there = here.filter((page) => page.type === option).length;
                  return (
                    <ChoiceCard
                      key={option}
                      href={`${chapterHref}&type=${option}`}
                      mark={TYPE_MARK[option]}
                      title={ACTIVITY_TYPE_LABELS[option].label}
                      detail={ACTIVITY_TYPE_LABELS[option].hint}
                      badge={
                        there > 0 ? `${there} ${there === 1 ? 'page' : 'pages'} here` : undefined
                      }
                    />
                  );
                })}
              </div>
            </Card>
            <ExistingPages
              pages={here}
              title={`Already in this chapter (${here.length})`}
              description="Open any activity to change it, or add one more to a page."
            />
          </>
        )}

        {step === 4 && book && type && (
          <ExistingPages
            pages={here.filter((page) => page.type === type)}
            title={`${labelOf(type)} already in this chapter`}
            description="Add to one of these, or start a new page below."
          />
        )}

        {step === 4 && book && type && (
          <Card
            title={
              here.some((page) => page.type === type)
                ? `Or start a new ${labelOf(type)} page`
                : `${labelOf(type)} in ${book.name}`
            }
            description={editorDescription(type)}
          >
            <WriteStep
              type={type}
              book={book}
              chapterId={chapter?.id ?? null}
              here={here}
              activities={activities.items}
            />
          </Card>
        )}
      </div>
    </>
  );
}

/** A small picture for each type, so the cards can be told apart at a glance. */
const TYPE_MARK: Record<string, string> = {
  FLASHCARD: '🃏',
  SINGLE_CHOICE: '👆',
  ODD_ONE_OUT: '🔍',
  MULTIPLE_CHOICE: '✅',
  LETTER_HUNT: '🔤',
  MATCH_PAIRS: '🔗',
  SORT_GROUPS: '🧺',
  COUNT_OUT: '🖍️',
  FILL_GAP: '🚂',
  RHYME: '🎵',
  STORY: '📖',
};

function labelOf(type: string): string {
  return ACTIVITY_TYPE_LABELS[type as keyof typeof ACTIVITY_TYPE_LABELS]?.label ?? type;
}

function count(n: number, one: string, many: string): string {
  return n === 0 ? `No ${many} yet` : `${n} ${n === 1 ? one : many}`;
}

function chapterName(chapter: ChapterSummary): string {
  return chapter.number ? `${chapter.number}. ${chapter.name}` : chapter.name;
}

/** "1 Book · 2 Chapter · 3 Type": where you are, what is chosen, and Change. */
function Steps({
  step,
  choices,
}: {
  step: number;
  choices: Array<{ label: string; value?: string; href: string }>;
}) {
  return (
    <ol className="flex flex-wrap gap-2">
      {choices.map((choice, index) => {
        const number = index + 1;
        const done = Boolean(choice.value);
        const current = number === step;
        return (
          <li
            key={choice.label}
            className={`flex min-w-0 items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm ring-1 ${
              current
                ? 'bg-navy-900 text-white ring-navy-900'
                : done
                  ? 'bg-white text-navy-950 ring-navy-200'
                  : 'bg-white text-slate-400 ring-navy-950/[0.06]'
            }`}
          >
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                current
                  ? 'bg-white text-navy-900'
                  : done
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100'
              }`}
            >
              {done && !current ? '✓' : number}
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] uppercase tracking-wider opacity-70">
                {choice.label}
              </span>
              <span className="block truncate font-medium">{choice.value ?? 'Choose'}</span>
            </span>
            {done && (
              <Link
                href={choice.href}
                className={`ml-1 text-xs underline-offset-2 hover:underline ${
                  current ? 'text-white/80' : 'text-navy-700'
                }`}
              >
                Change
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Step 1: every book, under its standard. */
function BookStep({ books }: { books: BookSummary[] }) {
  const live = books.filter((book) => book.isActive);
  if (live.length === 0) {
    return (
      <EmptyState
        title="No books yet"
        description="An activity is a page of a book. Add a book first, under Books."
      />
    );
  }

  const byLevel = new Map<string, BookSummary[]>();
  for (const book of live) {
    byLevel.set(book.classLevel.name, [...(byLevel.get(book.classLevel.name) ?? []), book]);
  }

  return (
    <Card title="Which book?" description="The activity becomes a page of this book.">
      <SampleBookCard bookId={live.find((book) => book.code === 'PRE_PRIMARY_A_SAMPLES')?.id} />
      <div className="space-y-5">
        {[...byLevel.entries()].map(([level, group]) => (
          <div key={level}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {level}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.map((book) => (
                <ChoiceCard
                  key={book.id}
                  href={`/publication/questions/new?bookId=${book.id}`}
                  title={book.name}
                  detail={[
                    book.subject?.name,
                    count(book.activityCount, 'activity page', 'activity pages'),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  cover={book.coverUrl}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** One tappable choice. */
function ChoiceCard({
  href,
  title,
  detail,
  mark,
  cover,
  quiet,
  badge,
}: {
  href: string;
  title: string;
  detail?: string;
  mark?: string;
  cover?: string | null;
  quiet?: boolean;
  /** "2 pages here": what the chapter already has of this. */
  badge?: string;
}) {
  const coverId = cover?.split('/').pop();
  return (
    <Link
      href={href}
      className={`flex min-w-0 items-start gap-3 rounded-xl p-3.5 ring-1 transition-colors hover:bg-navy-50 hover:ring-navy-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 ${
        quiet ? 'bg-slate-50 ring-navy-950/[0.06]' : 'bg-white ring-navy-950/[0.1]'
      }`}
    >
      {coverId ? (
        <img
          src={`/attachments?kind=catalogue&id=${coverId}`}
          alt=""
          className="h-12 w-10 shrink-0 rounded-md object-cover ring-1 ring-navy-950/10"
        />
      ) : mark ? (
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-navy-50 text-xl"
        >
          {mark}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-navy-950">{title}</span>
          {badge && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
              {badge}
            </span>
          )}
        </span>
        {detail && (
          <span className="mt-0.5 block text-xs leading-snug text-slate-500">{detail}</span>
        )}
      </span>
    </Link>
  );
}

/**
 * The form: a new page in the chosen book and chapter, with its first
 * question. What it counts towards is guessed from its neighbours — the skill
 * the chapter's other pages count towards, else the book's — and can be
 * changed under More options.
 */
async function WriteStep({
  type,
  book,
  chapterId,
  here,
  activities,
}: {
  type: string;
  book: BookSummary;
  chapterId: string | null;
  here: CatalogueActivity[];
  activities: CatalogueActivity[];
}) {
  const skills = await apiFetch<Array<{ id: string; name: string }>>('/publication/skills');
  if (skills.length === 0) {
    return (
      <Notice tone="info" title="No skills yet">
        Every activity counts towards a skill. Add one before writing activities.
      </Notice>
    );
  }

  const inBook = activities.filter((activity) =>
    activity.books.some((each) => each.id === book.id),
  );
  const skillId =
    mostCommonSkill(here) ??
    mostCommonSkill(inBook) ??
    skills.find((skill) =>
      book.subject ? skill.name.toLowerCase().includes(book.subject.name.toLowerCase()) : false,
    )?.id ??
    skills[0]!.id;

  return (
    <NewActivityForm
      place={{ bookId: book.id, chapterId, type, classLevelId: book.classLevel.id }}
      skills={skills}
      skillId={skillId}
    />
  );
}

function mostCommonSkill(activities: CatalogueActivity[]): string | undefined {
  const tally = new Map<string, number>();
  for (const activity of activities) {
    tally.set(activity.skill.id, (tally.get(activity.skill.id) ?? 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** One more question on a page that exists — the Activities list's "Add to …". */
async function AddToPage({ activityId, added }: { activityId: string; added: boolean }) {
  const [activity, existing] = await Promise.all([
    apiFetch<CatalogueActivity>(`/publication/activities/${activityId}`),
    apiFetch<QuestionRow[]>(`/publication/activities/${activityId}/questions`),
  ]);
  const book = activity.book;
  const startAgain = book
    ? `/publication/questions/new?bookId=${book.id}&chapterId=${activity.chapter?.id ?? 'none'}`
    : '/publication/questions/new';

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/publication/questions"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy-900"
          >
            <IconArrowLeft size={16} />
            All activities
          </Link>
        }
        title="Add an activity"
        description={[book?.name, activity.chapter?.name, labelOf(activity.type)]
          .filter(Boolean)
          .join(' · ')}
      />

      <div className="max-w-3xl space-y-4">
        {added && (
          <Notice tone="success" title="Saved">
            Add another one to this page below, or{' '}
            <Link href={startAgain} className="font-medium underline">
              add a different type in this chapter
            </Link>
            .
          </Notice>
        )}
        {existing.length > 0 && (
          <Card
            title={`Already on this page (${existing.length})`}
            description="Open any of them to change it."
          >
            <QuestionList questions={existing} />
          </Card>
        )}
        <Card
          title={existing.length > 0 ? `Add one more to “${activity.title}”` : activity.title}
          description={editorDescription(activity.type)}
        >
          <AddQuestionForm activityId={activity.id} type={activity.type} count={existing.length} />
        </Card>
      </div>
    </>
  );
}
