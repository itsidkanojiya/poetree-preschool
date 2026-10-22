import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AppPicturesImport,
  LibraryPicture,
  Paginated,
  PictureLibraryQuery,
  StoredPicture,
} from '@poetree/shared';
import { prismaUnscoped } from '../db/prisma.js';
import { compressPicture } from '../lib/compress.js';
import { stripImageMetadata } from '../lib/exif.js';
import { paginate, toSkipTake } from '../lib/pagination.js';
import { sniffMime, storage } from '../lib/storage.js';
import { ApiError } from '../lib/apiError.js';

/**
 * The picture library: the catalogue's own pictures, to be chosen again.
 *
 * Every picture a question, a cover or a subject shows is a publication-owned
 * file — school NULL — served to every school from `/catalogue/assets/:id`.
 * Until now each was uploaded where it was used, so the same apple went up
 * once per question and was stored once per upload. The library lists what is
 * there; storing goes through one door that answers the picture already held
 * when the same one comes again.
 *
 * Book PDFs are publication-owned too, and never listed: they are what a
 * school pays for, not clip art. Pictures only, which leaves them out.
 */

/** A publication-owned picture that is still there. */
const IN_LIBRARY = {
  schoolId: null,
  deletedAt: null,
  mimeType: { startsWith: 'image/' },
} as const;

const urlOf = (id: string): string => `/api/v1/catalogue/assets/${id}`;

