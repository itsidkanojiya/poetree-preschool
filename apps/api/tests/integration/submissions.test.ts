import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isDatabaseReachable,
  resetDatabase,
  seedBaseline,
  seedSchool,
  type Baseline,
  type TestSchool,
} from '../helpers/db.js';
import bcrypt from 'bcryptjs';
import { api, auth, BASE, login, type Session } from '../helpers/api.js';
import { TEST_PASSWORD } from '../helpers/db.js';
import { prismaUnscoped, disconnectPrisma } from '../../src/db/prisma.js';

const dbUp = await isDatabaseReachable();

/** A real 1x1 PNG — fabricated rows have no bytes on disk and 404 on read. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const CLASSMATE_PHONE = '+919812345678';

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
  let photoId: string;
  let photoHomeworkId: string;

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

    // A second family in the same classroom. The authorisation test below
    // needs someone for whom every filter passes except the guardian link.
    const classmateUser = await prismaUnscoped.user.create({
      data: {
        schoolId: schoolA.id,
        scopeKey: schoolA.id,
        name: 'Classmate Parent',
        phone: CLASSMATE_PHONE,
        passwordHash: bcrypt.hashSync(TEST_PASSWORD, 4),
        role: 'PARENT',
        status: 'ACTIVE',
      },
    });
    const classmateProfile = await prismaUnscoped.parentProfile.create({
      data: { userId: classmateUser.id, schoolId: schoolA.id, relation: 'GUARDIAN' },
    });
    const classmate = await prismaUnscoped.student.create({
      data: {
        schoolId: schoolA.id,
        admissionNo: 'ALPHA-060',
        firstName: 'Class',
        lastName: 'Mate',
        dateOfBirth: new Date('2022-04-04'),
        gender: 'FEMALE',
        status: 'ACTIVE',
      },
    });
    await prismaUnscoped.studentGuardian.create({
      data: {
        schoolId: schoolA.id,
        studentId: classmate.id,
        parentProfileId: classmateProfile.id,
        isPrimary: true,
      },
    });
    await prismaUnscoped.studentEnrolment.create({
      data: {
        schoolId: schoolA.id,
        studentId: classmate.id,
        academicYearId: schoolA.academicYearId,
        classroomId: schoolA.classroomId,
        status: 'ACTIVE',
      },
    });
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

  it('refuses a file the parent did not upload, and does not grant them sight of it', async () => {
    // The escalation this guards against: a submission grants read access to
    // whatever is attached to it, so attaching an arbitrary in-school file id
    // would let a parent point their own child's submission at another
    // family's paperwork and thereby give themselves permission to open it.
    //
    // Uploaded by the office, not by this parent.
    const officeFile = await prismaUnscoped.fileObject.create({
      data: {
        schoolId: schoolA.id,
        storageKey: 'alpha/2026/08/another-family-medical.pdf',
        originalName: 'medical-letter.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        checksum: 'alpha-medical',
        uploadedById: schoolA.adminId,
        visibility: 'SCHOOL',
      },
    });

    const attempt = await api
      .post(`${BASE}/homework/${homeworkId}/submit`)
      .set(auth(parentA))
      .send({ studentId: schoolA.studentId, fileIds: [officeFile.id] });

    expect(attempt.status).toBe(400);

    // Nothing was attached...
    const attached = await prismaUnscoped.homeworkSubmissionFile.count({
      where: { fileId: officeFile.id },
    });
    expect(attached).toBe(0);

    // ...and the parent still cannot read it.
    const read = await api.get(`${BASE}/files/${officeFile.id}`).set(auth(parentA));
    expect(read.status).toBe(404);
  });

  it('treats the same photograph sent twice as a double tap', async () => {
    const file = await prismaUnscoped.fileObject.create({
      data: {
        schoolId: schoolA.id,
        storageKey: 'alpha/2026/08/twice.jpg',
        originalName: 'twice.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        checksum: 'alpha-twice',
        // Uploaded by the parent, so it is theirs to attach.
        uploadedById: parentA.userId,
        visibility: 'SCHOOL',
      },
    });

    // (submission, file) is unique — without dedupe this is an unhandled
    // constraint violation and a 500 in the parent's face.
    const response = await api
      .post(`${BASE}/homework/${homeworkId}/submit`)
      .set(auth(parentA))
      .send({ studentId: schoolA.studentId, fileIds: [file.id, file.id] });

    expect(response.status).toBe(204);

    const rows = await prismaUnscoped.homeworkSubmissionFile.count({
      where: { fileId: file.id },
    });
    expect(rows).toBe(1);
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
        // The parent's own upload — attaching is now restricted to what you
        // uploaded yourself, so a file owned by the office would be refused.
        uploadedById: parentA.userId,
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

  it('shows the teacher the note and the photograph', async () => {
    // Uploaded through the real endpoint: a fabricated FileObject row has no
    // bytes behind it, and serving one 404s however correct the permissions
    // are. The note goes in the same request, because a later submission
    // without one legitimately clears it.
    const upload = await api
      .post(`${BASE}/files`)
      .set(auth(parentA))
      .attach('file', TINY_PNG, { filename: 'drawing.png', contentType: 'image/png' });

    expect(upload.status).toBe(201);
    photoId = upload.body.id as string;

    // Its own homework: the review test above marks the shared one COMPLETED,
    // and the API rightly refuses a resubmission after the teacher has judged.
    const fresh = await api
      .post(`${BASE}/homework`)
      .set(auth(teacherA))
      .send({
        classroomId: schoolA.classroomId,
        title: 'Paint a rainbow',
        dueDate: inDays(5),
        allowsSubmission: true,
      });
    photoHomeworkId = fresh.body.id as string;
    await api.post(`${BASE}/homework/${photoHomeworkId}/publish`).set(auth(teacherA));

    const sent = await api
      .post(`${BASE}/homework/${photoHomeworkId}/submit`)
      .set(auth(parentA))
      .send({
        studentId: schoolA.studentId,
        note: 'She drew all four of us',
        fileIds: [photoId],
      });
    expect(sent.status).toBe(204);

    const submissions = await api
      .get(`${BASE}/homework/${photoHomeworkId}/submissions`)
      .set(auth(teacherA));

    expect(submissions.status).toBe(200);
    const mine = submissions.body.find(
      (s: { studentId: string }) => s.studentId === schoolA.studentId,
    );

    // Both were stored from the start and neither was ever returned, so the
    // review screen showed an empty quote and no picture — the two things a
    // teacher needs in order to decide.
    expect(mine.note).toBe('She drew all four of us');
    expect(mine.files.map((f: { id: string }) => f.id)).toContain(photoId);
    expect(mine.files[0].url).toBe(`/api/v1/files/${mine.files[0].id}`);
  });

  it('lets the right people open the photograph, and nobody else', async () => {
    // The family who sent it.
    const own = await api.get(`${BASE}/files/${photoId}`).set(auth(parentA));
    expect(own.status).toBe(200);

    // The teacher who set the work.
    const teacher = await api.get(`${BASE}/files/${photoId}`).set(auth(teacherA));
    expect(teacher.status).toBe(200);

    // The one that matters. This second family is in the SAME school, the SAME
    // classroom, and was set the SAME homework — every filter except the
    // guardian link passes for them. If the scoping is ever loosened this is
    // the test that fails, and a picture of somebody's child is what leaks.
    const classmateSession = await login(CLASSMATE_PHONE);
    const otherFamily = await api.get(`${BASE}/files/${photoId}`).set(auth(classmateSession));

    expect(otherFamily.status).toBe(404);
    // Missing, not forbidden — a 403 would confirm the photograph exists.
    expect(otherFamily.body.error.code).toBe('NOT_FOUND');

    // And another school sees nothing either.
    const adminB = await login(schoolB.adminEmail);
    const foreign = await api.get(`${BASE}/files/${photoId}`).set(auth(adminB));
    expect(foreign.status).toBe(404);
  });

  it('keeps a parent out of the submissions list', async () => {
    // "Who has done their homework" is a list of other people's children.
    const response = await api
      .get(`${BASE}/homework/${homeworkId}/submissions`)
      .set(auth(parentA));

    expect(response.status).toBe(403);
  });
});
