import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { logger } from './logger.js';

/**
 * Making what the publisher uploads smaller without it looking any different.
 *
 * "Looks identical", not "bit-identical", chosen on purpose: lossless saves
 * about a third, while high-quality compression saves four fifths or more —
 * measured on the publisher's own pictures — and nobody can tell the two apart
 * on a phone. Every phone downloads these, many on mobile data, so the
 * difference is the difference between a book that opens and one that does
 * not.
 *
 * Never worse than doing nothing: anything that fails, or comes out no
 * smaller, leaves the original exactly as it was.
 */

/** The longest side a picture needs: no phone or tablet draws one larger. */
const MAX_PICTURE_SIDE = 2048;

/**
 * WebP at 90, with the transparency kept exactly. Measured on the books'
 * pictures: 16% of the PNG they came as, no difference to see.
 */
const PICTURE_QUALITY = 90;

export interface Picture {
  bytes: Buffer;
  mime: string;
  name: string;
}

/**
 * A picture as a high-quality WebP, no larger than a screen needs.
 *
 * WebP that arrives as WebP is left alone: it is compressed already, and
 * compressing it again only loses more. Sharp writes no metadata unless asked,
 * so a camera's location goes with the conversion too.
 */
export async function compressPicture(picture: Picture): Promise<Picture> {
  if (picture.mime !== 'image/jpeg' && picture.mime !== 'image/png') return picture;

  try {
    const bytes = await sharp(picture.bytes)
      // The camera's "this way up", applied before the metadata saying so goes.
      .rotate()
      .resize({
        width: MAX_PICTURE_SIDE,
        height: MAX_PICTURE_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: PICTURE_QUALITY, alphaQuality: 100, effort: 6, smartSubsample: true })
      .toBuffer();

    if (bytes.length >= picture.bytes.length) return picture;

    return {
      bytes,
      mime: 'image/webp',
      name: `${picture.name.replace(/\.[^./\\]+$/, '')}.webp`,
    };
  } catch (error) {
    logger.warn('Could not compress a picture; keeping it as uploaded', {
      name: picture.name,
      error: error instanceof Error ? error.message : String(error),
    });
    return picture;
  }
}

const run = promisify(execFile);

/** Whether a command-line tool is installed here, asked once per tool. */
const installed = new Map<string, Promise<boolean>>();

function has(tool: string): Promise<boolean> {
  let answer = installed.get(tool);
  if (!answer) {
    answer = run(tool, ['--version'], { timeout: 10_000 }).then(
      () => true,
      () => false,
    );
    installed.set(tool, answer);
  }
  return answer;
}

/** Long enough for a fifty-megabyte book on a busy server, and no longer. */
const PDF_TIMEOUT_MS = 10 * 60_000;

/**
 * Ghostscript's settings: pictures inside the book brought down to 200 dpi —
 * sharper than any phone or tablet screen shows a page — and re-encoded at
 * print quality. Line art stays at 400 dpi, so text drawn as pictures keeps
 * its edges. -dSAFER keeps the interpreter away from the file system.
 */
const GHOSTSCRIPT_ARGS = [
  '-dSAFER',
  '-dBATCH',
  '-dNOPAUSE',
  '-dQUIET',
  '-sDEVICE=pdfwrite',
  '-dCompatibilityLevel=1.6',
  '-dPDFSETTINGS=/printer',
  '-dDownsampleColorImages=true',
  '-dColorImageDownsampleType=/Bicubic',
  '-dColorImageResolution=200',
  '-dColorImageDownsampleThreshold=1.2',
  '-dDownsampleGrayImages=true',
  '-dGrayImageDownsampleType=/Bicubic',
  '-dGrayImageResolution=200',
  '-dGrayImageDownsampleThreshold=1.2',
  '-dDownsampleMonoImages=true',
  '-dMonoImageResolution=400',
  '-dDetectDuplicateImages=true',
  '-dCompressFonts=true',
  '-dSubsetFonts=true',
];

/**
 * A book's PDF made smaller for reading on a phone, or null when nothing on
 * this machine can do it.
 *
 * Ghostscript, then qpdf — each only if installed, so a server with one of
 * them still gets what that one does, and a developer's laptop with neither
 * simply keeps the original. qpdf on its own is lossless: it repacks the file
 * without touching a single page.
 */
export async function compressPdf(inputPath: string): Promise<Buffer | null> {
  const [ghostscript, qpdf] = await Promise.all([has('gs'), has('qpdf')]);
  if (!ghostscript && !qpdf) return null;

  const dir = await mkdtemp(join(tmpdir(), 'poetree-book-'));
  try {
    let current = inputPath;

    if (ghostscript) {
      const out = join(dir, 'pictures.pdf');
      await run('gs', [...GHOSTSCRIPT_ARGS, `-sOutputFile=${out}`, current], {
        timeout: PDF_TIMEOUT_MS,
      });
      current = out;
    }

    if (qpdf) {
      const out = join(dir, 'packed.pdf');
      try {
        await run(
          'qpdf',
          [
            '--object-streams=generate',
            '--compress-streams=y',
            '--recompress-flate',
            '--compression-level=9',
            current,
            out,
          ],
          { timeout: PDF_TIMEOUT_MS },
        );
      } catch (error) {
        // Exit 3 is qpdf finishing with warnings: the file it wrote is whole.
        const code = (error as { code?: unknown }).code;
        if (code !== 3 || !(await stat(out).catch(() => null))) throw error;
      }
      current = out;
    }

    return await readFile(current);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * One heavy job at a time. Ghostscript on a large book takes a processor for a
 * minute or more, on a server other sites share; two at once would only make
 * both slower.
 */
let queue: Promise<void> = Promise.resolve();

/** Settles once everything handed to [inBackground] so far has finished. */
export function backgroundSettled(): Promise<void> {
  return queue;
}

export function inBackground(job: () => Promise<unknown>): void {
  queue = queue.then(job).then(
    () => undefined,
    (error: unknown) => {
      logger.error('A background compression failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    },
  );
}
