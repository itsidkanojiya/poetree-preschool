'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { GUARDIAN_RELATIONS } from '@poetree/shared';
import { Field, Input, PasswordInput, Select } from '@/components/ui/form';
import { PendingButton } from '@/components/ui/kept-form';
import { IconSearch } from '@/components/icons';
import { findParentsAction, type FamilyState, type ParentOption } from './family-actions';

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

/**
 * Finding a parent the school already has, by name, phone or email.
 *
 * A search, not a list: a school has hundreds of parents, and the office has
 * the mother's number in front of them far more often than her surname.
 */
function ParentPicker({ exclude }: { exclude: string[] }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ParentOption[]>([]);
  const [chosen, setChosen] = useState<ParentOption | null>(null);
  const [searching, startSearch] = useTransition();
  const latest = useRef('');

  useEffect(() => {
    const query = search.trim();
    latest.current = query;
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      startSearch(async () => {
        const found = await findParentsAction(query);
        // Only the answer to what is in the box now, not an earlier keystroke.
        if (latest.current === query) setResults(found);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  if (chosen) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-xl bg-navy-50/60 px-3.5 py-3 ring-1 ring-inset ring-navy-100">
        <input type="hidden" name="parentProfileId" value={chosen.id} />
        <div className="min-w-0 text-sm">
          <p className="font-medium text-navy-950">{chosen.name}</p>
          <p className="text-xs text-slate-500">
            {[chosen.phone, chosen.email].filter(Boolean).join(' · ')}
          </p>
          {chosen.children.length > 0 && (
            <p className="mt-0.5 text-xs text-slate-500">Parent of {chosen.children.join(', ')}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setChosen(null)}
          className="shrink-0 text-xs font-medium text-navy-700 hover:text-navy-900"
        >
          Change
        </button>
      </div>
    );
  }

  const shown = results.filter((parent) => !exclude.includes(parent.id));

  return (
    <div>
      <div className="relative">
        <IconSearch
          size={17}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Parent’s name, mobile or email"
          aria-label="Find a parent"
          className="pl-10"
          autoComplete="off"
        />
      </div>
      {search.trim().length >= 2 && (
        <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto">
          {shown.map((parent) => (
            <li key={parent.id}>
              <button
                type="button"
                onClick={() => setChosen(parent)}
                className="w-full rounded-lg px-3 py-2 text-left ring-1 ring-navy-950/[0.06] transition-colors hover:bg-navy-50"
              >
                <span className="block text-sm font-medium text-navy-950">{parent.name}</span>
                <span className="block text-xs text-slate-500">
                  {[parent.phone, parent.email].filter(Boolean).join(' · ')}
                  {parent.children.length > 0 && <> · parent of {parent.children.join(', ')}</>}
                </span>
              </button>
            </li>
          ))}
          {!searching && shown.length === 0 && (
            <li className="px-1 py-2 text-xs text-slate-500">
              Nobody here matches. Choose “A new parent” to add them.
            </li>
          )}
          {searching && <li className="px-1 py-2 text-xs text-slate-400">Searching…</li>}
        </ul>
      )}
    </div>
  );
}

/**
 * The account the school already has for the number or email typed — and the
 * way to use it instead of opening a second one.
 */
function AccountOffer({ state, pending }: { state: FamilyState; pending: boolean }) {
  const account = state.existingAccount;
  if (!account) return null;

  const label = account.removed
    ? `Restore ${account.name} and link them`
    : account.roles.includes('PARENT')
      ? `Link ${account.name}`
      : `Make ${account.name} a parent too and link them`;
  const explain = account.removed
    ? 'They come back on the account they had, with the same sign-in — and any child removed with them comes back too.'
    : account.roles.includes('PARENT')
      ? 'Their sign-in stays as it is; this child appears in their app beside their other children.'
      : 'They keep teaching on the same account and switch to parent in the app.';

  return (
    <div className="space-y-3 rounded-xl bg-navy-50/60 px-3.5 py-3 ring-1 ring-inset ring-navy-100">
      {/* Why it was refused, then the way forward. */}
      {state.error && <p className="text-sm font-medium text-navy-950">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <PendingButton
          pending={pending}
          variant="secondary"
          name="useAccount"
          value={account.userId}
          pendingLabel="Linking…"
        >
          {label}
        </PendingButton>
        <span className="min-w-[12rem] flex-1 text-xs text-slate-500">{explain}</span>
      </div>
    </div>
  );
}

/**
 * Who the parent is: one already at the school, or a new one opened here.
 *
 * Shared by adding a child and by linking another parent to a child, so both
 * ask the same questions the same way. Field names for a new parent are
 * prefixed `parent.` so they cannot collide with the child's own.
 */
export function FamilyFields({
  state,
  pending,
  exclude = [],
  defaultRelation = 'MOTHER',
}: {
  state: FamilyState;
  pending: boolean;
  /** Parent profiles already linked, left out of the search. */
  exclude?: string[];
  defaultRelation?: (typeof GUARDIAN_RELATIONS)[number];
}) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Which parent">
        {(
          [
            ['new', 'A new parent', 'Opens their account, so they can sign in to the app.'],
            ['existing', 'A parent already here', 'A brother’s or sister’s parent, or a teacher.'],
          ] as const
        ).map(([value, title, detail]) => (
          <label
            key={value}
            className="flex cursor-pointer items-start gap-2.5 rounded-xl p-3 ring-1 ring-navy-950/10 has-[:checked]:bg-navy-50 has-[:checked]:ring-navy-900"
          >
            <input
              type="radio"
              name="familyMode"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
              className="mt-0.5 h-4 w-4"
            />
            <span className="text-sm">
              <span className="block font-medium text-navy-950">{title}</span>
              <span className="block text-xs text-slate-500">{detail}</span>
            </span>
          </label>
        ))}
      </div>

      <Field label="Relation to the child" required>
        <Select name="relation" defaultValue={defaultRelation}>
          {GUARDIAN_RELATIONS.map((relation) => (
            <option key={relation} value={relation}>
              {titleCase(relation)}
            </option>
          ))}
        </Select>
      </Field>

      {mode === 'existing' ? (
        <ParentPicker exclude={exclude} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <Input name="parent.name" required maxLength={120} autoComplete="off" />
          </Field>
          <Field label="Mobile" required hint="They sign in with this.">
            <Input
              name="parent.phone"
              type="tel"
              required
              maxLength={20}
              placeholder="+91…"
              autoComplete="off"
            />
          </Field>
          <Field label="Email">
            <Input name="parent.email" type="email" maxLength={254} autoComplete="off" />
          </Field>
          <Field
            label="Password"
            required
            hint="8 or more characters, with a letter and a number. Tell the parent."
          >
            <PasswordInput
              name="parent.password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Occupation">
            <Input name="parent.occupation" maxLength={120} />
          </Field>
          <Field label="Address">
            <Input name="parent.address" maxLength={300} autoComplete="off" />
          </Field>
        </div>
      )}

      <AccountOffer state={state} pending={pending} />
    </div>
  );
}
