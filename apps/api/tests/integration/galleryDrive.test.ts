import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isDatabaseReachable,
  resetDatabase,
  seedBaseline,
  seedSchool,
  type Baseline,
  type TestSchool,
} from '../helpers/db.js';
import { api, auth, BASE, login, type Session } from '../helpers/api.js';
import { disconnectPrisma, prismaUnscoped } from '../../src/db/prisma.js';
import { DRIVE_SCOPE, DriveError, type DriveClient } from '../../src/lib/googleDrive.js';
import { storage } from '../../src/lib/storage.js';
import { restoreDriveForTests, useDriveForTests } from '../../src/services/drive.service.js';

const dbUp = await isDatabaseReachable();

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

/**
 * Google, as far as these tests need it: folders and files in memory, a
 * consent that can leave Drive unticked, a Drive that can fill up, and access
 * that can be taken back.
 */
class FakeDrive implements DriveClient {
  readonly folders = new Set<string>();
  readonly files = new Map<
    string,
    { folderId: string; name: string; bytes: Buffer; trashed: boolean }
  >();
  readonly revoked: string[] = [];
  full = false;
  accessRemoved = false;
  private next = 0;

  authUrl(state: string): string {
    return `https://accounts.google.test/auth?state=${encodeURIComponent(state)}`;
  }

  async exchangeCode(code: string) {
    return {
      refreshToken: `refresh-${code}`,
      email: 'office@alpha.test',
      scopes: code === 'no-drive' ? ['openid', 'email'] : ['openid', 'email', DRIVE_SCOPE],
    };
  }

  async accessToken(refreshToken: string) {
    if (this.accessRemoved) throw new DriveError('Google Drive access was removed.', 'auth');
    return { token: `access-${refreshToken}`, expiresInSeconds: 3600 };
  }

  async revoke(refreshToken: string) {
    this.revoked.push(refreshToken);
  }

  async createFolder() {
    const id = `folder${++this.next}`;
    this.folders.add(id);
    return id;
  }

  async folderUsable(_token: string, folderId: string) {
    return this.folders.has(folderId);
  }

  async upload(
    _token: string,
    input: { folderId: string; name: string; mimeType: string; bytes: Buffer },
  ) {
    if (this.full) {
      throw new DriveError('The school’s Google Drive is full. Free up space in it.', 'full');
    }
    const id = `drivefile${++this.next}`;
    this.files.set(id, {
      folderId: input.folderId,
      name: input.name,
      bytes: input.bytes,
      trashed: false,
    });
    return { id, sha256: createHash('sha256').update(input.bytes).digest('hex') };
  }

  async download(_token: string, fileId: string) {
    if (this.accessRemoved) throw new DriveError('Google Drive access was removed.', 'auth');
    const file = this.files.get(fileId);
    if (!file)
      throw new DriveError('That file is not in the school’s Google Drive any more.', 'missing');
    return file.bytes;
  }

  async trash(_token: string, fileId: string) {
    const file = this.files.get(fileId);
    if (file) file.trashed = true;
  }
}

/**
 * The gallery kept in each school's own Google Drive, and its videos on the
 * school's own YouTube channel.
 *
 * What matters is the same as ever — who does NOT see a photo — plus what
 * Drive adds: a school connected only by its own administrator, a token never
 * stored as it came, and the photos already here moved without a link
 * breaking.
 */
