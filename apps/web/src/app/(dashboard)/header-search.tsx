'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { IconSearch } from '@/components/icons';
import { searchChildrenAction, type SearchHit } from './search-actions';

/**
 * Find a child from any page: by name, admission or GR number, or a parent's
 * name or mobile. Results come as you type; arrow keys and Enter work, and
 * Escape closes the list.
 */
export function HeaderSearch() {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  // A pause in typing, then one search — not one per key.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      startTransition(async () => {
        setHits(await searchChildrenAction(term));
        setActive(0);
        setOpen(true);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // A click anywhere else closes the list.
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const go = (hit: SearchHit) => {
    setOpen(false);
    setQuery('');
    router.push(`/school/students/${hit.id}`);
  };

  const showList = open && query.trim().length >= 2;

  return (
    <div ref={box} className="relative w-full max-w-md">
      <label className="relative block">
        <span className="sr-only">Search for a child or parent</span>
        <IconSearch
          size={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
            if (!hits.length) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((i) => (i + 1) % hits.length);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((i) => (i - 1 + hits.length) % hits.length);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              go(hits[active]!);
            }
          }}
          placeholder="Search a child or parent…"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          className="h-11 w-full rounded-full border-0 bg-white pl-10 pr-4 text-[0.9375rem] text-navy-950 shadow-card ring-1 ring-inset ring-navy-950/10 placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500"
        />
      </label>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-12 z-40 max-h-96 overflow-auto rounded-2xl bg-white p-1.5 shadow-pop ring-1 ring-navy-950/10"
        >
          {pending && hits.length === 0 && (
            <li className="px-3 py-3 text-sm text-slate-500">Searching…</li>
          )}
          {!pending && hits.length === 0 && (
            <li className="px-3 py-3 text-sm text-slate-500">
              No child or parent matches “{query.trim()}”.
            </li>
          )}
          {hits.map((hit, index) => (
            <li key={hit.id} role="option" aria-selected={index === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => go(hit)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${
                  index === active ? 'bg-sky-50' : ''
                }`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky-100 text-sm font-bold text-sky-700">
                  {hit.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join('')
                    .toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-navy-950">
                    {hit.name}
                    <span className="font-normal text-slate-500">
                      {' '}
                      · {hit.classroom ?? 'No class yet'}
                    </span>
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {hit.admissionNo}
                    {hit.parent && <> · {hit.parent}</>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
