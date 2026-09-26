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
  let seededChild: {
    firstName: string;
    lastName: string | null;
    dateOfBirth: string;
    admissionNo: string;
  };

  /** The form as a real family fills it in. */
  const form = (overrides: Record<string, unknown> = {}) => ({
    // Three parts, as the form asks for them: name, father's name, surname.
    studentFirstName: 'Aarav',
    studentMiddleName: 'Nikhil',
    studentLastName: 'Joshi',
    studentDateOfBirth: '2021-04-09',
    // The second number, and an email: both required since the form stopped
    // asking a family to identify themselves separately from their child.
    motherPhone: '+919820007777',
    email: 'family@example.test',
    guardianName: 'Nikhil Joshi',
    phone: '+919820007001',
    password: 'Family@2026',
    confirmPassword: 'Family@2026',
    declarationAccepted: true,
    termsAccepted: true,
    ...overrides,
  });

  /**
   * Ask for a code and type it back, the way the app does before the form is
   * sent. The static providers answer 1234 to everybody, which is what they
   * are for — see otp.service.ts for why that is not verification of anything.
   */
  const verifiedChallenge = async (
    schoolCode: string,
    channel: 'PHONE' | 'EMAIL',
    destination: string,
  ): Promise<string> => {
    const sent = await api
      .post(`${BASE}/public/schools/${schoolCode}/otp/send`)
      .send({ channel, destination });

    const challengeId = sent.body.challengeId as string;
    await api
      .post(`${BASE}/public/schools/${schoolCode}/otp/verify`)
      .send({ challengeId, code: '1234' });

    return challengeId;
  };

  /** The whole journey: prove both, then send the form with both proofs. */
  const submit = async (schoolCode: string, body: Record<string, unknown>) => {
    const phone = String(body.phone ?? '+919820007001');
    const email = String(body.email ?? 'family@example.test');

    const phoneChallengeId =
      body.phoneChallengeId ?? (await verifiedChallenge(schoolCode, 'PHONE', phone));
    const emailChallengeId =
      body.emailChallengeId ?? (await verifiedChallenge(schoolCode, 'EMAIL', email));

    return api
      .post(`${BASE}/public/schools/${schoolCode}/registrations`)
      .send({ ...body, phoneChallengeId, emailChallengeId });
  };

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    other = await seedSchool(baseline, 'beta', 'Beta Preschool');
    admin = await login(school.adminEmail);

    const student = await prismaUnscoped.student.findUniqueOrThrow({
      where: { id: school.studentId },
      select: { firstName: true, lastName: true, dateOfBirth: true, admissionNo: true },
    });
    seededChild = {
      firstName: student.firstName,
      lastName: student.lastName,
      dateOfBirth: student.dateOfBirth.toISOString(),
      admissionNo: student.admissionNo,
    };
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

  it('takes a family whose child the school has never heard of', async () => {
    // The whole point of the change: a family joining the school has no
    // admission number, because the office has not issued one yet.
    const newcomer = await submit(
      'alpha',
      form({ phone: '+919820007009', studentFirstName: 'Nobody', studentLastName: 'Onroll' }),
    );

    expect(newcomer.status).toBe(202);

    const waiting = await prismaUnscoped.parentRegistration.findFirstOrThrow({
      where: { phone: '+919820007009' },
      select: { studentId: true, admissionNo: true, studentDateOfBirth: true },
    });
    expect(waiting.studentId).toBeNull();
    expect(waiting.admissionNo).toBeNull();
    expect(waiting.studentDateOfBirth).not.toBeNull();
  });

  it('refuses a registration with no child named', async () => {
    const wrong = await submit('alpha', form({ studentFirstName: '' }));

    // A validation failure now, not a missing child: there is no roll to miss.
    expect(wrong.status).toBe(400);
    expect(
      wrong.body.error.details.some(
        (issue: { path: string }) => issue.path === 'studentFirstName',
      ),
    ).toBe(true);
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
      .set(auth(neighbour))
      .send({ mode: 'LINK', studentId: other.studentId });
    expect(refused.status).toBe(404);
  });

  it('shows the office the claim beside the child it matched', async () => {
    const listed = await api.get(`${BASE}/registrations`).set(auth(admin));
    const row = listed.body.items.find(
      (r: { phone: string }) => r.phone === '+919820007001',
    );

    // Nothing is claimed any more, so there is nothing to compare it against
    // until the office decides. The three parts are written out for the queue.
    expect(row.studentName).toBe('Aarav Nikhil Joshi');
    expect(row.student).toBeNull();
    expect(row.admissionNo).toBeNull();
    expect(Array.isArray(row.matches)).toBe(true);
  });

  it('offers the office the children it might be', async () => {
    // A family registering for a child already on the roll — a sibling, or one
    // the office entered last week. The screen should put them in front of the
    // office rather than make them go and search.
    const sibling = await submit(
      'alpha',
      form({
        phone: '+919820007011',
        studentFirstName: seededChild.firstName,
        studentMiddleName: '',
        studentLastName: seededChild.lastName ?? '',
        studentDateOfBirth: seededChild.dateOfBirth,
      }),
    );
    expect(sibling.status).toBe(202);

    const listed = await api.get(`${BASE}/registrations`).set(auth(admin));
    const row = listed.body.items.find((r: { phone: string }) => r.phone === '+919820007011');

    expect(row.matches.length).toBeGreaterThan(0);
    expect(row.matches.map((m: { id: string }) => m.id)).toContain(school.studentId);
    expect(row.matches[0].admissionNo).toBeTruthy();
  });

  it('creates the account, links the child, and lets the family in', async () => {
    const listed = await api.get(`${BASE}/registrations`).set(auth(admin));
    const waiting = listed.body.items.find(
      (r: { phone: string }) => r.phone === '+919820007001',
    );

    const approved = await api
      .post(`${BASE}/registrations/${waiting.id}/approve`)
      .set(auth(admin))
      .send({ mode: 'LINK', studentId: school.studentId });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('APPROVED');
    // The decided row says what was decided.
    expect(approved.body.student.id).toBe(school.studentId);
    expect(approved.body.admissionNo).toBe(seededChild.admissionNo);

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
      .set(auth(admin))
      .send({ mode: 'LINK', studentId: school.studentId });

    expect(again.status).toBe(409);
  });

  it('creates the child and issues the number when the office says so', async () => {
    const sent = await submit(
      'alpha',
      form({
        phone: '+919820007013',
        studentFirstName: 'Ishaan',
        studentMiddleName: 'Ketan',
        studentLastName: 'Newcomer',
      }),
    );
    expect(sent.status).toBe(202);

    const queue = await api.get(`${BASE}/registrations`).set(auth(admin));
    const waiting = queue.body.items.find(
      (r: { phone: string }) => r.phone === '+919820007013',
    );

    const approved = await api
      .post(`${BASE}/registrations/${waiting.id}/approve`)
      .set(auth(admin))
      .send({ mode: 'CREATE', gender: 'MALE' });

    expect(approved.status).toBe(200);
    // Issued from the school's own series, not typed by the family.
    expect(approved.body.admissionNo).toMatch(/^ADM-\d+$/);

    const child = await prismaUnscoped.student.findUniqueOrThrow({
      where: { id: approved.body.student.id },
      select: {
        firstName: true,
        middleName: true,
        lastName: true,
        dateOfBirth: true,
        schoolId: true,
      },
    });
    // The three parts as the family typed them, not a guess from splitting a
    // sentence on its spaces.
    expect(child.firstName).toBe('Ishaan');
    expect(child.middleName).toBe('Ketan');
    expect(child.lastName).toBe('Newcomer');
    expect(approved.body.student.name).toBe('Ishaan Ketan Newcomer');
    expect(child.schoolId).toBe(school.id);
    // The birthday the family gave, not today.
    expect(child.dateOfBirth.toISOString().slice(0, 10)).toBe('2021-04-09');

    // And the family can sign in and see that child.
    const parent = await api
      .post(`${BASE}/auth/login`)
      .send({ identifier: '+919820007013', password: 'Family@2026' });
    expect(parent.status).toBe(200);

    const children = await api
      .get(`${BASE}/me/children`)
      .set({ Authorization: `Bearer ${parent.body.accessToken}` });
    expect(children.status).toBe(200);
    expect(JSON.stringify(children.body)).toContain(approved.body.student.id);
  });

  it('will not link a child belonging to another school', async () => {
    const sent = await submit('alpha', form({ phone: '+919820007015' }));
    expect(sent.status).toBe(202);

    const queue = await api.get(`${BASE}/registrations`).set(auth(admin));
    const waiting = queue.body.items.find(
      (r: { phone: string }) => r.phone === '+919820007015',
    );

    const refused = await api
      .post(`${BASE}/registrations/${waiting.id}/approve`)
      .set(auth(admin))
      .send({ mode: 'LINK', studentId: other.studentId });

    // 404, like every other cross-tenant read.
    expect(refused.status).toBe(404);
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

    const sent = await submit(
      'beta',
      form({
        phone: '+919820007003',
        bloodGroup: 'O+',
        emergencyContactName: 'A parent’s guess',
        emergencyContactPhone: '+918888888888',
      }),
    );
    expect(sent.status).toBe(202);

    const neighbour = await login(other.adminEmail);
    const queue = await api.get(`${BASE}/registrations`).set(auth(neighbour));
    const waiting = queue.body.items.find(
      (r: { phone: string }) => r.phone === '+919820007003',
    );
    await api
      .post(`${BASE}/registrations/${waiting.id}/approve`)
      .set(auth(neighbour))
      .send({ mode: 'LINK', studentId: other.studentId });

    const after = await prismaUnscoped.student.findUniqueOrThrow({
      where: { id: other.studentId },
      select: { bloodGroup: true, emergencyContactName: true },
    });

    expect(after.bloodGroup).toBe('O+');
    expect(after.emergencyContactName).toBe('The office knows best');
  });

  it('will not take a registration without a code that was typed back', async () => {
    const phone = '+919820007021';

    // Asked for, never confirmed.
    const sent = await api
      .post(`${BASE}/public/schools/alpha/otp/send`)
      .send({ channel: 'PHONE', destination: phone });
    expect(sent.status).toBe(202);
    expect(sent.body.challengeId).toBeTruthy();
    // The code itself is never in the reply, whatever the provider.
    expect(JSON.stringify(sent.body)).not.toContain('1234');

    const refused = await submit(
      'alpha',
      form({ phone, phoneChallengeId: sent.body.challengeId }),
    );

    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toContain('confirm');
  });

  it('refuses a wrong code, and says the same thing every time', async () => {
    const phone = '+919820007023';
    const sent = await api
      .post(`${BASE}/public/schools/alpha/otp/send`)
      .send({ channel: 'PHONE', destination: phone });

    const wrong = await api
      .post(`${BASE}/public/schools/alpha/otp/verify`)
      .send({ challengeId: sent.body.challengeId, code: '9999' });

    expect(wrong.status).toBe(400);

    // A challenge that does not exist says exactly the same: which of the two
    // it was is the only thing a guesser would learn here.
    const unknown = await api
      .post(`${BASE}/public/schools/alpha/otp/verify`)
      .send({ challengeId: sent.body.challengeId.replace(/.$/, 'z'), code: '1234' });

    expect(unknown.status).toBe(400);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it('will not let one code open two accounts', async () => {
    const phone = '+919820007025';
    const challengeId = await verifiedChallenge('alpha', 'PHONE', phone);

    const first = await submit('alpha', form({ phone, phoneChallengeId: challengeId }));
    expect(first.status).toBe(202);

    // Same proof, a second family. It was spent when the first form arrived.
    const second = await submit(
      'alpha',
      form({ phone: '+919820007027', phoneChallengeId: challengeId }),
    );
    expect(second.status).toBe(400);
  });

  it('will not accept a code proved for a different number', async () => {
    // Prove one number, type another: the school would end up ringing a phone
    // nobody had ever answered for.
    const challengeId = await verifiedChallenge('alpha', 'PHONE', '+919820007029');

    const refused = await submit(
      'alpha',
      form({ phone: '+919820007031', phoneChallengeId: challengeId }),
    );

    expect(refused.status).toBe(400);
  });

  it('keeps one school’s codes out of another school’s registrations', async () => {
    const challengeId = await verifiedChallenge('beta', 'PHONE', '+919820007033');

    const refused = await submit(
      'alpha',
      form({ phone: '+919820007033', phoneChallengeId: challengeId }),
    );

    expect(refused.status).toBe(400);
  });

  it('will not take a registration without the email confirmed', async () => {
    const email = 'unconfirmed@example.test';

    const sent = await api
      .post(`${BASE}/public/schools/alpha/otp/send`)
      .send({ channel: 'EMAIL', destination: email });
    expect(sent.status).toBe(202);

    const refused = await submit(
      'alpha',
      form({ phone: '+919820007035', email, emailChallengeId: sent.body.challengeId }),
    );

    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toContain('email');
  });

  it('will not accept a phone code as proof of an email address', async () => {
    // Same table, two channels: the one thing that must not be interchangeable.
    const email = 'crossed@example.test';
    const phoneProof = await verifiedChallenge('alpha', 'PHONE', '+919820007037');

    const refused = await submit(
      'alpha',
      form({ phone: '+919820007037', email, emailChallengeId: phoneProof }),
    );

    expect(refused.status).toBe(400);
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
