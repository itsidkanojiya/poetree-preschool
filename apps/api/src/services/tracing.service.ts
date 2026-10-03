import { Prisma } from '@prisma/client';
import {
  TRACING_PATTERNS,
  youTubeVideoId,
  type CreateTracingItemInput,
  type TracingCatalogueAdmin,
  type TracingCategoryAdmin,
  type TracingCategoryForChild,
  type TracingHome,
  type TracingItemAdmin,
  type UpdateTracingCategoryInput,
  type UpdateTracingItemInput,
} from '@poetree/shared';
import { prisma, prismaUnscoped } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { GLYPH_STROKES, isFreeOrderGlyph, strokesForGlyph } from '../content/glyphStrokes.js';
import { assertCanReadStudent } from './scope.service.js';
import { writeAuditLog } from './audit.service.js';

/**
 * The tracing module: pick a category, pick a letter, watch its video, trace
 * it, go on to the next.
 *
 * The catalogue is the publisher's and the same for every school, like a
 * book. Each child's progress through it is their school's, like an attempt.
 * One switch on the publication turns the module on or off everywhere; off
 * closes the child's routes here as well as hiding the tile in the app, so an
 * app that has not noticed yet still cannot open it.
 */

/* -------------------------------------------------------------------------- */
/* The default catalogue                                                      */
/* -------------------------------------------------------------------------- */

const ALL_GLYPHS = Object.keys(GLYPH_STROKES);

const inRange = (glyph: string, from: number, to: number) => {
  const code = glyph.codePointAt(0) ?? 0;
  return code >= from && code <= to;
};
const isDevanagariDigit = (g: string) => inRange(g, 0x0966, 0x096f);
const isGujaratiDigit = (g: string) => inRange(g, 0x0ae6, 0x0aef);

const letters = (from: string, to: string) =>
  Array.from({ length: to.charCodeAt(0) - from.charCodeAt(0) + 1 }, (_, i) =>
    String.fromCharCode(from.charCodeAt(0) + i),
  );

/**
 * What a new installation starts with. The three a preschool teaches first are
 * on; the rest are there, in teaching order, for the publisher to switch on
 * when their videos are ready. Built from the stroke table rather than typed
 * out, so a letter the table cannot draw can never be offered.
 */
const DEFAULT_CATEGORIES: Array<{
  key: string;
  name: string;
  label: string;
  isActive: boolean;
  glyphs: string[];
}> = [
  {
    key: 'capital',
    name: 'Capital letters',
    label: 'A B C',
    isActive: true,
    glyphs: letters('A', 'Z'),
  },
  {
    key: 'number',
    name: 'Numbers',
    label: '1 2 3',
    isActive: true,
    glyphs: Array.from({ length: 10 }, (_, i) => String(i + 1)),
  },
  {
    key: 'small',
    name: 'Small letters',
    label: 'a b c',
    isActive: true,
    glyphs: letters('a', 'z'),
  },
  {
    key: 'pattern',
    name: 'Patterns',
    label: '| — /',
    isActive: false,
    glyphs: TRACING_PATTERNS.map((p) => p.key),
  },
  {
    key: 'hindi',
    name: 'Hindi letters',
    label: 'अ आ इ',
    isActive: false,
    glyphs: ALL_GLYPHS.filter((g) => inRange(g, 0x0900, 0x097f) && !isDevanagariDigit(g)),
  },
  {
    key: 'hindi-number',
    name: 'Hindi numbers',
    label: '१ २ ३',
    isActive: false,
    glyphs: ALL_GLYPHS.filter(isDevanagariDigit),
  },
  {
    key: 'gujarati',
    name: 'Gujarati letters',
    label: 'અ આ ઇ',
    isActive: false,
    glyphs: ALL_GLYPHS.filter((g) => inRange(g, 0x0a80, 0x0aff) && !isGujaratiDigit(g)),
  },
  {
    key: 'gujarati-number',
    name: 'Gujarati numbers',
    label: '૧ ૨ ૩',
    isActive: false,
    glyphs: ALL_GLYPHS.filter(isGujaratiDigit),
  },
].map((category) => ({
  ...category,
  glyphs: category.glyphs.filter((g) => g in GLYPH_STROKES),
}));

