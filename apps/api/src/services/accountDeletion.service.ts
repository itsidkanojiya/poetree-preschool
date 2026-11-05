import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { AccountDeletedResponse, DeleteAccountInput } from '@poetree/shared';
import { prismaUnscoped } from '../db/prisma.js';
import { ApiError } from '../lib/apiError.js';
import { profileRoles, rolesHeld } from './roles.service.js';
import { burnPasswordComparison, hashPassword, verifyPassword } from '../lib/password.js';
import { newTokenId } from '../lib/tokens.js';
import { writeAuditLog } from './audit.service.js';
import { rememberSession } from './auth.service.js';

/**
 * A family closing their account — from the app's Settings, or from the website
 * once the app is gone.
 *
 * Google Play requires both, and requires that closing an account actually
 * removes what it held. What goes is everything that is the PARENT's: their
 * name, phone number, email address, password, address, their sign-ins and
 * devices, their notifications, the registration they sent the school (which
 * carries all of those again), the codes that proved their number, and their
 * personal details in the audit trail.
 *
 * What stays is the CHILD's school record — enrolment, attendance, homework,
 * fees, report cards, certificates, learning progress. The school created that
 * record and keeps it as a school keeps any pupil's file; a parent leaving the
 * app is not the school deleting a pupil. The link from the child to this
 * parent is removed, so the record no longer names them. The privacy policy and
 * the website's deletion page both say this.
 *
 * The User row itself is not removed but emptied: a fee plan the parent once
 * chose points at it under a Restrict key, and the fee record is the school's.
 * Nothing on the row identifies anyone afterwards — no name, no phone, no
 * email, a password nobody knows — and the soft-delete filter hides it from
 * every school screen.
 */

/** What an emptied account is called wherever a school record still points at it. */
export const DELETED_ACCOUNT_NAME = 'Deleted account';

const accountSelect = {
  id: true,
  schoolId: true,
  role: true,
  phone: true,
  email: true,
  passwordHash: true,
  school: { select: { name: true, code: true } },
  ...profileRoles,
} satisfies Prisma.UserSelect;

type Account = Prisma.UserGetPayload<{ select: typeof accountSelect }>;

type Channel = 'APP' | 'WEBSITE';

/** The app: the signed-in parent, with their password typed again. */
export async function deleteOwnAccount(
  userId: string,
  password: string,
): Promise<AccountDeletedResponse> {
  const account = await prismaUnscoped.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: accountSelect,
  });
  if (!account) throw ApiError.unauthenticated();

  assertParent(account);

  if (!(await verifyPassword(password, account.passwordHash))) {
    throw ApiError.invalidCredentials('That password is not right.');
  }

  await eraseAccount(account, 'APP');
  return { deleted: true, schoolName: account.school?.name ?? null, registrationOnly: false };
}

/**
 * The website: the same phone number or email and password the parent signs
 * in with, and the school code when one number has accounts at two schools.
 */
export async function deleteAccountWithCredentials(
  input: DeleteAccountInput,
): Promise<AccountDeletedResponse> {
  const identifier = input.identifier.trim();
  const school = input.schoolCode ? { school: schoolMatching(input.schoolCode) } : {};

  const candidates = (
    await prismaUnscoped.user.findMany({
      where: { AND: [identifierWhere(identifier), school], deletedAt: null },
      select: accountSelect,
      take: 5,
    })
  ).filter((candidate) => sameIdentifier(candidate, identifier));

  const matches: Account[] = [];
  for (const candidate of candidates) {
    if (await verifyPassword(input.password, candidate.passwordHash)) matches.push(candidate);
  }

  if (matches.length === 0) {
    // No account — perhaps because the school never approved one. What the
    // family sent is still held, and is theirs to withdraw.
    const erased = await eraseUnapprovedRegistrations(identifier, input.password, school);
    if (erased) return { deleted: true, schoolName: erased.schoolName, registrationOnly: true };

    // Spend the same time as a real comparison, as sign-in does, so a missing
    // account is not told apart from a wrong password by how long it took.
    if (candidates.length === 0) await burnPasswordComparison();
    throw ApiError.invalidCredentials(
      'That phone number or email and password do not match an account.',
    );
  }

  if (matches.length > 1) {
    throw ApiError.conflict(
      'This login has an account at more than one school. Enter the School ID of the one to delete.',
      { schoolCodes: matches.map((match) => match.school?.code).filter(Boolean) },
    );
  }

  const account = matches[0]!;
  assertParent(account);

  await eraseAccount(account, 'WEBSITE');
  return { deleted: true, schoolName: account.school?.name ?? null, registrationOnly: false };
}

