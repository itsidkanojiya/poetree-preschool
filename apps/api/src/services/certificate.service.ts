import type {
  CertificateDetail,
  CertificateRecipient,
  CertificateSummary,
  ChildCertificate,
  CreateCertificateInput,
  UpdateCertificateInput,
} from '@poetree/shared';
import { prisma } from '../db/prisma.js';
import { getRequestContext, requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { createDocument, toBuffer } from '../lib/pdf.js';
import { studentName } from '../lib/names.js';
import { writeAuditLog } from './audit.service.js';
import { guardianUserIdsFor, notifySafe } from './notification.service.js';
import { nextDocumentNumber } from './sequence.service.js';
import { assertCanReadStudent } from './scope.service.js';
import { schoolBranding, signatureOf } from './printAssets.service.js';
import { A4_LANDSCAPE, drawCertificate, type CertificateArt } from './certificate.pdf.js';

/**
 * Certificates the school awards.
 *
 * The office writes one — a title, a line about why, a design and a date —
 * ticks the children, and issues it. Issuing gives every child their own
 * numbered copy from the school's gapless counter and tells their family. A
 * draft is the office's alone; no family sees anything until it is issued.
 */

const OFFICE = new Set(['SCHOOL_ADMIN', 'ORG_ADMIN']);

function isOffice(): boolean {
  const role = getRequestContext()?.role;
  return !!role && OFFICE.has(role);
}

const certificateInclude = {
  _count: { select: { awards: true } },
} as const;

function toSummary(row: {
  id: string;
  title: string;
  body: string;
  design: CertificateSummary['design'];
  issuedOn: Date;
  issuedAt: Date | null;
  createdAt: Date;
  _count: { awards: number };
}): CertificateSummary {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    design: row.design,
    issuedOn: row.issuedOn.toISOString(),
    issuedAt: row.issuedAt?.toISOString() ?? null,
    status: row.issuedAt ? 'ISSUED' : 'DRAFT',
    recipientCount: row._count.awards,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listCertificates(): Promise<CertificateSummary[]> {
  const rows = await prisma.certificate.findMany({
    include: certificateInclude,
    orderBy: [{ issuedOn: 'desc' }, { createdAt: 'desc' }],
  });
  return rows.map(toSummary);
}

/** The class a child is in now, as printed: "Nursery — A". */
async function currentClassLabels(studentIds: string[]): Promise<Map<string, string>> {
  const enrolments = await prisma.studentEnrolment.findMany({
    where: { studentId: { in: studentIds }, status: 'ACTIVE' },
    select: {
      studentId: true,
      classroom: { select: { section: true, classLevel: { select: { name: true } } } },
    },
  });
  return new Map(
    enrolments.map((e) => [e.studentId, `${e.classroom.classLevel.name} — ${e.classroom.section}`]),
  );
}

export async function getCertificate(id: string): Promise<CertificateDetail> {
  const row = await prisma.certificate.findFirst({
    where: { id },
    include: {
      ...certificateInclude,
      awards: {
        include: { student: { select: { firstName: true, middleName: true, lastName: true } } },
      },
    },
  });
  if (!row) throw ApiError.notFound('Certificate not found');

  // A draft shows each child's class as it is now; an issued one, as printed.
  const labels = row.issuedAt
    ? new Map<string, string>()
    : await currentClassLabels(row.awards.map((a) => a.studentId));

  const recipients: CertificateRecipient[] = row.awards
    .map((award) => ({
      awardId: award.id,
      studentId: award.studentId,
      fullName: studentName(award.student),
      classroomLabel: award.classroomLabel ?? labels.get(award.studentId) ?? null,
      number: award.number,
      revokedAt: award.revokedAt?.toISOString() ?? null,
    }))
    .sort(
      (a, b) =>
        (a.classroomLabel ?? '').localeCompare(b.classroomLabel ?? '') ||
        a.fullName.localeCompare(b.fullName),
    );

  return { ...toSummary(row), recipients };
}

/** Only children of this school, still on its roll. */
async function assertStudents(studentIds: string[]): Promise<string[]> {
  const unique = [...new Set(studentIds)];
  if (unique.length === 0) return unique;
  const found = await prisma.student.findMany({
    where: { id: { in: unique }, deletedAt: null },
    select: { id: true },
  });
  if (found.length !== unique.length) {
    throw ApiError.badRequest('One of those children is not at this school');
  }
  return unique;
}

async function draft(id: string) {
  const row = await prisma.certificate.findFirst({ where: { id } });
  if (!row) throw ApiError.notFound('Certificate not found');
  if (row.issuedAt) {
    throw ApiError.conflict('This certificate has been issued and can no longer be changed');
  }
  return row;
}

export async function createCertificate(
  input: CreateCertificateInput,
  actorUserId: string,
): Promise<CertificateDetail> {
  const schoolId = requireSchoolId();
  const studentIds = await assertStudents(input.studentIds);
  const year = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });

  const created = await prisma.certificate.create({
    data: {
      schoolId,
      academicYearId: year?.id ?? null,
      title: input.title,
      body: input.body,
      design: input.design,
      issuedOn: input.issuedOn,
      createdById: actorUserId,
      awards: { create: studentIds.map((studentId) => ({ schoolId, studentId })) },
    },
  });
  return getCertificate(created.id);
}

