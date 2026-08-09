import type { ImportReport, ImportRowIssue, ImportStudentRow, ImportStudentsInput } from '@poetree/shared';
import { importStudentRowSchema } from '@poetree/shared';
import { prisma } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { hashPassword } from '../lib/password.js';
import { writeAuditLog } from './audit.service.js';
import { nextDocumentNumber } from './sequence.service.js';

/**
 * Bulk admission from a spreadsheet.
 *
 * Two-pass by design: the client uploads, gets a per-row report, and only then
 * confirms. The apply is all-or-nothing — a half-imported roll is worse than a
 * failed import, because nobody can tell which children made it in.
 */
export async function importStudents(
  input: ImportStudentsInput,
  actorUserId: string,
): Promise<ImportReport> {
  const schoolId = requireSchoolId();

  const classroom = await prisma.classroom.findFirst({
    where: { id: input.classroomId },
    select: { id: true, academicYearId: true },
  });
  if (!classroom) throw ApiError.badRequest('That classroom does not exist at your school');

  const issues: ImportRowIssue[] = [];
  const parsed: Array<{ row: number; data: ImportStudentRow }> = [];

  // Pass 1 — shape and field validity.
  input.rows.forEach((raw, index) => {
    const rowNumber = index + 1;
    const result = importStudentRowSchema.safeParse(raw);

    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({
          row: rowNumber,
          field: issue.path.join('.') || '(row)',
          message: issue.message,
        });
      }
      return;
    }

    parsed.push({ row: rowNumber, data: result.data });
  });

  // Pass 2 — collisions, both inside the file and against what is already stored.
  const seenAdmission = new Map<string, number>();
  const seenPhone = new Map<string, number>();

  for (const { row, data } of parsed) {
    if (data.admissionNo) {
      const first = seenAdmission.get(data.admissionNo);
      if (first) {
        issues.push({
          row,
          field: 'admissionNo',
          message: `Duplicate of row ${first} in this file`,
        });
      } else {
        seenAdmission.set(data.admissionNo, row);
      }
    }

    const firstPhone = seenPhone.get(data.guardianPhone);
    if (firstPhone) {
      // Not an error: siblings legitimately share a guardian.
      seenPhone.set(data.guardianPhone, firstPhone);
    } else {
      seenPhone.set(data.guardianPhone, row);
    }
  }

  const admissionNumbers = [...seenAdmission.keys()];
  if (admissionNumbers.length > 0) {
    const clashes = await prisma.student.findMany({
      where: { admissionNo: { in: admissionNumbers } },
      select: { admissionNo: true },
    });
    for (const clash of clashes) {
      const row = seenAdmission.get(clash.admissionNo);
      if (row) {
        issues.push({
          row,
          field: 'admissionNo',
          message: 'A child with this admission number already exists',
        });
      }
    }
  }

  const report: ImportReport = {
    totalRows: input.rows.length,
    validRows: parsed.length,
    issues,
    applied: false,
    createdStudents: 0,
    createdGuardians: 0,
  };

  // Dry run, or something is wrong: report and change nothing.
  if (!input.commit || issues.length > 0) {
    return report;
  }

  const guardianPasswordHash = await hashPassword(input.guardianPassword);
  let createdGuardians = 0;

  await prisma.$transaction(async (tx) => {
    // Guardians are keyed on phone, so siblings in the same file share one
    // account rather than creating a duplicate parent per child.
    const guardianByPhone = new Map<string, string>();

    for (const { data } of parsed) {
      let parentProfileId = guardianByPhone.get(data.guardianPhone);

      if (!parentProfileId) {
        const existingUser = await tx.user.findFirst({
          where: { schoolId, phone: data.guardianPhone, role: 'PARENT' },
          include: { parentProfile: { select: { id: true } } },
        });

        if (existingUser?.parentProfile) {
          parentProfileId = existingUser.parentProfile.id;
        } else {
          const user = await tx.user.create({
            data: {
              schoolId,
              scopeKey: schoolId,
              name: data.guardianName,
              phone: data.guardianPhone,
              email: data.guardianEmail || null,
              passwordHash: guardianPasswordHash,
              role: 'PARENT',
              status: 'ACTIVE',
              mustChangePassword: true,
            },
          });
          const profile = await tx.parentProfile.create({
            data: { userId: user.id, schoolId, relation: 'GUARDIAN' },
          });
          parentProfileId = profile.id;
          createdGuardians += 1;
        }

        guardianByPhone.set(data.guardianPhone, parentProfileId);
      }

      const admissionNo =
        data.admissionNo ??
        (await nextDocumentNumber(tx, {
          schoolId,
          kind: 'ADMISSION',
          academicYearId: null,
          defaultPrefix: 'ADM-',
        }));

      const student = await tx.student.create({
        data: {
          schoolId,
          admissionNo,
          admissionDate: new Date(),
          firstName: data.firstName,
          lastName: data.lastName ?? null,
          dateOfBirth: data.dateOfBirth,
          gender: data.gender,
          status: 'ACTIVE',
        },
      });

      await tx.studentGuardian.create({
        data: { schoolId, studentId: student.id, parentProfileId, isPrimary: true },
      });

      await tx.studentEnrolment.create({
        data: {
          schoolId,
          studentId: student.id,
          academicYearId: classroom.academicYearId,
          classroomId: classroom.id,
          rollNo: data.rollNo ?? null,
          status: 'ACTIVE',
        },
      });
    }
  });

  report.applied = true;
  report.createdStudents = parsed.length;
  report.createdGuardians = createdGuardians;

  await writeAuditLog({
    action: 'STUDENTS_IMPORTED',
    entity: 'Student',
    entityId: input.classroomId,
    schoolId,
    actorUserId,
    metadata: {
      classroomId: input.classroomId,
      students: report.createdStudents,
      guardians: report.createdGuardians,
    },
  });

  return report;
}
