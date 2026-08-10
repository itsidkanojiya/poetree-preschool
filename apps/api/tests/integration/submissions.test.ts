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
import { prismaUnscoped, disconnectPrisma } from '../../src/db/prisma.js';

const dbUp = await isDatabaseReachable();

const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!dbUp)('homework submission', () => {
  let baseline: Baseline;
  let schoolA: TestSchool;
  let schoolB: TestSchool;
  let teacherA: Session;
  let parentA: Session;
  let parentB: Session;

  let homeworkId: string;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    schoolA = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    schoolB = await seedSchool(baseline, 'beta', 'Beta Preschool');

    teacherA = await login(schoolA.teacherEmail);
    parentA = await login(schoolA.parentPhone);
    parentB = await login(schoolB.parentPhone);

    const created = await api
      .post(`${BASE}/homework`)
      .set(auth(teacherA))
      .send({
        classroomId: schoolA.classroomId,
        title: 'Draw your family',
        description: 'Any colours you like.',
        dueDate: inDays(3),
        allowsSubmission: true,
      });
    homeworkId = created.body.id as string;

    await api.post(`${BASE}/homework/${homeworkId}/publish`).set(auth(teacherA));
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnectPrisma();
  });

  it('lets a parent mark their own child’s homework done', async () => {
    const response = await api
      .post(`${BASE}/homework/${homeworkId}/submit`)
      .set(auth(parentA))
      .send({ studentId: schoolA.studentId, note: 'Done at the weekend' });

    expect(response.status).toBe(204);

    const submission = await prismaUnscoped.homeworkSubmission.findFirstOrThrow({
      where: { homeworkId, studentId: schoolA.studentId },
    });

    // SUBMITTED, not COMPLETED. A parent saying "we did this" and a teacher
    // agreeing are different claims, and collapsing them would make every
    // completion figure a self-report.
    expect(submission.status).toBe('SUBMITTED');
    expect(submission.note).toBe('Done at the weekend');
    expect(submission.submittedOn).not.toBeNull();
  });

  it('stops a parent submitting for a child who is not theirs', async () => {
    const stranger = await prismaUnscoped.student.create({
      data: {
        schoolId: schoolA.id,
        admissionNo: 'ALPHA-050',
        firstName: 'Other',
        lastName: 'Child',
        dateOfBirth: new Date('2022-02-02'),
        gender: 'MALE',
        status: 'ACTIVE',
      },
    });

    const response = await api
      .post(`${BASE}/homework/${homeworkId}/submit`)
      .set(auth(parentA))
      .send({ studentId: stranger.id });

    expect(response.status).toBe(404);
  });

  it('stops another school’s parent entirely', async () => {
    const response = await api
      .post(`${BASE}/homework/${homeworkId}/submit`)
      .set(auth(parentB))
      .send({ studentId: schoolB.studentId });

    expect(response.status).toBe(404);
  });

  it('refuses a file belonging to another school', async () => {
    const foreign = await prismaUnscoped.fileObject.create({
      data: {
        schoolId: schoolB.id,
        storageKey: 'beta/2026/08/photo.jpg',
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 2048,
        checksum: 'beta-photo',
        uploadedById: schoolB.adminId,
        visibility: 'SCHOOL',
      },
    });

    const response = await api
      .post(`${BASE}/homework/${homeworkId}/submit`)
      .set(auth(parentA))
      .send({ studentId: schoolA.studentId, fileIds: [foreign.id] });

    expect(response.status).toBe(400);

    const attached = await prismaUnscoped.homeworkSubmissionFile.count({
      where: { fileId: foreign.id },
    });
    expect(attached).toBe(0);
  });

  it('attaches a photograph of the work', async () => {
    const file = await prismaUnscoped.fileObject.create({
      data: {
        schoolId: schoolA.id,
        storageKey: 'alpha/2026/08/drawing.jpg',
        originalName: 'drawing.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 4096,
        checksum: 'alpha-drawing',
        uploadedById: schoolA.adminId,
        visibility: 'SCHOOL',
      },
    });

    const response = await api
      .post(`${BASE}/homework/${homeworkId}/submit`)
      .set(auth(parentA))
      .send({ studentId: schoolA.studentId, fileIds: [file.id] });

    expect(response.status).toBe(204);

    const attached = await prismaUnscoped.homeworkSubmissionFile.count({
      where: { fileId: file.id },
    });
    expect(attached).toBe(1);
  });

  it('lets the teacher review it, and then refuses further submissions', async () => {
    const submissions = await api
      .get(`${BASE}/homework/${homeworkId}/submissions`)
      .set(auth(teacherA));

    expect(submissions.status).toBe(200);
    expect(submissions.body[0].status).toBe('SUBMITTED');

    const reviewed = await api
      .patch(`${BASE}/homework/submissions/${submissions.body[0].id}`)
      .set(auth(teacherA))
      .send({ status: 'COMPLETED', teacherRemark: 'Lovely colours' });

    expect(reviewed.status).toBe(204);

    // Once the teacher has judged it, a parent resubmitting would silently
    // undo that judgement.
    const again = await api
      .post(`${BASE}/homework/${homeworkId}/submit`)
      .set(auth(parentA))
      .send({ studentId: schoolA.studentId });

    expect(again.status).toBe(400);
  });

  it('keeps a parent out of the submissions list', async () => {
    // "Who has done their homework" is a list of other people's children.
    const response = await api
      .get(`${BASE}/homework/${homeworkId}/submissions`)
      .set(auth(parentA));

    expect(response.status).toBe(403);
  });
});
