import type { Prisma } from '@prisma/client';
import type {
  CreateClassroomPostInput,
  CreateHomeworkInput,
  ClassroomPostSummary,
  HomeworkSummary,
  ListHomeworkQuery,
  Paginated,
  ReviewSubmissionInput,
  SubmissionSummary,
  UpdateHomeworkInput,
} from '@poetree/shared';
import { CLASS_LEVEL_LABELS } from '@poetree/shared';
import { prisma, type TenantTransactionClient } from '../db/prisma.js';
import { getRequestContext, requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { paginate, toSkipTake } from '../lib/pagination.js';
import { writeAuditLog } from './audit.service.js';
import { assertTeacherOwnsClassroom, guardianStudentIds, teacherClassroomIds } from './scope.service.js';
import { guardianUserIdsFor, notifySafe } from './notification.service.js';

/**
 * Tells the class's guardians that work has been set.
 *
 * Sent once, at publication. Editing a due date deliberately does not resend —
 * a teacher tidying wording should not buzz thirty phones again.
 */
async function notifyHomeworkPublished(
  schoolId: string,
  homeworkId: string,
  classroomId: string,
  title: string,
  dueDate: Date,
): Promise<void> {
  const enrolments = await prisma.studentEnrolment.findMany({
    where: { classroomId, status: 'ACTIVE' },
    select: { studentId: true },
  });

  const guardians = await guardianUserIdsFor(enrolments.map((e) => e.studentId));
  if (guardians.length === 0) return;

  const due = dueDate.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

  notifySafe({
    schoolId,
    userIds: guardians,
    type: 'HOMEWORK_ASSIGNED',
    title: 'New homework',
    body: `${title} — due ${due}.`,
    entityType: 'Homework',
    entityId: homeworkId,
  });
}

const homeworkInclude = {
  classroom: { include: { classLevel: { select: { code: true } } } },
  subject: { select: { id: true, name: true } },
  assignedBy: { select: { name: true } },
  _count: { select: { attachments: true } },
} satisfies Prisma.HomeworkInclude;

type HomeworkRow = Prisma.HomeworkGetPayload<{ include: typeof homeworkInclude }>;

function toSummary(
  row: HomeworkRow,
  progress: { total: number; completed: number; pending: number },
): HomeworkSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.dueDate.toISOString().slice(0, 10),
    status: row.status,
    allowsSubmission: row.allowsSubmission,
    classroom: {
      id: row.classroom.id,
      label: `${CLASS_LEVEL_LABELS[row.classroom.classLevel.code]} - ${row.classroom.section}`,
    },
    subject: row.subject ? { id: row.subject.id, name: row.subject.name } : null,
    assignedBy: row.assignedBy.name,
    assignedOn: row.assignedOn.toISOString(),
    attachmentCount: row._count.attachments,
    progress,
  };
}

/**
 * Narrows a listing to what the caller may see: a teacher's own classrooms, or
 * the classrooms a parent's children are enrolled in. School Admins see all.
 */
async function visibilityFilter(): Promise<Prisma.HomeworkWhereInput> {
  const context = getRequestContext();
  if (!context) throw ApiError.unauthenticated();

  if (context.role === 'TEACHER') {
    return { classroomId: { in: await teacherClassroomIds() } };
  }

  if (context.role === 'PARENT') {
    const studentIds = await guardianStudentIds();
    return {
      status: 'PUBLISHED',
      classroom: { enrolments: { some: { studentId: { in: studentIds }, status: 'ACTIVE' } } },
    };
  }

  return {};
}

