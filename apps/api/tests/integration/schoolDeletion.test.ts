import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isDatabaseReachable,
  resetDatabase,
  seedBaseline,
  seedSchool,
  TEST_PASSWORD,
  type Baseline,
  type TestSchool,
} from '../helpers/db.js';
import { api, auth, BASE, login, type Session } from '../helpers/api.js';
import { disconnectPrisma, prismaUnscoped } from '../../src/db/prisma.js';

const dbUp = await isDatabaseReachable();

/** Rows each school-owned table holds for one school. */
async function rowsOf(schoolId: string): Promise<Record<string, number>> {
  const tables = await prismaUnscoped.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT DISTINCT TABLE_NAME AS name FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'schoolId'`,
  );
  const counts: Record<string, number> = {};
  for (const { name } of tables) {
    const [row] = await prismaUnscoped.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT COUNT(*) AS n FROM \`${name}\` WHERE \`schoolId\` = ?`,
      schoolId,
    );
    counts[name] = Number(row?.n ?? 0);
  }
  return counts;
}

/**
 * The publisher deleting a school for good: every record of it goes, and not
 * one record of any other school.
 */
describe.skipIf(!dbUp)('deleting a school', () => {
  let baseline: Baseline;
  let alpha: TestSchool;
  let beta: TestSchool;
  let publisher: Session;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    alpha = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    beta = await seedSchool(baseline, 'beta', 'Beta Preschool');
    publisher = await login(baseline.superAdminEmail);

    // More of Alpha: a second family, and people signed in.
    const admin = await login(alpha.adminEmail);
    const family = await api
      .post(`${BASE}/students`)
      .set(auth(admin))
      .send({
        firstName: 'Ira',
        dateOfBirth: '2021-01-01',
        gender: 'FEMALE',
        admissionNo: 'DEL-1',
        classroomId: alpha.classroomId,
        newParent: {
          name: 'Mira Sen',
          phone: '+919820008383',
          password: 'Family2026x',
          relation: 'MOTHER',
        },
      });
    expect(family.status).toBe(201);
    await login(alpha.teacherEmail);
    await login(alpha.parentPhone);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('refuses without the School ID typed back, and deletes nothing', async () => {
    const before = await rowsOf(alpha.id);
    const refused = await api
      .delete(`${BASE}/publication/schools/${alpha.id}`)
      .set(auth(publisher))
      .send({ confirmCode: 'beta' });
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toContain('alpha');
    expect(await rowsOf(alpha.id)).toEqual(before);
  });

  it('is the publisher’s alone', async () => {
    const admin = await login(alpha.adminEmail);
    const response = await api
      .delete(`${BASE}/publication/schools/${alpha.id}`)
      .set(auth(admin))
      .send({ confirmCode: 'alpha' });
    expect(response.status).toBe(403);
  });

  it('deletes the school and everything in it, and nothing of any other school', async () => {
    const betaBefore = await rowsOf(beta.id);
    const alphaBefore = await rowsOf(alpha.id);
    expect(alphaBefore.students).toBe(2);

    const deleted = await api
      .delete(`${BASE}/publication/schools/${alpha.id}`)
      .set(auth(publisher))
      .send({ confirmCode: 'ALPHA' });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toMatchObject({
      name: 'Alpha Preschool',
      code: 'alpha',
      students: 2,
    });

    // Every table, empty of Alpha.
    const left = Object.entries(await rowsOf(alpha.id)).filter(([, n]) => n > 0);
    expect(left).toEqual([]);
    expect(await prismaUnscoped.school.findUnique({ where: { id: alpha.id } })).toBeNull();
    expect(
      await prismaUnscoped.refreshToken.count({ where: { user: { schoolId: alpha.id } } }),
    ).toBe(0);

    // Beta, exactly as it was.
    expect(await rowsOf(beta.id)).toEqual(betaBefore);
    await login(beta.adminEmail);

    // Nobody from Alpha can sign in, and the deletion is on the record.
    const signIn = await api
      .post(`${BASE}/auth/login`)
      .send({ identifier: alpha.adminEmail, password: TEST_PASSWORD });
    expect(signIn.status).toBeGreaterThanOrEqual(400);
    const audit = await prismaUnscoped.auditLog.findFirst({
      where: { action: 'SCHOOL_DELETED', entityId: alpha.id },
    });
    expect(audit).toMatchObject({ schoolId: null });
  });
});
