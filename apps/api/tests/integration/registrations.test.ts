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

/**
 * A family asking their school for access.
 *
 * The whole point of the workflow is that nothing exists until the school says
 * so, so most of these assert an absence: no account, no guardian link, no way
 * in — until somebody in the office decides.
 */
describe.skipIf(!dbUp)('parent registration', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let other: TestSchool;
  let admin: Session;
  let admissionNo: string;

  /** The form as a real family fills it in. */
  const form = (overrides: Record<string, unknown> = {}) => ({
    admissionNo,
    studentName: 'Aarav Joshi',
    guardianName: 'Meera Joshi',
    relation: 'MOTHER',
    phone: '+919820007001',
    password: 'Family@2026',
    confirmPassword: 'Family@2026',
    declarationAccepted: true,
    termsAccepted: true,
    ...overrides,
  });

  const submit = (code: string, body: Record<string, unknown>) =>
    api.post(`${BASE}/public/schools/${code}/registrations`).send(body);

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    other = await seedSchool(baseline, 'beta', 'Beta Preschool');
    admin = await login(school.adminEmail);

    const student = await prismaUnscoped.student.findUniqueOrThrow({
      where: { id: school.studentId },
      select: { admissionNo: true },
    });
    admissionNo = student.admissionNo;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('takes a registration without anybody signing in', async () => {
    const sent = await submit('alpha', form());

    // 202, not 201: the school has it, and nothing has been created.
    expect(sent.status).toBe(202);
    expect(sent.body.status).toBe('PENDING');

    // Nothing exists yet. This is the assertion the whole feature turns on.
    const account = await prismaUnscoped.user.findFirst({
      where: { phone: '+919820007001' },
    });
    expect(account).toBeNull();
  });

  it('refuses a child the school has never heard of', async () => {
    const wrong = await submit('alpha', form({ admissionNo: 'NOT-A-REAL-ONE' }));

    expect(wrong.status).toBe(404);
    expect(wrong.body.error.message).toContain('admission number');
  });

  it('tells somebody who already has an account to sign in instead', async () => {
    // The seeded parent, who the office created by hand.
    const existing = await submit('alpha', form({ phone: school.parentPhone }));

    expect(existing.status).toBe(409);
    // Pointed at the door they actually want, rather than "phone already taken".
    expect(existing.body.error.message).toContain('signing in');
  });

  it('refuses a second request from the same phone while one is waiting', async () => {
    const again = await submit('alpha', form());

    expect(again.status).toBe(409);
    expect(again.body.error.message).toContain('already waiting');
  });

  it('lets the other parent register for the same child', async () => {
    // A mother and a father both want the app. Nothing about one family's
    // second guardian is a duplicate, and a unique key would have said it was.
    const father = await submit(
      'alpha',
      form({ phone: '+919820007002', guardianName: 'Sameer Joshi', relation: 'FATHER' }),
    );

    expect(father.status).toBe(202);
  });

  it('says the account is under verification, not that the password is wrong', async () => {
    const blocked = await api
      .post(`${BASE}/auth/login`)
      .send({ identifier: '+919820007001', password: 'Family@2026' });

    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('REGISTRATION_PENDING');
    expect(blocked.body.error.message).toContain('under verification');
  });

  it('keeps one school’s queue out of another school’s hands', async () => {
    const neighbour = await login(other.adminEmail);

    const theirs = await api.get(`${BASE}/registrations`).set(auth(neighbour));
    expect(theirs.status).toBe(200);
    expect(theirs.body.items).toHaveLength(0);

    const mine = await api.get(`${BASE}/registrations`).set(auth(admin));
    expect(mine.body.items.length).toBeGreaterThan(0);

    // 404 rather than 403: a refusal that confirms the row exists is itself a
    // leak about the school next door.
    const refused = await api
      .post(`${BASE}/registrations/${mine.body.items[0].id}/approve`)
      .set(auth(neighbour));
    expect(refused.status).toBe(404);
  });

  it('shows the office the claim beside the child it matched', async () => {
    const listed = await api.get(`${BASE}/registrations`).set(auth(admin));
    const row = listed.body.items.find(
      (r: { phone: string }) => r.phone === '+919820007001',
    );

    // Both halves, because the screen exists to compare them: a name that does
    // not match the admission number is exactly what it is there to catch.
    expect(row.studentName).toBe('Aarav Joshi');
    expect(row.student.admissionNo).toBe(admissionNo);
    expect(row.student.name).toBeTruthy();
  });

  it('creates the account, links the child, and lets the family in', async () => {
    const listed = await api.get(`${BASE}/registrations`).set(auth(admin));
    const waiting = listed.body.items.find(
      (r: { phone: string }) => r.phone === '+919820007001',
    );

    const approved = await api
      .post(`${BASE}/registrations/${waiting.id}/approve`)
      .set(auth(admin));
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('APPROVED');

    const user = await prismaUnscoped.user.findFirstOrThrow({
      where: { phone: '+919820007001' },
      include: { parentProfile: { include: { children: true } } },
    });
    expect(user.role).toBe('PARENT');
    expect(user.status).toBe('ACTIVE');
    // Their own password, chosen when they registered. Nobody else has seen it,
    // so there is nothing to force them to change.
    expect(user.mustChangePassword).toBe(false);
    expect(user.parentProfile?.children).toHaveLength(1);
    expect(user.parentProfile?.children[0]?.studentId).toBe(school.studentId);

    // And the password they chose weeks ago still works.
    const signedIn = await api
      .post(`${BASE}/auth/login`)
      .send({ identifier: '+919820007001', password: 'Family@2026' });
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.user.role).toBe('PARENT');
  });

  it('will not approve the same registration twice', async () => {
    const listed = await api
      .get(`${BASE}/registrations`)
      .query({ status: 'APPROVED' })
      .set(auth(admin));

    const again = await api
      .post(`${BASE}/registrations/${listed.body.items[0].id}/approve`)
      .set(auth(admin));

    expect(again.status).toBe(409);
  });

  it('fills a blank on the child but never writes over the office', async () => {
    // The school holds no blood group for this child and the parent supplied
    // one; the school's own emergency contact is set and must survive.
    await prismaUnscoped.student.update({
      where: { id: other.studentId },
      data: {
        bloodGroup: null,
        emergencyContactName: 'The office knows best',
        emergencyContactPhone: '+919999999999',
      },
    });

    const child = await prismaUnscoped.student.findUniqueOrThrow({
      where: { id: other.studentId },
      select: { admissionNo: true },
    });

    const sent = await submit(
      'beta',
      form({
        admissionNo: child.admissionNo,
        phone: '+919820007003',
        bloodGroup: 'O+',
        emergencyContactName: 'A parent’s guess',
        emergencyContactPhone: '+918888888888',
      }),
    );
    expect(sent.status).toBe(202);

    const neighbour = await login(other.adminEmail);
    const queue = await api.get(`${BASE}/registrations`).set(auth(neighbour));
    await api
      .post(`${BASE}/registrations/${queue.body.items[0].id}/approve`)
      .set(auth(neighbour));

    const after = await prismaUnscoped.student.findUniqueOrThrow({
      where: { id: other.studentId },
      select: { bloodGroup: true, emergencyContactName: true },
    });

    expect(after.bloodGroup).toBe('O+');
    expect(after.emergencyContactName).toBe('The office knows best');
  });

  it('turns one down, and says so at the next sign-in', async () => {
    const father = await api
      .get(`${BASE}/registrations`)
      .query({ status: 'PENDING' })
      .set(auth(admin));
    const pending = father.body.items[0];

    const rejected = await api
      .post(`${BASE}/registrations/${pending.id}/reject`)
      .set(auth(admin))
      .send({ reason: 'That admission number belongs to another family’s child.' });

    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe('REJECTED');

    const blocked = await api
      .post(`${BASE}/auth/login`)
      .send({ identifier: pending.phone, password: 'Family@2026' });

    expect(blocked.body.error.code).toBe('REGISTRATION_REJECTED');
    expect(blocked.body.error.message).toContain('another family');
  });

  it('still says nothing useful to somebody who never registered', async () => {
    const stranger = await api
      .post(`${BASE}/auth/login`)
      .send({ identifier: '+919820009999', password: 'Family@2026' });

    expect(stranger.status).toBe(401);
    expect(stranger.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('refuses a mismatched confirmation before anything else happens', async () => {
    const typo = await submit(
      'alpha',
      form({ phone: '+919820007004', confirmPassword: 'Something@Else9' }),
    );

    expect(typo.status).toBe(400);
  });

  it('will not take a registration without the declaration ticked', async () => {
    const undeclared = await submit(
      'alpha',
      form({ phone: '+919820007005', declarationAccepted: false }),
    );

    expect(undeclared.status).toBe(400);
  });
});