export async function listLibrary(query: PictureLibraryQuery): Promise<Paginated<LibraryPicture>> {
  const where = {
    ...IN_LIBRARY,
    ...(query.search ? { originalName: { contains: query.search } } : {}),
  };
  const [rows, total] = await Promise.all([
    prismaUnscoped.fileObject.findMany({
      where,
      // Newest first: what was just uploaded is what is wanted again next.
      // The name settles a tie, which an import of a hundred makes common.
      orderBy: [{ createdAt: 'desc' }, { originalName: 'asc' }, { id: 'asc' }],
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
      ...toSkipTake(query),
    }),
    prismaUnscoped.fileObject.count({ where }),
  ]);

  return paginate(
    rows.map((row) => ({
      id: row.id,
      name: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      url: urlOf(row.id),
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    query,
  );
}

/**
 * Stores a picture for the catalogue, or answers the one already there.
 *
 * Made smaller for the phones that will download it, looking the same, then
 * compared by what it is: the same picture uploaded twice — or uploaded again
 * after being brought in from the app — is one file, used in both places.
 * Compression is deterministic, so the same upload comes out as the same
 * bytes every time.
 */
export async function storePicture(input: {
  bytes: Buffer;
  name: string;
  uploadedById: string;
}): Promise<StoredPicture> {
  // By content, never by the name or the Content-Type the client sent.
  const mime = sniffMime(input.bytes);
  if (!mime?.startsWith('image/')) {
    throw ApiError.badRequest('Catalogue artwork has to be a picture');
  }

  // Compressed first, so a photo's "this way up" is applied before its
  // metadata goes; one kept as uploaded is stripped like every other upload.
  const picture = await compressPicture({ bytes: input.bytes, mime, name: input.name });
  const bytes =
    picture.bytes === input.bytes ? stripImageMetadata(input.bytes, mime) : picture.bytes;
  const checksum = createHash('sha256').update(bytes).digest('hex');

  const held = await prismaUnscoped.fileObject.findFirst({
    where: { ...IN_LIBRARY, checksum },
    orderBy: { createdAt: 'asc' },
    select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
  });
  if (held) return { ...held, url: urlOf(held.id), reused: true };

  const stored = await storage.put({ schoolId: null, originalName: picture.name, bytes });
  const record = await prismaUnscoped.fileObject.create({
    data: {
      schoolId: null,
      storageKey: stored.key,
      originalName: picture.name.slice(0, 200),
      mimeType: picture.mime,
      sizeBytes: stored.sizeBytes,
      checksum: stored.checksum,
      uploadedById: input.uploadedById,
      visibility: 'PUBLIC',
    },
    select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
  });
  return { ...record, url: urlOf(record.id), reused: false };
}

/* -------------------------------------------------------------------------- */
/* The app's own pictures                                                     */
/* -------------------------------------------------------------------------- */

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * The app's assets, which the deploy copies to the server with the rest of the
 * repository. Resolved at call time: the layout differs between `src` under
 * tsx and `dist` after a build, and the process may start from the repository
 * root or from `apps/api`.
 */
export function appAssetsDir(): string | null {
  const candidates = [
    path.resolve(HERE, '../../../mobile/assets'),
    path.resolve(process.cwd(), '../mobile/assets'),
    path.resolve(process.cwd(), 'apps/mobile/assets'),
  ];
  return candidates.find((p) => fs.existsSync(path.join(p, 'tracing/lessons.json'))) ?? null;
}

export interface AppPicture {
  /** Relative to the app's assets folder. */
  file: string;
  /** What the library calls it: "Apple (A)", "Four fish (4)". */
  name: string;
}

interface LessonEntry {
  kind?: string;
  language?: string;
  word?: string;
  phrase?: string;
  count?: number;
  image?: string;
}

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The letter and number pictures the app teaches with — an apple for A, four
 * fish for 4 — named the way an author will look for them.
 *
 * Read from the tracing lessons, the one place that says what each picture
 * shows. A number's picture is the same in every language and is listed once,
 * by its English phrase.
 */
export async function appPictures(dir: string): Promise<AppPicture[]> {
  const lessons = JSON.parse(await readFile(path.join(dir, 'tracing/lessons.json'), 'utf8')) as {
    glyphs: Record<string, LessonEntry>;
  };

  const byFile = new Map<string, AppPicture>();
  for (const [glyph, entry] of Object.entries(lessons.glyphs)) {
    if (!entry.image?.startsWith('assets/')) continue;
    const file = entry.image.slice('assets/'.length);
    const extension = path.extname(file);

    if (entry.kind === 'number') {
      // English first, whichever language the file lists first.
      if (entry.language !== 'en' && byFile.has(file)) continue;
      const shows = entry.phrase ? capitalise(entry.phrase) : `Number ${entry.count ?? glyph}`;
      byFile.set(file, { file, name: `${shows} (${entry.count ?? glyph})${extension}` });
    } else if (entry.kind === 'letter' && entry.word && !byFile.has(file)) {
      byFile.set(file, { file, name: `${entry.word} (${glyph})${extension}` });
    }
  }
  return [...byFile.values()];
}

/**
 * Brings the app's letter and number pictures into the library, once.
 *
 * Safe to run again: a picture already there — by its bytes, or by the name it
 * was brought in under — is left alone, so pressing the button twice adds
 * nothing and a picture the publisher uploaded themselves is not doubled.
 */
export async function importAppPictures(
  uploadedById: string,
  dir: string | null = appAssetsDir(),
): Promise<AppPicturesImport> {
  if (!dir) throw ApiError.notFound('The app’s pictures are not on this server');

  const pictures = await appPictures(dir);
  const named = new Set(
    (
      await prismaUnscoped.fileObject.findMany({
        where: { ...IN_LIBRARY, originalName: { in: pictures.flatMap(namesAsStored) } },
        select: { originalName: true },
      })
    ).map((row) => row.originalName),
  );

  let added = 0;
  let existing = 0;
  for (const picture of pictures) {
    if (namesAsStored(picture).some((name) => named.has(name))) {
      existing += 1;
      continue;
    }
    const bytes = await readFile(path.join(dir, picture.file));
    const stored = await storePicture({ bytes, name: picture.name, uploadedById });
    if (stored.reused) existing += 1;
    else added += 1;
  }
  return { total: pictures.length, added, existing };
}

/** A PNG is stored as WebP when that is smaller, and named for what it is. */
function namesAsStored(picture: AppPicture): string[] {
  return [picture.name, picture.name.replace(/\.png$/i, '.webp')].map((name) => name.slice(0, 200));
}
