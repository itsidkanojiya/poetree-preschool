'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { addSampleBookAction, type SampleBookResult } from './sample-actions';

/**
 * "See every type working": adds the sample book — an activity or two of each
 * type, modelled on the Pre-Primary A books — given to no school. Pressing it
 * again adds only what is missing.
 */
export function SampleBookCard({ bookId }: { bookId?: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SampleBookResult | null>(null);
  const openId = result && 'bookId' in result ? result.bookId : bookId;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-950 ring-1 ring-sky-200">
      <div className="min-w-0 flex-1">
        <p className="font-medium">Sample activities from the Pre-Primary A books</p>
        <p className="mt-0.5 text-xs text-sky-900/80">
          One or two of every type — match the shadow, healthy or junk, colour 11 balls, the number
          train — in a sample book that no school is given. Copy what you like.
        </p>
        {result && 'error' in result && (
          <p role="alert" className="mt-1 text-xs font-medium text-rose-700">
            {result.error}
          </p>
        )}
        {result && 'added' in result && (
          <p role="status" className="mt-1 text-xs font-medium text-emerald-800">
            {result.added === 0
              ? `All ${result.total} sample activities are there already.`
              : `${result.added} sample activities added.`}
          </p>
        )}
      </div>
      {openId && (
        <Link
          href={`/publication/books/${openId}`}
          className="rounded-xl px-3.5 py-2 text-sm font-medium text-sky-950 ring-1 ring-sky-300 transition-colors hover:bg-sky-100"
        >
          Open the sample book
        </Link>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await addSampleBookAction()))}
        className="rounded-xl bg-sky-700 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-800 disabled:opacity-60"
      >
        {pending ? 'Adding…' : bookId ? 'Add anything missing' : 'Add the sample book'}
      </button>
    </div>
  );
}
