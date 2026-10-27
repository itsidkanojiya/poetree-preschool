'use client';

import { useActionState } from 'react';
import { Field, FormError, Input, Select, SubmitButton } from '@/components/ui/form';
import { QuestionFields } from '../../question-types/[id]/questions/editors';
import {
  addChapterAction,
  createActivityAction,
  type WizardPlace,
  type WizardState,
} from './actions';

/** Step 2's last card: a chapter the book does not have yet. */
export function AddChapterForm({ bookId }: { bookId: string }) {
  const [state, formAction] = useActionState<WizardState, FormData>(
    addChapterAction.bind(null, bookId),
    {},
  );
  return (
    <form action={formAction} className="space-y-2">
      <FormError message={state.error} />
      <div className="flex gap-2">
        <Input
          name="name"
          required
          maxLength={160}
          placeholder="New chapter, e.g. Numbers 1 to 5"
          aria-label="New chapter name"
        />
        <SubmitButton variant="secondary" pendingLabel="Adding…">
          Add
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * Step 3's form: what the child does, laid out for the chosen type, and Save.
 * The page's name and what it counts towards are filled in already, under
 * "More options", for the rare time they need changing.
 */
export function NewActivityForm({
  place,
  skills,
  skillId,
}: {
  place: WizardPlace;
  skills: Array<{ id: string; name: string }>;
  skillId: string;
}) {
  const [state, formAction] = useActionState<WizardState, FormData>(
    createActivityAction.bind(null, place),
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />

      <QuestionFields type={place.type} />

      <details className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-navy-950/[0.06]">
        <summary className="cursor-pointer text-sm font-medium text-navy-950">More options</summary>
        <div className="mt-4 space-y-4">
          <Field
            label="Name of the page"
            hint="As printed in the book. Leave empty to use what the child has to do."
          >
            <Input name="title" maxLength={160} placeholder="Circle the correct letter" />
          </Field>
          <Field label="Counts towards" hint="The skill a child’s score adds to.">
            <Select name="skillId" defaultValue={skillId}>
              {skills.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </details>

      <SubmitButton pendingLabel="Saving…">Save activity</SubmitButton>
    </form>
  );
}