describe.skipIf(!dbUp)('gallery in the school’s own Google Drive', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let neighbour: TestSchool;
  let admin: Session;
  let neighbourAdmin: Session;
  let parent: Session;
  let otherClassroomId: string;
  let beforeDrive: { id: string; url: string; thumbUrl: string };

  const drive = new FakeDrive();

  const createEvent = async (session: Session, body: Record<string, unknown>) => {
    const response = await api.post(`${BASE}/gallery/events`).set(auth(session)).send(body);
    expect(response.status).toBe(201);
    return response.body.id as string;
  };

  const uploadPhoto = (session: Session, eventId: string, name: string, thumb = true) => {
    const request = api
      .post(`${BASE}/gallery/events/${eventId}/photos/upload`)
      .set(auth(session))
      .attach('photo', TINY_PNG, { filename: name, contentType: 'image/png' });
    return thumb
      ? request.attach('thumb', TINY_JPEG, { filename: 'small.jpg', contentType: 'image/jpeg' })
      : request;
  };

  const startConnect = async (session: Session) => {
    const started = await api.post(`${BASE}/gallery/drive/connect`).set(auth(session));
    expect(started.status).toBe(200);
    return new URL(started.body.url as string).searchParams.get('state')!;
  };

  const connect = async (session: Session, code = 'yes') =>
    api
      .post(`${BASE}/gallery/drive/callback`)
      .set(auth(session))
      .send({ code, state: await startConnect(session) });

  const status = async (session: Session) =>
    (await api.get(`${BASE}/gallery/drive`).set(auth(session))).body;

  const fileRow = (originalName: string) =>
    prismaUnscoped.fileObject.findFirstOrThrow({
      where: { originalName },
      orderBy: { createdAt: 'desc' },
    });

  const asApiPath = (url: string) => url.replace('/api/v1', BASE);

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    neighbour = await seedSchool(baseline, 'beta', 'Beta Preschool');
    admin = await login(school.adminEmail);
    neighbourAdmin = await login(neighbour.adminEmail);
    parent = await login(school.parentPhone);

    const juniorKg = await prismaUnscoped.classLevel.findUniqueOrThrow({
      where: { code: 'JUNIOR_KG' },
      select: { id: true },
    });
    const other = await prismaUnscoped.classroom.create({
      data: {
        schoolId: school.id,
        academicYearId: school.academicYearId,
        classLevelId: juniorKg.id,
        section: 'B',
      },
    });
    otherClassroomId = other.id;

    useDriveForTests(null);
  });

  afterAll(async () => {
    restoreDriveForTests();
    await disconnectPrisma();
  });

  it('keeps photos on this server where Google sign-in is not set up', async () => {
    const eventId = await createEvent(admin, {
      name: 'Before Drive',
      classroomIds: [school.classroomId],
    });

    const uploaded = await uploadPhoto(admin, eventId, 'before.png');
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.thumbUrl).toBe(`${uploaded.body.url}?variant=thumb`);
    beforeDrive = uploaded.body;

    const row = await fileRow('before.png');
    expect(row.provider).toBe('LOCAL');
    expect(row.thumbKey).not.toBeNull();

    const small = await api.get(asApiPath(beforeDrive.thumbUrl)).set(auth(parent));
    expect(small.status).toBe(200);
    expect(small.headers['content-type']).toContain('image/jpeg');

    expect(await status(admin)).toMatchObject({ available: false, connected: false, onServer: 1 });
  });

  it('connects a Drive only through a sign-in this school’s office started', async () => {
    useDriveForTests(drive);
    expect(await status(admin)).toMatchObject({ available: true, connected: false });

    // Another school's round trip, finished here: the classic way to connect
    // somebody else's school to your own Drive.
    const theirs = await startConnect(neighbourAdmin);
    const crossed = await api
      .post(`${BASE}/gallery/drive/callback`)
      .set(auth(admin))
      .send({ code: 'yes', state: theirs });
    expect(crossed.status).toBe(400);

    const tampered = await api
      .post(`${BASE}/gallery/drive/callback`)
      .set(auth(admin))
      .send({ code: 'yes', state: `${await startConnect(admin)}x` });
    expect(tampered.status).toBe(400);

    const connected = await connect(admin);
    expect(connected.status).toBe(200);
    expect(connected.body).toMatchObject({
      connected: true,
      broken: false,
      email: 'office@alpha.test',
    });
    expect(drive.folders.size).toBe(2);

    // Stored sealed, never as Google handed it over.
    const row = await prismaUnscoped.schoolDriveConnection.findUniqueOrThrow({
      where: { schoolId: school.id },
    });
    expect(row.refreshTokenSealed).not.toContain('refresh-yes');

    // The neighbour is untouched by any of it.
    expect(await status(neighbourAdmin)).toMatchObject({ connected: false });
  });

  it('refuses a connection with Google Drive left unticked, and hands it back', async () => {
    const refused = await connect(neighbourAdmin, 'no-drive');
    expect(refused.status).toBe(400);
    expect(drive.revoked).toContain('refresh-no-drive');
    expect(await status(neighbourAdmin)).toMatchObject({ connected: false });
  });

  it('is set up once by the Super Admin, who sees every school’s own Drive', async () => {
    const superAdmin = await login(baseline.superAdminEmail);
    const settings = `${BASE}/publication/google-drive`;
    const clientId = '1234-abc.apps.googleusercontent.com';
    const redirectUri = 'https://school.poetree.test/school/gallery/drive/callback';

    // Not the school office's to change, nor to read.
    expect((await api.get(settings).set(auth(admin))).status).toBe(403);

    const notAClient = await api
      .put(settings)
      .set(auth(superAdmin))
      .send({ clientId: 'not-a-client', clientSecret: 'secret', redirectUri });
    expect(notAClient.status).toBe(400);

    const noSecret = await api.put(settings).set(auth(superAdmin)).send({ clientId, redirectUri });
    expect(noSecret.status).toBe(400);

    const saved = await api
      .put(settings)
      .set(auth(superAdmin))
      .send({ clientId, clientSecret: 'GOCSPX-top-secret', redirectUri });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      configured: true,
      clientId,
      clientSecretSet: true,
      redirectUri,
    });

    // The secret is never sent back, and never stored as it was typed.
    expect(JSON.stringify(saved.body)).not.toContain('GOCSPX-top-secret');
    const row = await prismaUnscoped.publication.findFirstOrThrow();
    expect(row.googleClientSecretSealed).not.toContain('GOCSPX-top-secret');

    // Each school's own Drive, with the Google account it connected; a school
    // that has not connected one is not listed.
    expect(saved.body.schools).toEqual([
      expect.objectContaining({
        schoolId: school.id,
        schoolName: 'Alpha Preschool',
        googleEmail: 'office@alpha.test',
        broken: false,
      }),
    ]);

    // A blank secret keeps the saved one.
    const kept = await api.put(settings).set(auth(superAdmin)).send({ clientId, redirectUri });
    expect(kept.status).toBe(200);
    expect(kept.body.clientSecretSet).toBe(true);

    // A different client: every school's access was given to the old one, so
    // each is told to connect again rather than finding photos missing.
    const moved = await api
      .put(settings)
      .set(auth(superAdmin))
      .send({ clientId: '5678-def.apps.googleusercontent.com', redirectUri });
    expect(moved.body.schools[0].broken).toBe(true);
    expect(await status(admin)).toMatchObject({ connected: true, broken: true });

    const again = await connect(admin);
    expect(again.body).toMatchObject({ connected: true, broken: false });
    expect(drive.folders.size).toBe(2);
  });

  it('asks a school without a Drive to connect one before adding photos', async () => {
    const eventId = await createEvent(neighbourAdmin, { name: 'Beta Day', visibleToAll: true });
    const refused = await uploadPhoto(neighbourAdmin, eventId, 'beta.png');
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toMatch(/Connect the school’s Google Drive/);
  });

  it('keeps a new photo in the school’s Drive, behind the same checks as ever', async () => {
    const eventId = await createEvent(admin, {
      name: 'Sports Day',
      classroomIds: [school.classroomId],
    });
    const uploaded = await uploadPhoto(admin, eventId, 'race.png');
    expect(uploaded.status).toBe(201);

    const connection = await prismaUnscoped.schoolDriveConnection.findUniqueOrThrow({
      where: { schoolId: school.id },
    });
    const row = await fileRow('race.png');
    expect(row.provider).toBe('GOOGLE_DRIVE');
    expect(drive.files.get(row.storageKey)).toMatchObject({
      folderId: connection.folderId,
      name: 'Sports Day — race.png',
    });
    expect(drive.files.get(row.thumbKey!)?.folderId).toBe(connection.thumbFolderId);

    // Nothing of it on this server.
    expect(existsSync(storage.locate(row.storageKey))).toBe(false);

    const photo = await api.get(asApiPath(uploaded.body.url)).set(auth(parent));
    expect(photo.status).toBe(200);
    expect(Buffer.compare(photo.body as Buffer, drive.files.get(row.storageKey)!.bytes)).toBe(0);

    const small = await api.get(asApiPath(uploaded.body.thumbUrl)).set(auth(parent));
    expect(small.status).toBe(200);
    expect(small.headers['content-type']).toContain('image/jpeg');
    expect(Buffer.compare(small.body as Buffer, drive.files.get(row.thumbKey!)!.bytes)).toBe(0);

    // Another class's photo, in the same Drive, is still not this family's.
    const picnic = await createEvent(admin, { name: 'Picnic', classroomIds: [otherClassroomId] });
    const theirs = await uploadPhoto(admin, picnic, 'picnic.png');
    expect((await api.get(asApiPath(theirs.body.url)).set(auth(parent))).status).toBe(404);

    // Nor another school's.
    const across = await api.get(asApiPath(uploaded.body.url)).set(auth(neighbourAdmin));
    expect(across.status).toBe(404);
  });

  it('tells the office in plain words when the school’s Drive is full', async () => {
    const eventId = await createEvent(admin, { name: 'Full Drive', visibleToAll: true });
    drive.full = true;
    try {
      const refused = await uploadPhoto(admin, eventId, 'full.png');
      expect(refused.status).toBe(409);
      expect(refused.body.error.message).toMatch(/full/);
    } finally {
      drive.full = false;
    }
  });

  it('puts a removed photo, and a deleted event’s, in the Drive’s bin', async () => {
    const eventId = await createEvent(admin, { name: 'Temporary', visibleToAll: true });
    const first = await uploadPhoto(admin, eventId, 'first.png');
    const second = await uploadPhoto(admin, eventId, 'second.png');
    expect(second.status).toBe(201);

    const removed = await api.delete(`${BASE}/gallery/photos/${first.body.id}`).set(auth(admin));
    expect(removed.status).toBe(204);

    const firstRow = await fileRow('first.png');
    expect(drive.files.get(firstRow.storageKey)?.trashed).toBe(true);
    expect(drive.files.get(firstRow.thumbKey!)?.trashed).toBe(true);
    expect(firstRow.deletedAt).not.toBeNull();

    const deleted = await api.delete(`${BASE}/gallery/events/${eventId}`).set(auth(admin));
    expect(deleted.status).toBe(204);
    const secondRow = await fileRow('second.png');
    expect(drive.files.get(secondRow.storageKey)?.trashed).toBe(true);
  });

  it('moves the photos already on this server into Drive, keeping every link', async () => {
    const before = await fileRow('before.png');
    const onDisk = storage.locate(before.storageKey);
    expect(existsSync(onDisk)).toBe(true);

    // A photo whose bytes went missing from the disk: passed over, not retried
    // forever at the front of the queue.
    const event = await prismaUnscoped.galleryEvent.findFirstOrThrow({
      where: { schoolId: school.id, name: 'Before Drive' },
    });
    const lost = await prismaUnscoped.fileObject.create({
      data: {
        schoolId: school.id,
        storageKey: `${school.id}/lost/nowhere.png`,
        originalName: 'lost.png',
        mimeType: 'image/png',
        sizeBytes: 10,
        visibility: 'SCHOOL',
      },
    });
    await prismaUnscoped.galleryPhoto.create({
      data: { schoolId: school.id, eventId: event.id, fileId: lost.id, sortOrder: 9 },
    });

    expect(await status(admin)).toMatchObject({ onServer: 2 });

    let moved = 0;
    let failed = 0;
    let remaining = -1;
    let after: string | undefined;
    for (let step = 0; step < 10; step += 1) {
      const result = await api
        .post(`${BASE}/gallery/drive/move`)
        .set(auth(admin))
        .send(after ? { after } : {});
      expect(result.status).toBe(200);
      moved += result.body.moved;
      failed += result.body.failed;
      remaining = result.body.remaining;
      after = result.body.next ?? undefined;
      if (!after) break;
    }
    expect({ moved, failed, remaining }).toEqual({ moved: 1, failed: 1, remaining: 1 });

    const now = await prismaUnscoped.fileObject.findUniqueOrThrow({ where: { id: before.id } });
    expect(now.provider).toBe('GOOGLE_DRIVE');
    expect(drive.files.get(now.storageKey)?.name).toBe('Before Drive — before.png');
    expect(existsSync(onDisk)).toBe(false);

    // The same link as before the move, still opening the same photo.
    const photo = await api.get(asApiPath(beforeDrive.url)).set(auth(parent));
    expect(photo.status).toBe(200);
    expect(Buffer.compare(photo.body as Buffer, TINY_PNG)).toBe(0);
  });

  it('marks the connection broken when Google takes the access back', async () => {
    const eventId = await createEvent(admin, { name: 'Revoked', visibleToAll: true });
    const uploaded = await uploadPhoto(admin, eventId, 'revoked.png', false);
    expect(uploaded.status).toBe(201);

    drive.accessRemoved = true;
    try {
      const refused = await api.get(asApiPath(uploaded.body.url)).set(auth(parent));
      expect(refused.status).toBe(409);
      expect(await status(admin)).toMatchObject({ connected: true, broken: true });
    } finally {
      drive.accessRemoved = false;
    }

    // Connecting the same account again mends it, in the same folders.
    const folders = drive.folders.size;
    const again = await connect(admin);
    expect(again.body).toMatchObject({ connected: true, broken: false });
    expect(drive.folders.size).toBe(folders);
    expect((await api.get(asApiPath(uploaded.body.url)).set(auth(parent))).status).toBe(200);
  });

  it('adds a video by its YouTube link, and shows it to the family', async () => {
    const eventId = await createEvent(admin, {
      name: 'Annual Day',
      classroomIds: [school.classroomId],
    });

    const notYouTube = await api
      .post(`${BASE}/gallery/events/${eventId}/videos`)
      .set(auth(admin))
      .send({ url: 'https://vimeo.com/123456' });
    expect(notYouTube.status).toBe(400);

    const added = await api
      .post(`${BASE}/gallery/events/${eventId}/videos`)
      .set(auth(admin))
      .send({ url: 'https://youtu.be/dQw4w9WgXcQ', caption: 'Our dance' });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({
      videoId: 'dQw4w9WgXcQ',
      caption: 'Our dance',
      thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    });

    // The same video by its longer address is still the same video.
    const again = await api
      .post(`${BASE}/gallery/events/${eventId}/videos`)
      .set(auth(admin))
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    expect(again.status).toBe(409);

    // An event with only a video is not empty: the family sees it.
    const listed = await api
      .get(`${BASE}/me/children/${school.studentId}/gallery`)
      .set(auth(parent));
    const annual = listed.body.find((e: { name: string }) => e.name === 'Annual Day');
    expect(annual).toMatchObject({ videoCount: 1, photoCount: 0 });
    expect(annual.coverVideo.videoId).toBe('dQw4w9WgXcQ');

    const opened = await api
      .get(`${BASE}/me/children/${school.studentId}/gallery/${eventId}`)
      .set(auth(parent));
    expect(opened.body.videos).toHaveLength(1);

    // Another class's video stays with that class.
    const theirEvent = await createEvent(admin, {
      name: 'Junior KG Song',
      classroomIds: [otherClassroomId],
    });
    await api
      .post(`${BASE}/gallery/events/${theirEvent}/videos`)
      .set(auth(admin))
      .send({ url: 'https://youtu.be/aqz-KE-bpKQ' });
    const stillListed = await api
      .get(`${BASE}/me/children/${school.studentId}/gallery`)
      .set(auth(parent));
    expect(stillListed.body.map((e: { name: string }) => e.name)).not.toContain('Junior KG Song');

    const removed = await api.delete(`${BASE}/gallery/videos/${added.body.id}`).set(auth(admin));
    expect(removed.status).toBe(204);
    const afterRemoval = await api
      .get(`${BASE}/me/children/${school.studentId}/gallery`)
      .set(auth(parent));
    expect(afterRemoval.body.map((e: { name: string }) => e.name)).not.toContain('Annual Day');
  });

  it('lets go of the Drive, hands the access back, and asks again before more photos', async () => {
    const released = await api.delete(`${BASE}/gallery/drive`).set(auth(admin));
    expect(released.status).toBe(204);
    expect(drive.revoked).toContain('refresh-yes');
    expect(await status(admin)).toMatchObject({ connected: false });

    const eventId = await createEvent(admin, { name: 'After', visibleToAll: true });
    expect((await uploadPhoto(admin, eventId, 'after.png')).status).toBe(409);

    const audit = await prismaUnscoped.auditLog.findMany({
      where: { schoolId: school.id, action: { startsWith: 'GALLERY_DRIVE_' } },
      select: { action: true },
    });
    expect(audit.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(['GALLERY_DRIVE_CONNECTED', 'GALLERY_DRIVE_DISCONNECTED']),
    );
  });

  it('keeps Drive to the office', async () => {
    const asParent = await api.get(`${BASE}/gallery/drive`).set(auth(parent));
    expect([403, 404]).toContain(asParent.status);
  });
});