export async function listHomework(query: ListHomeworkQuery): Promise<Paginated<HomeworkSummary>> {
  const where: Prisma.HomeworkWhereInput = { ...(await visibilityFilter()) };
  if (query.classroomId) where.classroomId = query.classroomId;
  if (query.status) where.status = query.status;
  if (query.search) where.title = { contains: query.search };

  const [rows, total] = await Promise.all([
    prisma.homework.findMany({
      where,
      include: homeworkInclude,
      orderBy: [{ dueDate: 'desc' }],
      ...toSkipTake(query),
    }),
    prisma.homework.count({ where }),
  ]);

  // One grouped query rather than a count per row.
  const grouped = await prisma.homeworkSubmission.groupBy({
    by: ['homeworkId', 'status'],
    where: { homeworkId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  });

  const progressByHomework = new Map<string, { total: number; completed: number; pending: number }>();
  for (const group of grouped) {
    const entry = progressByHomework.get(group.homeworkId) ?? { total: 0, completed: 0, pending: 0 };
    const count = group._count._all;
    entry.total += count;
    if (group.status === 'COMPLETED' || group.status === 'SUBMITTED') entry.completed += count;
    if (group.status === 'PENDING') entry.pending += count;
    progressByHomework.set(group.homeworkId, entry);
  }

  return paginate(
    rows.map((row) =>
      toSummary(row, progressByHomework.get(row.id) ?? { total: 0, completed: 0, pending: 0 }),
    ),
    total,
    query,
  );
}

export async function getHomework(homeworkId: string): Promise<HomeworkSummary> {
  const where: Prisma.HomeworkWhereInput = { id: homeworkId, ...(await visibilityFilter()) };
  const row = await prisma.homework.findFirst({ where, include: homeworkInclude });
  if (!row) throw ApiError.notFound('Homework not found');

  const grouped = await prisma.homeworkSubmission.groupBy({
    by: ['status'],
    where: { homeworkId },
    _count: { _all: true },
  });

  const progress = { total: 0, completed: 0, pending: 0 };
  for (const group of grouped) {
    progress.total += group._count._all;
    if (group.status === 'COMPLETED' || group.status === 'SUBMITTED') progress.completed += group._count._all;
    if (group.status === 'PENDING') progress.pending += group._count._all;
  }

  return toSummary(row, progress);
}

export async function createHomework(
  input: CreateHomeworkInput,
  actorUserId: string,
): Promise<HomeworkSummary> {
  const schoolId = requireSchoolId();
  await assertTeacherOwnsClassroom(input.classroomId);

  const classroom = await prisma.classroom.findFirst({
    where: { id: input.classroomId },
    select: { id: true, academicYearId: true },
  });
  if (!classroom) throw ApiError.notFound('Classroom not found');

  const homeworkId = await prisma.$transaction(async (tx) => {
    const homework = await tx.homework.create({
      data: {
        schoolId,
        academicYearId: classroom.academicYearId,
        classroomId: input.classroomId,
        subjectId: input.subjectId ?? null,
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate,
        allowsSubmission: input.allowsSubmission,
        assignedById: actorUserId,
        status: input.publish ? 'PUBLISHED' : 'DRAFT',
      },
    });

    if (input.fileIds?.length) {
      await tx.homeworkAttachment.createMany({
        data: input.fileIds.map((fileId) => ({ schoolId, homeworkId: homework.id, fileId })),
      });
    }

    if (input.publish) {
      await materialiseSubmissions(tx, schoolId, homework.id, input.classroomId);
    }

    return homework.id;
  });

  if (input.publish) {
    await writeAuditLog({
      action: 'HOMEWORK_PUBLISHED',
      entity: 'Homework',
      entityId: homeworkId,
      schoolId,
      actorUserId,
      metadata: { classroomId: input.classroomId, title: input.title },
    });
  }

  if (input.publish) {
    await notifyHomeworkPublished(
      schoolId,
      homeworkId,
      input.classroomId,
      input.title,
      input.dueDate,
    );
  }

  return getHomework(homeworkId);
}

/**
 * Creates one submission row per currently-enrolled child.
 *
 * Doing this at publish time rather than on demand means "who has not done it"
 * is an indexed query. A child enrolled *after* publication is deliberately not
 * back-filled: they were not in the class when it was set.
 */
async function materialiseSubmissions(
  tx: TenantTransactionClient,
  schoolId: string,
  homeworkId: string,
  classroomId: string,
): Promise<void> {
  const enrolments = await tx.studentEnrolment.findMany({
    where: { schoolId, classroomId, status: 'ACTIVE' },
    select: { studentId: true },
  });

  if (enrolments.length === 0) return;

  await tx.homeworkSubmission.createMany({
    data: enrolments.map((e) => ({
      schoolId,
      homeworkId,
      studentId: e.studentId,
      status: 'PENDING' as const,
    })),
    skipDuplicates: true,
  });
}

export async function updateHomework(
  homeworkId: string,
  input: UpdateHomeworkInput,
  actorUserId: string,
): Promise<HomeworkSummary> {
  const schoolId = requireSchoolId();

  const existing = await prisma.homework.findFirst({
    where: { id: homeworkId },
    select: { id: true, classroomId: true, dueDate: true },
  });
  if (!existing) throw ApiError.notFound('Homework not found');
  await assertTeacherOwnsClassroom(existing.classroomId);

  await prisma.homework.update({
    where: { id: homeworkId },
    data: {
      title: input.title,
      description: input.description,
      dueDate: input.dueDate,
      subjectId: input.subjectId,
      allowsSubmission: input.allowsSubmission,
    },
  });

  await writeAuditLog({
    action: 'HOMEWORK_PUBLISHED',
    entity: 'Homework',
    entityId: homeworkId,
    schoolId,
    actorUserId,
    before: { dueDate: existing.dueDate.toISOString().slice(0, 10) },
    after: { fields: Object.keys(input) },
  });

  return getHomework(homeworkId);
}

/** Publishing a draft is what creates the submission rows. */
export async function publishHomework(
  homeworkId: string,
  actorUserId: string,
): Promise<HomeworkSummary> {
  const schoolId = requireSchoolId();

  const homework = await prisma.homework.findFirst({
    where: { id: homeworkId },
    select: { id: true, classroomId: true, status: true },
  });
  if (!homework) throw ApiError.notFound('Homework not found');
  await assertTeacherOwnsClassroom(homework.classroomId);

  if (homework.status === 'PUBLISHED') {
    throw ApiError.conflict('This homework is already published');
  }

  await prisma.$transaction(async (tx) => {
    await tx.homework.update({ where: { id: homeworkId }, data: { status: 'PUBLISHED' } });
    await materialiseSubmissions(tx, schoolId, homeworkId, homework.classroomId);
  });

  await writeAuditLog({
    action: 'HOMEWORK_PUBLISHED',
    entity: 'Homework',
    entityId: homeworkId,
    schoolId,
    actorUserId,
  });

  return getHomework(homeworkId);
}

export async function listSubmissions(homeworkId: string): Promise<SubmissionSummary[]> {
  const homework = await prisma.homework.findFirst({
    where: { id: homeworkId },
    select: { id: true, classroomId: true },
  });
  if (!homework) throw ApiError.notFound('Homework not found');
  await assertTeacherOwnsClassroom(homework.classroomId);

  const submissions = await prisma.homeworkSubmission.findMany({
    where: { homeworkId },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          enrolments: { where: { status: 'ACTIVE' }, take: 1, select: { rollNo: true } },
        },
      },
    },
  });

  return submissions.map((submission) => ({
    id: submission.id,
    studentId: submission.studentId,
    fullName: [submission.student.firstName, submission.student.lastName]
      .filter(Boolean)
      .join(' '),
    rollNo: submission.student.enrolments[0]?.rollNo ?? null,
    status: submission.status,
    submittedOn: submission.submittedOn?.toISOString() ?? null,
    teacherRemark: submission.teacherRemark,
    reviewedOn: submission.reviewedOn?.toISOString() ?? null,
  }));
}

