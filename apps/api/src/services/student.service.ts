import type { Prisma } from '@prisma/client';
import type {
  AddGuardianInput,
  CreateStudentInput,
  ListStudentsQuery,
  Paginated,
  StudentChange,
  StudentSummary,
  UpdateGuardianInput,
  UpdateStudentInput,
} from '@poetree/shared';
import { prisma, prismaUnscoped } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { paginate, toSkipTake } from '../lib/pagination.js';
import { writeAuditLog } from './audit.service.js';
import { assertCanReadStudent } from './scope.service.js';
import { getPlanLimits } from './plan.service.js';
import { studentName } from '../lib/names.js';
import { hashPassword } from '../lib/password.js';
import { assertNoAccount, auditParentCreated, createParentRecords } from './parent.service.js';

/**
 * A student's class and roll number live on their enrolment for the current
 * academic year, never on the student record itself. That is what lets a child
 * be promoted without overwriting last year's history — see docs/architecture.md.
 */
const studentInclude = {
  enrolments: {
    where: { status: 'ACTIVE' as const },
    orderBy: { enrolledOn: 'desc' as const },
    take: 1,
    include: {
      academicYear: { select: { id: true, name: true, isCurrent: true } },
      classroom: {
        include: { classLevel: { select: { code: true, name: true } } },
      },
    },
  },
  // The registration the school verified the child through, if any.
  registrations: {
    where: { status: 'APPROVED' as const },
    orderBy: { reviewedAt: 'desc' as const },
    take: 1,
    select: { reviewedAt: true, reviewedBy: { select: { name: true } } },
  },
  // Only parents the school has not removed: a removed parent's link is kept,
  // inert, for restoring them, but they are nobody's guardian meanwhile.
  guardians: {
    where: { parentProfile: { removedAt: null } },
    // The main contact first, then in the order they were linked.
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
    include: {
      parentProfile: {
        select: { id: true, userId: true, user: { select: { name: true, phone: true } } },
      },
    },
  },
} satisfies Prisma.StudentInclude;

type StudentRow = Prisma.StudentGetPayload<{ include: typeof studentInclude }>;

function toSummary(
  student: StudentRow,
  removedWith: Map<string, { userId: string; name: string }> = new Map(),
): StudentSummary {
  const enrolment = student.enrolments[0] ?? null;

  return {
    id: student.id,
    admissionNo: student.admissionNo,
    firstName: student.firstName,
    middleName: student.middleName,
    lastName: student.lastName,
    fullName: studentName(student),
    dateOfBirth: student.dateOfBirth.toISOString(),
    gender: student.gender,
    rollNo: enrolment?.rollNo ?? null,
    // The uploaded photograph wins over a typed-in URL: somebody who uploads
    // one has just said which they mean. Authenticated, unlike a school logo —
    // this is a picture of a four-year-old.
    avatarUrl: student.photoFileId ? `/api/v1/files/${student.photoFileId}` : student.avatarUrl,
    bloodGroup: student.bloodGroup,
    status: student.status,
    classroom: enrolment
      ? {
          id: enrolment.classroom.id,
          label: `${enrolment.classroom.classLevel.name} — ${enrolment.classroom.section}`,
          standard: enrolment.classroom.classLevel.name,
          section: enrolment.classroom.section,
          academicYear: enrolment.academicYear.name,
        }
      : null,
    guardians: student.guardians.map((link) => ({
      parentProfileId: link.parentProfileId,
      userId: link.parentProfile.userId,
      name: link.parentProfile.user.name,
      phone: link.parentProfile.user.phone,
      relation: link.relation,
      isPrimary: link.isPrimary,
    })),
    addressLine1: student.addressLine1,
    addressLine2: student.addressLine2,
    city: student.city,
    postalCode: student.postalCode,
    emergencyContactName: student.emergencyContactName,
    emergencyContactPhone: student.emergencyContactPhone,
    allergies: student.allergies,
    medicalNotes: student.medicalNotes,
    verification: student.registrations[0]?.reviewedAt
      ? {
          verifiedAt: student.registrations[0].reviewedAt.toISOString(),
          verifiedBy: student.registrations[0].reviewedBy?.name ?? null,
        }
      : null,
    removedAt: student.deletedAt?.toISOString() ?? null,
    removedWithParent: student.removedWithParentId
      ? (removedWith.get(student.removedWithParentId) ?? null)
      : null,
    createdAt: student.createdAt.toISOString(),
  };
}

