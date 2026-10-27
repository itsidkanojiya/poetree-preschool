'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { CatalogueActivity, ChapterSummary } from '@poetree/shared';
import { apiFetch, errorMessage } from '@/lib/api';
import { readPromptPicture, readQuestion } from '../../question-types/[id]/questions/read-question';

export interface WizardState {
  error?: string;
}

/** A new chapter in the book being added to, then straight on to step 3. */
export async function addChapterAction(
  bookId: string,
  _prev: WizardState,
  formData: FormData,
): Promise<WizardState> {
  const name = String(formData.get('name') ?? '').trim();
  if (name === '') return { error: 'Give the chapter a name.' };

  let chapter: ChapterSummary;
  try {
    chapter = await apiFetch<ChapterSummary>(`/publication/books/${bookId}/chapters`, {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: { name },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not add the chapter.') };
  }

  revalidatePath(`/publication/books/${bookId}`);
  redirect(`/publication/questions/new?bookId=${bookId}&chapterId=${chapter.id}`);
}

/** Where the new activity goes, fixed by the three steps before the form. */
export interface WizardPlace {
  bookId: string;
  /** Null when it is in the book but in no chapter. */
  chapterId: string | null;
  type: string;
  classLevelId: string;
}

/**
 * Step 3's form: the activity page and its first question, saved together.
 *
 * The page is named after what the child is asked unless the author named it,
 * filed in the chosen book and chapter, at the book's own class level. Then
 * the question goes on it, and the author lands on that page ready to add the
 * next one.
 */
export async function createActivityAction(
  place: WizardPlace,
  _prev: WizardState,
  formData: FormData,
): Promise<WizardState> {
  const say = String(formData.get('say') ?? '').trim();
  if (say.length < 1) return { error: 'Say what the child has to do.' };
  const title = String(formData.get('title') ?? '').trim() || say;
  const skillId = String(formData.get('skillId') ?? '').trim();
  if (skillId === '') return { error: 'Choose what this counts towards.' };

  let activity: CatalogueActivity;
  try {
    // Read first: a picture that will not upload must not leave an empty page
    // behind.
    const question = await readQuestion(formData);
    const promptFileId = (await readPromptPicture(formData)) ?? null;

    activity = await apiFetch<CatalogueActivity>('/publication/activities', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        title: title.slice(0, 160),
        type: place.type,
        skillId,
        classLevelId: place.classLevelId,
        bookIds: [place.bookId],
        chapterId: place.chapterId,
      },
    });

    await apiFetch(`/publication/activities/${activity.id}/questions`, {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: { ...question, promptFileId },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save the activity.') };
  }

  revalidatePath('/publication/questions');
  revalidatePath('/publication/question-types');
  revalidatePath(`/publication/books/${place.bookId}`);
  redirect(`/publication/questions/new?activityId=${activity.id}&added=1`);
}
