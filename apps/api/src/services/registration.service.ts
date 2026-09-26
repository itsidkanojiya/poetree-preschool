import type {
  ApproveRegistrationInput,
  ListRegistrationsQuery,
  Paginated,
  RegistrationSummary,
  StudentMatch,
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
import { consumeVerifiedChallenge } from './otp.service.js';
import { nextDocumentNumber } from './sequence.service.js';
import { assertStudentSeatAvailable, currentAcademicYearId } from './student.service.js';
import { studentName } from '../lib/names.js';

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

const studentSelect = {
  id: true,
  firstName: true,
  middleName: true,
  lastName: true,
  admissionNo: true,
  dateOfBirth: true,
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
} satisfies Prisma.StudentSelect;

type StudentRow = Prisma.StudentGetPayload<{ select: typeof studentSelect }>;

function toMatch(student: StudentRow): StudentMatch {
  const classroom = student.enrolments[0]?.classroom;

  return {
    id: student.id,
    name: studentName(student),
    admissionNo: student.admissionNo,
    dateOfBirth: student.dateOfBirth.toISOString(),
    classroom: classroom ? `${classroom.classLevel.name} — ${classroom.section}` : null,
    photoUrl: student.photoFileId ? `/api/v1/files/${student.photoFileId}` : student.avatarUrl,
  };
}

const registrationInclude = {
  student: { select: studentSelect },
  reviewedBy: { select: { name: true } },
} satisfies Prisma.ParentRegistrationInclude;

type RegistrationRow = Prisma.ParentRegistrationGetPayload<{
  include: typeof registrationInclude;
}>;

function toSummary(row: RegistrationRow, matches: StudentMatch[] = []): RegistrationSummary {
  return {
    id: row.id,
    status: row.status,

    guardianName: row.guardianName,
    relation: row.relation,
    phone: row.phone,
    email: row.email,
    address: row.address,

    admissionNo: row.admissionNo,
    motherPhone: row.motherPhone,
    studentName: row.studentName,
    studentDateOfBirth: row.studentDateOfBirth?.toISOString() ?? null,
    fatherName: row.fatherName,
    motherName: row.motherName,
    bloodGroup: row.bloodGroup,
    emergencyContactName: row.emergencyContactName,
    emergencyContactPhone: row.emergencyContactPhone,

    student: row.student ? toMatch(row.student) : null,
    matches,

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
 * It is a request, not a claim. It used to demand the child's admission number
 * and resolve a pupil from it here, which meant a family could only register if
 * the office had already handed them one — the wrong way round for a family
 * joining the school. Nothing is checked against the roll any more, and nothing
 * is created: the office decides which child this is, and issues the number,
 * when it approves.
 *
 * What that costs is a queue anyone can put a row into. What keeps it harmless
 * is that a row grants nothing, the route is rate limited, and somebody in the
 * office reads every one before an account exists.
 */
/**
 * The school a family is registering at, by the code in the path.
 *
 * Shared with the two code-sending routes: a school that cannot take
 * registrations must not be able to send text messages at its own expense
 * either, and three copies of this check would be three chances to disagree.
 */
export async function registeringSchool(
  schoolCode: string,
): Promise<{ id: string; name: string }> {
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

  return { id: school.id, name: school.name };
}

export async function submitRegistration(
  schoolCode: string,
  input: SubmitRegistrationInput,
): Promise<SubmitRegistrationResponse> {
  const school = await registeringSchool(schoolCode);

  // Both answered before any of this was typed. Spent here, so one code cannot
  // open two accounts, and each checked against what is ON the form — a family
  // that proves one number and types another would leave the school ringing a
  // phone nobody had answered for.
  await consumeVerifiedChallenge(school.id, 'PHONE', input.phoneChallengeId, input.phone);
  await consumeVerifiedChallenge(school.id, 'EMAIL', input.emailChallengeId, input.email);

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
      // No child and no number yet. The office decides which pupil this is —
      // one already on the roll, or a record it creates — when it approves.
      studentId: null,
      admissionNo: null,
      studentName: studentName({
        firstName: input.studentFirstName,
        middleName: input.studentMiddleName,
        lastName: input.studentLastName,
      }),
      studentFirstName: input.studentFirstName,
      studentMiddleName: input.studentMiddleName ?? null,
      studentLastName: input.studentLastName ?? null,
      studentDateOfBirth: input.studentDateOfBirth,
      motherPhone: input.motherPhone,

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
    metadata: { phone: input.phone, studentName: input.studentFirstName },
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
      // A school code or a group's code, as at login: the app sends whichever
      // it was built with.
      ...(schoolCode
        ? { school: { OR: [{ code: schoolCode }, { organisation: { code: schoolCode } }] } }
        : {}),
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

  // Only for the rows still waiting: a decided one has its child already, and
  // a page of twenty would otherwise run twenty pointless queries.
  const items = await Promise.all(
    rows.map(async (row) => toSummary(row, row.status === 'PENDING' ? await matchesFor(row) : [])),
  );

  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/**
 * Children already on the roll who might be the one described.
 *
 * Birthday first, because it is the one thing that distinguishes two children
 * of the same name; then the name itself, which catches a sibling whose
 * birthday the parent mistyped. Five at most — this is a prompt for the office,
 * not a search results page.
 */
async function matchesFor(row: {
  studentName: string;
  studentDateOfBirth: Date | null;
}): Promise<StudentMatch[]> {
  const firstWord = row.studentName.trim().split(/\s+/)[0] ?? '';

  const candidates = await prisma.student.findMany({
    where: {
      deletedAt: null,
      OR: [
        ...(row.studentDateOfBirth ? [{ dateOfBirth: row.studentDateOfBirth }] : []),
        ...(firstWord.length >= 3
          ? [{ firstName: { contains: firstWord } }, { lastName: { contains: firstWord } }]
          : []),
      ],
    },
    select: studentSelect,
    take: 5,
  });

  return candidates.map(toMatch);
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
 * The child comes from the office, not from the form. Either they point at a
 * pupil already on the roll — a sibling, or a child the office entered while
 * the request sat in the queue — or they have the record created here, with an
 * admission number issued from the school's own series. Those are the two
 * things that actually happen, and doing the second here saves the office
 * entering the same child twice.
 *
 * It also fills gaps on the child: blood group and emergency contact are
 * written only where the school holds nothing. A parent's word is better than
 * an empty column and worse than the office's own record, and this is the only
 * ordering of those two that is true both ways round.
 */
export async function approveRegistration(
  registrationId: string,
  input: ApproveRegistrationInput,
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

  // Linking: the child must be one of this school's, which the scoped client
  // settles — another school's id is simply not found.
  const existing =
    input.mode === 'LINK'
      ? await prisma.student.findFirst({
          where: { id: input.studentId, deletedAt: null },
          select: {
            id: true,
            admissionNo: true,
            bloodGroup: true,
            emergencyContactName: true,
            emergencyContactPhone: true,
          },
        })
      : null;

  if (input.mode === 'LINK' && !existing) {
    throw ApiError.notFound('That child is no longer on the roll');
  }

  if (input.mode === 'CREATE') {
    // A new child takes a seat, the same as one entered by hand.
    await assertStudentSeatAvailable(schoolId);

    if (input.admissionNo) {
      const duplicate = await prisma.student.findFirst({
        where: { admissionNo: input.admissionNo },
        select: { id: true },
      });
      if (duplicate) {
        throw ApiError.conflict('Admission number "' + input.admissionNo + '" is already in use', {
          field: 'admissionNo',
        });
      }
    }

    if (input.classroomId) {
      const classroom = await prisma.classroom.findFirst({
        where: { id: input.classroomId },
        select: { id: true },
      });
      if (!classroom) throw ApiError.notFound('Classroom not found');
    }
  }

  // A class means an enrolment, and an enrolment needs a year to belong to.
  const academicYearId =
    input.mode === 'CREATE' && input.classroomId ? await currentAcademicYearId() : null;
  if (input.mode === 'CREATE' && input.classroomId && !academicYearId) {
    throw ApiError.badRequest('Set a current academic year before putting a child in a classroom.');
  }

  // Longer than the five seconds Prisma allows by default. Approving writes
  // eight statements — the account, the profile, the child, its admission
  // number under a row lock, the class, the guardian link, the gap-filling and
  // the decision — and the first run of this against a database over an SSH
  // tunnel died halfway through with "transaction not found", leaving a family
  // approved on screen and no account behind it. On the server the database is
  // local and this is nowhere near the limit; the limit is there for the day it
  // is not.
  const { userId, student } = await prisma.$transaction(
    async (tx) => {
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

    // The child: the one pointed at, or a new record whose number is issued
    // from the school's own series inside this same transaction, so a rollback
    // takes the number back with it.
    const child =
      existing ??
      (await (async () => {
        // The three parts as they were typed. Rows from before the form
        // asked separately have only the written-out name, and the first word
        // of it is the best guess there is.
        const [firstWord, ...rest] = registration.studentName.trim().split(/\s+/);
        const firstName = registration.studentFirstName ?? firstWord ?? registration.studentName;
        const middleName = registration.studentMiddleName;
        const lastName =
          registration.studentFirstName === null
            ? rest.join(' ') || null
            : registration.studentLastName;

        const admissionNo =
          input.mode === 'CREATE' && input.admissionNo
            ? input.admissionNo
            : await nextDocumentNumber(tx, {
                schoolId,
                kind: 'ADMISSION',
                academicYearId: null,
                defaultPrefix: 'ADM-',
              });

        const created = await tx.student.create({
          data: {
            schoolId,
            admissionNo,
            admissionDate: new Date(),
            firstName,
            middleName,
            lastName,
            // The birthday the family gave. A row from before the form asked
            // for one falls back to today, which the office will correct —
            // better than refusing to approve a family that did nothing wrong.
            dateOfBirth: registration.studentDateOfBirth ?? new Date(),
            gender: input.mode === 'CREATE' ? input.gender : 'OTHER',
            bloodGroup: registration.bloodGroup,
            emergencyContactName: registration.emergencyContactName,
            emergencyContactPhone: registration.emergencyContactPhone,
            status: 'ACTIVE',
          },
          select: {
            id: true,
            admissionNo: true,
            bloodGroup: true,
            emergencyContactName: true,
            emergencyContactPhone: true,
          },
        });

        if (input.mode === 'CREATE' && input.classroomId && academicYearId) {
          await tx.studentEnrolment.create({
            data: {
              schoolId,
              studentId: created.id,
              academicYearId,
              classroomId: input.classroomId,
              status: 'ACTIVE',
            },
          });
        }

        return created;
      })());

    await tx.studentGuardian.create({
      data: {
        schoolId,
        studentId: child.id,
        parentProfileId: profile.id,
        relation: registration.relation,
        isEmergencyContact: Boolean(registration.emergencyContactPhone),
      },
    });

    // Only where the school holds nothing. Never over the office's own record.
    const fill: Prisma.StudentUpdateInput = {};
    if (!child.bloodGroup && registration.bloodGroup) {
      fill.bloodGroup = registration.bloodGroup;
    }
    if (!child.emergencyContactName && registration.emergencyContactName) {
      fill.emergencyContactName = registration.emergencyContactName;
    }
    if (!child.emergencyContactPhone && registration.emergencyContactPhone) {
      fill.emergencyContactPhone = registration.emergencyContactPhone;
    }
    // No emergency contact given, but a mother's number was: that is the second
    // number to ring, which is what an emergency contact is for.
    if (!child.emergencyContactPhone && !registration.emergencyContactPhone && registration.motherPhone) {
      fill.emergencyContactPhone = registration.motherPhone;
      if (!child.emergencyContactName && registration.motherName) {
        fill.emergencyContactName = registration.motherName;
      }
    }
    if (Object.keys(fill).length > 0) {
      await tx.student.update({ where: { id: child.id }, data: fill });
    }

    await tx.parentRegistration.update({
      where: { id: registrationId },
      data: {
        status: 'APPROVED',
        reviewedById: actorUserId,
        reviewedAt: new Date(),
        // Which child this turned out to be, and the number it was given,
        // written back so a decided row says what was decided.
        studentId: child.id,
        admissionNo: child.admissionNo,
      },
    });

      return { userId: user.id, student: child };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );

  // After the transaction, as createParent does. The audit log is written
  // through the unscoped client so that a tenant filter can never suppress it,
  // which also means it was never going to join a scoped transaction.
  await writeAuditLog({
    action: 'REGISTRATION_APPROVED',
    entity: 'ParentRegistration',
    entityId: registrationId,
    schoolId,
    actorUserId,
    after: {
      userId,
      studentId: student.id,
      admissionNo: student.admissionNo,
      mode: input.mode,
    },
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
