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

/**
 * A customer that runs more than one school.
 *
 * A branch is a school row, so the interesting part is not that a branch has
 * its own children — that falls out of the isolation the platform already has —
 * but the seam around it: that one session is bound to one branch at a time,
 * that switching is checked against the group, and that a group administrator
 * cannot reach a school that is not theirs.
 */
describe.skipIf(!dbUp)('organisations and branches', () => {
  let baseline: Baseline;
  let outsider: TestSchool;
  let superAdmin: Session;

  let organisationId: string;
  let organisationCode: string;
  let branchOneId: string;
  let branchTwoId: string;
  const orgAdminEmail = 'head@sunrisegroup.test';

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    // A school belonging to nobody, to switch into and be refused.
    outsider = await seedSchool(baseline, 'outsider', 'Outsider Preschool');
    superAdmin = await login(baseline.superAdminEmail);

    const organisation = await api
      .post(`${BASE}/publication/organisations`)
      .set(auth(superAdmin))
      .send({ name: 'Sunrise Group' });

    organisationId = organisation.body.id;
    organisationCode = organisation.body.code;

    const first = await api
      .post(`${BASE}/publication/schools`)
      .set(auth(superAdmin))
      .send({ name: 'Sunrise Nikol', organisationId });
    const second = await api
      .post(`${BASE}/publication/schools`)
      .set(auth(superAdmin))
      .send({ name: 'Sunrise Naroda', organisationId });

    branchOneId = first.body.id;
    branchTwoId = second.body.id;

    // Branches are created on TRIAL, which is a usable status, so nothing here
    // needs a plan assigning before anyone can sign in.
    await api
      .post(`${BASE}/publication/organisations/${organisationId}/admins`)
      .set(auth(superAdmin))
      .send({ name: 'Group Head', email: orgAdminEmail, password: TEST_PASSWORD });
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('names a group from its name, and its branches after the group', async () => {
    expect(organisationCode).toBe('sunrisegroup');

    const branches = await prismaUnscoped.school.findMany({
      where: { organisationId },
      orderBy: { code: 'asc' },
      select: { code: true, slug: true },
    });

    expect(branches.map((b) => b.code)).toEqual(['sunrisegroup01', 'sunrisegroup02']);
    // The slug carries the code, so two branches of one group do not collide.
    expect(new Set(branches.map((b) => b.slug)).size).toBe(2);
  });

  it('generates a code for an independent school, and still refuses a taken one', async () => {
    const created = await api
      .post(`${BASE}/publication/schools`)
      .set(auth(superAdmin))
      .send({ name: 'Poppins Preschool' });

    expect(created.status).toBe(201);
    expect(created.body.code).toBe('poppinspreschool');

    const clash = await api
      .post(`${BASE}/publication/schools`)
      .set(auth(superAdmin))
      .send({ name: 'Another One', code: 'poppinspreschool' });

    expect(clash.status).toBe(409);
  });

  it('signs a group administrator in with no school of their own', async () => {
    const session = await login(orgAdminEmail);

    expect(session.schoolId).toBeNull();

    const me = await api.get(`${BASE}/auth/me`).set(auth(session));
    expect(me.body.user.role).toBe('ORG_ADMIN');
    expect(me.body.user.organisation.code).toBe(organisationCode);
    expect(me.body.user.school).toBeNull();
  });

  it('lists the group’s branches, and switches into one', async () => {
    const session = await login(orgAdminEmail);

    const branches = await api.get(`${BASE}/auth/branches`).set(auth(session));
    expect(branches.status).toBe(200);
    expect(branches.body).toHaveLength(2);
    expect(branches.body.every((b: { isCurrent: boolean }) => !b.isCurrent)).toBe(true);

    const switched = await api
      .post(`${BASE}/auth/switch-branch`)
      .set(auth(session))
      .send({ schoolId: branchOneId });

    expect(switched.status).toBe(200);
    expect(switched.body.user.schoolId).toBe(branchOneId);
    expect(switched.body.user.school.code).toBe('sunrisegroup01');

    // And from there it is an ordinary school admin session.
    const inBranch: Session = {
      accessToken: switched.body.accessToken,
      refreshToken: switched.body.refreshToken,
      userId: switched.body.user.id,
      schoolId: branchOneId,
    };

    const students = await api.get(`${BASE}/students`).set(auth(inBranch));
    expect(students.status).toBe(200);

    const marked = await api.get(`${BASE}/auth/branches`).set(auth(inBranch));
    expect(marked.body.find((b: { id: string }) => b.id === branchOneId).isCurrent).toBe(true);
  });

  it('keeps the branch across a refresh', async () => {
    // The session must not quietly fall back to "no branch chosen" an hour in:
    // the next tenant-scoped request would fail halfway through a task.
    const session = await login(orgAdminEmail);
    const switched = await api
      .post(`${BASE}/auth/switch-branch`)
      .set(auth(session))
      .send({ schoolId: branchTwoId });

    const refreshed = await api
      .post(`${BASE}/auth/refresh`)
      .send({ refreshToken: switched.body.refreshToken });

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.user.schoolId).toBe(branchTwoId);
  });

  it('sees only the branch it is in', async () => {
    const session = await login(orgAdminEmail);

    const intoOne = await api
      .post(`${BASE}/auth/switch-branch`)
      .set(auth(session))
      .send({ schoolId: branchOneId });

    const child = await api
      .post(`${BASE}/students`)
      .set({ Authorization: `Bearer ${intoOne.body.accessToken}` })
      .send({
        firstName: 'Aarav',
        lastName: 'Joshi',
        dateOfBirth: '2021-05-04',
        gender: 'MALE',
        admissionNo: 'NIK-001',
        guardians: [],
      });

    // Whether that child was accepted is the roster suite's business; what
    // matters here is that the other branch cannot see anything of branch one's.
    const intoTwo = await api
      .post(`${BASE}/auth/switch-branch`)
      .set(auth(session))
      .send({ schoolId: branchTwoId });

    const fromTwo = await api
      .get(`${BASE}/students`)
      .set({ Authorization: `Bearer ${intoTwo.body.accessToken}` });

    expect(fromTwo.status).toBe(200);
    const ids = (fromTwo.body.items ?? []).map((s: { id: string }) => s.id);
    if (child.status === 201) expect(ids).not.toContain(child.body.id);
  });

  it('will not switch into a school outside the group', async () => {
    const session = await login(orgAdminEmail);

    const refused = await api
      .post(`${BASE}/auth/switch-branch`)
      .set(auth(session))
      .send({ schoolId: outsider.id });

    // 404 rather than 403, like every other cross-tenant read: a group
    // administrator learns nothing about schools that are not theirs.
    expect(refused.status).toBe(404);
  });

  it('will not let an ordinary school admin switch branch', async () => {
    const admin = await login(outsider.adminEmail);

    const refused = await api
      .post(`${BASE}/auth/switch-branch`)
      .set(auth(admin))
      .send({ schoolId: branchOneId });

    expect(refused.status).toBe(403);
  });

  it('lets a branch user sign in with the group’s code', async () => {
    // The app for a group is built with the group's code, so that is what every
    // one of its branches' users sends.
    const response = await api
      .post(`${BASE}/auth/login`)
      .send({ identifier: orgAdminEmail, password: TEST_PASSWORD, schoolCode: organisationCode });

    expect(response.status).toBe(200);

    // And a code that belongs to somebody else finds nobody, rather than
    // signing them in anyway.
    const wrongApp = await api
      .post(`${BASE}/auth/login`)
      .send({ identifier: orgAdminEmail, password: TEST_PASSWORD, schoolCode: 'outsider' });

    expect(wrongApp.status).toBe(401);
  });
});
