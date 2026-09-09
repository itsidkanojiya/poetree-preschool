import type {
  ListRegistrationsQuery,
  Paginated,
  RegistrationSummary,
  SubmitRegistrationInput,
  SubmitRegistrationResponse,
} from '@poetree/shared';
import type { Prisma } from '@prisma/client';
import { prisma, prismaUnscoped } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { hashPassword } from '../lib/password.js';
import { isSchoolUsable } from './schoolAccess.service.js';
import { writeAuditLog } from './audit.service.js';

/**
 * A family asking their school for access, and the school deciding.
 *
 * Two halves with two different clients, and the split is deliberate:
 *
 *  - [submitRegistration] runs on a public route with no token, so there is no
 *    request context and the scoped client would throw. It uses
 *    `prismaUnscoped` with a `schoolId` resolved from the school code in the
 *    path — never from anything the caller sent.
 *  - everything else runs inside a signed-in school admin's context, so it uses
 *    the scoped client and a request for another school's row is simply not
 *    found.
 */

const registrationInclude = {
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      photoFileId: true,
      avatarUrl: true,
      enrolments: {
        where: { status: 'ACTIVE' as const },
        take: 1,
        orderBy: { enrolledOn: 'desc' as const },
        select: {
          classroom: {
            select: { section: true, classLevel: { select: { name: true } } },
          },
        },
      },
    },
  },
  reviewedBy: { select: { name: true } },
} satisfies Prisma.ParentRegistrationInclude;

type RegistrationRow = Prisma.ParentRegistrationGetPayload<{
  include: typeof registrationInclude;
}>;

function toSummary(row: RegistrationRow): RegistrationSummary {
  const classroom = row.student.enrolments[0]?.classroom;

  return {
    id: row.id,
    status: row.status,

    guardianName: row.guardianName,
    relation: row.relation,
    phone: row.phone,
    email: row.email,
    address: row.address,

    admissionNo: row.admissionNo,
    studentName: row.studentName,
    fatherName: row.fatherName,
    motherName: row.motherName,
    bloodGroup: row.bloodGroup,
    emergencyContactName: row.emergencyContactName,
    emergencyContactPhone: row.emergencyContactPhone,

    student: {
      id: row.student.id,
      name: [row.student.firstName, row.student.lastName].filter(Boolean).join(' '),
      admissionNo: row.student.admissionNo,
      classroom: classroom
        ? `${classroom.classLevel.name} — ${classroom.section}`
        : null,
      photoUrl: row.student.photoFileId
        ? `/api/v1/files/${row.student.photoFileId}`
        : row.student.avatarUrl,
    },

    submittedAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewedBy: row.reviewedBy?.name ?? null,
    rejectionReason: row.rejectionReason,
  };
}

/* -------------------------------------------------------------------------- */
/* The public half                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A parent's own request to join, from the app, with nobody signed in.
 *
 * It claims a child the school has already enrolled. The admission number is
 * what makes that a claim rather than an application: the school issued it, so
 * a family holding one is a family the school has already met.
 *
 * Note what this tells a stranger. A wrong admission number gets a plain "we
 * could not find that", which does let somebody with a list of guessed numbers
 * learn which ones exist. The alternative — refusing to say — leaves a parent
 * who mistyped one digit with no way to work out what is wrong, which is the
 * more likely person by a very long way. The rate limiter on the route is what
 * makes the trade acceptable.
 */
