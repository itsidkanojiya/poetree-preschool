'use client';

import { useActionState, useRef, useState, useTransition } from 'react';
import type { ClassroomSummary, GalleryEventDetail } from '@poetree/shared';
import { Field, FieldSet, FormError, Input, SubmitButton, Textarea } from '@/components/ui/form';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Toast } from '@/components/ui/toast';
import {
  createEventAction,
  deleteEventAction,
  refreshEventAction,
  removePhotoAction,
  updateEventAction,
  uploadPhotoAction,
  type GalleryState,
} from './actions';
import { shrinkForGallery } from './shrink';

const classLabel = (classroom: ClassroomSummary) =>
  `${classroom.classLevel.name} — ${classroom.section}`;

/**
 * Who may see an event: the whole school, or the classes ticked.
 *
 * The classes are hidden while "whole school" is ticked, so nobody ticks both
 * and wonders which one wins.
 */
function AudienceFields({
  classrooms,
  visibleToAll: initialAll = false,
  selected = [],
}: {
  classrooms: ClassroomSummary[];
  visibleToAll?: boolean;
  selected?: string[];
}) {
  const [visibleToAll, setVisibleToAll] = useState(initialAll);

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Who can see it
      </legend>

      <label className="flex items-start gap-2.5 text-sm text-navy-950">
        <input
          type="checkbox"
          name="visibleToAll"
          checked={visibleToAll}
          onChange={(event) => setVisibleToAll(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-navy-300"
        />
        <span>
          <span className="block font-medium">Every family in the school</span>
          <span className="block text-xs text-slate-500">
            For school-wide occasions. Otherwise, only the classes ticked below.
          </span>
        </span>
      </label>

      {!visibleToAll && (
        <div className="grid gap-1.5 pl-1 sm:grid-cols-2">
          {classrooms.length === 0 && (
            <p className="text-xs text-slate-500">
              No classes this year yet — add one under Classrooms first.
            </p>
          )}
          {classrooms.map((classroom) => (
            <label key={classroom.id} className="flex items-center gap-2 text-sm text-navy-950">
              <input
                type="checkbox"
                name="classroomIds"
                value={classroom.id}
                defaultChecked={selected.includes(classroom.id)}
                className="h-4 w-4 rounded border-navy-300"
              />
              {classLabel(classroom)}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

export function NewEventForm({ classrooms }: { classrooms: ClassroomSummary[] }) {
  const [state, formAction] = useActionState<GalleryState, FormData>(createEventAction, {});

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />

      <FieldSet>
        <Field label="Event name" required>
          <Input name="name" required placeholder="Sports Day" />
        </Field>
        <Field label="Date">
          <Input name="eventDate" type="date" />
        </Field>
      </FieldSet>

      <Field label="About it" hint="Optional — a line shown above the photos.">
        <Textarea name="description" rows={2} maxLength={500} />
      </Field>

      <AudienceFields classrooms={classrooms} />

      <SubmitButton pendingLabel="Creating…">Create and add photos</SubmitButton>
    </form>
  );
}

export function EditEventForm({
  event,
  classrooms,
}: {
  event: GalleryEventDetail;
  classrooms: ClassroomSummary[];
}) {
  const [state, formAction] = useActionState<GalleryState, FormData>(
    updateEventAction.bind(null, event.id),
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <Toast message={state.success} />

      <FieldSet>
        <Field label="Event name" required>
          <Input name="name" required defaultValue={event.name} />
        </Field>
        <Field label="Date">
          <Input name="eventDate" type="date" defaultValue={event.eventDate?.slice(0, 10) ?? ''} />
        </Field>
      </FieldSet>

      <Field label="About it">
        <Textarea
          name="description"
          rows={2}
          maxLength={500}
          defaultValue={event.description ?? ''}
        />
      </Field>

      <AudienceFields
        classrooms={classrooms}
        visibleToAll={event.visibleToAll}
        selected={event.classrooms.map((classroom) => classroom.id)}
      />

      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}

/**
 * Choosing photos, shrinking each one here in the browser, and sending them one
 * at a time with a running count — a school uploads forty photos from a sports
 * day, and a single spinner for all forty tells them nothing.
 */
export function PhotoUploader({ eventId }: { eventId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  async function send(files: FileList) {
    const chosen = Array.from(files);
    setProblems([]);
    setProgress({ done: 0, total: chosen.length });

    const failed: string[] = [];

    for (const [index, file] of chosen.entries()) {
      try {
        const small = await shrinkForGallery(file);
        const body = new FormData();
        // Named .jpg because that is what it now is, whatever it started as.
        body.append('photo', new File([small], toJpegName(file.name), { type: small.type }));

        const result = await uploadPhotoAction(eventId, body);
        if (result.error) failed.push(`${file.name}: ${result.error}`);
      } catch (error) {
        failed.push(error instanceof Error ? error.message : `${file.name}: could not be read`);
      }
      setProgress({ done: index + 1, total: chosen.length });
    }

    setProblems(failed);
    setProgress(null);
    if (input.current) input.current.value = '';
    startTransition(() => refreshEventAction(eventId));
  }

  return (
    <div className="space-y-3">
      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          progress ? 'border-navy-200 bg-navy-50/50' : 'border-navy-200 hover:border-navy-400 hover:bg-navy-50'
        }`}
      >
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          disabled={progress !== null}
          className="sr-only"
          onChange={(event) => event.target.files && send(event.target.files)}
        />
        {progress ? (
          <>
            <span className="text-sm font-semibold text-navy-950">
              Uploading {progress.done} of {progress.total}…
            </span>
            <span className="h-1.5 w-48 overflow-hidden rounded-full bg-navy-100">
              <span
                className="block h-full rounded-full bg-navy-900 transition-all"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </span>
          </>
        ) : (
          <>
            <span className="text-sm font-semibold text-navy-950">Choose photos</span>
            <span className="text-xs text-slate-500">
              Any size — each is shrunk to under 1 MB before it is sent.
            </span>
          </>
        )}
      </label>

      {problems.length > 0 && (
        <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
          <p className="mb-1 font-semibold">
            {problems.length} {problems.length === 1 ? 'photo was' : 'photos were'} not added:
          </p>
          <ul className="list-disc space-y-0.5 pl-4">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function toJpegName(name: string): string {
  const stem = name.replace(/\.[^.]+$/, '') || 'photo';
  return `${stem}.jpg`;
}

/** The photos already in the event, each removable. */
export function PhotoGrid({ event }: { event: GalleryEventDetail }) {
  if (event.photos.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No photos yet. Families will not see this event until it has at least one.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {event.photos.map((photo) => {
        const fileId = photo.url.split('/').pop();
        return (
          <div key={photo.id} className="group relative overflow-hidden rounded-xl bg-slate-100">
            {/* A plain img: a picture from our own API through the portal's
                authenticated attachment route. */}
            <img
              src={`/attachments?id=${fileId}`}
              alt={photo.caption ?? ''}
              className="aspect-square w-full object-cover"
              loading="lazy"
            />
            <form
              action={removePhotoAction.bind(null, event.id, photo.id)}
              className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
            >
              <button
                type="submit"
                className="rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-rose-700 shadow"
              >
                Remove
              </button>
            </form>
          </div>
        );
      })}
    </div>
  );
}

export function DeleteEventButton({ event }: { event: GalleryEventDetail }) {
  return (
    <ConfirmButton
      action={deleteEventAction.bind(null, event.id)}
      label="Delete event"
      title={`Delete “${event.name}”?`}
      body={`The event and its ${event.photoCount} ${
        event.photoCount === 1 ? 'photo go' : 'photos go'
      } from every family’s gallery. This cannot be undone.`}
      confirmLabel="Delete it"
    />
  );
}
