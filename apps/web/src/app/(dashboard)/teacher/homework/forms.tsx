'use client';

import { useActionState } from 'react';
import type { SubmissionStatus, SubmissionSummary } from '@poetree/shared';
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
import { Avatar, Notice } from '@/components/ui/layout';
import { createHomeworkAction, reviewSubmissionAction, type HomeworkState } from './actions';

interface MyClassroom {
  id: string;
  label: string;
}

export function NewHomeworkForm({ classrooms }: { classrooms: MyClassroom[] }) {
  const [state, formAction] = useActionState<HomeworkState, FormData>(createHomeworkAction, {});

  if (classrooms.length === 0) {
    return (
      <Notice tone="info" title="No classes assigned">
        Ask the school office to assign you as a class teacher.
      </Notice>
    );
  }

  const inAWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <FieldSet>
        <Field label="Class" required>
          <Select name="classroomId" required defaultValue={classrooms[0]?.id}>
            {classrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Due date" required>
          <Input name="dueDate" type="date" required defaultValue={inAWeek} />
        </Field>
      </FieldSet>

      <Field label="Title" required>
        <Input name="title" required placeholder="Practice letter A" />
      </Field>

      <Field label="What should the child do?">
        <Textarea name="description" rows={3} placeholder="Trace the letter A five times in the workbook." />
      </Field>

      <Field
        label="Worksheet (optional)"
        hint="A page for the family to print or work from. PDF or a photograph."
      >
        <Input
          name="worksheets"
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png,image/webp"
        />
      </Field>

      <div className="space-y-2.5">
        <label className="flex items-center gap-2.5 text-sm text-slate-700">
          <input type="checkbox" name="allowsSubmission" className="h-4 w-4 rounded border-navy-300 text-navy-900" />
          Parents can upload the finished work
        </label>
        <label className="flex items-center gap-2.5 text-sm text-slate-700">
          <input type="checkbox" name="publish" defaultChecked className="h-4 w-4 rounded border-navy-300 text-navy-900" />
          Publish now — leave unticked to keep it a draft
        </label>
      </div>

      <SubmitButton pendingLabel="Saving…">Set homework</SubmitButton>
    </form>
  );
}

const REVIEW: Array<{ status: SubmissionStatus; label: string; tone: string }> = [
  { status: 'COMPLETED', label: 'Done', tone: 'bg-leaf-600 text-white' },
  { status: 'NOT_COMPLETED', label: 'Not done', tone: 'bg-rose-600 text-white' },
  { status: 'PENDING', label: 'Pending', tone: 'bg-slate-500 text-white' },
];

/**
 * Marking is one tap per child. A teacher reviewing thirty pieces of homework
 * should never open a dialog to record a yes or a no.
 */
export function SubmissionList({ submissions }: { submissions: SubmissionSummary[] }) {
  if (submissions.length === 0) {
    return <p className="text-sm text-slate-500">Nobody is enrolled in this class yet.</p>;
  }

  return (
    <ul className="divide-y divide-navy-950/[0.06]">
      {submissions.map((submission) => (
        <li key={submission.id} className="flex flex-wrap items-center gap-3 py-2.5">
          <Avatar name={submission.fullName} size="sm" />
          <span className="min-w-0 flex-1 text-sm text-navy-950">
            <span className="block truncate">
              {submission.fullName}
              {submission.rollNo && (
                <span className="ml-1.5 text-xs text-slate-500">Roll {submission.rollNo}</span>
              )}
            </span>

            {/* What the family actually sent. Without it, "done" is a checkbox
                a parent ticked and the teacher is marking nothing. */}
            {submission.note && (
              <span className="block truncate text-xs text-slate-500">“{submission.note}”</span>
            )}
            {submission.files.length > 0 && (
              <span className="mt-1 flex flex-wrap gap-1.5">
                {submission.files.map((file) => (
                  <a
                    key={file.id}
                    href={`/attachments?id=${file.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-navy-900 hover:bg-slate-200"
                  >
                    {file.mimeType.startsWith('image/') ? '🖼' : '📄'} {file.originalName}
                  </a>
                ))}
              </span>
            )}
          </span>

          <span className="flex gap-1">
            {REVIEW.map((option) => {
              const active = submission.status === option.status;
              return (
                <form
                  key={option.status}
                  action={reviewSubmissionAction.bind(null, submission.id, option.status)}
                >
                  <button
                    type="submit"
                    aria-pressed={active}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                      active ? option.tone : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {option.label}
                  </button>
                </form>
              );
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}
