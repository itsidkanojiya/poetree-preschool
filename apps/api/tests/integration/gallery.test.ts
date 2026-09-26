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

const dbUp = await isDatabaseReachable();

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * The school's photographs.
 *
 * They are pictures of children, so what matters is who does NOT see them: the
 * other class, the other school, and anybody holding a 10 MB original the
 * portal should have shrunk.
 */
describe.skipIf(!dbUp)('gallery', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let neighbour: TestSchool;
  let admin: Session;
  let neighbourAdmin: Session;
  let parent: Session;
  let otherClassroomId: string;

  const upload = async (session: Session, bytes: Buffer, name: string, type: string) => {
    const response = await api
      .post(`${BASE}/files`)
      .set(auth(session))
      .attach('file', bytes, { filename: name, contentType: type });
    return response.body.id as string;
  };

  const createEvent = (session: Session, body: Record<string, unknown>) =>
    api.post(`${BASE}/gallery/events`).set(auth(session)).send(body);

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    neighbour = await seedSchool(baseline, 'beta', 'Beta Preschool');
    admin = await login(school.adminEmail);
    neighbourAdmin = await login(neighbour.adminEmail);
    parent = await login(school.parentPhone);

    // A second class at the same school, which the parent's child is not in.
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
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('shows an event to the class it was made for', async () => {
    const event = await createEvent(admin, {
      name: 'Sports Day',
      eventDate: '2026-09-20',
      classroomIds: [school.classroomId],
    });
    expect(event.status).toBe(201);

    const fileId = await upload(admin, TINY_PNG, 'race.png', 'image/png');
    const added = await api
      .post(`${BASE}/gallery/events/${event.body.id}/photos`)
      .set(auth(admin))
      .send({ fileIds: [fileId] });
    expect(added.status).toBe(200);
    expect(added.body.photoCount).toBe(1);

    const listed = await api
      .get(`${BASE}/me/children/${school.studentId}/gallery`)
      .set(auth(parent));
    expect(listed.body.map((e: { name: string }) => e.name)).toContain('Sports Day');

    const opened = await api
      .get(`${BASE}/me/children/${school.studentId}/gallery/${event.body.id}`)
      .set(auth(parent));
    expect(opened.status).toBe(200);
    expect(opened.body.photos).toHaveLength(1);

    // And the photo itself opens — a picture listed but not loadable is a grid
    // of broken squares.
    const photo = await api.get(opened.body.photos[0].url.replace('/api/v1', BASE)).set(auth(parent));
    expect(photo.status).toBe(200);
  });

  it('hides another class’s event, its photos included', async () => {
    const event = await createEvent(admin, {
      name: 'Junior KG Picnic',
      classroomIds: [otherClassroomId],
    });
    const fileId = await upload(admin, TINY_PNG, 'picnic.png', 'image/png');
    await api
      .post(`${BASE}/gallery/events/${event.body.id}/photos`)
      .set(auth(admin))
      .send({ fileIds: [fileId] });

    const listed = await api
      .get(`${BASE}/me/children/${school.studentId}/gallery`)
      .set(auth(parent));
    expect(listed.body.map((e: { name: string }) => e.name)).not.toContain('Junior KG Picnic');

    // Not forbidden — not found. The list of other classes' outings is not
    // itself something to confirm.
    const direct = await api
      .get(`${BASE}/me/children/${school.studentId}/gallery/${event.body.id}`)
      .set(auth(parent));
    expect(direct.status).toBe(404);

    const photo = await api.get(`${BASE}/files/${fileId}`).set(auth(parent));
    expect(photo.status).toBe(404);
  });

  it('shows a whole-school event to everyone', async () => {
    const event = await createEvent(admin, { name: 'Annual Day', visibleToAll: true });
    const fileId = await upload(admin, TINY_PNG, 'stage.png', 'image/png');
    await api
      .post(`${BASE}/gallery/events/${event.body.id}/photos`)
      .set(auth(admin))
      .send({ fileIds: [fileId] });

    const listed = await api
      .get(`${BASE}/me/children/${school.studentId}/gallery`)
      .set(auth(parent));
    expect(listed.body.map((e: { name: string }) => e.name)).toContain('Annual Day');
  });

  it('keeps an empty event from families until it has photos', async () => {
    await createEvent(admin, { name: 'Not Ready Yet', visibleToAll: true });

    const listed = await api
      .get(`${BASE}/me/children/${school.studentId}/gallery`)
      .set(auth(parent));
    expect(listed.body.map((e: { name: string }) => e.name)).not.toContain('Not Ready Yet');
  });

  it('insists on an audience', async () => {
    // No classes and not the whole school: nobody would ever see it, which is
    // almost certainly not what the office meant.
    const refused = await createEvent(admin, { name: 'For Nobody' });
    expect(refused.status).toBe(400);
  });

  it('refuses a photo over 1 MB', async () => {
    // The portal shrinks a photo before sending it, so anything bigger arriving
    // here went around the portal — and every parent's phone would download it.
    const huge = Buffer.concat([TINY_PNG, Buffer.alloc(1024 * 1024 + 10)]);
    const fileId = await upload(admin, huge, 'huge.png', 'image/png');
    const event = await createEvent(admin, { name: 'Big Photos', visibleToAll: true });

    const refused = await api
      .post(`${BASE}/gallery/events/${event.body.id}/photos`)
      .set(auth(admin))
      .send({ fileIds: [fileId] });

    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toContain('1 MB');
  });

  it('refuses a file that is not a photograph', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
    const fileId = await upload(admin, pdf, 'minutes.pdf', 'application/pdf');
    const event = await createEvent(admin, { name: 'Papers', visibleToAll: true });

    const refused = await api
      .post(`${BASE}/gallery/events/${event.body.id}/photos`)
      .set(auth(admin))
      .send({ fileIds: [fileId] });

    expect(refused.status).toBe(400);
  });

  it('keeps one school’s gallery out of another school’s hands', async () => {
    const mine = await createEvent(admin, { name: 'Private Event', visibleToAll: true });

    const theirs = await api.get(`${BASE}/gallery/events`).set(auth(neighbourAdmin));
    expect(theirs.body.map((e: { name: string }) => e.name)).not.toContain('Private Event');

    const direct = await api
      .get(`${BASE}/gallery/events/${mine.body.id}`)
      .set(auth(neighbourAdmin));
    expect(direct.status).toBe(404);

    // Nor can they put one of our photographs into an event of theirs.
    const ourFile = await upload(admin, TINY_PNG, 'ours.png', 'image/png');
    const theirEvent = await createEvent(neighbourAdmin, { name: 'Theirs', visibleToAll: true });
    const stolen = await api
      .post(`${BASE}/gallery/events/${theirEvent.body.id}/photos`)
      .set(auth(neighbourAdmin))
      .send({ fileIds: [ourFile] });
    expect(stolen.status).toBe(404);
  });

  it('removes a photo, and deletes an event with its photos', async () => {
    const event = await createEvent(admin, { name: 'Temporary', visibleToAll: true });
    const fileId = await upload(admin, TINY_PNG, 'temp.png', 'image/png');
    const added = await api
      .post(`${BASE}/gallery/events/${event.body.id}/photos`)
      .set(auth(admin))
      .send({ fileIds: [fileId] });

    const removed = await api
      .delete(`${BASE}/gallery/photos/${added.body.photos[0].id}`)
      .set(auth(admin));
    expect(removed.status).toBe(204);

    const deleted = await api.delete(`${BASE}/gallery/events/${event.body.id}`).set(auth(admin));
    expect(deleted.status).toBe(204);

    const gone = await api.get(`${BASE}/gallery/events/${event.body.id}`).set(auth(admin));
    expect(gone.status).toBe(404);
  });
});
