'use client';

import { useActionState } from 'react';
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
import { createPostAction, type StreamState } from './actions';

interface MyClassroom {
  id: string;
  label: string;
}

export function NewPostForm({
  classrooms,
  selectedId,
}: {
  classrooms: MyClassroom[];
  selectedId?: string;
}) {
  const [state, formAction] = useActionState<StreamState, FormData>(createPostAction, {});

  if (classrooms.length === 0) {
    return (
      <Notice tone="info" title="No classes assigned">
        Ask the school office to assign you as a class teacher.
      </Notice>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <FieldSet>
        <Field label="Class" required>
          <Select name="classroomId" required defaultValue={selectedId ?? classrooms[0]?.id}>
            {classrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Kind">
          <Select name="type" defaultValue="ANNOUNCEMENT">
            <option value="ANNOUNCEMENT">Announcement</option>
            <option value="MATERIAL">Material</option>
          </Select>
        </Field>
      </FieldSet>

      <Field label="Title" required>
        <Input name="title" required placeholder="Bring an old newspaper tomorrow" />
      </Field>

      <Field label="Details">
        <Textarea name="body" rows={3} placeholder="We are making paper boats in craft class." />
      </Field>

      <SubmitButton pendingLabel="Posting…">Post to class</SubmitButton>
    </form>
  );
}
