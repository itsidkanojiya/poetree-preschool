import Link from 'next/link';
import {
  ACTIVITY_TYPES,
  type ChapterOption,
  type StandardSummary,
} from '@poetree/shared';
import { Input, Select } from '@/components/ui/form';

/** Only what the picker shows — so any book-shaped row can be passed in. */
export interface BookChoice {
  id: string;
  name: string;
  classLevel: { name: string };
}

export interface TypeFilters {
  classLevelId?: string;
  bookId?: string;
  chapterId?: string;
  type?: string;
  search?: string;
}

/**
 * The same narrowing as the questions list, one level up.
 *
 * A plain GET form so the result lives in the URL: a filtered list can be
 * bookmarked, sent to whoever is writing that book, and reloaded after an edit
 * without losing the place.
 */
export function TypeFilterBar({
  filters,
  standards,
  books,
  chapters,
}: {
  filters: TypeFilters;
  standards: StandardSummary[];
  books: BookChoice[];
  chapters: ChapterOption[];
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

        <Select name="type" defaultValue={filters.type ?? ''} aria-label="Played as">
          <option value="">Played any way</option>
          {ACTIVITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {type.charAt(0) + type.slice(1).toLowerCase()}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="search"
          defaultValue={filters.search ?? ''}
          placeholder="Search the instruction"
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
            href="/publication/question-types"
            className="rounded-lg px-3 py-2 text-sm font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
          >
            Clear {active === 1 ? 'filter' : `all ${active}`}
          </Link>
        )}
      </div>
    </form>
  );
}
