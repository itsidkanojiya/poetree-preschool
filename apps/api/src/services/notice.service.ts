import type { Prisma } from '@prisma/client';
import type {
  CreateNoticeInput,
  ListNoticesQuery,
  NoticeSummary,
  Paginated,
} from '@poetree/shared';
import { prisma, prismaUnscoped } from '../db/prisma.js';
import { getRequestContext, requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { paginate, toSkipTake } from '../lib/pagination.js';
import { writeAuditLog } from './audit.service.js';
import { guardianStudentIds, teacherClassroomIds } from './scope.service.js';
import { notifySafe } from './notification.service.js';

/**
 * Who a published notice should reach.
 *
 * Resolved from the audience rather than broadcast to the school, so a notice
 * addressed to one class does not buzz every parent's phone.
 */
async function noticeRecipients(
  schoolId: string,
  input: Pick<CreateNoticeInput, 'audience' | 'classroomIds'>,
): Promise<string[]> {
  if (input.audience === 'CLASSROOMS' && input.classroomIds?.length) {
    const [guardians, teachers] = await Promise.all([
      prismaUnscoped.studentGuardian.findMany({
        where: {
          schoolId,
          student: {
            enrolments: { some: { classroomId: { in: input.classroomIds }, status: 'ACTIVE' } },
          },
        },
        select: { parentProfile: { select: { userId: true } } },
      }),
      prismaUnscoped.classroomTeacher.findMany({
        where: { schoolId, classroomId: { in: input.classroomIds } },
        select: { userId: true },
      }),
    ]);

    return [
      ...new Set([
        ...guardians.map((g) => g.parentProfile.userId),
        ...teachers.map((t) => t.userId),
      ]),
    ];
  }

  const roles =
    input.audience === 'TEACHERS'
      ? (['TEACHER'] as const)
      : input.audience === 'PARENTS'
        ? (['PARENT'] as const)
        : (['TEACHER', 'PARENT'] as const);

  const users = await prismaUnscoped.user.findMany({
    where: { schoolId, role: { in: [...roles] }, status: 'ACTIVE' },
    select: { id: true },
  });

  return users.map((u) => u.id);
}

const noticeInclude = {
  createdBy: { select: { name: true } },
  targets: { include: { classroom: { include: { classLevel: { select: { code: true, name: true } } } } } },
  _count: { select: { attachments: true, reads: true } },
} satisfies Prisma.NoticeInclude;

type NoticeRow = Prisma.NoticeGetPayload<{ include: typeof noticeInclude }>;

function toSummary(row: NoticeRow, extras: Partial<NoticeSummary> = {}): NoticeSummary {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    type: row.type,
    audience: row.audience,
    status: row.status,
    pinned: row.pinned,
    publishAt: row.publishAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdBy: row.createdBy.name,
    classroomLabels: row.targets.map(
      (t) => `${t.classroom.classLevel.name} - ${t.classroom.section}`,
    ),
    attachmentCount: row._count.attachments,
    ...extras,
  };
}

/**
 * What this caller is entitled to see.
 *
 * Admins see everything including drafts. Everyone else sees only published,
 * in-window notices addressed to them — and for a class-specific notice, only
 * if it targets a classroom they teach or their child is enrolled in.
 */
async function visibilityFilter(): Promise<Prisma.NoticeWhereInput> {
  const context = getRequestContext();
  if (!context) throw ApiError.unauthenticated();

  if (context.role === 'SCHOOL_ADMIN') return {};

  const now = new Date();
  const live: Prisma.NoticeWhereInput = {
    status: 'PUBLISHED',
    publishAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };

  if (context.role === 'TEACHER') {
    const classroomIds = await teacherClassroomIds();
    return {
      AND: [
        live,
        {
          OR: [
            { audience: 'ALL' },
            { audience: 'TEACHERS' },
            { audience: 'CLASSROOMS', targets: { some: { classroomId: { in: classroomIds } } } },
          ],
        },
      ],
    };
  }

  // Parent
  const studentIds = await guardianStudentIds();
  return {
    AND: [
      live,
      {
        OR: [
          { audience: 'ALL' },
          { audience: 'PARENTS' },
          {
            audience: 'CLASSROOMS',
            targets: {
              some: {
                classroom: {
                  enrolments: { some: { studentId: { in: studentIds }, status: 'ACTIVE' } },
                },
              },
            },
          },
        ],
      },
    ],
  };
}

export async function listNotices(query: ListNoticesQuery): Promise<Paginated<NoticeSummary>> {
  const context = getRequestContext();
  if (!context) throw ApiError.unauthenticated();

  const where: Prisma.NoticeWhereInput = { ...(await visibilityFilter()) };
  if (query.type) where.type = query.type;
  if (query.status && context.role === 'SCHOOL_ADMIN') where.status = query.status;
  if (query.search) where.title = { contains: query.search };

  const [rows, total] = await Promise.all([
    prisma.notice.findMany({
      where,
      include: noticeInclude,
      orderBy: [{ pinned: 'desc' }, { publishAt: 'desc' }],
      ...toSkipTake(query),
    }),
    prisma.notice.count({ where }),
  ]);

  // Admins care how many people have opened it; everyone else cares whether
  // they personally have.
  if (context.role === 'SCHOOL_ADMIN') {
    return paginate(
      rows.map((row) => toSummary(row, { readCount: row._count.reads })),
      total,
      query,
    );
  }

  const myReads = await prisma.noticeRead.findMany({
    where: { userId: context.userId, noticeId: { in: rows.map((r) => r.id) } },
    select: { noticeId: true },
  });
  const readSet = new Set(myReads.map((r) => r.noticeId));

  return paginate(
    rows.map((row) => toSummary(row, { readByMe: readSet.has(row.id) })),
    total,
    query,
  );
}