/** Who each removed child went with, by parent profile, for a page of children. */
async function removedWithParents(
  rows: StudentRow[],
): Promise<Map<string, { userId: string; name: string }>> {
  const ids = [...new Set(rows.map((row) => row.removedWithParentId).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const profiles = await prisma.parentProfile.findMany({
    where: { id: { in: ids as string[] } },
    select: { id: true, userId: true, user: { select: { name: true } } },
  });
  return new Map(profiles.map((p) => [p.id, { userId: p.userId, name: p.user.name }]));
}

/** The child's own fields the office may change, compared one by one. */
const EDITABLE_FIELDS = [
  'firstName',
  'middleName',
  'lastName',
  'dateOfBirth',
  'gender',
  'avatarUrl',
  'bloodGroup',
  'status',
  'addressLine1',
  'addressLine2',
  'city',
  'postalCode',
  'emergencyContactName',
  'emergencyContactPhone',
  'allergies',
  'medicalNotes',
] as const;

/** A value as the change log shows it: a date as its day, nothing as null. */
function shown(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/** "Nursery — A", for the change log. */
async function classroomLabel(classroomId: string | null | undefined): Promise<string | null> {
  if (!classroomId) return null;
  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId },
    select: { section: true, classLevel: { select: { name: true } } },
  });
  return classroom ? `${classroom.classLevel.name} — ${classroom.section}` : null;
}

/** The year new admissions are enrolled into. */
export async function currentAcademicYearId(): Promise<string | null> {
  const year = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });
  return year?.id ?? null;
}

export async function listStudents(query: ListStudentsQuery): Promise<Paginated<StudentSummary>> {
  // Removed children only on request, for the screen that puts them back.
  const where: Prisma.StudentWhereInput =
    query.removed === 'true' ? { deletedAt: { not: null } } : {};
  if (query.status) where.status = query.status;
  // Filtering by classroom now goes through the enrolment, not the student.
  if (query.classroomId) {
    where.enrolments = { some: { classroomId: query.classroomId, status: 'ACTIVE' } };
  }
  if (query.search) {
    const search = query.search;
    where.OR = [
      { firstName: { contains: search } },
      { middleName: { contains: search } },
      { lastName: { contains: search } },
      { admissionNo: { contains: search } },
      // The office is as likely to have the parent on the phone as the child's
      // name in front of them.
      {
        guardians: {
          some: {
            parentProfile: {
              removedAt: null,
              user: {
                OR: [
                  { name: { contains: search } },
                  { phone: { contains: search } },
                  { email: { contains: search } },
                ],
              },
            },
          },
        },
      },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.student.findMany({
      where,
      include: studentInclude,
      orderBy: [{ firstName: 'asc' }],
      ...toSkipTake(query),
    }),
    prisma.student.count({ where }),
  ]);

  const removedWith = await removedWithParents(rows);
  return paginate(
    rows.map((row) => toSummary(row, removedWith)),
    total,
    query,
  );
}

/** One child — a removed one too, so the portal can show them and put them back. */
export async function getStudent(studentId: string): Promise<StudentSummary> {
  const student = await prisma.student.findFirst({
    where: { id: studentId, deletedAt: undefined },
    include: studentInclude,
  });
  // Another school's student is reported missing — never "forbidden", which
  // would confirm the id exists somewhere.
  if (!student) throw ApiError.notFound('Student not found');
  return toSummary(student, await removedWithParents([student]));
}

