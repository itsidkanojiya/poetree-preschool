'use client';

import { useRouter } from 'next/navigation';
import type { CatalogueActivity } from '@poetree/shared';
import { Field, Select } from '@/components/ui/form';

/**
 * Which page the question is printed on.
 *
 * Navigates rather than holding the choice in state: the form underneath is
 * built from the type — strokes for tracing, choices for matching — and that is
 * decided on the server. Putting the choice in the address also means a
 * half-written page can be reopened where it was.
 */
export function TypePicker({
  types,
  chosenId,
}: {
  types: CatalogueActivity[];
  chosenId?: string;
}) {
  const router = useRouter();

  // Grouped by book, because a publisher with four hundred pages thinks
  // "Nursery English, chapter two", not in one flat alphabet.
  const byBook = new Map<string, CatalogueActivity[]>();
  for (const type of types) {
    const key = type.book?.name ?? 'Not in a book';
    byBook.set(key, [...(byBook.get(key) ?? []), type]);
  }

  return (
    <Field label="Question type" required hint="The instruction this question is printed under.">
      <Select
        defaultValue={chosenId ?? ''}
        onChange={(event) => {
          const value = event.target.value;
          router.push(
            value ? `/publication/questions/new?activityId=${value}` : '/publication/questions/new',
          );
        }}
      >
        <option value="">Choose…</option>
        {[...byBook.entries()].map(([book, group]) => (
          <optgroup key={book} label={book}>
            {group.map((type) => (
              <option key={type.id} value={type.id}>
                {type.chapter ? `${type.chapter.name} · ` : ''}
                {type.title}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    </Field>
  );
}
