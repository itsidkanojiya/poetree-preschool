import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isDatabaseReachable,
  resetDatabase,
  seedBaseline,
  seedSchool,
  type TestSchool,
} from '../helpers/db.js';
import { api, auth, BASE, login, type Session } from '../helpers/api.js';
import { disconnectPrisma, prismaUnscoped } from '../../src/db/prisma.js';

const dbUp = await isDatabaseReachable();

/**
 * A child's family, managed from the child.
 *
 * The office types a family in once — child and new parent together — links
 * and unlinks parents on the child's page, and never leaves a child on the
 * roll with nobody to reach: removing a child's only parent takes the child
 * along, and restoring the parent brings them back.
 */
describe.skipIf(!dbUp)("a child's family", () => {
  let school: TestSchool;
  let other: TestSchool;
  let admin: Session;
  let otherAdmin: Session;
  let serial = 0;

  const newParent = (phone: string, name = 'Meera Shah') => ({
    name,
    phone,
    email: `${phone.replace(/[^0-9]/g, '')}@family.test`,
    password: 'Family@2026',
    relation: 'MOTHER',
  });

  /** A child with one brand-new parent, the way the office now adds a family. */
  const family = async (phone: string, name = 'Meera Shah') => {
    serial += 1;
    const response = await api
      .post(`${BASE}/students`)
      .set(auth(admin))
      .send({
        firstName: `Child${serial}`,
        lastName: 'Shah',
        dateOfBirth: '2021-03-04',
        gender: 'FEMALE',
        admissionNo: `FAM-${serial}`,
        classroomId: school.classroomId,
        newParent: newParent(phone, name),
      });
    expect(response.status).toBe(201);
    return response.body as {
      id: string;
      fullName: string;
      guardians: Array<{ parentProfileId: string; userId: string; isPrimary: boolean }>;
    };
  };

  beforeAll(async () => {
    await resetDatabase();
    const baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    other = await seedSchool(baseline, 'beta', 'Beta Preschool');
    admin = await login(school.adminEmail);
    otherAdmin = await login(other.adminEmail);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('adds a child and a new parent together, and the parent can sign in', async () => {
    const child = await family('+919830001001');
    expect(child.guardians).toHaveLength(1);
    expect(child.guardians[0]).toMatchObject({ isPrimary: true, userId: expect.any(String) });

    const parent = await api.post(`${BASE}/auth/login`).send({
      identifier: '+919830001001',
      password: 'Family@2026',
    });
    expect(parent.status).toBe(200);
  });

  it('refuses a new parent the school already has, and adds no child', async () => {
    await family('+919830001101');
    const before = await prismaUnscoped.student.count({ where: { schoolId: school.id } });

    const again = await api
      .post(`${BASE}/students`)
      .set(auth(admin))
      .send({
        firstName: 'Twin',
        dateOfBirth: '2021-03-04',
        gender: 'MALE',
        admissionNo: 'FAM-TWIN',
        newParent: newParent('+919830001101'),
      });
    expect(again.status).toBe(409);
    expect(again.body.error.details.existingAccount.roles).toContain('PARENT');
    expect(await prismaUnscoped.student.count({ where: { schoolId: school.id } })).toBe(before);
  });

  it("finds a child by their parent's phone or name", async () => {
    const child = await family('+919830001201', 'Kavita Raman');

    const byPhone = await api
      .get(`${BASE}/students`)
      .query({ search: '9830001201' })
      .set(auth(admin));
    expect(byPhone.body.items.map((s: { id: string }) => s.id)).toEqual([child.id]);

    const byName = await api.get(`${BASE}/students`).query({ search: 'Kavita' }).set(auth(admin));
    expect(byName.body.items.map((s: { id: string }) => s.id)).toContain(child.id);
  });

  it('links a second parent, hands them the main contact, and never unlinks the last', async () => {
    const child = await family('+919830001301');
    const first = child.guardians[0]!;

    const linked = await api
      .post(`${BASE}/students/${child.id}/guardians`)
      .set(auth(admin))
      .send({ parent: newParent('+919830001302', 'Arjun Shah'), relation: 'FATHER' });
    expect(linked.status).toBe(201);
    expect(linked.body.guardians).toHaveLength(2);
    const second = linked.body.guardians.find(
      (g: { parentProfileId: string }) => g.parentProfileId !== first.parentProfileId,
    );
    // The first stays the main contact unless asked otherwise.
    expect(second.isPrimary).toBe(false);

    const handed = await api
      .patch(`${BASE}/students/${child.id}/guardians/${second.parentProfileId}`)
      .set(auth(admin))
      .send({ isPrimary: true });
    expect(handed.status).toBe(200);
    const primaries = handed.body.guardians.filter((g: { isPrimary: boolean }) => g.isPrimary);
    expect(primaries.map((g: { parentProfileId: string }) => g.parentProfileId)).toEqual([
      second.parentProfileId,
    ]);

    // Unlinking the main contact passes it to the one left.
    const unlinked = await api
      .delete(`${BASE}/students/${child.id}/guardians/${second.parentProfileId}`)
      .set(auth(admin));
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.guardians).toEqual([
      expect.objectContaining({ parentProfileId: first.parentProfileId, isPrimary: true }),
    ]);

    const last = await api
      .delete(`${BASE}/students/${child.id}/guardians/${first.parentProfileId}`)
      .set(auth(admin));
    expect(last.status).toBe(409);
    expect(last.body.error.message).toContain('only parent');

    // Each step is on the child's record.
    const history = await api.get(`${BASE}/students/${child.id}/history`).set(auth(admin));
    const fields = history.body.flatMap((h: { changes: Array<{ field: string }> }) =>
      h.changes.map((c) => c.field),
    );
    expect(fields).toEqual(expect.arrayContaining(['guardians', 'primaryGuardian']));
  });

  it('links a parent the school already has, but not twice', async () => {
    const sibling = await family('+919830001401');
    const child = await family('+919830001402');
    const parentProfileId = sibling.guardians[0]!.parentProfileId;

    const linked = await api
      .post(`${BASE}/students/${child.id}/guardians`)
      .set(auth(admin))
      .send({ parentProfileId, relation: 'MOTHER' });
    expect(linked.status).toBe(201);

    const twice = await api
      .post(`${BASE}/students/${child.id}/guardians`)
      .set(auth(admin))
      .send({ parentProfileId, relation: 'MOTHER' });
    expect(twice.status).toBe(409);
  });

  it('keeps a child who has another parent, and hands over the main contact', async () => {
    const child = await family('+919830001501');
    const mother = child.guardians[0]!;
    await api
      .post(`${BASE}/students/${child.id}/guardians`)
      .set(auth(admin))
      .send({ parent: newParent('+919830001502', 'Vikram Shah'), relation: 'FATHER' });

    const removed = await api.delete(`${BASE}/parents/${mother.userId}`).set(auth(admin));
    expect(removed.status).toBe(200);

    const still = await api.get(`${BASE}/students/${child.id}`).set(auth(admin));
    expect(still.body.removedAt).toBeNull();
    expect(still.body.guardians).toEqual([
      expect.objectContaining({ name: 'Vikram Shah', isPrimary: true }),
    ]);
  });

  it('removes a child with their only parent; the child alone cannot come back', async () => {
    const child = await family('+919830001601', 'Leela Iyer');
    const parent = child.guardians[0]!;

    const detail = await api.get(`${BASE}/parents/${parent.userId}`).set(auth(admin));
    expect(detail.body.children[0]).toMatchObject({ hasOtherGuardian: false, removed: false });

    await api.delete(`${BASE}/parents/${parent.userId}`).set(auth(admin));
    const gone = await api.get(`${BASE}/students/${child.id}`).set(auth(admin));
    expect(gone.body.removedAt).not.toBeNull();

    // Not on the roll with nobody to reach: the parent comes back first.
    const alone = await api.post(`${BASE}/students/${child.id}/restore`).set(auth(admin));
    expect(alone.status).toBe(409);
    expect(alone.body.error.message).toContain('Leela Iyer');

    const restored = await api.post(`${BASE}/parents/${parent.userId}/restore`).set(auth(admin));
    expect(restored.status).toBe(200);
    expect(restored.body.children[0]).toMatchObject({ id: child.id, removed: false });

    const back = await api.get(`${BASE}/students/${child.id}`).set(auth(admin));
    expect(back.body.removedAt).toBeNull();
    expect(back.body.guardians).toHaveLength(1);
  });

  it('does not bring back a child who was removed on their own', async () => {
    const child = await family('+919830001701');
    const parent = child.guardians[0]!;

    await api.delete(`${BASE}/students/${child.id}`).set(auth(admin));
    await api.delete(`${BASE}/parents/${parent.userId}`).set(auth(admin));
    await api.post(`${BASE}/parents/${parent.userId}/restore`).set(auth(admin));

    const still = await api.get(`${BASE}/students/${child.id}`).set(auth(admin));
    expect(still.body.removedAt).not.toBeNull();
  });

  it("is this school's alone", async () => {
    const child = await family('+919830001801');
    const parentProfileId = child.guardians[0]!.parentProfileId;

    const link = await api
      .post(`${BASE}/students/${child.id}/guardians`)
      .set(auth(otherAdmin))
      .send({ parentProfileId: other.parentProfileId });
    expect(link.status).toBe(404);

    const unlink = await api
      .delete(`${BASE}/students/${child.id}/guardians/${parentProfileId}`)
      .set(auth(otherAdmin));
    expect(unlink.status).toBe(404);

    // Nor can a parent from another school be linked here.
    const foreign = await api
      .post(`${BASE}/students/${child.id}/guardians`)
      .set(auth(admin))
      .send({ parentProfileId: other.parentProfileId });
    expect(foreign.status).toBe(400);
  });
});