async function assertGuardiansBelongToSchool(parentProfileIds: string[]): Promise<void> {
  const found = await prisma.parentProfile.findMany({
    where: { id: { in: parentProfileIds }, removedAt: null },
    select: { id: true },
  });

  if (found.length !== parentProfileIds.length) {
    const known = new Set(found.map((p) => p.id));
    throw ApiError.badRequest('One or more guardians do not exist at your school', {
      unknown: parentProfileIds.filter((id) => !known.has(id)),
    });
  }
}

async function assertClassroomBelongsToSchool(classroomId: string): Promise<void> {
  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId },
    select: { id: true },
  });
  if (!classroom) throw ApiError.badRequest('That classroom does not exist at your school');
}

export async function assertStudentSeatAvailable(schoolId: string): Promise<void> {
  const limits = await getPlanLimits(schoolId);
  if (limits?.maxStudents == null) return;

  const current = await prisma.student.count({ where: { status: 'ACTIVE' } });
  if (current >= limits.maxStudents) {
    throw ApiError.planLimitExceeded(
      `Your plan allows ${limits.maxStudents} students. Contact Poetree Publication to upgrade.`,
      { limit: limits.maxStudents, current },
    );
  }
}

export async function createStudent(
  input: CreateStudentInput,
  actorUserId: string,
): Promise<StudentSummary> {
  const schoolId = requireSchoolId();

  await assertStudentSeatAvailable(schoolId);
  if (input.guardians.length > 0) {
    await assertGuardiansBelongToSchool(input.guardians.map((g) => g.parentProfileId));
  }
  if (input.classroomId) await assertClassroomBelongsToSchool(input.classroomId);
  // A new parent typed in with the child: refused, before anything is
  // written, if the school already has someone with that phone or email.
  const newParent = input.newParent;
  if (newParent) await assertNoAccount({ phone: newParent.phone, email: newParent.email });
  const parentPasswordHash = newParent ? await hashPassword(newParent.password) : null;

  const duplicate = await prisma.student.findFirst({
    where: { admissionNo: input.admissionNo },
    select: { id: true },
  });
  if (duplicate) {
    throw ApiError.conflict(`Admission number "${input.admissionNo}" is already in use`, {
      field: 'admissionNo',
    });
  }

  // A classroom means an enrolment, and an enrolment needs a year to belong to.
  const academicYearId = input.classroomId ? await currentAcademicYearId() : null;
  if (input.classroomId && !academicYearId) {
    throw ApiError.badRequest(
      'Set a current academic year before assigning a child to a classroom.',
    );
  }

  let newParentUserId: string | null = null;
  const studentId = await prisma.$transaction(async (tx) => {
    let links = input.guardians.map((g) => ({ ...g, isPrimary: newParent ? false : g.isPrimary }));
    if (newParent) {
      const created = await createParentRecords(tx, schoolId, newParent, parentPasswordHash!);
      newParentUserId = created.userId;
      links = [
        { parentProfileId: created.profileId, relation: newParent.relation, isPrimary: true },
        ...links,
      ];
    }
    // Somebody is the main contact, even when nobody was ticked.
    if (!links.some((g) => g.isPrimary)) links[0] = { ...links[0]!, isPrimary: true };

    const student = await tx.student.create({
      data: {
        schoolId,
        admissionNo: input.admissionNo,
        admissionDate: new Date(),
        firstName: input.firstName,
        middleName: input.middleName ?? null,
        lastName: input.lastName ?? null,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        avatarUrl: input.avatarUrl ?? null,
        bloodGroup: input.bloodGroup ?? null,
        status: 'ACTIVE',
      },
    });

    // Nested writes are not rewritten by the isolation extension, so schoolId is
    // set explicitly here.
    await tx.studentGuardian.createMany({
      data: links.map((g) => ({
        schoolId,
        studentId: student.id,
        parentProfileId: g.parentProfileId,
        relation: g.relation,
        isPrimary: g.isPrimary,
      })),
    });

    if (input.classroomId && academicYearId) {
      await tx.studentEnrolment.create({
        data: {
          schoolId,
          studentId: student.id,
          academicYearId,
          classroomId: input.classroomId,
          rollNo: input.rollNo ?? null,
          status: 'ACTIVE',
        },
      });
    }

    return student.id;
  });

  await writeAuditLog({
    action: 'STUDENT_CREATED',
    entity: 'Student',
    entityId: studentId,
    schoolId,
    actorUserId,
    metadata: { admissionNo: input.admissionNo },
  });
  if (newParentUserId && newParent) {
    await auditParentCreated(newParentUserId, newParent, actorUserId);
  }

  return getStudent(studentId);
}

