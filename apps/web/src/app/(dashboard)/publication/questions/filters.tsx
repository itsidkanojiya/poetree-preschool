import Link from 'next/link';
import type {
  CatalogueActivity,
  ChapterOption,
  StandardSummary,
} from '@poetree/shared';
import { Input, Select } from '@/components/ui/form';

/** Only what the picker shows — so any book-shaped row can be passed in. */
export interface BookChoice {
  id: string;
  name: string;
  classLevel: { name: string };
}

export interface QuestionFilters {
  classLevelId?: string;
  bookId?: string;
  chapterId?: string;
  activityId?: string;
  type?: string;
  search?: string;
}

/**
 * Narrowing a catalogue of hundreds down to the page somebody is working on.
 *
 * A plain GET form rather than anything reactive: it round-trips through the
 * URL, so a filtered list can be bookmarked, shared with whoever is writing the
 * content, and reloaded after an edit without losing where you were.
 *
 * The selects do not cascade — chapters carry their book's name and question
 * types their instruction, so every option says which parent it belongs to.
 * Cascading would need this to be a client component, and the cost of choosing
 * a chapter from the wrong book is a list with nothing in it, not a mistake in
 * the data.
 */
export function QuestionFilterBar({
  filters,
  standards,
  books,
  chapters,
  types,
}: {
  filters: QuestionFilters;
  standards: StandardSummary[];
  books: BookChoice[];
  chapters: ChapterOption[];
  types: CatalogueActivity[];
}) {
  const active = Object.values(filters).filter(Boolean).length;

  return (
    <form method="get" className="mb-5 space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Select name="classLevelId" defaultValue={filters.classLevelId ?? ''} aria-label="Standard">
          <option value="">Every standard</option>
          {standards.map((standard) => (
            <option key={standard.id} value={standard.id}>
              {standard.name}
            </option>
          ))}
        </Select>

        <Select name="bookId" defaultValue={filters.bookId ?? ''} aria-label="Book">
          <option value="">Every book</option>
          {books.map((book) => (
            <option key={book.id} value={book.id}>
              {book.classLevel.name} · {book.name}
            </option>
          ))}
        </Select>

        <Select name="chapterId" defaultValue={filters.chapterId ?? ''} aria-label="Chapter">
          <option value="">Every chapter</option>
          {chapters.map((chapter) => (
            <option key={chapter.id} value={chapter.id}>
              {chapter.bookName} · {chapter.name}
            </option>
          ))}
        </Select>

        <Select name="activityId" defaultValue={filters.activityId ?? ''} aria-label="Question type">
          <option value="">Every question type</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.title}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="search"
          defaultValue={filters.search ?? ''}
          placeholder="Search the words the app reads aloud"
          className="h-10 w-full sm:w-80"
          aria-label="Search"
        />
        <button
          type="submit"
          className="rounded-lg bg-navy-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-800"
        >
          Filter
        </button>
        {active > 0 && (
          <Link
            href="/publication/questions"
            className="rounded-lg px-3 py-2 text-sm font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
          >
            Clear {active === 1 ? 'filter' : `all ${active}`}
          </Link>
        )}
      </div>
    </form>
  );
}