/**
 * Writes any default category that is not there yet. A category can be
 * switched off but never deleted, so one that is missing has simply never been
 * written — and asking costs one query of eight short keys.
 */
async function ensureCatalogue(): Promise<void> {
  const existing = new Set(
    (await prismaUnscoped.tracingCategory.findMany({ select: { key: true } })).map((c) => c.key),
  );

  for (const [index, category] of DEFAULT_CATEGORIES.entries()) {
    if (existing.has(category.key)) continue;
    try {
      await prismaUnscoped.tracingCategory.create({
        data: {
          key: category.key,
          name: category.name,
          label: category.label,
          isActive: category.isActive,
          sortOrder: index,
          items: {
            create: category.glyphs.map((glyph, sortOrder) => ({ glyph, sortOrder })),
          },
        },
      });
    } catch (error) {
      // Two first requests at once: the other one wrote it.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

function toVideo(url: string | null) {
  if (!url) return null;
  const videoId = youTubeVideoId(url);
  return videoId ? { videoId, url } : null;
}

const PATTERN_NAMES = new Map<string, string>(TRACING_PATTERNS.map((p) => [p.key, p.label]));

/** The sentence the voice starts with, when the publisher has not written one. */
export function plainSay(glyph: string): string {
  const pattern = PATTERN_NAMES.get(glyph);
  if (pattern) return `Trace the ${pattern.toLowerCase()}. Follow the dots with your finger.`;
  if (/^\d+$/.test(glyph)) return `Trace the number ${glyph}. Follow the dots with your finger.`;
  if (/^[A-Z]$/.test(glyph))
    return `Trace the capital letter ${glyph}. Follow the dots with your finger.`;
  if (/^[a-z]$/.test(glyph))
    return `Trace the small letter ${glyph}. Follow the dots with your finger.`;
  return `Trace ${glyph}. Follow the dots with your finger.`;
}

async function publicationRow() {
  const publication = await prismaUnscoped.publication.findFirst({
    select: { id: true, tracingEnabled: true },
  });
  if (!publication) {
    throw ApiError.internal('No publication has been configured. Run the database seed.');
  }
  return publication;
}

/** Whether this school's app offers tracing. */
async function enabledForSchool(): Promise<boolean> {
  const school = await prismaUnscoped.school.findUnique({
    where: { id: requireSchoolId() },
    select: { publication: { select: { tracingEnabled: true } } },
  });
  return school?.publication.tracingEnabled ?? false;
}

async function assertEnabled(): Promise<void> {
  // A 404 rather than a 403: to the app, a module that is off is not there.
  if (!(await enabledForSchool())) throw ApiError.notFound('Tracing is not available');
}

/* -------------------------------------------------------------------------- */
/* A child                                                                    */
/* -------------------------------------------------------------------------- */

/** The home screen's question: is tracing on, and which categories to show. */
export async function homeFor(studentId: string): Promise<TracingHome> {
  await assertCanReadStudent(studentId);
  if (!(await enabledForSchool())) return { enabled: false, categories: [] };
  await ensureCatalogue();

  const [categories, traced] = await Promise.all([
    prismaUnscoped.tracingCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { items: { where: { isActive: true }, select: { id: true } } },
    }),
    prisma.tracingProgress.findMany({
      where: { studentId, tracedAt: { not: null } },
      select: { itemId: true },
    }),
  ]);
  const done = new Set(traced.map((row) => row.itemId));

  return {
    enabled: true,
    categories: categories
      .filter((category) => category.items.length > 0)
      .map((category) => ({
        id: category.id,
        key: category.key,
        name: category.name,
        label: category.label,
        itemCount: category.items.length,
        tracedCount: category.items.filter((item) => done.has(item.id)).length,
      })),
  };
}

export async function categoryFor(
  categoryId: string,
  studentId: string,
): Promise<TracingCategoryForChild> {
  await assertCanReadStudent(studentId);
  await assertEnabled();

  const category = await prismaUnscoped.tracingCategory.findFirst({
    where: { id: categoryId, isActive: true },
    include: {
      items: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
    },
  });
  if (!category) throw ApiError.notFound('Category not found');

  const progress = await prisma.tracingProgress.findMany({
    where: { studentId, itemId: { in: category.items.map((item) => item.id) } },
    select: { itemId: true, videoWatchedAt: true, tracedAt: true },
  });
  const byItem = new Map(progress.map((row) => [row.itemId, row]));

  return {
    id: category.id,
    key: category.key,
    name: category.name,
    label: category.label,
    items: category.items.flatMap((item) => {
      const strokes = strokesForGlyph(item.glyph);
      // Only a glyph the table can draw is ever added; this keeps a row that
      // somehow is not from reaching a child as an empty page.
      if (!strokes) return [];
      const row = byItem.get(item.id);
      return [
        {
          id: item.id,
          glyph: item.glyph,
          say: item.say ?? plainSay(item.glyph),
          strokes,
          ordered: !isFreeOrderGlyph(item.glyph),
          video: toVideo(item.videoUrl),
          videoWatched: Boolean(row?.videoWatchedAt),
          traced: Boolean(row?.tracedAt),
        },
      ];
    }),
  };
}

async function playableItem(itemId: string) {
  const item = await prismaUnscoped.tracingItem.findFirst({
    where: { id: itemId, isActive: true, category: { isActive: true } },
    select: { id: true, videoUrl: true },
  });
  if (!item) throw ApiError.notFound('Item not found');
  return item;
}

/** The child reached the end of the item's video. */
export async function recordWatched(itemId: string, studentId: string): Promise<void> {
  await assertCanReadStudent(studentId);
  await assertEnabled();
  await playableItem(itemId);
  const now = new Date();

  await prisma.tracingProgress.upsert({
    where: { studentId_itemId: { studentId, itemId } },
    create: { schoolId: requireSchoolId(), studentId, itemId, videoWatchedAt: now },
    update: { videoWatchedAt: now },
  });
}

/**
 * The child traced the item to the end.
 *
 * Refused while its video is unwatched: the app puts the video first, and
 * this holds the same line for anything that talks to the API directly.
 */
export async function recordTraced(itemId: string, studentId: string): Promise<{ traced: true }> {
  await assertCanReadStudent(studentId);
  await assertEnabled();
  const item = await playableItem(itemId);

  const existing = await prisma.tracingProgress.findUnique({
    where: { studentId_itemId: { studentId, itemId } },
    select: { videoWatchedAt: true, tracedAt: true },
  });
  if (toVideo(item.videoUrl) && !existing?.videoWatchedAt) {
    throw ApiError.conflict('Watch the video first');
  }

  const now = new Date();
  await prisma.tracingProgress.upsert({
    where: { studentId_itemId: { studentId, itemId } },
    create: { schoolId: requireSchoolId(), studentId, itemId, tracedAt: now, traceCount: 1 },
    update: { tracedAt: existing?.tracedAt ?? now, traceCount: { increment: 1 } },
  });
  return { traced: true };
}

/* -------------------------------------------------------------------------- */
/* The publisher                                                              */
/* -------------------------------------------------------------------------- */

type ItemRow = {
  id: string;
  glyph: string;
  videoUrl: string | null;
  say: string | null;
  sortOrder: number;
  isActive: boolean;
};

function toItemAdmin(row: ItemRow): TracingItemAdmin {
  return {
    id: row.id,
    glyph: row.glyph,
    videoUrl: row.videoUrl,
    videoId: row.videoUrl ? youTubeVideoId(row.videoUrl) : null,
    say: row.say,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

export async function catalogueAdmin(): Promise<TracingCatalogueAdmin> {
  await ensureCatalogue();
  const [publication, categories] = await Promise.all([
    publicationRow(),
    prismaUnscoped.tracingCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    }),
  ]);

  return {
    enabled: publication.tracingEnabled,
    categories: categories.map((category): TracingCategoryAdmin => ({
      id: category.id,
      key: category.key,
      name: category.name,
      label: category.label,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      items: category.items.map(toItemAdmin),
    })),
    glyphs: ALL_GLYPHS,
  };
}

export async function setEnabled(enabled: boolean, actorUserId: string): Promise<void> {
  const publication = await publicationRow();
  await prismaUnscoped.publication.update({
    where: { id: publication.id },
    data: { tracingEnabled: enabled },
  });
  await writeAuditLog({
    action: 'TRACING_SETTINGS_CHANGED',
    entity: 'Publication',
    entityId: publication.id,
    schoolId: null,
    actorUserId,
    before: { tracingEnabled: publication.tracingEnabled },
    after: { tracingEnabled: enabled },
  });
}

export async function updateCategory(
  id: string,
  input: UpdateTracingCategoryInput,
  actorUserId: string,
): Promise<void> {
  const found = await prismaUnscoped.tracingCategory.findUnique({ where: { id } });
  if (!found) throw ApiError.notFound('Category not found');

  await prismaUnscoped.tracingCategory.update({ where: { id }, data: input });
  await writeAuditLog({
    action: 'TRACING_CONTENT_UPDATED',
    entity: 'TracingCategory',
    entityId: id,
    schoolId: null,
    actorUserId,
    metadata: { fields: Object.keys(input) },
  });
}

export async function addItem(
  categoryId: string,
  input: CreateTracingItemInput,
  actorUserId: string,
): Promise<TracingItemAdmin> {
  const glyph = input.glyph.trim();
  if (!(glyph in GLYPH_STROKES)) {
    throw ApiError.badRequest(`There is no tracing shape for “${glyph}”`);
  }

  const category = await prismaUnscoped.tracingCategory.findUnique({
    where: { id: categoryId },
    include: { items: { select: { id: true, glyph: true, isActive: true, sortOrder: true } } },
  });
  if (!category) throw ApiError.notFound('Category not found');

  const videoUrl = input.videoUrl?.trim() || null;
  // Compared here, exactly, rather than by a unique index: the database's
  // collation would call ड़ and ड the same letter.
  const existing = category.items.find((item) => item.glyph === glyph);
  if (existing?.isActive) throw ApiError.conflict(`“${glyph}” is already in ${category.name}`);

  // One that was taken out comes back where it was, keeping its video
  // unless a new one is given.
  const row = existing
    ? await prismaUnscoped.tracingItem.update({
        where: { id: existing.id },
        data: { isActive: true, ...(videoUrl ? { videoUrl } : {}) },
      })
    : await prismaUnscoped.tracingItem.create({
        data: {
          categoryId,
          glyph,
          videoUrl,
          sortOrder: Math.max(-1, ...category.items.map((item) => item.sortOrder)) + 1,
        },
      });

  await writeAuditLog({
    action: 'TRACING_CONTENT_UPDATED',
    entity: 'TracingItem',
    entityId: row.id,
    schoolId: null,
    actorUserId,
    after: { categoryId, glyph },
  });
  return toItemAdmin(row);
}

export async function updateItem(
  id: string,
  input: UpdateTracingItemInput,
  actorUserId: string,
): Promise<TracingItemAdmin> {
  const found = await prismaUnscoped.tracingItem.findUnique({ where: { id } });
  if (!found) throw ApiError.notFound('Item not found');

  const row = await prismaUnscoped.tracingItem.update({
    where: { id },
    data: {
      ...(input.videoUrl !== undefined ? { videoUrl: input.videoUrl.trim() || null } : {}),
      ...(input.say !== undefined ? { say: input.say.trim() || null } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  await writeAuditLog({
    action: 'TRACING_CONTENT_UPDATED',
    entity: 'TracingItem',
    entityId: id,
    schoolId: null,
    actorUserId,
    before: { videoUrl: found.videoUrl, isActive: found.isActive },
    after: { videoUrl: row.videoUrl, isActive: row.isActive },
  });
  return toItemAdmin(row);
}
