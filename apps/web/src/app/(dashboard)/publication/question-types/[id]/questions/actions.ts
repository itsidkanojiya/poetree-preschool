'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { API_BASE_URL, apiFetch, errorMessage } from '@/lib/api';
import { ACCESS_COOKIE } from '@/lib/auth-cookies';

export interface QuestionState {
  error?: string;
  success?: string;
}

/**
 * Uploads one picture to the catalogue and returns its id.
 *
 * Done from the server so the access token stays in its httpOnly cookie, the
 * same two-step every other attachment in this system uses.
 */
async function uploadAsset(file: File): Promise<string> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const form = new FormData();
  form.append('file', file);

  const response = await fetch(`${API_BASE_URL}/publication/assets`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: form,
    cache: 'no-store',
  });

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: { message?: string } }).error.message ?? 'Upload failed')
        : 'Upload failed';
    throw new Error(message);
  }

  return (data as { id: string }).id;
}

/**
 * The drawn path, as the editor serialised it.
 *
 * Empty means the author has not drawn anything, which is not the same as
 * "leave what was there" — but it is what a cleared canvas means, and the API
 * will refuse to show a tracing question with no path anyway.
 */
function readStrokes(formData: FormData): Array<Array<{ x: number; y: number }>> | undefined {
  const raw = String(formData.get('strokes') ?? '').trim();
  if (raw === '') return undefined;

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) && parsed.length > 0
      ? (parsed as Array<Array<{ x: number; y: number }>>)
      : undefined;
  } catch {
    return undefined;
  }
}

interface OptionDraft {
  text?: string;
  glyph?: string;
  fileId?: string | null;
  isCorrect: boolean;
}

/**
 * Reads the four option slots off the form.
 *
 * A slot with nothing in it is not an option — an author filling two of four is
 * writing a two-choice question, not leaving two blank squares for a child to
 * tap.
 */
async function readOptions(formData: FormData): Promise<OptionDraft[]> {
  const correct = String(formData.get('correct') ?? '');
  const drafts: OptionDraft[] = [];

  for (let index = 0; index < 4; index += 1) {
    const text = String(formData.get(`option-${index}-text`) ?? '').trim();
    const glyph = String(formData.get(`option-${index}-glyph`) ?? '').trim();
    const keep = String(formData.get(`option-${index}-fileId`) ?? '').trim();
    const picture = formData.get(`option-${index}-image`);

    let fileId: string | null = keep === '' ? null : keep;
    if (picture instanceof File && picture.size > 0) {
      fileId = await uploadAsset(picture);
    }

    if (text === '' && glyph === '' && fileId === null) continue;

    drafts.push({
      text: text === '' ? undefined : text,
      glyph: glyph === '' ? undefined : glyph,
      fileId,
      isCorrect: correct === String(index),
    });
  }

  return drafts;
}

export async function addQuestionAction(
  activityId: string,
  _prev: QuestionState,
  formData: FormData,
): Promise<QuestionState> {
  const say = String(formData.get('say') ?? '').trim();
  if (say.length < 1) return { error: 'Say what the child has to do.' };

  try {
    const options = await readOptions(formData);

    const promptPicture = formData.get('prompt-image');
    const promptFileId =
      promptPicture instanceof File && promptPicture.size > 0
        ? await uploadAsset(promptPicture)
        : null;

    await apiFetch(`/publication/activities/${activityId}/questions`, {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        say,
        promptGlyph: String(formData.get('promptGlyph') ?? '').trim() || null,
        promptFileId,
        strokes: readStrokes(formData),
        options,
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not add the question.') };
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
    const options = await readOptions(formData);

    await apiFetch(`/publication/questions/${questionId}`, {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: {
        say: String(formData.get('say') ?? '').trim(),
        promptGlyph: String(formData.get('promptGlyph') ?? '').trim() || null,
        strokes: readStrokes(formData),
        options,
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save the question.') };
  }

  revalidatePath(`/publication/question-types/${activityId}/questions`);
  return { success: 'Saved.' };
}

export async function deleteQuestionAction(
  activityId: string,
  questionId: string,
): Promise<void> {
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
    `/publication/question-types/${activityId}/questions`,
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