export async function submitRegistration(
  schoolCode: string,
  input: SubmitRegistrationInput,
): Promise<SubmitRegistrationResponse> {
  const school = await prismaUnscoped.school.findUnique({
    where: { code: schoolCode },
    select: { id: true, name: true, status: true },
  });
  if (!school) throw ApiError.notFound('School not found');

  // A school whose plan has lapsed cannot take on new families. Said plainly
  // rather than accepted and left in a queue nobody will ever open.
  if (!isSchoolUsable(school.status)) {
    throw ApiError.schoolSuspended(
      `${school.name} is not accepting registrations at the moment. Please contact the school.`,
    );
  }

  const student = await prismaUnscoped.student.findFirst({
    where: {
      schoolId: school.id,
      admissionNo: input.admissionNo,
      deletedAt: null,
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!student) {
    throw ApiError.notFound(
      'We could not find a child with that admission number at this school. ' +
        'Check the number on your child’s records, or ask the school office.',
    );
  }

  // Already has an account: they want to sign in, not register. Saying so is
  // more use than "phone already taken".
  const existing = await prismaUnscoped.user.findFirst({
    where: {
      schoolId: school.id,
      deletedAt: null,
      OR: [{ phone: input.phone }, ...(input.email ? [{ email: input.email }] : [])],
    },
    select: { id: true },
  });
  if (existing) {
    throw ApiError.conflict(
      'There is already an account with that phone number at this school. ' +
        'Try signing in, or ask the office to reset your password.',
    );
  }

  const waiting = await prismaUnscoped.parentRegistration.findFirst({
    where: { schoolId: school.id, phone: input.phone, status: 'PENDING' },
    select: { id: true },
  });
  if (waiting) {
    throw ApiError.conflict(
      'A request from this phone number is already waiting for the school to check it.',
    );
  }

  const registration = await prismaUnscoped.parentRegistration.create({
    data: {
      schoolId: school.id,
      studentId: student.id,
      admissionNo: input.admissionNo,
      studentName: input.studentName,

      guardianName: input.guardianName,
      relation: input.relation,
      phone: input.phone,
      email: input.email ?? null,
      // Hashed here, the moment it arrives. Nothing downstream ever sees the
      // password the family chose.
      passwordHash: await hashPassword(input.password),
      address: input.address ?? null,

      fatherName: input.fatherName ?? null,
      motherName: input.motherName ?? null,
      bloodGroup: input.bloodGroup ?? null,
      emergencyContactName: input.emergencyContactName ?? null,
      emergencyContactPhone: input.emergencyContactPhone ?? null,
    },
    select: { id: true },
  });

  await writeAuditLog({
    action: 'REGISTRATION_SUBMITTED',
    entity: 'ParentRegistration',
    entityId: registration.id,
    schoolId: school.id,
    // Nobody is signed in. The actor is the family, who has no account yet.
    actorUserId: null,
    metadata: { phone: input.phone, admissionNo: input.admissionNo },
  });

  return {
    status: 'PENDING',
    message:
      'Thank you. Your registration has been sent to the school. ' +
      'You will be able to sign in once they have approved it.',
  };
}

/**
 * What to tell somebody signing in who has no account.
 *
 * Called from the login path when no user matched, so that a family waiting on
 * the school is told that, rather than "invalid password" — which reads as
 * their own mistake and sends them round the loop again.
 *
 * Unscoped and by identifier only, exactly as the login lookup itself is: there
 * is no context at sign-in time.
 */
export async function registrationAwaiting(
  identifier: string,
  schoolCode?: string,
): Promise<{ status: 'PENDING' | 'REJECTED'; schoolName: string; reason: string | null } | null> {
  const looksLikeEmail = identifier.includes('@');

  const row = await prismaUnscoped.parentRegistration.findFirst({
    where: {
      ...(looksLikeEmail ? { email: identifier.toLowerCase() } : { phone: identifier }),
      status: { in: ['PENDING', 'REJECTED'] },
      ...(schoolCode ? { school: { code: schoolCode } } : {}),
    },
    // The most recent word on it. A family rejected once and re-registering is
    // waiting again, and should be told so.
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: {
      status: true,
      rejectionReason: true,
      school: { select: { name: true } },
    },
  });

  if (!row) return null;

  return {
    status: row.status === 'PENDING' ? 'PENDING' : 'REJECTED',
    schoolName: row.school.name,
    reason: row.rejectionReason,
  };
}

/* -------------------------------------------------------------------------- */
/* The school's half                                                          */
/* -------------------------------------------------------------------------- */

export async function listRegistrations(
  query: ListRegistrationsQuery,
): Promise<Paginated<RegistrationSummary>> {
  const where: Prisma.ParentRegistrationWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { guardianName: { contains: query.search } },
            { studentName: { contains: query.search } },
            { phone: { contains: query.search } },
            { admissionNo: { contains: query.search } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.parentRegistration.findMany({
      where,
      include: registrationInclude,
      // Waiting first, then newest: the queue is a to-do list, not an archive.
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.parentRegistration.count({ where }),
  ]);

  return {
    items: rows.map(toSummary),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/** How many are waiting, for the badge on the nav. */
export async function pendingRegistrationCount(): Promise<number> {
  return prisma.parentRegistration.count({ where: { status: 'PENDING' } });
}

/**
 * The school says yes, and the account comes into existence.
 *
 * The same three rows `createParent` writes — User, ParentProfile, and the
 * guardian link — except the password hash was chosen by the family weeks ago
 * and has been sitting on the registration ever since.
 *
 * It also fills gaps on the child: blood group and emergency contact are
 * written only where the school holds nothing. A parent's word is better than
 * an empty column and worse than the office's own record, and this is the only
 * ordering of those two that is true both ways round.
 */
export async function approveRegistration(
  registrationId: string,
  actorUserId: string,
): Promise<RegistrationSummary> {
  const schoolId = requireSchoolId();

  const registration = await prisma.parentRegistration.findUnique({
    where: { id: registrationId },
    include: registrationInclude,
  });
  if (!registration) throw ApiError.notFound('Registration not found');

  if (registration.status !== 'PENDING') {
    throw ApiError.conflict(
      registration.status === 'APPROVED'
        ? 'This registration has already been approved.'
        : 'This registration was turned down. Ask the family to register again.',
    );
  }

  // Checked again at approval, not only at submission. Weeks can pass, and the
  // office may have created the account by hand in the meantime.
  const clash = await prisma.user.findFirst({
    where: {
      OR: [
        { phone: registration.phone },
        ...(registration.email ? [{ email: registration.email }] : []),
      ],
    },
    select: { id: true, deletedAt: true },
  });
  if (clash) {
    throw ApiError.conflict(
      clash.deletedAt
        ? 'That phone number belonged to an account that was removed. The office will need to restore it rather than approve this.'
        : 'An account with that phone number already exists at your school.',
    );
  }

  const student = await prisma.student.findFirst({
    where: { id: registration.studentId },
    select: {
      id: true,
      bloodGroup: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
    },
  });
  if (!student) throw ApiError.notFound('The child on this registration is no longer here');

  const userId = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        schoolId,
        scopeKey: schoolId,
        name: registration.guardianName,
        email: registration.email,
        phone: registration.phone,
        // Their own password, chosen when they registered. They are not made to
        // change it: nobody else has ever seen it.
        passwordHash: registration.passwordHash,
        role: 'PARENT',
        status: 'ACTIVE',
      },
    });

    const profile = await tx.parentProfile.create({
      data: {
        userId: user.id,
        schoolId,
        relation: registration.relation,
        address: registration.address,
      },
    });

    await tx.studentGuardian.create({
      data: {
        schoolId,
        studentId: registration.studentId,
        parentProfileId: profile.id,
        relation: registration.relation,
        isEmergencyContact: Boolean(registration.emergencyContactPhone),
      },
    });

    // Only where the school holds nothing. Never over the office's own record.
    const fill: Prisma.StudentUpdateInput = {};
    if (!student.bloodGroup && registration.bloodGroup) {
      fill.bloodGroup = registration.bloodGroup;
    }
    if (!student.emergencyContactName && registration.emergencyContactName) {
      fill.emergencyContactName = registration.emergencyContactName;
    }
    if (!student.emergencyContactPhone && registration.emergencyContactPhone) {
      fill.emergencyContactPhone = registration.emergencyContactPhone;
    }
    if (Object.keys(fill).length > 0) {
      await tx.student.update({ where: { id: student.id }, data: fill });
    }

    await tx.parentRegistration.update({
      where: { id: registrationId },
      data: { status: 'APPROVED', reviewedById: actorUserId, reviewedAt: new Date() },
    });

    return user.id;
  });

  // After the transaction, as createParent does. The audit log is written
  // through the unscoped client so that a tenant filter can never suppress it,
  // which also means it was never going to join a scoped transaction.
  await writeAuditLog({
    action: 'REGISTRATION_APPROVED',
    entity: 'ParentRegistration',
    entityId: registrationId,
    schoolId,
    actorUserId,
    after: { userId, studentId: registration.studentId },
  });

  const approved = await prisma.parentRegistration.findUniqueOrThrow({
    where: { id: registrationId },
    include: registrationInclude,
  });
  return toSummary(approved);
}

