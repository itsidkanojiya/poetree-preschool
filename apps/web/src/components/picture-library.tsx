'use client';

import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import type { LibraryPicture, Paginated } from '@poetree/shared';
import { importAppPicturesAction } from '@/app/(dashboard)/publication/pictures/actions';

/** A catalogue picture through the proxy, which attaches the cookie's token. */
const pictureSrc = (id: string): string => `/attachments?kind=catalogue&id=${id}`;

/**
 * A picture for a question or an option: chosen from the library, or uploaded.
 *
 * The library is every picture already in the catalogue — what was uploaded
 * before, and the app's own letter and number pictures — so the apple used on
 * one page is chosen again on the next instead of being uploaded again. A new
 * upload is still one click away, and an upload of a picture the library
 * already has is answered with that one by the API.
 *
 * What the form sends: the chosen picture's id in `fileIdName`, or a new file
 * in `uploadName`. Neither means no picture.
 */
export function PictureField({
  fileIdName,
  uploadName,
  currentId,
  compact = false,
}: {
  fileIdName: string;
  uploadName: string;
  /** The picture it has now, when editing. */
  currentId?: string | null;
  /** The small version, for an option slot. */
  compact?: boolean;
}) {
  const [chosen, setChosen] = useState<string | null>(currentId ?? null);
  const [upload, setUpload] = useState<{ url: string; name: string } | null>(null);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // A preview made from the file on this computer, gone with it.
  useEffect(() => {
    if (!upload) return undefined;
    return () => URL.revokeObjectURL(upload.url);
  }, [upload]);

  const clearUpload = () => {
    if (fileRef.current) fileRef.current.value = '';
    setUpload(null);
  };

  const preview = upload?.url ?? (chosen ? pictureSrc(chosen) : null);
  const size = compact ? 'h-12 w-12' : 'h-20 w-20';

  return (
    <div className="flex items-center gap-3">
      <div
        className={`${size} grid shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-50 ring-1 ring-navy-950/10`}
      >
        {preview ? (
          <img src={preview} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="px-1 text-center text-[10px] leading-tight text-slate-400">
            No picture
          </span>
        )}
      </div>

      <input type="hidden" name={fileIdName} value={upload ? '' : (chosen ?? '')} />

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setOpen(true)} className={BUTTON}>
          Choose from library
        </button>
        <label className={`${BUTTON} cursor-pointer`}>
          Upload new
          <input
            ref={fileRef}
            type="file"
            name={uploadName}
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              setUpload(file ? { url: URL.createObjectURL(file), name: file.name } : null);
            }}
          />
        </label>
        {preview && (
          <button
            type="button"
            onClick={() => {
              clearUpload();
              setChosen(null);
            }}
            className="rounded-lg px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
          >
            Remove
          </button>
        )}
        {upload && (
          <span className="w-full truncate text-xs text-slate-500" title={upload.name}>
            {upload.name} · uploaded on save
          </span>
        )}
      </div>

      {open && (
        <LibraryDialog
          selectedId={upload ? null : chosen}
          onClose={() => setOpen(false)}
          onChoose={(picture) => {
            clearUpload();
            setChosen(picture.id);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

const BUTTON =
  'rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50';

/**
 * The library itself: search, a grid, and a larger look at the one picked
 * before it is used.
 */
function LibraryDialog({
  selectedId,
  onClose,
  onChoose,
}: {
  selectedId: string | null;
  onClose: () => void;
  onChoose: (picture: LibraryPicture) => void;
}) {
  const titleId = useId();
  const [search, setSearch] = useState('');
  const [pictures, setPictures] = useState<LibraryPicture[]>([]);
  const [page, setPage] = useState(1);
  const [totals, setTotals] = useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<LibraryPicture | null>(null);
  const [importing, startImport] = useTransition();
  const [imported, setImported] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (query: string, at: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/publication/pictures?search=${encodeURIComponent(query)}&page=${at}`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error();
      const data = (await response.json()) as Paginated<LibraryPicture>;
      setPictures((before) => (at === 1 ? data.items : [...before, ...data.items]));
      setTotals({ total: data.total, totalPages: data.totalPages });
      setPage(at);
    } catch {
      setError('The pictures could not be loaded. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // As they type, after a pause: one request for a word, not one per letter.
  useEffect(() => {
    const timer = setTimeout(() => void load(search.trim(), 1), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [search, load]);

  useEffect(() => {
    searchRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const bringInAppPictures = () =>
    startImport(async () => {
      const answer = await importAppPicturesAction();
      if ('error' in answer) {
        setImported(answer.error);
        return;
      }
      const { added, total } = answer.result;
      setImported(
        added === 0
          ? `All ${total} of the app’s pictures are here already.`
          : `${added} of the app’s pictures added.`,
      );
      await load(search.trim(), 1);
    });

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-navy-950/40 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl ring-1 ring-navy-950/10"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-navy-950/[0.06] p-5">
          <h2 id={titleId} className="text-lg font-semibold text-navy-950">
            Picture library
          </h2>
          <span className="text-xs text-slate-500">
            {totals.total} {totals.total === 1 ? 'picture' : 'pictures'}
          </span>
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search — apple, four, (A)"
            aria-label="Search the pictures"
            className="ml-auto w-full rounded-xl border-0 px-3 py-2 text-sm ring-1 ring-navy-950/10 focus:ring-2 focus:ring-navy-400 sm:w-64"
          />
        </div>

        <div className="grid min-h-0 flex-1 gap-0 sm:grid-cols-[1fr_15rem]">
          <div className="min-h-[16rem] overflow-y-auto p-5">
            {error && <p className="text-sm text-rose-700">{error}</p>}

            {!loading && !error && pictures.length === 0 && (
              <div className="grid h-full place-items-center text-center">
                <div className="max-w-sm space-y-3">
                  <p className="text-sm text-slate-600">
                    {search
                      ? `No pictures called “${search.trim()}”.`
                      : 'No pictures yet. Every picture uploaded for an activity will be here to use again.'}
                  </p>
                </div>
              </div>
            )}

            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {pictures.map((picture) => {
                const isPicked = (picked?.id ?? selectedId) === picture.id;
                return (
                  <li key={picture.id}>
                    <button
                      type="button"
                      aria-pressed={isPicked}
                      onClick={() => setPicked(picture)}
                      onDoubleClick={() => onChoose(picture)}
                      title={picture.name}
                      className={`group block w-full rounded-xl p-1.5 text-left transition-colors ${
                        isPicked
                          ? 'bg-navy-50 ring-2 ring-navy-600'
                          : 'ring-1 ring-navy-950/[0.08] hover:bg-slate-50'
                      }`}
                    >
                      <span className="block aspect-square overflow-hidden rounded-lg bg-white">
                        <img
                          src={pictureSrc(picture.id)}
                          alt={picture.name}
                          loading="lazy"
                          className="h-full w-full object-contain"
                        />
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-slate-600">
                        {displayName(picture.name)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {loading && <p className="mt-4 text-sm text-slate-500">Loading pictures…</p>}
            {!loading && page < totals.totalPages && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => void load(search.trim(), page + 1)}
                  className={BUTTON}
                >
                  Show more
                </button>
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-3 border-t border-navy-950/[0.06] bg-slate-50/60 p-5 sm:border-l sm:border-t-0">
            {picked ? (
              <>
                <div className="grid aspect-square place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-navy-950/10">
                  <img
                    src={pictureSrc(picked.id)}
                    alt={picked.name}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div>
                  <p className="break-words text-sm font-medium text-navy-950">
                    {displayName(picked.name)}
                  </p>
                  <p className="text-xs text-slate-500">{kilobytes(picked.sizeBytes)}</p>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Pick a picture to see it larger. Double-click to use it straight away.
              </p>
            )}

            <div className="mt-auto space-y-2 border-t border-navy-950/[0.06] pt-3">
              <p className="text-xs text-slate-500">
                The app’s letter and number pictures — an apple for A, four fish for 4 — can be
                brought in once and chosen like any other.
              </p>
              <button
                type="button"
                onClick={bringInAppPictures}
                disabled={importing}
                className={`${BUTTON} w-full disabled:opacity-60`}
              >
                {importing ? 'Adding the app’s pictures…' : 'Add the app’s pictures'}
              </button>
              {imported && (
                <p role="status" className="text-xs text-slate-600">
                  {imported}
                </p>
              )}
            </div>
          </aside>
        </div>

        <div className="flex justify-end gap-2 border-t border-navy-950/[0.06] p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!picked}
            onClick={() => picked && onChoose(picked)}
            className="rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-800 disabled:opacity-40"
          >
            Use this picture
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** "Apple (A).webp" reads as "Apple (A)". */
function displayName(name: string): string {
  return name.replace(/\.(webp|png|jpe?g)$/i, '');
}

function kilobytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