export async function reviewSubmission(
  submissionId: string,
  input: ReviewSubmissionInput,
  actorUserId: string,
): Promise<void> {
  const submission = await prisma.homeworkSubmission.findFirst({
    where: { id: submissionId },
    include: { homework: { select: { classroomId: true } } },
  });
  if (!submission) throw ApiError.notFound('Submission not found');
  await assertTeacherOwnsClassroom(submission.homework.classroomId);

  await prisma.homeworkSubmission.update({
    where: { id: submissionId },
    data: {
      status: input.status,
      teacherRemark: input.teacherRemark ?? null,
      reviewedById: actorUserId,
      reviewedOn: new Date(),
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Class stream                                                               */
/* -------------------------------------------------------------------------- */

export async function listClassroomPosts(classroomId: string): Promise<ClassroomPostSummary[]> {
  await assertTeacherOwnsClassroom(classroomId);

  const posts = await prisma.classroomPost.findMany({
    where: { classroomId, status: 'PUBLISHED' },
    include: { createdBy: { select: { name: true } }, _count: { select: { attachments: true } } },
    orderBy: { publishedAt: 'desc' },
    take: 50,
  });

  return posts.map((post) => ({
    id: post.id,
    type: post.type,
    title: post.title,
    body: post.body,
    createdBy: post.createdBy.name,
    publishedAt: post.publishedAt.toISOString(),
    attachmentCount: post._count.attachments,
  }));
}

export async function createClassroomPost(
  input: CreateClassroomPostInput,
  actorUserId: string,
): Promise<ClassroomPostSummary> {
  const schoolId = requireSchoolId();
  await assertTeacherOwnsClassroom(input.classroomId);

  const postId = await prisma.$transaction(async (tx) => {
    const post = await tx.classroomPost.create({
      data: {
        schoolId,
        classroomId: input.classroomId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        createdById: actorUserId,
        status: 'PUBLISHED',
      },
    });

    if (input.fileIds?.length) {
      await tx.classroomPostAttachment.createMany({
        data: input.fileIds.map((fileId) => ({ schoolId, postId: post.id, fileId })),
      });
    }

    return post.id;
  });

  const posts = await listClassroomPosts(input.classroomId);
  const created = posts.find((post) => post.id === postId);
  if (!created) throw ApiError.internal('Post was created but could not be read back');
  return created;
}
