import { readFile } from 'node:fs/promises';
import { prisma } from '../db/prisma.js';
import { storage } from '../lib/storage.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { writeAuditLog } from './audit.service.js';

/** PDFKit embeds JPEG and PNG. Anything else has to be left out. */
const EMBEDDABLE = new Set(['image/jpeg', 'image/png']);

/**
 * The bytes of an uploaded image, or null for every reason it might not work.
 *
 * Null rather than throwing, in all of: no file, a soft-deleted one, a format
 * PDFKit cannot embed, or bytes that have gone missing from disk. A card with
 * initials where a photograph should be is a card; an exception is a school
 * that cannot print anything today.
 *
 * The WebP case is real rather than theoretical — the upload route accepts
 * WebP, and PDFKit cannot embed it.
 */
export async function imageBytes(fileId: string | null): Promise<Buffer | null> {
  if (!fileId) return null;

  const file = await prisma.fileObject.findFirst({
    where: { id: fileId, deletedAt: null },
    select: { storageKey: true, mimeType: true },
  });
  if (!file || !EMBEDDABLE.has(file.mimeType)) return null;

  try {
    return await readFile(storage.locate(file.storageKey));
  } catch {
    return null;
  }
}

/**
 * The school as every printed document shows it: name, address, colour,
 * logo, and the principal who signs.
 */
export interface SchoolBranding {
  name: string;
  addressLine: string | null;
  phone: string | null;
  primaryColor: string;
  logo: Buffer | null;
  principalName: string | null;
  principalSignature: Buffer | null;
}

export async function schoolBranding(): Promise<SchoolBranding> {
  const school = await prisma.school.findUniqueOrThrow({
    where: { id: requireSchoolId() },
    select: {
      name: true,
      phone: true,
      addressLine1: true,
      city: true,
      state: true,
      postalCode: true,
      primaryColor: true,
      logoFileId: true,
      principalName: true,
      principalSignatureFileId: true,
    },
  });

  const [logo, principalSignature] = await Promise.all([
    imageBytes(school.logoFileId),
    imageBytes(school.principalSignatureFileId),
  ]);

  return {
    name: school.name,
    addressLine:
      [school.addressLine1, school.city, school.state, school.postalCode]
        .filter(Boolean)
        .join(', ') || null,
    phone: school.phone,
    primaryColor: school.primaryColor ?? '#16307C',
    logo,
    principalName: school.principalName,
    principalSignature,
  };
}

/** A member of staff's signature, if one has been uploaded for them. */
export async function signatureOf(userId: string | null): Promise<Buffer | null> {
  if (!userId) return null;
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { signatureFileId: true },
  });
  return imageBytes(user?.signatureFileId ?? null);
}

/**
 * A signature has to be a picture PDFKit can print — JPEG or PNG — and this
 * school's own upload. A WebP signature would quietly print as nothing.
 */
async function assertSignatureFile(fileId: string): Promise<void> {
  const file = await prisma.fileObject.findFirst({
    where: { id: fileId, deletedAt: null },
    select: { mimeType: true, schoolId: true },
  });
  // The scoped client already hides other schools' files; this also refuses
  // the publisher's (no school), since a signature is the school's own upload.
  if (!file || file.schoolId !== requireSchoolId()) {
    throw ApiError.badRequest('That file does not exist');
  }
  if (!EMBEDDABLE.has(file.mimeType)) {
    throw ApiError.badRequest('A signature has to be a JPEG or PNG picture');
  }
}

export async function setPrincipalSignature(
  fileId: string | null,
  actorUserId: string,
): Promise<void> {
  const schoolId = requireSchoolId();
  if (fileId) await assertSignatureFile(fileId);

  const before = await prisma.school.findUniqueOrThrow({
    where: { id: schoolId },
    select: { principalSignatureFileId: true },
  });
  await prisma.school.update({
    where: { id: schoolId },
    data: { principalSignatureFileId: fileId },
  });
  await writeAuditLog({
    action: 'SCHOOL_UPDATED',
    entity: 'School',
    entityId: schoolId,
    schoolId,
    actorUserId,
    before: { principalSignatureFileId: before.principalSignatureFileId },
    after: { principalSignatureFileId: fileId },
  });
}

export async function setTeacherSignature(
  userId: string,
  fileId: string | null,
  actorUserId: string,
): Promise<void> {
  const schoolId = requireSchoolId();
  const teacher = await prisma.user.findFirst({
    where: { id: userId, role: 'TEACHER' },
    select: { id: true },
  });
  if (!teacher) throw ApiError.notFound('Teacher not found');
  if (fileId) await assertSignatureFile(fileId);

  await prisma.user.update({ where: { id: userId, schoolId }, data: { signatureFileId: fileId } });
  await writeAuditLog({
    action: 'USER_UPDATED',
    entity: 'User',
    entityId: userId,
    schoolId,
    actorUserId,
    metadata: { role: 'TEACHER', fields: ['signature'] },
  });
}
