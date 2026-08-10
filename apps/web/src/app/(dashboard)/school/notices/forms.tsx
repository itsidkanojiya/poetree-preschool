'use client';

import { useActionState, useState } from 'react';
import type { ClassroomSummary } from '@poetree/shared';
import {
  Field,
  FieldSet,
  FormError,
  FormSuccess,
  Input,
  Select,
  SubmitButton,
  Textarea,
} from '@/components/ui/form';
import { Notice } from '@/components/ui/layout';
import { createNoticeAction, type NoticeState } from './actions';

const TYPES = ['GENERAL', 'EVENT', 'HOLIDAY', 'ACADEMIC', 'EMERGENCY'] as const;
const AUDIENCES = [
  { value: 'ALL', label: 'Everyone' },
  { value: 'PARENTS', label: 'Parents only' },
  { value: 'TEACHERS', label: 'Teachers only' },
  { value: 'CLASSROOMS', label: 'Specific classes' },
] as const;

export function NewNoticeForm({ classrooms }: { classrooms: ClassroomSummary[] }) {
  const [audience, setAudience] = useState<string>('ALL');
  const [type, setType] = useState<string>('GENERAL');
  const [state, formAction] = useActionState<NoticeState, FormData>(createNoticeAction, {});

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      {type === 'EMERGENCY' && (
        <Notice tone="danger" title="Emergency notices bypass the daily digest">
          This is pushed immediately rather than batched. Use it for something that genuinely
          cannot wait.
        </Notice>
      )}

      <FieldSet>
        <Field label="Type" required>
          <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((option) => (
              <option key={option} value={option}>
                {option.charAt(0) + option.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Who should see it" required>
          <Select name="audience" value={audience} onChange={(e) => setAudience(e.target.value)}>
            {AUDIENCES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </FieldSet>

      {audience === 'CLASSROOMS' && (
        <Field label="Classes" required hint="Parents of children in these classes, and their teachers.">
          <div className="grid gap-1.5 sm:grid-cols-2">
            {classrooms.length === 0 ? (
              <p className="text-sm text-slate-500">No classrooms yet.</p>
            ) : (
              classrooms.map((classroom) => (
                <label key={classroom.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="classroomIds"
                    value={classroom.id}
                    className="h-4 w-4 rounded border-navy-300 text-navy-900"
                  />
                  {classroom.classLevel.name} — {classroom.section}
                </label>
              ))
            )}
          </div>
        </Field>
      )}

      <Field label="Title" required>
        <Input name="title" required placeholder="Sports day on Friday" />
      </Field>

      <Field label="Notice" required>
        <Textarea name="body" rows={4} required placeholder="Please send children in sports uniform." />
      </Field>

      <FieldSet>
        <Field label="Stop showing after" hint="Leave blank to keep it until you archive it.">
          <Input name="expiresAt" type="date" />
        </Field>
      </FieldSet>

      <div className="space-y-2.5">
        <label className="flex items-center gap-2.5 text-sm text-slate-700">
          <input type="checkbox" name="pinned" className="h-4 w-4 rounded border-navy-300 text-navy-900" />
          Pin to the top
        </label>
        <label className="flex items-center gap-2.5 text-sm text-slate-700">
          <input type="checkbox" name="publish" defaultChecked className="h-4 w-4 rounded border-navy-300 text-navy-900" />
          Publish now
        </label>
      </div>

      <SubmitButton pendingLabel="Publishing…">Publish notice</SubmitButton>
    </form>
  );
}