/**
 * Staff accounts are the school's to open and close. A teacher's name has to
 * go on rendering on last year's registers, which is why staff are
 * deactivated by the office rather than erased.
 */
function assertParent(account: Account): void {
  const held = rolesHeld(account);
  if (!held.includes('PARENT') || held.includes('TEACHER')) {
    throw ApiError.forbidden(
      'Staff accounts are opened and closed by the school office. Please ask them to close yours.',
    );
  }
}

async function eraseAccount(account: Account, via: Channel): Promise<void> {
  const userId = account.id;
  const schoolId = account.schoolId;
  const contact = [account.phone, account.email].filter((value): value is string => !!value);

  const [profile, registrations] = await Promise.all([
    prismaUnscoped.parentProfile.findUnique({ where: { userId }, select: { id: true } }),
    schoolId && contact.length > 0
      ? prismaUnscoped.parentRegistration.findMany({
          where: {
            schoolId,
            OR: [
              ...(account.phone ? [{ phone: account.phone }] : []),
              ...(account.email ? [{ email: account.email }] : []),
            ],
          },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);
  const registrationIds = registrations.map((registration) => registration.id);

  // Outside the transaction: bcrypt at production cost takes a quarter of a
  // second, and an interactive transaction has a five-second budget.
  const unusablePassword = await hashPassword(randomBytes(32).toString('hex'));

  // A session id nobody holds. Null would mean "no session on record", which
  // lets any token through; this refuses every token issued before now, so the
  // access token on the phone stops working at once rather than hours later.
  const closedSession = newTokenId();

  await prismaUnscoped.$transaction(async (tx) => {
    await tx.parentRegistration.deleteMany({ where: { id: { in: registrationIds } } });
    if (schoolId && contact.length > 0) {
      await tx.otpChallenge.deleteMany({ where: { schoolId, destination: { in: contact } } });
    }

    await tx.refreshToken.deleteMany({ where: { userId } });
    await tx.deviceToken.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.noticeRead.deleteMany({ where: { userId } });
    // Takes the links to their children with it (StudentGuardian cascades).
    await tx.parentProfile.deleteMany({ where: { userId } });

    await redactAuditTrail(tx, {
      entityIds: [userId, ...(profile ? [profile.id] : []), ...registrationIds],
      actorUserId: userId,
      identifiers: contact,
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        name: DELETED_ACCOUNT_NAME,
        phone: null,
        email: null,
        passwordHash: unusablePassword,
        status: 'INACTIVE',
        deletedAt: new Date(),
        currentSessionId: closedSession,
        lastLoginAt: null,
        mustChangePassword: false,
      },
    });

    // No IP address and no name: the entry records that an account was
    // erased, not who it belonged to.
    await writeAuditLog(
      {
        action: 'ACCOUNT_DELETED',
        entity: 'User',
        entityId: userId,
        schoolId,
        actorUserId: userId,
        metadata: { via },
      },
      tx,
    );
  });

  // This process stops honouring the old session immediately; any other one
  // within its few seconds of session memory.
  rememberSession(userId, closedSession);
}

/**
 * A registration the school has not approved, withdrawn by the family who sent
 * it. Proved the same way as an account: the password they chose on the form,
 * which is stored hashed on the request.
 */
async function eraseUnapprovedRegistrations(
  identifier: string,
  password: string,
  school: { school?: Prisma.SchoolWhereInput },
): Promise<{ schoolName: string } | null> {
  const rows = (
    await prismaUnscoped.parentRegistration.findMany({
      where: {
        AND: [registrationIdentifierWhere(identifier), school],
        status: { in: ['PENDING', 'REJECTED'] },
      },
      select: {
        id: true,
        schoolId: true,
        phone: true,
        email: true,
        passwordHash: true,
        school: { select: { name: true } },
      },
      take: 10,
    })
  ).filter((row) => sameIdentifier(row, identifier));

  const proven: typeof rows = [];
  for (const row of rows) {
    if (await verifyPassword(password, row.passwordHash)) proven.push(row);
  }
  if (proven.length === 0) return null;

  await prismaUnscoped.$transaction(async (tx) => {
    await tx.parentRegistration.deleteMany({ where: { id: { in: proven.map((row) => row.id) } } });

    for (const row of proven) {
      const contact = [row.phone, row.email].filter((value): value is string => !!value);
      await tx.otpChallenge.deleteMany({
        where: { schoolId: row.schoolId, destination: { in: contact } },
      });
      await redactAuditTrail(tx, { entityIds: [row.id], identifiers: contact });
      await writeAuditLog(
        {
          action: 'ACCOUNT_DELETED',
          entity: 'ParentRegistration',
          entityId: row.id,
          schoolId: row.schoolId,
          metadata: { via: 'WEBSITE', registrationOnly: true },
        },
        tx,
      );
    }
  });

  return { schoolName: proven[0]!.school.name };
}

/**
 * The audit trail keeps its events and loses the personal details in them.
 *
 * A registration's entry holds the phone number and the child's name; an
 * office edit holds the parent's details before and after; a failed sign-in
 * holds the number that was typed. The fact that each happened is kept — the
 * school may be asked about it — but not who it was about.
 */
async function redactAuditTrail(
  tx: Prisma.TransactionClient,
  trail: { entityIds: string[]; actorUserId?: string; identifiers: string[] },
): Promise<void> {
  const about: Prisma.AuditLogWhereInput[] = [
    { entityId: { in: trail.entityIds } },
    ...(trail.actorUserId ? [{ actorUserId: trail.actorUserId }] : []),
    ...trail.identifiers.map((identifier) => ({
      action: 'LOGIN_FAILED',
      metadata: { path: '$.identifier', equals: identifier },
    })),
  ];

  await tx.auditLog.updateMany({
    where: { OR: about },
    data: {
      before: Prisma.DbNull,
      after: Prisma.DbNull,
      metadata: Prisma.DbNull,
      ipAddress: null,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Finding the account the way a person types it                              */
/* -------------------------------------------------------------------------- */

const digitsOf = (value: string): string => value.replace(/[^0-9]/g, '');

/**
 * The last ten digits, as the OTP limiter counts a phone: +91 98200 00000,
 * 098200 00000 and 9820000000 are one number. On the website nobody is
 * guided into the exact format the app stored, and the password is still what
 * proves the account is theirs.
 */
const nationalNumber = (value: string): string => digitsOf(value).slice(-10);

const isEmail = (identifier: string): boolean => identifier.includes('@');

function identifierWhere(identifier: string): Prisma.UserWhereInput {
  if (isEmail(identifier)) return { email: identifier.toLowerCase() };
  const national = nationalNumber(identifier);
  return national.length === 10
    ? { OR: [{ phone: identifier }, { phone: { endsWith: national } }] }
    : { phone: identifier };
}

function registrationIdentifierWhere(identifier: string): Prisma.ParentRegistrationWhereInput {
  if (isEmail(identifier)) return { email: identifier.toLowerCase() };
  const national = nationalNumber(identifier);
  return national.length === 10
    ? { OR: [{ phone: identifier }, { phone: { endsWith: national } }] }
    : { phone: identifier };
}

/** `endsWith` narrows the query; this is what actually decides. */
function sameIdentifier(
  row: { phone: string | null; email: string | null },
  identifier: string,
): boolean {
  if (isEmail(identifier)) return row.email?.toLowerCase() === identifier.toLowerCase();
  if (!row.phone) return false;
  if (row.phone === identifier) return true;
  const national = nationalNumber(identifier);
  return national.length === 10 && nationalNumber(row.phone) === national;
}

/** A school's code or its group's, as at sign-in. */
function schoolMatching(code: string): Prisma.SchoolWhereInput {
  return { OR: [{ code }, { organisation: { code } }] };
}
