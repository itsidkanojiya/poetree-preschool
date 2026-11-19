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
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm text-navy-950 shadow-card ring-1 ring-navy-950/[0.07]">
      <div className="min-w-[15rem] flex-1">
        <p className="font-medium">Sample activities from the Pre-Primary A books</p>
        <p className="mt-0.5 text-xs text-slate-500">
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
            {result.added === 0 && result.questionsAdded === 0
              ? `All ${result.total} sample pages are there already, with everything on them.`
              : [
                  result.added > 0 ? `${result.added} sample pages added` : null,
                  result.questionsAdded > 0
                    ? `${result.questionsAdded} activities added to pages already there`
                    : null,
                ]
                  .filter(Boolean)
                  .join(', ') + '.'}
          </p>
        )}
      </div>
      {openId && (
        <Link
          href={`/publication/books/${openId}`}
          className="rounded-xl px-3.5 py-2 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 transition-colors hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600"
        >
          Open the sample book
        </Link>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await addSampleBookAction()))}
        className="rounded-xl bg-navy-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600 focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {pending ? 'Adding…' : bookId ? 'Add anything missing' : 'Add the sample book'}
      </button>
    </div>
  );
}
