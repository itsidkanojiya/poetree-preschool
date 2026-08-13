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

describe.skipIf(!dbUp)('standards', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let publisher: Session;
  let admin: Session;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    publisher = await login(baseline.superAdminEmail);
    admin = await login(school.adminEmail);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('lets the publisher add a year the code never knew about', async () => {
    // The whole point: this was an enum of four, so a school calling its first
    // year "Toddler" could not be described at all.
    const created = await api
      .post(`${BASE}/publication/standards`)
      .set(auth(publisher))
      .send({ code: 'TODDLER', name: 'Toddler', minAgeMonths: 18, maxAgeMonths: 30 });

    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Toddler');
    expect(created.body.classroomCount).toBe(0);
  });

  it('opens a classroom in a standard that did not exist last week', async () => {
    const toddler = await prismaUnscoped.classLevel.findUniqueOrThrow({
      where: { code: 'TODDLER' },
      select: { id: true },
    });

    const classroom = await api
      .post(`${BASE}/classrooms`)
      .set(auth(admin))
      .send({
        academicYearId: school.academicYearId,
        classLevelId: toddler.id,
        section: 'A',
      });

    expect(classroom.status).toBe(201);
    // The label everywhere in the product now comes off the row, not a map
    // compiled into the code.
    expect(classroom.body.classLevel.name).toBe('Toddler');
  });

  it('shows the renamed standard everywhere it is printed', async () => {
    const toddler = await prismaUnscoped.classLevel.findUniqueOrThrow({
      where: { code: 'TODDLER' },
      select: { id: true },
    });

    await api
      .patch(`${BASE}/publication/standards/${toddler.id}`)
      .set(auth(publisher))
      .send({ name: 'Tiny Tots' });

    const classrooms = await api.get(`${BASE}/classrooms`).set(auth(admin));
    const renamed = classrooms.body.find(
      (c: { classLevel: { id: string } }) => c.classLevel.id === toddler.id,
    );

    expect(renamed.classLevel.name).toBe('Tiny Tots');
  });

  it('refuses to retire a standard with classes still in it', async () => {
    const toddler = await prismaUnscoped.classLevel.findUniqueOrThrow({
      where: { code: 'TODDLER' },
      select: { id: true },
    });

    const response = await api
      .post(`${BASE}/publication/standards/${toddler.id}/retire`)
      .set(auth(publisher));

    // Deleting would either cascade a school's history away or leave a register
    // pointing at nothing. The office should hear which classes are in the way.
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('classroom');
  });

  it('will not let two standards share a code', async () => {
    const clash = await api
      .post(`${BASE}/publication/standards`)
      .set(auth(publisher))
      .send({ code: 'TODDLER', name: 'Toddler again' });

    expect(clash.status).toBe(409);
  });

  it('is the publisher’s to set, not the school’s', async () => {
    // A standard is what a book and a child's progress hang off. Sixty schools
    // each inventing their own would make "Nursery" mean sixty things.
    const listed = await api.get(`${BASE}/publication/standards`).set(auth(admin));
    expect(listed.status).toBe(403);

    const written = await api
      .post(`${BASE}/publication/standards`)
      .set(auth(admin))
      .send({ code: 'OUR_OWN', name: 'Our own year' });
    expect(written.status).toBe(403);

    // The school still reads the list it needs to open a class.
    const forPickers = await api.get(`${BASE}/class-levels`).set(auth(admin));
    expect(forPickers.status).toBe(200);
    expect(forPickers.body.length).toBeGreaterThan(0);
  });
});
