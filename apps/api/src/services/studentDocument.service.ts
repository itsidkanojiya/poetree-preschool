import type { StudentDocumentType } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { writeAuditLog } from './audit.service.js';

/**
 * A child's paperwork — birth certificate, address proof, medical letter.
 *
 * The bytes already live in FileObject; this only records what a file *is* and
 * whose it is. Keeping the two apart means a document can be re-labelled or
 * removed from a child without touching storage, and the same upload path,
 * content sniffing and size caps apply here as everywhere else.
 *
 * This is the most sensitive data in the system — medical notes and identity
 * documents belonging to minors — so nothing here is public, and both attaching
 * and removing are audited.
 */

export interface StudentDocumentRow {
  id: string;
  type: StudentDocumentType;
  label: string | null;
  createdAt: string;
  file: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    url: string;
  };
}

const documentSelect = {
  id: true,
  type: true,
  label: true,
  createdAt: true,
  file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
} as const;

type Row = {
  id: string;
  type: StudentDocumentType;
  label: string | null;
  createdAt: Date;
  file: { id: string; originalName: string; mimeType: string; sizeBytes: number };
};

function present(row: Row): StudentDocumentRow {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    file: { ...row.file, url: `/api/v1/files/${row.file.id}` },
  };
}

/** Resolves through the scoped client, so another school's child is simply absent. */
async function assertStudentExists(studentId: string): Promise<void> {
  const student = await prisma.student.findFirst({
    where: { id: studentId },
    select: { id: true },
  });
  if (!student) throw ApiError.notFound('Student not found');
}

export async function listDocuments(studentId: string): Promise<StudentDocumentRow[]> {
  await assertStudentExists(studentId);

  const rows = await prisma.studentDocument.findMany({
    where: { studentId },
    select: documentSelect,
    orderBy: { createdAt: 'desc' },
  });

  return rows.map(present);
}

export interface AttachDocumentInput {
  fileId: string;
  type: StudentDocumentType;
  label?: string;
}

export async function attachDocument(
  studentId: string,
  input: AttachDocumentInput,
  actorUserId: string,
): Promise<StudentDocumentRow> {
  const schoolId = requireSchoolId();
  await assertStudentExists(studentId);

  // The file must be this school's too. Without this check a valid id from
  // anywhere would attach, and the file route would then happily serve it to
  // this child's guardians.
  const file = await prisma.fileObject.findFirst({
    where: { id: input.fileId },
    select: { id: true },
  });
  if (!file) throw ApiError.badRequest('That file does not exist');

  // One row per file per child: attaching the same upload twice is a double
  // click, not a second document.
  const existing = await prisma.studentDocument.findFirst({
    where: { studentId, fileId: input.fileId },
    select: documentSelect,
  });
  if (existing) return present(existing);

  const created = await prisma.studentDocument.create({
    data: {
      schoolId,
      studentId,
      fileId: input.fileId,
      type: input.type,
      label: input.label?.trim() || null,
    },
    select: documentSelect,
  });

  await writeAuditLog({
    action: 'STUDENT_DOCUMENT_ATTACHED',
    entity: 'StudentDocument',
    entityId: created.id,
    schoolId,
    actorUserId,
    after: { studentId, type: input.type, label: created.label },
  });

  return present(created);
}

export async function removeDocument(
  studentId: string,
  documentId: string,
  actorUserId: string,
): Promise<void> {
  const schoolId = requireSchoolId();

  const document = await prisma.studentDocument.findFirst({
    where: { id: documentId, studentId },
    select: { id: true, type: true, label: true, fileId: true },
  });
  if (!document) throw ApiError.notFound('Document not found');

  // The link goes; the file itself is left to the purge job, so a misclick
  // during a busy morning is recoverable.
  await prisma.studentDocument.delete({ where: { id: document.id } });

  await writeAuditLog({
    action: 'STUDENT_DOCUMENT_REMOVED',
    entity: 'StudentDocument',
    entityId: documentId,
    schoolId,
    actorUserId,
    before: { studentId, type: document.type, label: document.label, fileId: document.fileId },
  });
}
