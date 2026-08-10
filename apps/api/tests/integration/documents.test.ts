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

/**
 * Student documents and the parent's own view of their children.
 *
 * These two shipped without tests, which is the same gap that produced the fee
 * leak and the attendance leak: a permission was checked and a row was not.
 */
describe.skipIf(!dbUp)('student documents and /me/children', () => {
  let baseline: Baseline;
  let schoolA: TestSchool;
  let schoolB: TestSchool;
  let adminA: Session;
  let adminB: Session;
  let parentA: Session;
  let teacherA: Session;

  /** A file belonging to each school, as if uploaded through POST /files. */
  let fileA: string;
  let fileB: string;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    schoolA = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    schoolB = await seedSchool(baseline, 'beta', 'Beta Preschool');

    adminA = await login(schoolA.adminEmail);
    adminB = await login(schoolB.adminEmail);
    parentA = await login(schoolA.parentPhone);
    teacherA = await login(schoolA.teacherEmail);

    const makeFile = async (school: TestSchool, uploaderId: string) => {
      const file = await prismaUnscoped.fileObject.create({
        data: {
          schoolId: school.id,
          storageKey: `${school.code}/2026/08/${school.code}-doc.pdf`,
          originalName: 'birth-certificate.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          checksum: `checksum-${school.code}`,
          uploadedById: uploaderId,
          visibility: 'SCHOOL',
        },
      });
      return file.id;
    };

    fileA = await makeFile(schoolA, schoolA.adminId);
    fileB = await makeFile(schoolB, schoolB.adminId);
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnectPrisma();
  });

  it('attaches a document to a child and lists it back', async () => {
    const created = await api
      .post(`${BASE}/students/${schoolA.studentId}/documents`)
      .set(auth(adminA))
      .send({ fileId: fileA, type: 'BIRTH_CERTIFICATE', label: 'Issued 2022' });

    expect(created.status).toBe(201);
    expect(created.body.type).toBe('BIRTH_CERTIFICATE');
    expect(created.body.label).toBe('Issued 2022');
    // The URL goes through the API, which re-checks entitlement per request —
    // it is not a key to the bytes.
    expect(created.body.file.url).toBe(`/api/v1/files/${fileA}`);

    const listed = await api
      .get(`${BASE}/students/${schoolA.studentId}/documents`)
      .set(auth(adminA));

    expect(listed.status).toBe(200);
    expect(listed.body.documents).toHaveLength(1);
  });

  it('treats attaching the same file twice as a double click', async () => {
    const again = await api
      .post(`${BASE}/students/${schoolA.studentId}/documents`)
      .set(auth(adminA))
      .send({ fileId: fileA, type: 'BIRTH_CERTIFICATE' });

    expect(again.status).toBe(201);

    const listed = await api
      .get(`${BASE}/students/${schoolA.studentId}/documents`)
      .set(auth(adminA));

    // One document, not two — a slow tap is not a second certificate.
    expect(listed.body.documents).toHaveLength(1);
  });

  it('refuses a file belonging to another school', async () => {
    // Without this check a valid id from anywhere would attach, and the file
    // route would then serve it to this child's guardians.
    const response = await api
      .post(`${BASE}/students/${schoolA.studentId}/documents`)
      .set(auth(adminA))
      .send({ fileId: fileB, type: 'OTHER' });

    expect(response.status).toBe(400);

    const leaked = await prismaUnscoped.studentDocument.count({
      where: { fileId: fileB },
    });
    expect(leaked).toBe(0);
  });

  it('keeps one school out of another school’s paperwork', async () => {
    const read = await api
      .get(`${BASE}/students/${schoolA.studentId}/documents`)
      .set(auth(adminB));
    expect(read.status).toBe(404);

    const write = await api
      .post(`${BASE}/students/${schoolA.studentId}/documents`)
      .set(auth(adminB))
      .send({ fileId: fileB, type: 'MEDICAL' });
    expect(write.status).toBe(404);
  });

  it('is closed to parents and teachers entirely', async () => {
    // Identity documents and medical letters are office paperwork. A parent
    // reaches the file itself through /files, which scopes by guardian link;
    // neither role manages the record.
    for (const session of [parentA, teacherA]) {
      const response = await api
        .get(`${BASE}/students/${schoolA.studentId}/documents`)
        .set(auth(session));

      expect(response.status).toBe(403);
    }
  });

  it('records the attach and the removal in the audit log', async () => {
    const listed = await api
      .get(`${BASE}/students/${schoolA.studentId}/documents`)
      .set(auth(adminA));
    const documentId = listed.body.documents[0].id as string;

    const removed = await api
      .delete(`${BASE}/students/${schoolA.studentId}/documents/${documentId}`)
      .set(auth(adminA));
    expect(removed.status).toBe(204);

    const entries = await prismaUnscoped.auditLog.findMany({
      where: {
        schoolId: schoolA.id,
        action: { in: ['STUDENT_DOCUMENT_ATTACHED', 'STUDENT_DOCUMENT_REMOVED'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    // "Who put this on the record, and when" is asked a year later.
    expect(entries.map((e) => e.action)).toEqual([
      'STUDENT_DOCUMENT_ATTACHED',
      'STUDENT_DOCUMENT_REMOVED',
    ]);

    // The link goes; the bytes are left to the purge job so a misclick during a
    // busy morning is recoverable.
    const file = await prismaUnscoped.fileObject.findUnique({ where: { id: fileA } });
    expect(file).not.toBeNull();
    expect(file?.deletedAt).toBeNull();
  });

  it('gives a parent their own children and nobody else’s', async () => {
    const response = await api.get(`${BASE}/me/children`).set(auth(parentA));

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(schoolA.studentId);
    expect(response.body[0].classroom.label).toContain('Nursery');

    // Scoped by guardian link, not by school — being a parent at a school does
    // not entitle anyone to the roster of it.
    const otherChild = await prismaUnscoped.student.create({
      data: {
        schoolId: schoolA.id,
        admissionNo: 'ALPHA-099',
        firstName: 'Someone',
        lastName: 'Else',
        dateOfBirth: new Date('2022-05-01'),
        gender: 'FEMALE',
        status: 'ACTIVE',
      },
    });

    const after = await api.get(`${BASE}/me/children`).set(auth(parentA));
    expect(after.body).toHaveLength(1);
    expect(after.body.map((c: { id: string }) => c.id)).not.toContain(otherChild.id);
  });

  it('is not a back door for staff', async () => {
    for (const session of [adminA, teacherA]) {
      const response = await api.get(`${BASE}/me/children`).set(auth(session));
      expect(response.status).toBe(403);
    }
  });
});
