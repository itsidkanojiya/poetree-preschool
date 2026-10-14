import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type {
  ConnectGalleryDriveInput,
  GalleryDriveMoveResult,
  GalleryDriveStatus,
  GoogleDriveSettings,
  MoveGalleryToDriveInput,
  SaveGoogleDriveSettingsInput,
} from '@poetree/shared';
import { env } from '../config/env.js';
import { prisma, prismaUnscoped } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import {
  DRIVE_SCOPE,
  DriveError,
  GoogleDriveClient,
  type DriveClient,
} from '../lib/googleDrive.js';
import { logger } from '../lib/logger.js';
import { storage } from '../lib/storage.js';
import { writeAuditLog } from './audit.service.js';

/**
 * A school's own Google Drive, as the place its gallery photos are kept.
 *
 * The school's administrator connects it once from the portal. From then on
 * every photo the office adds goes into a folder in that Drive, and the space
 * it takes is the school's — a full Drive is theirs to clear or upgrade, and
 * this server keeps no copy.
 *
 * Families never see Drive. A parent's phone asks this API for a photo
 * exactly as before; the API decides whether they may have it, by the same
 * rules as before, and only then fetches it from the school's Drive with the
 * school's token. Nothing is ever shared by link, so no photo of a child is
 * reachable by anybody holding a URL.
 *
 * Connections are looked up by an explicit school id, always one that has
 * already been settled — the caller's own school, or the school of a file the
 * caller was just allowed to read.
 *
 * All of it goes through one Google sign-in, Poetree's own, which the Super
 * Admin sets up once. It tells Google "this is Poetree"; which school's Drive
 * is in play is settled by which Google account said yes.
 */

interface DriveSetup {
  client: DriveClient;
}

/**
 * Seals the secrets Google gives Poetree and signs the sign-in round trip.
 *
 * Never kept in the database next to what it seals: DRIVE_TOKEN_KEY when the
 * server has one, otherwise derived from JWT_REFRESH_SECRET — either way a
 * secret that only this server holds, so a copy of the database alone opens
 * nothing.
 */
let key: Buffer | undefined;

function sealKey(): Buffer {
  key ??= env.DRIVE_TOKEN_KEY
    ? Buffer.from(env.DRIVE_TOKEN_KEY, 'base64')
    : Buffer.from(hkdfSync('sha256', env.JWT_REFRESH_SECRET, 'poetree', 'google-drive-seal', 32));
  return key;
}

/**
 * Poetree's Google sign-in as the Super Admin last saved it. Read again every
 * half minute rather than on every photo; saving it clears this at once.
 */
const SETUP_TTL_MS = 30_000;
let saved: { setup: DriveSetup | null; at: number } | undefined;
let override: DriveSetup | null | undefined;

async function setup(): Promise<DriveSetup | null> {
  if (override !== undefined) return override;
  if (saved && Date.now() - saved.at < SETUP_TTL_MS) return saved.setup;

  const publication = await prismaUnscoped.publication.findFirst({
    select: { googleClientId: true, googleClientSecretSealed: true, googleRedirectUri: true },
  });

  let found: DriveSetup | null = null;
  if (
    publication?.googleClientId &&
    publication.googleClientSecretSealed &&
    publication.googleRedirectUri
  ) {
    try {
      found = {
        client: new GoogleDriveClient({
          clientId: publication.googleClientId,
          clientSecret: unseal(sealKey(), publication.googleClientSecretSealed),
          redirectUri: publication.googleRedirectUri,
        }),
      };
    } catch {
      // Sealed with a key this server no longer has. As good as not set up
      // until the Super Admin enters the secret again.
      logger.warn('Poetree’s Google client secret could not be unsealed; enter it again');
    }
  }

  saved = { setup: found, at: Date.now() };
  return found;
}

/** Tests only: a stand-in for Google, or null for a platform without it. */
export function useDriveForTests(client: DriveClient | null): void {
  override = client ? { client } : null;
  tokens.clear();
  forget();
}

/** Tests only: back to whatever the Super Admin saved. */
export function restoreDriveForTests(): void {
  override = undefined;
  saved = undefined;
  tokens.clear();
  forget();
}

/** Poetree's Google sign-in is set up, so schools can connect their Drives. */
export async function driveAvailable(): Promise<boolean> {
  return (await setup()) !== null;
}

