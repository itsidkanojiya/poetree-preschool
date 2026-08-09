import { prisma } from '../db/prisma.js';
import { getRequestContext } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';

/**
 * Row-level scope, the second half of authorisation.
 *
 * `requirePermission` answers "may this ROLE do this at all". These answer "may
 * THIS user do it to THIS row" — a teacher only reaches their own classrooms, a
 * parent only their own children.
 *
 * Every lookup runs through the tenant-scoped client, so an id belonging to
 * another school does not resolve and the caller gets a 404 rather than a 403.
 * A 403 would confirm the record exists somewhere, which is itself a leak.
 */

/** Classroom ids the signed-in teacher currently holds an assignment for. */
export async function teacherClassroomIds(): Promise<string[]> {
  const context = getRequestContext();
  if (!context) throw ApiError.unauthenticated();

  const assignments = await prisma.classroomTeacher.findMany({
    where: { userId: context.userId, endedOn: null },
    select: { classroomId: true },
  });

  return assignments.map((a) => a.classroomId);
}

/**
 * Throws unless the caller may act on this classroom.
 *
 * School Admins pass — the whole school is theirs. Teachers must hold a live
 * assignment to it.
 */
export async function assertTeacherOwnsClassroom(classroomId: string): Promise<void> {
  const context = getRequestContext();
  if (!context) throw ApiError.unauthenticated();

  if (context.role !== 'TEACHER') return;

  const assignment = await prisma.classroomTeacher.findFirst({
    where: { classroomId, userId: context.userId, endedOn: null },
    select: { id: true },
  });

  if (!assignment) {
    throw ApiError.notFound('Classroom not found');
  }
}

/**
 * Throws unless the caller may see this child.
 *
 * Parents must be a linked guardian. Teachers must teach a classroom the child
 * is currently enrolled in — a teacher has no business reading the roster of a
 * class they do not take.
 */
export async function assertCanReadStudent(studentId: string): Promise<void> {
  const context = getRequestContext();
  if (!context) throw ApiError.unauthenticated();

  if (context.role === 'SCHOOL_ADMIN') return;

  if (context.role === 'PARENT') {
    const link = await prisma.studentGuardian.findFirst({
      where: { studentId, parentProfile: { userId: context.userId } },
      select: { id: true },
    });
    if (!link) throw ApiError.notFound('Student not found');
    return;
  }

  if (context.role === 'TEACHER') {
    const classroomIds = await teacherClassroomIds();
    if (classroomIds.length === 0) throw ApiError.notFound('Student not found');

    const enrolment = await prisma.studentEnrolment.findFirst({
      where: { studentId, classroomId: { in: classroomIds }, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!enrolment) throw ApiError.notFound('Student not found');
    return;
  }

  throw ApiError.forbidden('You do not have access to student records');
}

/** Student ids the signed-in parent is a guardian of. */
export async function guardianStudentIds(): Promise<string[]> {
  const context = getRequestContext();
  if (!context) throw ApiError.unauthenticated();

  const links = await prisma.studentGuardian.findMany({
    where: { parentProfile: { userId: context.userId } },
    select: { studentId: true },
  });

  return links.map((link) => link.studentId);
}