export async function updateCertificate(
  id: string,
  input: UpdateCertificateInput,
): Promise<CertificateDetail> {
  await draft(id);
  await prisma.certificate.update({ where: { id }, data: input });
  return getCertificate(id);
}

export async function setRecipients(id: string, studentIds: string[]): Promise<CertificateDetail> {
  const schoolId = requireSchoolId();
  await draft(id);
  const wanted = await assertStudents(studentIds);

  await prisma.$transaction(async (tx) => {
    await tx.certificateAward.deleteMany({
      where: { certificateId: id, studentId: { notIn: wanted } },
    });
    const existing = await tx.certificateAward.findMany({
      where: { certificateId: id },
      select: { studentId: true },
    });
    const have = new Set(existing.map((a) => a.studentId));
    const add = wanted.filter((studentId) => !have.has(studentId));
    if (add.length > 0) {
      await tx.certificateAward.createMany({
        data: add.map((studentId) => ({ schoolId, certificateId: id, studentId })),
      });
    }
  });
  return getCertificate(id);
}

export async function deleteCertificate(id: string): Promise<void> {
  await draft(id);
  await prisma.certificate.delete({ where: { id } });
}

/**
 * Issues a draft: numbers every copy, freezes each child's class as printed,
 * and tells their families.
 */
export async function issueCertificate(
  id: string,
  actorUserId: string,
): Promise<CertificateDetail> {
  const schoolId = requireSchoolId();
  const certificate = await draft(id);

  const awards = await prisma.certificateAward.findMany({
    where: { certificateId: id },
    select: { id: true, studentId: true, student: { select: { firstName: true } } },
  });
  if (awards.length === 0) {
    throw ApiError.badRequest('Choose at least one child before issuing');
  }
  const labels = await currentClassLabels(awards.map((a) => a.studentId));

  await prisma.$transaction(
    async (tx) => {
      for (const award of awards) {
        const number = await nextDocumentNumber(tx, {
          schoolId,
          kind: 'CERTIFICATE',
          academicYearId: null,
          defaultPrefix: 'CERT-',
          padTo: 4,
        });
        await tx.certificateAward.update({
          where: { id: award.id },
          data: { number, classroomLabel: labels.get(award.studentId) ?? null },
        });
      }
      await tx.certificate.update({ where: { id }, data: { issuedAt: new Date() } });
    },
    { timeout: 20_000 },
  );

  await writeAuditLog({
    action: 'CERTIFICATE_ISSUED',
    entity: 'Certificate',
    entityId: id,
    schoolId,
    actorUserId,
    metadata: { title: certificate.title, recipients: awards.length },
  });

  // One notification per child's family, so each opens on their own copy.
  for (const award of awards) {
    const guardians = await guardianUserIdsFor([award.studentId]);
    if (guardians.length === 0) continue;
    notifySafe({
      schoolId,
      userIds: guardians,
      type: 'CERTIFICATE_ISSUED',
      title: 'New certificate',
      body: `${award.student.firstName} received “${certificate.title}”`,
      entityType: 'CertificateAward',
      entityId: award.id,
    });
  }

  return getCertificate(id);
}

export async function revokeAward(awardId: string, actorUserId: string): Promise<void> {
  const schoolId = requireSchoolId();
  const award = await prisma.certificateAward.findFirst({
    where: { id: awardId },
    select: { id: true, revokedAt: true, certificateId: true, studentId: true },
  });
  if (!award) throw ApiError.notFound('Certificate not found');
  if (award.revokedAt) return;

  await prisma.certificateAward.update({ where: { id: awardId }, data: { revokedAt: new Date() } });
  await writeAuditLog({
    action: 'CERTIFICATE_REVOKED',
    entity: 'CertificateAward',
    entityId: awardId,
    schoolId,
    actorUserId,
    metadata: { certificateId: award.certificateId, studentId: award.studentId },
  });
}

/** A child's issued certificates, newest first, for their family. */
export async function certificatesForChild(studentId: string): Promise<ChildCertificate[]> {
  await assertCanReadStudent(studentId);
  const awards = await prisma.certificateAward.findMany({
    where: { studentId, revokedAt: null, certificate: { issuedAt: { not: null } } },
    include: { certificate: true },
    orderBy: { certificate: { issuedOn: 'desc' } },
  });
  return awards.map((award) => ({
    awardId: award.id,
    title: award.certificate.title,
    body: award.certificate.body,
    design: award.certificate.design,
    issuedOn: award.certificate.issuedOn.toISOString(),
    number: award.number,
  }));
}

