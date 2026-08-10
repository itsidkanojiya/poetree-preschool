import { createHash, randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { env } from '../config/env.js';

/**
 * File storage behind a narrow interface.
 *
 * Local disk today because the VPS has the room and no CDN is needed yet, but
 * every call site speaks this interface — so moving to S3 or R2 later is one new
 * implementation and no changes anywhere else.
 */
export interface StoredFile {
  key: string;
  sizeBytes: number;
  checksum: string;
}

export interface StorageProvider {
  put(input: { schoolId: string | null; originalName: string; bytes: Buffer }): Promise<StoredFile>;
  /** Absolute path or URL the web server can serve the bytes from. */
  locate(key: string): string;
  remove(key: string): Promise<void>;
}

/**
 * Files live outside the repository, so a deploy `rsync --delete` can never
 * remove a school's photographs.
 */
const ROOT = env.FILE_STORAGE_ROOT;

class LocalDiskStorage implements StorageProvider {
  async put(input: {
    schoolId: string | null;
    originalName: string;
    bytes: Buffer;
  }): Promise<StoredFile> {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');

    // The stored name is a generated UUID. The original never reaches the
    // filesystem, so a name like "../../etc/passwd" cannot escape the root, and
    // two children called Aarav cannot collide.
    const extension = safeExtension(input.originalName);
    const key = join(input.schoolId ?? '_publication', String(year), month, `${randomUUID()}${extension}`);

    const absolute = join(ROOT, key);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, input.bytes, { mode: 0o640 });

    return {
      key: key.split('\\').join('/'),
      sizeBytes: input.bytes.byteLength,
      checksum: createHash('sha256').update(input.bytes).digest('hex'),
    };
  }

  locate(key: string): string {
    return join(ROOT, key);
  }

  async remove(key: string): Promise<void> {
    await unlink(join(ROOT, key)).catch(() => undefined);
  }
}

/** Only ever the extension, lowercased, and only from a known-safe set. */
function safeExtension(originalName: string): string {
  const ext = extname(originalName).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
}

export const storage: StorageProvider = new LocalDiskStorage();

/* -------------------------------------------------------------------------- */
/* Content validation                                                         */
/* -------------------------------------------------------------------------- */

export interface AllowedType {
  mime: string;
  extensions: string[];
  maxBytes: number;
}

const MB = 1024 * 1024;

/**
 * What a school may upload.
 *
 * Deliberately short. Every additional type is another parser exposed to
 * whatever a browser does with it, and a preschool needs photographs, documents
 * and the occasional short video — nothing else.
 */
export const ALLOWED_TYPES: AllowedType[] = [
  { mime: 'image/jpeg', extensions: ['.jpg', '.jpeg'], maxBytes: 8 * MB },
  { mime: 'image/png', extensions: ['.png'], maxBytes: 8 * MB },
  { mime: 'image/webp', extensions: ['.webp'], maxBytes: 8 * MB },
  { mime: 'application/pdf', extensions: ['.pdf'], maxBytes: 15 * MB },
  { mime: 'video/mp4', extensions: ['.mp4'], maxBytes: 50 * MB },
];

export const MAX_UPLOAD_BYTES = Math.max(...ALLOWED_TYPES.map((t) => t.maxBytes));

/**
 * Identifies a file by its leading bytes, not its name.
 *
 * A browser's Content-Type header is supplied by the client and a `.jpg`
 * extension is just a string; neither says anything about what the file
 * actually is. The magic number does.
 */
export function sniffMime(bytes: Buffer): string | null {
  if (bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }

  if (bytes.subarray(0, 4).toString('ascii') === '%PDF') return 'application/pdf';

  if (
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  // ISO base media (mp4) carries "ftyp" at offset 4.
  if (bytes.subarray(4, 8).toString('ascii') === 'ftyp') return 'video/mp4';

  return null;
}

export function typeFor(mime: string): AllowedType | undefined {
  return ALLOWED_TYPES.find((t) => t.mime === mime);
}
