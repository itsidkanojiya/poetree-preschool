import 'server-only';

import type { QuestionSettings } from '@poetree/shared';
import { uploadCatalogueAsset } from '@/lib/catalogue-assets';
import { hasSettings, isChoiceType } from './editors/kinds';

/**
 * Reading a question off the editor's form, for every type: shared by the
 * question screens and the Add activity page, which both send what an author
 * wrote to the API.
 */

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

/** One picture, emoji or word, as an editor slot sends it. */
interface Media {
  text?: string;
  glyph?: string;
  fileId: string | null;
}

interface OptionDraft extends Media {
  isCorrect: boolean;
  groupIndex?: number | null;
  matchText?: string;
  matchGlyph?: string;
  matchFileId?: string | null;
  matchShadow?: boolean;
}

/** The most slots each editor shows. The API says how many a type allows. */
const OPTION_SLOTS = 8;
const PAIR_SLOTS = 5;
const BASKET_SLOTS = 3;
const CARD_SLOTS = 9;

/** A text field, trimmed; empty when the form has no such field. */
function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

/** A text setting: null when empty, so the API stores nothing for it. */
function textSetting(formData: FormData, name: string): string | null {
  return field(formData, name) || null;
}

/** A number setting: null when empty or not a number. */
function numberSetting(formData: FormData, name: string): number | null {
  const value = Number.parseInt(field(formData, name), 10);
  return Number.isNaN(value) ? null : value;
}

/**
 * One slot read back: the picture uploaded now, or the one chosen from the
 * library or kept; the emoji or number; the word.
 */
async function readMedia(formData: FormData, prefix: string): Promise<Media> {
  const text = field(formData, `${prefix}-text`);
  const glyph = field(formData, `${prefix}-glyph`);
  const keep = field(formData, `${prefix}-fileId`);
  const picture = formData.get(`${prefix}-image`);

  let fileId: string | null = keep === '' ? null : keep;
  if (picture instanceof File && picture.size > 0) {
    fileId = await uploadCatalogueAsset(picture);
  }

  return { text: text || undefined, glyph: glyph || undefined, fileId };
}

const isEmpty = (media: Media): boolean => !media.text && !media.glyph && !media.fileId;

/**
 * Reads the option slots off the form.
 *
 * A slot with nothing in it is not an option — an author filling two of four is
 * writing a two-choice question, not leaving two blank squares for a child to
 * tap.
 */
async function readOptions(formData: FormData): Promise<OptionDraft[]> {
  // getAll, because a multiple-choice question ticks more than one box and a
  // radio group sends exactly one — the same code reads both.
  const correct = new Set(formData.getAll('correct').map(String));
  const drafts: OptionDraft[] = [];

  for (let index = 0; index < OPTION_SLOTS; index += 1) {
    const media = await readMedia(formData, `option-${index}`);
    if (isEmpty(media)) continue;
    drafts.push({ ...media, isCorrect: correct.has(String(index)) });
  }

  return drafts;
}

/**
 * Match the Pairs: each filled pair, left side as the option and right side as
 * its partner. A pair with nothing on either side is an unused slot; one with
 * a left side only is kept, so the API can say what it is missing.
 */
async function readPairs(formData: FormData): Promise<OptionDraft[]> {
  const pairs: OptionDraft[] = [];

  for (let index = 0; index < PAIR_SLOTS; index += 1) {
    const left = await readMedia(formData, `pair-${index}-left`);
    const right = await readMedia(formData, `pair-${index}-right`);
    const shadow = formData.has(`pair-${index}-shadow`);
    if (isEmpty(left) && isEmpty(right) && !shadow) continue;

    pairs.push({
      ...left,
      isCorrect: false,
      matchText: right.text,
      matchGlyph: right.glyph,
      matchFileId: right.fileId,
      matchShadow: shadow,
    });
  }

  return pairs;
}

/**
 * Sort into Groups: the named baskets, and the cards with the basket each
 * goes in. A basket slot left empty is skipped, so the cards' choices are
 * renumbered to the baskets that exist; a card pointed at an empty slot is
 * sent with no basket, and the API says so beside the question.
 */
async function readSort(formData: FormData): Promise<{
  groups: Array<{ label: string; glyph: string | null; fileId: string | null }>;
  cards: OptionDraft[];
}> {
  const groups: Array<{ label: string; glyph: string | null; fileId: string | null }> = [];
  const renumbered = new Map<number, number>();

  for (let slot = 0; slot < BASKET_SLOTS; slot += 1) {
    const basket = await readMedia(formData, `group-${slot}`);
    if (isEmpty(basket)) continue;
    if (!basket.text) throw new Error(`Give basket ${slot + 1} a name, like Healthy or Day.`);
    renumbered.set(slot, groups.length);
    groups.push({ label: basket.text, glyph: basket.glyph ?? null, fileId: basket.fileId });
  }

  const cards: OptionDraft[] = [];
  for (let index = 0; index < CARD_SLOTS; index += 1) {
    const card = await readMedia(formData, `card-${index}`);
    if (isEmpty(card)) continue;
    const slot = Number.parseInt(field(formData, `card-${index}-group`), 10);
    cards.push({ ...card, isCorrect: false, groupIndex: renumbered.get(slot) ?? null });
  }

  return { groups, cards };
}

/**
 * The question as the API takes it, read for the type the form was laid out
 * for. Only the type's own fields are read: a rhyme has no options, a pair has
 * no right answer to tick.
 */
export async function readQuestion(formData: FormData) {
  const kind = field(formData, 'kind');

  let options: OptionDraft[] = [];
  let settings: QuestionSettings | undefined;

  if (isChoiceType(kind)) {
    options = await readOptions(formData);
  } else if (kind === 'MATCH_PAIRS') {
    options = await readPairs(formData);
  } else if (kind === 'SORT_GROUPS') {
    const sorted = await readSort(formData);
    options = sorted.cards;
    settings = { groups: sorted.groups };
  } else if (kind === 'COUNT_OUT') {
    settings = {
      target: numberSetting(formData, 'target'),
      shown: numberSetting(formData, 'shown'),
    };
  } else if (kind === 'FILL_GAP') {
    settings = { row: textSetting(formData, 'row'), extras: textSetting(formData, 'extras') };
  } else if (kind === 'LETTER_HUNT') {
    settings = { targets: textSetting(formData, 'targets'), grid: textSetting(formData, 'grid') };
  } else if (kind === 'RHYME' || kind === 'STORY') {
    settings = { lines: textSetting(formData, 'lines') };
  }

  return {
    say: field(formData, 'say'),
    promptGlyph: field(formData, 'promptGlyph') || null,
    strokes: readStrokes(formData),
    options,
    ...(settings && hasSettings(kind) ? { settings } : {}),
  };
}

/**
 * The picture above the question: a new upload, or the one chosen from the
 * library (or kept). Undefined when the form has no such field, which leaves
 * the question's picture as it is.
 */
export async function readPromptPicture(formData: FormData): Promise<string | null | undefined> {
  const upload = formData.get('prompt-image');
  if (upload instanceof File && upload.size > 0) return uploadCatalogueAsset(upload);
  if (!formData.has('prompt-fileId')) return undefined;
  const chosen = String(formData.get('prompt-fileId') ?? '').trim();
  return chosen === '' ? null : chosen;
}