// ---------------------------------------------------------------------------
// PDFs
// ---------------------------------------------------------------------------

/** The class teacher of a child's current class, with their signature. */
async function classTeacherOf(
  studentId: string,
): Promise<{ name: string; signature: Buffer | null } | null> {
  const enrolment = await prisma.studentEnrolment.findFirst({
    where: { studentId, status: 'ACTIVE' },
    select: { classroomId: true },
  });
  if (!enrolment) return null;
  const teacher = await prisma.classroomTeacher.findFirst({
    where: { classroomId: enrolment.classroomId, endedOn: null, role: 'CLASS_TEACHER' },
    select: { userId: true, user: { select: { name: true } } },
  });
  if (!teacher) return null;
  return { name: teacher.user.name, signature: await signatureOf(teacher.userId) };
}

type CertificateRow = NonNullable<Awaited<ReturnType<typeof loadForPrint>>>;

async function loadForPrint(id: string) {
  return prisma.certificate.findFirst({
    where: { id },
    include: {
      awards: {
        where: { revokedAt: null },
        include: {
          student: { select: { id: true, firstName: true, middleName: true, lastName: true } },
        },
      },
    },
  });
}

async function render(
  certificate: CertificateRow,
  awards: CertificateRow['awards'],
  sample = false,
): Promise<Buffer> {
  const school = await schoolBranding();
  const doc = createDocument(certificate.title, { size: A4_LANDSCAPE, margin: 0 });
  const labels = certificate.issuedAt
    ? new Map<string, string>()
    : await currentClassLabels(awards.map((a) => a.studentId));

  const pages: Array<Omit<CertificateArt, 'school'>> =
    sample || awards.length === 0
      ? [
          {
            design: certificate.design,
            title: certificate.title,
            body: certificate.body,
            childName: "Child's name",
            classroomLabel: null,
            issuedOn: certificate.issuedOn,
            number: null,
            classTeacher: null,
          },
        ]
      : await Promise.all(
          awards.map(async (award) => ({
            design: certificate.design,
            title: certificate.title,
            body: certificate.body,
            childName: studentName(award.student),
            classroomLabel: award.classroomLabel ?? labels.get(award.studentId) ?? null,
            issuedOn: certificate.issuedOn,
            number: award.number,
            classTeacher: await classTeacherOf(award.studentId),
          })),
        );

  pages.forEach((page, index) => {
    if (index > 0) doc.addPage({ size: A4_LANDSCAPE, margin: 0 });
    drawCertificate(doc, { ...page, school });
  });
  return toBuffer(doc);
}

function filename(title: string, suffix = ''): string {
  const slug =
    title
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'certificate';
  return `${slug}${suffix}.pdf`;
}

/** Every child's copy in one file, for the office to print. */
export async function certificatePdf(id: string): Promise<{ buffer: Buffer; filename: string }> {
  const certificate = await loadForPrint(id);
  if (!certificate) throw ApiError.notFound('Certificate not found');
  return {
    buffer: await render(certificate, certificate.awards),
    filename: filename(certificate.title),
  };
}

/** The design with a stand-in name, before anything is issued. */
export async function previewPdf(id: string): Promise<{ buffer: Buffer; filename: string }> {
  const certificate = await loadForPrint(id);
  if (!certificate) throw ApiError.notFound('Certificate not found');
  return {
    buffer: await render(certificate, certificate.awards, true),
    filename: filename(certificate.title, '-preview'),
  };
}

/**
 * One child's copy. The office may print any; a family only their own child's,
 * once issued and while it stands.
 */
export async function awardPdf(awardId: string): Promise<{ buffer: Buffer; filename: string }> {
  const award = await prisma.certificateAward.findFirst({
    where: { id: awardId },
    select: { id: true, studentId: true, revokedAt: true, certificateId: true },
  });
  if (!award) throw ApiError.notFound('Certificate not found');

  if (!isOffice()) {
    await assertCanReadStudent(award.studentId);
    if (award.revokedAt) throw ApiError.notFound('Certificate not found');
  }

  const certificate = await loadForPrint(award.certificateId);
  if (!certificate) throw ApiError.notFound('Certificate not found');
  if (!isOffice() && !certificate.issuedAt) throw ApiError.notFound('Certificate not found');

  const mine = certificate.awards.filter((a) => a.id === awardId);
  if (mine.length === 0) throw ApiError.notFound('Certificate not found');
  return { buffer: await render(certificate, mine), filename: filename(certificate.title) };
}
