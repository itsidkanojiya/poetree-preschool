'use client';

import { useEffect } from 'react';

/**
 * What a screen shows when it has thrown.
 *
 * There was no boundary at all, so any failure rendered the browser's own
 * "Application error: a client-side exception has occurred" on a blank page —
 * no idea what happened, nothing to click, and no hint that the work being done
 * was probably fine.
 *
 * The common cause here is not a bug. A page held open while the site is
 * deployed keeps a reference to the old build, and Next identifies server
 * actions by a hash that changes with every build — so saving from a stale tab
 * posts to an action the running server has never heard of. The page has to be
 * reloaded, and nothing was saved when it failed.
 *
 * Deliberately not an automatic reload: an error that survives the reload would
 * loop, and a person watching a page refresh itself forever learns less than one
 * reading a sentence.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle on the server-side detail, which the
    // production build redacts. Logging it means a support call can be matched
    // against the server's own log line.
    console.error('Dashboard error', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-semibold text-navy-950">This screen could not be shown</h1>

      <p className="mt-3 text-sm text-slate-600">
        If this happened while saving, nothing was saved. The usual cause is a page left open
        while the site was updated — reloading picks up the new version and the save will work.
      </p>

      <div className="mt-6 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800"
        >
          Reload the page
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
        >
          Try again
        </button>
      </div>

      {error.digest && (
        <p className="mt-6 font-mono text-xs text-slate-400">Reference {error.digest}</p>
      )}
    </div>
  );
}