export async function createNotice(
  input: CreateNoticeInput,
  actorUserId: string,
): Promise<NoticeSummary> {
  const schoolId = requireSchoolId();

  if (input.audience === 'CLASSROOMS' && input.classroomIds?.length) {
    // Resolve through the scoped client, so another school's classroom simply
    // does not exist and cannot be targeted.
    const found = await prisma.classroom.findMany({
      where: { id: { in: input.classroomIds } },
      select: { id: true },
    });
    if (found.length !== input.classroomIds.length) {
      throw ApiError.badRequest('One or more classrooms do not exist at your school');
    }
  }

  const noticeId = await prisma.$transaction(async (tx) => {
    const notice = await tx.notice.create({
      data: {
        schoolId,
        title: input.title,
        body: input.body,
        type: input.type,
        audience: input.audience,
        pinned: input.pinned,
        publishAt: input.publishAt ?? new Date(),
        expiresAt: input.expiresAt ?? null,
        createdById: actorUserId,
        status: input.publish ? 'PUBLISHED' : 'DRAFT',
      },
    });

    if (input.audience === 'CLASSROOMS' && input.classroomIds?.length) {
      await tx.noticeTarget.createMany({
        data: input.classroomIds.map((classroomId) => ({
          schoolId,
          noticeId: notice.id,
          classroomId,
        })),
      });
    }

    if (input.fileIds?.length) {
      await tx.noticeAttachment.createMany({
        data: input.fileIds.map((fileId) => ({ schoolId, noticeId: notice.id, fileId })),
      });
    }

    return notice.id;
  });

  await writeAuditLog({
    action: 'NOTICE_PUBLISHED',
    entity: 'Notice',
    entityId: noticeId,
    schoolId,
    actorUserId,
    metadata: { type: input.type, audience: input.audience, published: input.publish },
  });

  // After the transaction has committed, never inside it — telling parents about
  // a notice that then rolled back would be worse than telling them late.
  if (input.publish) {
    const recipients = await noticeRecipients(schoolId, input);
    notifySafe({
      schoolId,
      userIds: recipients,
      type: input.type === 'EMERGENCY' ? 'NOTICE_EMERGENCY' : 'NOTICE_PUBLISHED',
      title: input.title,
      // Push previews are read on a lock screen, so keep it short and never put
      // anything sensitive in the body.
      body: input.body.length > 120 ? `${input.body.slice(0, 117)}…` : input.body,
      entityType: 'Notice',
      entityId: noticeId,
    });
  }

  const row = await prisma.notice.findFirstOrThrow({
    where: { id: noticeId },
    include: noticeInclude,
  });
  return toSummary(row, { readCount: 0 });
}

/** Idempotent: opening the same notice twice records one read. */
export async function markNoticeRead(noticeId: string): Promise<void> {
  const context = getRequestContext();
  if (!context) throw ApiError.unauthenticated();
  const schoolId = requireSchoolId();

  const notice = await prisma.notice.findFirst({
    where: { id: noticeId },
    select: { id: true },
  });
  if (!notice) throw ApiError.notFound('Notice not found');

  const existing = await prisma.noticeRead.findFirst({
    where: { noticeId, userId: context.userId },
    select: { id: true },
  });
  if (existing) return;

  await prisma.noticeRead.create({
    data: { schoolId, noticeId, userId: context.userId },
  });
}

/**
 * Who has not opened it. For an emergency notice that is the question worth
 * asking, so it lists the unread rather than the read.
 */
export async function noticeReadReceipts(
  noticeId: string,
): Promise<{ read: number; unread: Array<{ userId: string; name: string; role: string }> }> {
  const notice = await prisma.notice.findFirst({
    where: { id: noticeId },
    select: { id: true, audience: true },
  });
  if (!notice) throw ApiError.notFound('Notice not found');

  const roles =
    notice.audience === 'TEACHERS'
      ? (['TEACHER'] as const)
      : notice.audience === 'PARENTS'
        ? (['PARENT'] as const)
        : (['TEACHER', 'PARENT'] as const);

  const [recipients, reads] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: [...roles] }, status: 'ACTIVE' },
      select: { id: true, name: true, role: true },
    }),
    prisma.noticeRead.findMany({ where: { noticeId }, select: { userId: true } }),
  ]);

  const readSet = new Set(reads.map((r) => r.userId));

  return {
    read: readSet.size,
    unread: recipients
      .filter((user) => !readSet.has(user.id))
      .map((user) => ({ userId: user.id, name: user.name, role: user.role })),
  };
}