/**
 * The school says no.
 *
 * The row stays. A family will ring the office about it, and "we turned that
 * down on the 3rd because the admission number was somebody else's child" is
 * only answerable if the refusal was kept.
 */
export async function rejectRegistration(
  registrationId: string,
  reason: string | undefined,
  actorUserId: string,
): Promise<RegistrationSummary> {
  const schoolId = requireSchoolId();

  const registration = await prisma.parentRegistration.findUnique({
    where: { id: registrationId },
    select: { id: true, status: true },
  });
  if (!registration) throw ApiError.notFound('Registration not found');

  if (registration.status !== 'PENDING') {
    throw ApiError.conflict('This registration has already been decided.');
  }

  await prisma.parentRegistration.update({
    where: { id: registrationId },
    data: {
      status: 'REJECTED',
      reviewedById: actorUserId,
      reviewedAt: new Date(),
      rejectionReason: reason ?? null,
    },
  });

  await writeAuditLog({
    action: 'REGISTRATION_REJECTED',
    entity: 'ParentRegistration',
    entityId: registrationId,
    schoolId,
    actorUserId,
    after: { reason: reason ?? null },
  });

  const rejected = await prisma.parentRegistration.findUniqueOrThrow({
    where: { id: registrationId },
    include: registrationInclude,
  });
  return toSummary(rejected);
}