export async function updateStudent(
  studentId: string,
  input: UpdateStudentInput,
  actorUserId: string,
): Promise<StudentSummary> {
  const schoolId = requireSchoolId();

  const existing = await prisma.student.findFirst({
    where: { id: studentId },
    include: {
      enrolments: { where: { status: 'ACTIVE' }, take: 1 },
      guardians: {
        where: { parentProfile: { removedAt: null } },
        select: {
          parentProfileId: true,
          parentProfile: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });
  if (!existing) throw ApiError.notFound('Student not found');

  if (input.guardians) {
    await assertGuardiansBelongToSchool(input.guardians.map((g) => g.parentProfileId));
  }
  if (input.classroomId) await assertClassroomBelongsToSchool(input.classroomId);

  const { guardians, classroomId, rollNo, ...fields } = input;
  const enrolment = existing.enrolments[0] ?? null;

  /**
   * What changed, field by field, for the record. Every change is allowed —
   * a verified child's record still needs correcting — and every change is
   * written down: who, when, and from what to what.
   */
  const before: Record<string, string | null> = {};
  const after: Record<string, string | null> = {};
  for (const field of EDITABLE_FIELDS) {
    if (fields[field] === undefined) continue;
    const was = shown(existing[field]);
    const now = shown(fields[field]);
    if (was !== now) {
      before[field] = was;
      after[field] = now;
    }
  }
  // Only what is actually written below: a null class leaves the enrolment as
  // it is, and a roll number needs an enrolment to live on.
  if (classroomId && classroomId !== enrolment?.classroomId) {
    before.classroom = await classroomLabel(enrolment?.classroomId);
    after.classroom = await classroomLabel(classroomId);
  }
  if (
    rollNo !== undefined &&
    (enrolment || classroomId) &&
    shown(rollNo) !== shown(enrolment?.rollNo)
  ) {
    before.rollNo = shown(enrolment?.rollNo);
    after.rollNo = shown(rollNo);
  }
  if (guardians) {
    const was = existing.guardians.map((g) => g.parentProfileId).sort();
    const now = [...new Set(guardians.map((g) => g.parentProfileId))].sort();
    if (was.join() !== now.join()) {
      const names = await prisma.parentProfile.findMany({
        where: { id: { in: now } },
        select: { user: { select: { name: true } } },
      });
      before.guardians =
        existing.guardians.map((g) => g.parentProfile.user.name).join(', ') || null;
      after.guardians = names.map((p) => p.user.name).join(', ') || null;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.student.update({
      where: { id: studentId, schoolId },
      data: {
        firstName: fields.firstName,
        middleName: fields.middleName,
        lastName: fields.lastName,
        dateOfBirth: fields.dateOfBirth,
        gender: fields.gender,
        avatarUrl: fields.avatarUrl,
        bloodGroup: fields.bloodGroup,
        status: fields.status,
        addressLine1: fields.addressLine1,
        addressLine2: fields.addressLine2,
        city: fields.city,
        postalCode: fields.postalCode,
        emergencyContactName: fields.emergencyContactName,
        emergencyContactPhone: fields.emergencyContactPhone,
        allergies: fields.allergies,
        medicalNotes: fields.medicalNotes,
      },
    });

    // Moving a child between sections mid-year updates the existing enrolment;
    // it does not open a second one. Only promotion does that.
    if (classroomId !== undefined || rollNo !== undefined) {
      if (enrolment) {
        await tx.studentEnrolment.update({
          where: { id: enrolment.id },
          data: {
            classroomId: classroomId ?? undefined,
            rollNo: rollNo ?? undefined,
          },
        });
      } else if (classroomId) {
        const academicYearId = await tx.academicYear
          .findFirst({ where: { schoolId, isCurrent: true }, select: { id: true } })
          .then((year) => year?.id ?? null);

        if (!academicYearId) {
          throw ApiError.badRequest(
            'Set a current academic year before assigning a child to a classroom.',
          );
        }

        await tx.studentEnrolment.create({
          data: {
            schoolId,
            studentId,
            academicYearId,
            classroomId,
            rollNo: rollNo ?? null,
            status: 'ACTIVE',
          },
        });
      }
    }

    if (guardians) {
      // Only the links to parents still here: a removed parent's link is kept,
      // inert, so restoring them puts the family back.
      await tx.studentGuardian.deleteMany({
        where: { studentId, schoolId, parentProfile: { removedAt: null } },
      });
      await tx.studentGuardian.createMany({
        data: guardians.map((g) => ({
          schoolId,
          studentId,
          parentProfileId: g.parentProfileId,
          relation: g.relation,
          isPrimary: g.isPrimary,
        })),
      });
    }
  });

  // Nothing different, nothing to record.
  if (Object.keys(after).length > 0) {
    await writeAuditLog({
      action: 'STUDENT_UPDATED',
      entity: 'Student',
      entityId: studentId,
      schoolId,
      actorUserId,
      before,
      after,
      metadata: { fields: Object.keys(after) },
    });
  }

  return getStudent(studentId);
}

/* -------------------------------------------------------------------------- */
/* A child's parents, from the child's page                                   */
/* -------------------------------------------------------------------------- */

/** The child's links to parents still at the school, oldest first. */
async function activeLinks(studentId: string) {
  return prisma.studentGuardian.findMany({
    where: { studentId, parentProfile: { removedAt: null, user: { deletedAt: null } } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      parentProfileId: true,
      isPrimary: true,
      relation: true,
      parentProfile: { select: { user: { select: { name: true } } } },
    },
  });
}

type Link = Awaited<ReturnType<typeof activeLinks>>[number];

const namesOf = (links: Link[]) =>
  links.map((link) => link.parentProfile.user.name).join(', ') || null;
const primaryOf = (links: Link[]) =>
  links.find((link) => link.isPrimary)?.parentProfile.user.name ?? null;

async function childOnRoll(studentId: string) {
  const student = await prisma.student.findFirst({
    where: { id: studentId },
    select: { id: true, firstName: true, middleName: true, lastName: true },
  });
  if (!student) throw ApiError.notFound('Student not found');
  return student;
}

/**
 * Linking a parent to a child: one the school already has, or a new one
 * opened here — the account and the link together, or neither.
 */
export async function addGuardian(
  studentId: string,
  input: AddGuardianInput,
  actorUserId: string,
): Promise<StudentSummary> {
  const schoolId = requireSchoolId();
  await childOnRoll(studentId);
  const links = await activeLinks(studentId);
  if (links.length >= 4) {
    throw ApiError.badRequest('A child can have up to four parents or guardians linked.');
  }

  let passwordHash: string | null = null;
  let name: string;
  if (input.parent) {
    await assertNoAccount({ phone: input.parent.phone, email: input.parent.email });
    passwordHash = await hashPassword(input.parent.password);
    name = input.parent.name;
  } else {
    await assertGuardiansBelongToSchool([input.parentProfileId!]);
    if (links.some((link) => link.parentProfileId === input.parentProfileId)) {
      throw ApiError.conflict('That parent is already linked to this child.');
    }
    const existing = await prisma.parentProfile.findFirstOrThrow({
      where: { id: input.parentProfileId },
      select: { user: { select: { name: true } } },
    });
    name = existing.user.name;
  }

  // The first parent, or one asked to be, is the main contact.
  const primary = input.isPrimary || !links.some((link) => link.isPrimary);

  const createdUserId = await prisma.$transaction(async (tx) => {
    let profileId = input.parentProfileId ?? null;
    let userId: string | null = null;
    if (input.parent) {
      const created = await createParentRecords(tx, schoolId, input.parent, passwordHash!);
      profileId = created.profileId;
      userId = created.userId;
    }
    if (primary) {
      await tx.studentGuardian.updateMany({
        where: { studentId, schoolId },
        data: { isPrimary: false },
      });
    }
    await tx.studentGuardian.create({
      data: {
        schoolId,
        studentId,
        parentProfileId: profileId!,
        relation: input.relation,
        isPrimary: primary,
      },
    });
    return userId;
  });

  if (createdUserId && input.parent) {
    await auditParentCreated(createdUserId, input.parent, actorUserId);
  }

  const before: Record<string, string | null> = { guardians: namesOf(links) };
  const after: Record<string, string | null> = {
    guardians: [namesOf(links), name].filter(Boolean).join(', '),
  };
  if (primary && primaryOf(links) !== name) {
    before.primaryGuardian = primaryOf(links);
    after.primaryGuardian = name;
  }
  await writeAuditLog({
    action: 'STUDENT_UPDATED',
    entity: 'Student',
    entityId: studentId,
    schoolId,
    actorUserId,
    before,
    after,
    metadata: { fields: Object.keys(after), newParent: Boolean(input.parent) },
  });

  return getStudent(studentId);
}

/** A linked parent's relation to the child, or making them the main contact. */
export async function updateGuardian(
  studentId: string,
  parentProfileId: string,
  input: UpdateGuardianInput,
  actorUserId: string,
): Promise<StudentSummary> {
  const schoolId = requireSchoolId();
  await childOnRoll(studentId);
  const links = await activeLinks(studentId);
  const link = links.find((l) => l.parentProfileId === parentProfileId);
  if (!link) throw ApiError.notFound('That parent is not linked to this child');

  const name = link.parentProfile.user.name;
  const before: Record<string, string | null> = {};
  const after: Record<string, string | null> = {};

  await prisma.$transaction(async (tx) => {
    if (input.isPrimary && !link.isPrimary) {
      await tx.studentGuardian.updateMany({
        where: { studentId, schoolId },
        data: { isPrimary: false },
      });
      await tx.studentGuardian.update({ where: { id: link.id }, data: { isPrimary: true } });
      before.primaryGuardian = primaryOf(links);
      after.primaryGuardian = name;
    }
    if (input.relation && input.relation !== link.relation) {
      await tx.studentGuardian.update({
        where: { id: link.id },
        data: { relation: input.relation },
      });
      before.guardianRelation = `${name}: ${link.relation}`;
      after.guardianRelation = `${name}: ${input.relation}`;
    }
  });

  if (Object.keys(after).length > 0) {
    await writeAuditLog({
      action: 'STUDENT_UPDATED',
      entity: 'Student',
      entityId: studentId,
      schoolId,
      actorUserId,
      before,
      after,
      metadata: { fields: Object.keys(after) },
    });
  }

  return getStudent(studentId);
}

/**
 * Unlinking a parent from one child. Their account and their other children
 * are not touched. Never the last one: a child on the roll always has a parent
 * here, so the last is replaced first — or the child removed, if they left.
 */
export async function removeGuardian(
  studentId: string,
  parentProfileId: string,
  actorUserId: string,
): Promise<StudentSummary> {
  const schoolId = requireSchoolId();
  const student = await childOnRoll(studentId);
  const links = await activeLinks(studentId);
  const link = links.find((l) => l.parentProfileId === parentProfileId);
  if (!link) throw ApiError.notFound('That parent is not linked to this child');

  const name = link.parentProfile.user.name;
  if (links.length === 1) {
    const child = studentName(student);
    throw ApiError.conflict(
      `${name} is ${child}’s only parent here. Link another parent first, or remove ${child} if they have left.`,
    );
  }

  const remaining = links.filter((l) => l.id !== link.id);
  const heir = link.isPrimary ? remaining[0]! : null;

  await prisma.$transaction(async (tx) => {
    await tx.studentGuardian.delete({ where: { id: link.id } });
    if (heir) {
      await tx.studentGuardian.update({ where: { id: heir.id }, data: { isPrimary: true } });
    }
  });

  const before: Record<string, string | null> = { guardians: namesOf(links) };
  const after: Record<string, string | null> = { guardians: namesOf(remaining) };
  if (heir) {
    before.primaryGuardian = name;
    after.primaryGuardian = heir.parentProfile.user.name;
  }
  await writeAuditLog({
    action: 'STUDENT_UPDATED',
    entity: 'Student',
    entityId: studentId,
    schoolId,
    actorUserId,
    before,
    after,
    metadata: { fields: Object.keys(after), unlinked: parentProfileId },
  });

  return getStudent(studentId);
}

/**
 * Everything recorded about a child's record, newest first: each change with
 * who made it and each field from what to what, the corrections the office
 * made to the family's registration while it waited, and its verification.
 */
export async function studentHistory(studentId: string): Promise<StudentChange[]> {
  const schoolId = requireSchoolId();
  const student = await prisma.student.findFirst({
    where: { id: studentId, deletedAt: undefined },
    select: { id: true, registrations: { select: { id: true } } },
  });
  if (!student) throw ApiError.notFound('Student not found');

  const rows = await prismaUnscoped.auditLog.findMany({
    where: {
      schoolId,
      OR: [
        { entity: 'Student', entityId: studentId },
        {
          entity: 'ParentRegistration',
          entityId: { in: student.registrations.map((r) => r.id) },
          action: { in: ['REGISTRATION_UPDATED', 'REGISTRATION_APPROVED'] },
        },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      action: true,
      createdAt: true,
      before: true,
      after: true,
      actor: { select: { name: true } },
    },
  });

  const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return rows.map((row) => {
    const changed = row.action.endsWith('_UPDATED');
    const was = asRecord(row.before);
    const now = asRecord(row.after);
    return {
      id: row.id,
      action: row.action,
      at: row.createdAt.toISOString(),
      by: row.actor?.name ?? null,
      changes: changed
        ? Object.keys(now).map((field) => ({
            field,
            before: shown(was[field]),
            after: shown(now[field]),
          }))
        : [],
    };
  });
}

/**
 * Points a child's record at an already-uploaded photograph.
 *
 * Two steps like every other attachment: POST /files owns the bytes, the
 * sniffing, the caps and the EXIF stripping, and this records the choice.
 */
export async function setStudentPhoto(
  studentId: string,
  fileId: string | null,
  actorUserId: string,
): Promise<StudentSummary> {
  const schoolId = requireSchoolId();

  const student = await prisma.student.findFirst({
    where: { id: studentId },
    select: { id: true, photoFileId: true },
  });
  if (!student) throw ApiError.notFound('Student not found');

  if (fileId) {
    // Through the scoped client, so a file from another school is simply not
    // there — a child cannot be given a photograph from somebody else's roll.
    const file = await prisma.fileObject.findFirst({
      where: { id: fileId, deletedAt: null },
      select: { id: true, mimeType: true },
    });
    if (!file) throw ApiError.badRequest('That file does not exist');
    if (!file.mimeType.startsWith('image/')) {
      throw ApiError.badRequest('A photograph has to be a picture');
    }
  }

  await prisma.student.update({
    where: { id: studentId },
    data: { photoFileId: fileId },
  });

  await writeAuditLog({
    action: fileId ? 'STUDENT_DOCUMENT_ATTACHED' : 'STUDENT_DOCUMENT_REMOVED',
    entity: 'Student',
    entityId: studentId,
    schoolId,
    actorUserId,
    before: { photoFileId: student.photoFileId },
    after: { photoFileId: fileId },
  });

  return getStudent(studentId);
}

/**
 * A parent setting their own child's photograph from the app.
 *
 * Only their own child — anything else is "not found", as everywhere a parent
 * reaches for a child that is not theirs — and only a picture they uploaded
 * themselves, so a file id seen somewhere else cannot be pinned to a child.
 * JPEG or PNG only: the photograph goes on the ID card, and the card cannot
 * print a WebP.
 */
export async function setOwnChildPhoto(
  studentId: string,
  fileId: string | null,
  actorUserId: string,
): Promise<void> {
  await assertCanReadStudent(studentId);

  if (fileId) {
    const file = await prisma.fileObject.findFirst({
      where: { id: fileId, deletedAt: null },
      select: { uploadedById: true, mimeType: true },
    });
    if (!file || file.uploadedById !== actorUserId) {
      throw ApiError.badRequest('That file does not exist');
    }
    if (file.mimeType !== 'image/jpeg' && file.mimeType !== 'image/png') {
      throw ApiError.badRequest('A photograph has to be a JPEG or PNG picture');
    }
  }

  await setStudentPhoto(studentId, fileId, actorUserId);
}

/**
 * The school removing a child from its records.
 *
 * Nothing is erased: attendance, fees, homework, report cards and certificates
 * all stay, and so do the totals they add up to. The child leaves their class
 * (the enrolment is closed as withdrawn, today), drops out of every list,
 * roster and parent's app, and can be restored. Their parents' accounts are
 * not touched — a parent with other children carries on with those.
 */
export async function removeStudent(
  studentId: string,
  actorUserId: string,
): Promise<StudentSummary> {
  const schoolId = requireSchoolId();

  const student = await prisma.student.findFirst({
    where: { id: studentId },
    select: { id: true, admissionNo: true, firstName: true, lastName: true, status: true },
  });
  if (!student) throw ApiError.notFound('Student not found');

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.studentEnrolment.updateMany({
      where: { studentId, schoolId, status: 'ACTIVE' },
      data: { status: 'WITHDRAWN', exitedOn: now, exitReason: 'Removed by the school' },
    });
    await tx.student.update({
      where: { id: studentId, schoolId },
      data: { deletedAt: now, status: 'WITHDRAWN' },
    });
  });

  await writeAuditLog({
    action: 'STUDENT_DELETED',
    entity: 'Student',
    entityId: studentId,
    schoolId,
    actorUserId,
    before: { status: student.status },
    metadata: { admissionNo: student.admissionNo, name: student.firstName },
  });

  return getStudent(studentId);
}

/**
 * Putting a removed child back on the roll, with all their history. They come
 * back without a class — the year may have moved on — for the office to place.
 */
export async function restoreStudent(
  studentId: string,
  actorUserId: string,
): Promise<StudentSummary> {
  const schoolId = requireSchoolId();

  const student = await prisma.student.findFirst({
    where: { id: studentId, deletedAt: { not: null } },
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
      removedWithParentId: true,
      _count: { select: { guardians: true } },
    },
  });
  if (!student) throw ApiError.notFound('There is no removed child with that id');

  // Not back on the roll with nobody to reach: a child whose parents here are
  // all removed comes back with a parent, not alone.
  const reachable = await prisma.studentGuardian.count({
    where: { studentId, parentProfile: { removedAt: null, user: { deletedAt: null } } },
  });
  if (student._count.guardians > 0 && reachable === 0) {
    const child = studentName(student);
    const parent = student.removedWithParentId
      ? await prisma.parentProfile.findFirst({
          where: { id: student.removedWithParentId },
          select: { user: { select: { name: true } } },
        })
      : null;
    throw ApiError.conflict(
      parent
        ? `${child} was removed with ${parent.user.name}, their only parent here. Restore ${parent.user.name} — that brings ${child} back too.`
        : `${child} has no parent at the school any more. Restore one of their parents first, then ${child}.`,
    );
  }

  await assertStudentSeatAvailable(schoolId);

  await prisma.student.update({
    where: { id: studentId, schoolId },
    data: { deletedAt: null, status: 'ACTIVE', removedWithParentId: null },
  });

  await writeAuditLog({
    action: 'STUDENT_RESTORED',
    entity: 'Student',
    entityId: studentId,
    schoolId,
    actorUserId,
  });

  return getStudent(studentId);
}
