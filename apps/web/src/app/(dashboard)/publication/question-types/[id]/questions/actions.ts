'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, errorMessage } from '@/lib/api';
import { readPromptPicture, readQuestion } from './read-question';

export interface QuestionState {
  error?: string;
  success?: string;
}

export async function addQuestionAction(
  activityId: string,
  _prev: QuestionState,
  formData: FormData,
): Promise<QuestionState> {
  const say = String(formData.get('say') ?? '').trim();
  if (say.length < 1) return { error: 'Say what the child has to do.' };

  try {
    const question = await readQuestion(formData);
    const promptFileId = (await readPromptPicture(formData)) ?? null;

    await apiFetch(`/publication/activities/${activityId}/questions`, {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: { ...question, promptFileId },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not add the activity.') };
  }

  revalidatePath(`/publication/question-types/${activityId}/questions`);
  return { success: 'Added.' };
}

export async function updateQuestionAction(
  activityId: string,
  questionId: string,
  _prev: QuestionState,
  formData: FormData,
): Promise<QuestionState> {
  try {
    const question = await readQuestion(formData);

    await apiFetch(`/publication/questions/${questionId}`, {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: { ...question, promptFileId: await readPromptPicture(formData) },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save the activity.') };
  }

  revalidatePath(`/publication/question-types/${activityId}/questions`);
  return { success: 'Saved.' };
}

export async function deleteQuestionAction(activityId: string, questionId: string): Promise<void> {
  await apiFetch(`/publication/questions/${questionId}`, { method: 'DELETE' });
  revalidatePath(`/publication/question-types/${activityId}/questions`);
}

/**
 * Moving a question up or down the page.
 *
 * A swap with the neighbour, not an adjustment to a number: two questions added
 * seconds apart can hold the same sort order, and nudging one of them would
 * leave the page in an order nobody chose.
 */
export async function moveQuestionAction(
  activityId: string,
  questionId: string,
  neighbourId: string,
): Promise<void> {
  const questions = await apiFetch<Array<{ id: string; sortOrder: number }>>(
    `/publication/activities/${activityId}/questions`,
  );

  const mine = questions.find((row) => row.id === questionId);
  const theirs = questions.find((row) => row.id === neighbourId);
  if (!mine || !theirs) return;

  // Equal orders would swap to no effect, so the pair is renumbered by
  // position instead.
  const [first, second] =
    mine.sortOrder === theirs.sortOrder
      ? [questions.indexOf(theirs), questions.indexOf(mine)]
      : [theirs.sortOrder, mine.sortOrder];

  await apiFetch(`/publication/questions/${questionId}`, {
    method: 'PATCH',
    body: { sortOrder: first },
  });
  await apiFetch(`/publication/questions/${neighbourId}`, {
    method: 'PATCH',
    body: { sortOrder: second },
  });

  revalidatePath(`/publication/question-types/${activityId}/questions`);
}