async function requireSetup(): Promise<DriveSetup> {
  const found = await setup();
  if (!found) {
    throw ApiError.conflict(
      'Google Drive is not set up on this platform yet. The Super Admin sets it up once, under Google Drive.',
    );
  }
  return found;
}

/* -------------------------------------------------------------------------- */
/* Sealing and signing                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A refresh token is a standing key to a school's Drive, so the database holds
 * it sealed (AES-256-GCM): a copy of the database alone opens nothing.
 */
function seal(key: Buffer, text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`;
}

function unseal(key: Buffer, sealed: string): string {
  const raw = Buffer.from(sealed.replace(/^v1\./, ''), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

/** How long the office has to finish on Google's page. */
const STATE_TTL_MS = 15 * 60 * 1000;

/**
 * The `state` that goes to Google and comes back: which school and which
 * administrator started this, signed. Without it, anyone could send an
 * administrator a link that connects the school to the sender's own Drive.
 */
function signState(key: Buffer, schoolId: string, userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      s: schoolId,
      u: userId,
      e: Date.now() + STATE_TTL_MS,
      n: randomBytes(8).toString('hex'),
    }),
  ).toString('base64url');
  return `${payload}.${mac(key, payload).toString('base64url')}`;
}

function stateMatches(key: Buffer, state: string, schoolId: string, userId: string): boolean {
  const [payload, signature] = state.split('.');
  if (!payload || !signature) return false;

  const expected = mac(key, payload);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      s?: string;
      u?: string;
      e?: number;
    };
    return claims.s === schoolId && claims.u === userId && (claims.e ?? 0) > Date.now();
  } catch {
    return false;
  }
}

function mac(key: Buffer, payload: string): Buffer {
  return createHmac('sha256', key).update(`drive-state.${payload}`).digest();
}

/* -------------------------------------------------------------------------- */
/* Connections and tokens                                                     */
/* -------------------------------------------------------------------------- */

interface Connection {
  id: string;
  schoolId: string;
  googleEmail: string;
  refreshTokenSealed: string;
  folderId: string;
  thumbFolderId: string;
  brokenAt: Date | null;
  updatedAt: Date;
}

function connectionFor(schoolId: string): Promise<Connection | null> {
  return prismaUnscoped.schoolDriveConnection.findUnique({ where: { schoolId } });
}

/**
 * Access tokens last an hour; asking Google for one per photo would be a
 * round trip per thumbnail and a quota spent for nothing.
 */
const tokens = new Map<string, { token: string; expiresAt: number; version: string }>();

const versionOf = (connection: Connection) => `${connection.id}:${connection.updatedAt.getTime()}`;

async function accessToken(connection: Connection): Promise<string> {
  const { client } = await requireSetup();
  const cached = tokens.get(connection.schoolId);
  if (
    cached &&
    cached.version === versionOf(connection) &&
    cached.expiresAt > Date.now() + 60_000
  ) {
    return cached.token;
  }

  try {
    const fresh = await client.accessToken(unseal(sealKey(), connection.refreshTokenSealed));
    tokens.set(connection.schoolId, {
      token: fresh.token,
      expiresAt: Date.now() + fresh.expiresInSeconds * 1000,
      version: versionOf(connection),
    });
    return fresh.token;
  } catch (error) {
    if (error instanceof DriveError && error.kind === 'auth') await markBroken(connection);
    throw asApiError(error);
  }
}

/**
 * Google refused the school's token for good. Remembered, so the office sees
 * why on the gallery page, and so every photo does not ask Google again.
 */
async function markBroken(connection: Connection): Promise<void> {
  tokens.delete(connection.schoolId);
  if (connection.brokenAt) return;
  await prismaUnscoped.schoolDriveConnection
    .update({ where: { id: connection.id }, data: { brokenAt: new Date() } })
    .catch(() => undefined);
  logger.warn('A school’s Google Drive access was removed', { schoolId: connection.schoolId });
}

function asApiError(error: unknown): unknown {
  if (!(error instanceof DriveError)) return error;
  return error.kind === 'missing'
    ? ApiError.notFound(error.message)
    : ApiError.conflict(error.message, { drive: error.kind });
}

/**
 * Runs `work` against the school's Drive with a current token. An access
 * token Google turns down mid-hour is dropped and the work tried once more
 * with a new one; only a refused refresh token means access is really gone.
 */
async function withDrive<T>(
  schoolId: string,
  work: (client: DriveClient, token: string, connection: Connection) => Promise<T>,
): Promise<T> {
  const { client } = await requireSetup();
  const connection = await connectionFor(schoolId);
  if (!connection) {
    throw ApiError.conflict(
      'Connect the school’s Google Drive first, on the Gallery page — gallery photos are kept there.',
      { drive: 'not_connected' },
    );
  }
  if (connection.brokenAt) {
    throw ApiError.conflict(
      'Google Drive access was removed. Connect the school’s Google Drive again on the Gallery page.',
      { drive: 'auth' },
    );
  }

  try {
    return await work(client, await accessToken(connection), connection);
  } catch (error) {
    if (!(error instanceof DriveError && error.kind === 'auth')) throw asApiError(error);
    tokens.delete(schoolId);
    try {
      return await work(client, await accessToken(connection), connection);
    } catch (again) {
      throw asApiError(again);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* The office: connect, disconnect, see                                       */
/* -------------------------------------------------------------------------- */

const folderUrl = (folderId: string) => `https://drive.google.com/drive/folders/${folderId}`;

/** Gallery photos kept on this server rather than in a Drive. */
const onServer = {
  provider: 'LOCAL',
  deletedAt: null,
  galleryPhotos: { some: {} },
} as const;

export async function driveStatus(): Promise<GalleryDriveStatus> {
  const schoolId = requireSchoolId();
  const available = await driveAvailable();
  const connection = available ? await connectionFor(schoolId) : null;

  return {
    available,
    connected: connection !== null,
    email: connection?.googleEmail ?? null,
    broken: Boolean(connection?.brokenAt),
    folderUrl: connection ? folderUrl(connection.folderId) : null,
    onServer: await prisma.fileObject.count({ where: onServer }),
  };
}

/** Google's page, for the administrator to say yes on. */
export async function driveConnectUrl(userId: string): Promise<{ url: string }> {
  const { client } = await requireSetup();
  return { url: client.authUrl(signState(sealKey(), requireSchoolId(), userId)) };
}

/**
 * The administrator is back from Google with a code. Swaps it for lasting
 * access, makes the gallery's folders, and keeps the token sealed.
 */
export async function completeDriveConnect(
  input: ConnectGalleryDriveInput,
  userId: string,
): Promise<GalleryDriveStatus> {
  const schoolId = requireSchoolId();
  const { client } = await requireSetup();

  if (!stateMatches(sealKey(), input.state, schoolId, userId)) {
    throw ApiError.badRequest(
      'That Google sign-in has expired or was not started here. Connect again from the Gallery page.',
    );
  }

  let grant;
  let token;
  try {
    grant = await client.exchangeCode(input.code);
    if (!grant.scopes.includes(DRIVE_SCOPE)) {
      // Google lets the person untick Drive on its consent screen. Without it
      // this connection could not store a single photo.
      await client.revoke(grant.refreshToken).catch(() => undefined);
      throw ApiError.badRequest(
        'Google Drive was not allowed. Connect again, and leave the Google Drive box ticked.',
      );
    }
    token = (await client.accessToken(grant.refreshToken)).token;
  } catch (error) {
    throw asApiError(error);
  }

  const existing = await connectionFor(schoolId);

  // The same Google account again keeps its folders, so the photos already
  // in them stay where they are. Another account starts its own.
  let folderId: string;
  let thumbFolderId: string;
  try {
    const keep =
      existing !== null &&
      existing.googleEmail === grant.email &&
      (await client.folderUsable(token, existing.folderId)) &&
      (await client.folderUsable(token, existing.thumbFolderId));

    if (keep) {
      folderId = existing.folderId;
      thumbFolderId = existing.thumbFolderId;
    } else {
      const school = await prismaUnscoped.school.findUnique({
        where: { id: schoolId },
        select: { name: true },
      });
      folderId = await client.createFolder(token, `${school?.name ?? 'School'} — Poetree Gallery`);
      thumbFolderId = await client.createFolder(token, 'Small copies for the app', folderId);
    }
  } catch (error) {
    throw asApiError(error);
  }

  const data = {
    googleEmail: grant.email.slice(0, 254),
    refreshTokenSealed: seal(sealKey(), grant.refreshToken),
    folderId,
    thumbFolderId,
    brokenAt: null,
  };
  await prismaUnscoped.schoolDriveConnection.upsert({
    where: { schoolId },
    create: { schoolId, ...data },
    update: data,
  });
  tokens.delete(schoolId);

  // A different account replaces the old one; its access is handed back.
  // Not for the same account — revoking would take the new grant with it.
  if (existing && existing.googleEmail !== grant.email) {
    await client.revoke(unseal(sealKey(), existing.refreshTokenSealed)).catch(() => undefined);
  }

  await writeAuditLog({
    action: 'GALLERY_DRIVE_CONNECTED',
    entity: 'School',
    entityId: schoolId,
    schoolId,
    actorUserId: userId,
    metadata: { googleEmail: grant.email },
  });

  return driveStatus();
}

/**
 * Lets go of the school's Drive. The photos stay in it — they are the
 * school's — but the app cannot show them until the same account connects
 * again.
 */
export async function disconnectDrive(userId: string): Promise<void> {
  const schoolId = requireSchoolId();
  const existing = await connectionFor(schoolId);
  if (!existing) return;

  await prismaUnscoped.schoolDriveConnection.delete({ where: { id: existing.id } });
  tokens.delete(schoolId);

  const found = await setup();
  if (found) {
    await found.client
      .revoke(unseal(sealKey(), existing.refreshTokenSealed))
      .catch(() => undefined);
  }

  await writeAuditLog({
    action: 'GALLERY_DRIVE_DISCONNECTED',
    entity: 'School',
    entityId: schoolId,
    schoolId,
    actorUserId: userId,
    metadata: { googleEmail: existing.googleEmail },
  });
}

/* -------------------------------------------------------------------------- */
/* Photos in and out                                                          */
/* -------------------------------------------------------------------------- */

/** "Sports Day — IMG_1024.jpg", so the school can find things in its Drive. */
export function driveFileName(eventName: string | undefined, originalName: string): string {
  return (eventName ? `${eventName} — ${originalName}` : originalName).slice(0, 200);
}

/**
 * Puts a photo, and the small copy for grids, in the school's Drive.
 *
 * Null when this platform has no Google sign-in: the photo is then kept on
 * this server, as before. When it does, a school that has not connected a
 * Drive is told to — keeping photos off this server is the point.
 */
export async function putInSchoolDrive(
  schoolId: string,
  input: { name: string; mimeType: string; bytes: Buffer; thumb: Buffer | null },
): Promise<{ id: string; thumbId: string | null; sha256: string | null } | null> {
  if (!(await driveAvailable())) return null;

  return withDrive(schoolId, async (client, token, connection) => {
    const photo = await client.upload(token, {
      folderId: connection.folderId,
      name: input.name,
      mimeType: input.mimeType,
      bytes: input.bytes,
    });
    try {
      const thumb = input.thumb
        ? await client.upload(token, {
            folderId: connection.thumbFolderId,
            name: input.name,
            mimeType: 'image/jpeg',
            bytes: input.thumb,
          })
        : null;
      return { id: photo.id, thumbId: thumb?.id ?? null, sha256: photo.sha256 };
    } catch (error) {
      await client.trash(token, photo.id).catch(() => undefined);
      throw error;
    }
  });
}

/**
 * The bytes most recently fetched from Drive, so a class opening the same
 * event at going-home time is one trip to Google per photo, not thirty.
 * Bounded; a thumbnail is a few tens of kilobytes.
 */
const CACHE_LIMIT_BYTES = 48 * 1024 * 1024;
const cache = new Map<string, Buffer>();
let cachedBytes = 0;

function recall(driveId: string): Buffer | undefined {
  const bytes = cache.get(driveId);
  if (bytes) {
    cache.delete(driveId);
    cache.set(driveId, bytes);
  }
  return bytes;
}

function remember(driveId: string, bytes: Buffer): void {
  if (bytes.length > 2 * 1024 * 1024 || cache.has(driveId)) return;
  cache.set(driveId, bytes);
  cachedBytes += bytes.length;
  for (const [id, old] of cache) {
    if (cachedBytes <= CACHE_LIMIT_BYTES) break;
    cache.delete(id);
    cachedBytes -= old.length;
  }
}

function forget(driveId?: string): void {
  if (driveId === undefined) {
    cache.clear();
    cachedBytes = 0;
    return;
  }
  const bytes = cache.get(driveId);
  if (bytes) {
    cache.delete(driveId);
    cachedBytes -= bytes.length;
  }
}

/**
 * A file's bytes from its school's Drive. Only ever called once the caller
 * has been allowed the file; `schoolId` is the file's own.
 */
export async function readFromSchoolDrive(schoolId: string, driveId: string): Promise<Buffer> {
  const cached = recall(driveId);
  if (cached) return cached;

  if (!(await driveAvailable())) throw ApiError.notFound('File not found');
  const bytes = await withDrive(schoolId, (client, token) => client.download(token, driveId));
  remember(driveId, bytes);
  return bytes;
}

/**
 * To the bin in the school's Drive, where they can still get it back for 30
 * days. Best effort: a photo gone from the gallery is gone from the app
 * whether or not Google answered.
 */
export async function trashInSchoolDrive(schoolId: string, driveIds: string[]): Promise<void> {
  if (driveIds.length === 0 || !(await driveAvailable())) return;
  for (const id of driveIds) forget(id);
  try {
    await withDrive(schoolId, async (client, token) => {
      for (const id of driveIds) await client.trash(token, id);
    });
  } catch (error) {
    logger.warn('Could not move removed photos to the school’s Drive bin', {
      schoolId,
      count: driveIds.length,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Moving what is already here                                                */
/* -------------------------------------------------------------------------- */

/** Small enough that one step answers well inside a request's time. */
const MOVE_BATCH = 10;

/**
 * Moves the next few gallery photos from this server into the school's Drive.
 * The portal calls it again, from where this one stopped, until every photo
 * has been tried — a photo that cannot move is passed over, not retried
 * forever at the front of the queue.
 *
 * Each photo keeps its id, so every event, every link and every app already
 * holding it go on working; only where the bytes are changes. The copy in
 * Drive is checked against the checksum taken at upload before this server's
 * copy is deleted.
 */
export async function moveGalleryToDrive(
  input: MoveGalleryToDriveInput,
): Promise<GalleryDriveMoveResult> {
  const schoolId = requireSchoolId();
  await requireSetup();
  if (!(await connectionFor(schoolId))) {
    throw ApiError.conflict('Connect the school’s Google Drive first.');
  }

  const files = await prisma.fileObject.findMany({
    where: { ...onServer, ...(input.after ? { id: { gt: input.after } } : {}) },
    orderBy: { id: 'asc' },
    take: MOVE_BATCH,
    select: {
      id: true,
      storageKey: true,
      thumbKey: true,
      originalName: true,
      mimeType: true,
      checksum: true,
      galleryPhotos: { take: 1, select: { event: { select: { name: true } } } },
    },
  });

  let moved = 0;
  let failed = 0;

  for (const file of files) {
    let bytes: Buffer;
    try {
      bytes = await readFile(storage.locate(file.storageKey));
    } catch {
      failed += 1;
      logger.warn('A gallery photo’s bytes are missing from this server', { fileId: file.id });
      continue;
    }
    const thumb = file.thumbKey
      ? await readFile(storage.locate(file.thumbKey)).catch(() => null)
      : null;

    // A full Drive or a removed connection fails every photo after this one
    // the same way, so it stops the batch and goes to the office as it is.
    const put = await putInSchoolDrive(schoolId, {
      name: driveFileName(file.galleryPhotos[0]?.event.name, file.originalName),
      mimeType: file.mimeType,
      bytes,
      thumb,
    });
    if (!put) throw ApiError.conflict('Google Drive is not set up on this platform');

    const strays = [put.id, ...(put.thumbId ? [put.thumbId] : [])];

    if (file.checksum && put.sha256 && put.sha256 !== file.checksum) {
      await trashInSchoolDrive(schoolId, strays);
      failed += 1;
      logger.warn('A photo arrived in Drive different from the one sent', { fileId: file.id });
      continue;
    }

    // Only if nobody moved it in the meantime — two tabs, two clicks.
    const switched = await prismaUnscoped.fileObject.updateMany({
      where: { id: file.id, schoolId, provider: 'LOCAL' },
      data: { provider: 'GOOGLE_DRIVE', storageKey: put.id, thumbKey: put.thumbId },
    });
    if (switched.count === 0) {
      await trashInSchoolDrive(schoolId, strays);
      continue;
    }

    await storage.remove(file.storageKey);
    if (file.thumbKey) await storage.remove(file.thumbKey);
    moved += 1;
  }

  return {
    moved,
    failed,
    remaining: await prisma.fileObject.count({ where: onServer }),
    next: files.length === MOVE_BATCH ? files[files.length - 1]!.id : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Poetree's Google sign-in: the Super Admin                                  */
/* -------------------------------------------------------------------------- */

async function publicationRow() {
  const publication = await prismaUnscoped.publication.findFirst({
    select: {
      id: true,
      googleClientId: true,
      googleClientSecretSealed: true,
      googleRedirectUri: true,
    },
  });
  if (!publication) {
    throw ApiError.internal('No publication has been configured. Run the database seed.');
  }
  return publication;
}

/**
 * Poetree's Google sign-in, and every school's own Drive connected through it.
 * The secret is never sent back — only whether one is saved.
 */
export async function googleDriveSettings(): Promise<GoogleDriveSettings> {
  const publication = await publicationRow();
  const [connections, inDrive, photosOnServer] = await Promise.all([
    prismaUnscoped.schoolDriveConnection.findMany({
      orderBy: { connectedAt: 'desc' },
      select: {
        schoolId: true,
        googleEmail: true,
        brokenAt: true,
        connectedAt: true,
        school: { select: { name: true } },
      },
    }),
    prismaUnscoped.fileObject.groupBy({
      by: ['schoolId'],
      where: { provider: 'GOOGLE_DRIVE', deletedAt: null, galleryPhotos: { some: {} } },
      _count: { _all: true },
    }),
    prismaUnscoped.fileObject.count({ where: onServer }),
  ]);
  const photos = new Map(inDrive.map((row) => [row.schoolId, row._count._all]));

  return {
    configured: Boolean(
      publication.googleClientId &&
      publication.googleClientSecretSealed &&
      publication.googleRedirectUri,
    ),
    clientId: publication.googleClientId,
    clientSecretSet: publication.googleClientSecretSealed !== null,
    redirectUri: publication.googleRedirectUri,
    schools: connections.map((connection) => ({
      schoolId: connection.schoolId,
      schoolName: connection.school.name,
      googleEmail: connection.googleEmail,
      broken: connection.brokenAt !== null,
      connectedAt: connection.connectedAt.toISOString(),
      photos: photos.get(connection.schoolId) ?? 0,
    })),
    photosOnServer,
  };
}

/**
 * Saves Poetree's Google sign-in. A blank secret keeps the saved one, so the
 * Super Admin can correct the address without digging the secret out again.
 *
 * A school's Drive access belongs to the Google client it was given to. A
 * different client id means every school has to connect again, and they are
 * told so on their Gallery page rather than finding photos missing.
 */
export async function saveGoogleDriveSettings(
  input: SaveGoogleDriveSettingsInput,
  actorUserId: string,
): Promise<GoogleDriveSettings> {
  const publication = await publicationRow();
  const secret = input.clientSecret?.trim() || null;
  if (!secret && !publication.googleClientSecretSealed) {
    throw ApiError.badRequest('Enter the client secret from the same Google OAuth client');
  }

  await prismaUnscoped.publication.update({
    where: { id: publication.id },
    data: {
      googleClientId: input.clientId,
      googleRedirectUri: input.redirectUri,
      ...(secret ? { googleClientSecretSealed: seal(sealKey(), secret) } : {}),
    },
  });

  const clientChanged =
    publication.googleClientId !== null && publication.googleClientId !== input.clientId;
  if (clientChanged) {
    await prismaUnscoped.schoolDriveConnection.updateMany({
      where: { brokenAt: null },
      data: { brokenAt: new Date() },
    });
  }

  saved = undefined;
  tokens.clear();

  await writeAuditLog({
    action: 'GOOGLE_DRIVE_SETTINGS_CHANGED',
    entity: 'Publication',
    entityId: publication.id,
    schoolId: null,
    actorUserId,
    before: { clientId: publication.googleClientId, redirectUri: publication.googleRedirectUri },
    after: {
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      secretChanged: secret !== null,
    },
  });

  return googleDriveSettings();
}

/**
 * Switches Poetree's Google sign-in off. New gallery photos stay on this
 * server again; photos already in schools' Drives do not load until it is
 * switched back on with the same client.
 */
export async function clearGoogleDriveSettings(actorUserId: string): Promise<GoogleDriveSettings> {
  const publication = await publicationRow();
  await prismaUnscoped.publication.update({
    where: { id: publication.id },
    data: { googleClientId: null, googleClientSecretSealed: null, googleRedirectUri: null },
  });
  saved = undefined;
  tokens.clear();
  forget();

  await writeAuditLog({
    action: 'GOOGLE_DRIVE_SETTINGS_CHANGED',
    entity: 'Publication',
    entityId: publication.id,
    schoolId: null,
    actorUserId,
    before: { clientId: publication.googleClientId, redirectUri: publication.googleRedirectUri },
    after: { clientId: null, redirectUri: null },
  });

  return googleDriveSettings();
}
