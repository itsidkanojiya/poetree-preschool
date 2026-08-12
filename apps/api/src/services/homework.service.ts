import type { Prisma } from '@prisma/client';
import type {
  AttachedFile,
  CreateClassroomPostInput,
  CreateHomeworkInput,
  ClassroomPostSummary,
  HomeworkSummary,
  ListHomeworkQuery,
  Paginated,
  ReviewSubmissionInput,
  SubmitHomeworkInput,
  SubmissionSummary,
  UpdateHomeworkInput,
} from '@poetree/shared';
import { CLASS_LEVEL_LABELS } from '@poetree/shared';
import { prisma, type TenantTransactionClient } from '../db/prisma.js';
import { getRequestContext, requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { paginate, toSkipTake } from '../lib/pagination.js';
import { writeAuditLog } from './audit.service.js';
import {
  assertCanReadClassroomContent,
  assertCanReadStudent,
  assertTeacherOwnsClassroom,
  guardianStudentIds,
  teacherClassroomIds,
} from './scope.service.js';
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

/** Everything an attached file needs to be listed and opened. */
const attachedFileSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
} as const;

function toAttachedFile(file: {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}): AttachedFile {
  // The authenticated route, not a storage path. Guessing it gets you nothing.
  return { ...file, url: `/api/v1/files/${file.id}` };
}

const homeworkInclude = {
  classroom: { include: { classLevel: { select: { code: true } } } },
  subject: { select: { id: true, name: true } },
  assignedBy: { select: { name: true } },
  _count: { select: { attachments: true } },
  attachments: { include: { file: { select: attachedFileSelect } } },
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
    attachments: row.attachments.map((a) => toAttachedFile(a.file)),
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

  // "Have we done this" is a different question from "how many of the class
  // have", and the aggregate above cannot answer it. Only asked when the caller
  // named a child, and only after checking they may read that child.
  const mine = new Map<string, MySubmission>();
  if (query.studentId && rows.length > 0) {
    await assertCanReadStudent(query.studentId);

    const submissions = await prisma.homeworkSubmission.findMany({
      where: { studentId: query.studentId, homeworkId: { in: rows.map((r) => r.id) } },
      select: {
        id: true,
        homeworkId: true,
        status: true,
        submittedOn: true,
        teacherRemark: true,
        files: { include: { file: { select: attachedFileSelect } } },
      },
    });

    for (const submission of submissions) {
      mine.set(submission.homeworkId, {
        id: submission.id,
        status: submission.status,
        submittedOn: submission.submittedOn?.toISOString() ?? null,
        teacherRemark: submission.teacherRemark,
        // A parent who sent a photo should be able to see that it arrived,
        // not just be told the status changed.
        files: submission.files.map((f) => toAttachedFile(f.file)),
      });
    }
  }

  return paginate(
    rows.map((row) => ({
      ...toSummary(row, progressByHomework.get(row.id) ?? { total: 0, completed: 0, pending: 0 }),
      ...(mine.has(row.id) ? { mySubmission: mine.get(row.id) } : {}),
    })),
    total,
    query,
  );
}

type MySubmission = NonNullable<HomeworkSummary['mySubmission']>;

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

    // Same rule as a parent's submission: you may only attach what you
    // uploaded. A homework attachment is readable by every family in the
    // class, so attaching someone else's file would publish it to thirty
    // households.
    const attachmentIds = [...new Set(input.fileIds ?? [])];

    if (attachmentIds.length > 0) {
      const owned = await tx.fileObject.findMany({
        where: { id: { in: attachmentIds }, uploadedById: actorUserId },
        select: { id: true },
      });

      if (owned.length !== attachmentIds.length) {
        throw ApiError.badRequest('You can only attach files you uploaded yourself');
      }

      await tx.homeworkAttachment.createMany({
        data: attachmentIds.map((fileId) => ({ schoolId, homeworkId: homework.id, fileId })),
        skipDuplicates: true,
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

/**
 * Removes a piece of work that should not have been set.
 *
 * Soft, because the audit trail should still be able to explain what a class
 * was once asked to do. Refused once any child has sent something in: a
 * teacher who deletes the homework would take a parent's photograph and a
 * child's work with it, and "I set it twice" is not worth that. Those get
 * archived instead, which stops them reaching parents while keeping the work.
 */
export async function deleteHomework(homeworkId: string, actorUserId: string): Promise<void> {
  const schoolId = requireSchoolId();

  const existing = await prisma.homework.findFirst({
    where: { id: homeworkId },
    select: { id: true, classroomId: true, title: true },
  });
  if (!existing) throw ApiError.notFound('Homework not found');
  await assertTeacherOwnsClassroom(existing.classroomId);

  const sentIn = await prisma.homeworkSubmission.count({
    where: { homeworkId, status: { not: 'PENDING' } },
  });
  if (sentIn > 0) {
    throw ApiError.badRequest(
      'Some children have already sent this in. Archive it instead of deleting it.',
    );
  }

  await prisma.homework.update({
    where: { id: homeworkId },
    data: { deletedAt: new Date() },
  });

  await writeAuditLog({
    action: 'HOMEWORK_DELETED',
    entity: 'Homework',
    entityId: homeworkId,
    schoolId,
    actorUserId,
    before: { title: existing.title, classroomId: existing.classroomId },
  });
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
      files: { include: { file: { select: attachedFileSelect } } },
    },
    orderBy: [{ status: 'asc' }],
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
    // Both of these were stored and never returned, so the teacher's review
    // screen showed an empty quote and no photograph — the two things they
    // need to decide whether the work is done.
    note: submission.note,
    files: submission.files.map((f) => toAttachedFile(f.file)),
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

/**
 * A parent marking their child's homework done.
 *
 * The submission row already exists — they are materialised for every enrolled
 * child when homework is published, so "who has not done it" is an indexed
 * query rather than a set difference. This fills one in.
 *
 * Deliberately sets SUBMITTED and not COMPLETED. A parent saying "we did this"
 * and a teacher agreeing are different claims, and collapsing them would make
 * every completion figure a self-report.
 */
export async function submitHomework(
  homeworkId: string,
  input: SubmitHomeworkInput,
  actorUserId: string,
): Promise<void> {
  const schoolId = requireSchoolId();

  // Guardian link, so a parent cannot submit on another child's behalf.
  await assertCanReadStudent(input.studentId);

  const homework = await prisma.homework.findFirst({
    where: { id: homeworkId, status: 'PUBLISHED' },
    select: { id: true, allowsSubmission: true, dueDate: true },
  });
  if (!homework) throw ApiError.notFound('Homework not found');

  if (!homework.allowsSubmission) {
    throw ApiError.badRequest('This homework does not take submissions');
  }

  const submission = await prisma.homeworkSubmission.findFirst({
    where: { homeworkId, studentId: input.studentId },
    select: { id: true, status: true },
  });
  // Absent means the child enrolled after this was published, and per the brief
  // they do not retroactively owe it.
  if (!submission) throw ApiError.notFound('Homework not found');

  if (submission.status === 'COMPLETED' || submission.status === 'NOT_COMPLETED') {
    throw ApiError.badRequest('The teacher has already marked this');
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.homeworkSubmission.update({
      where: { id: submission.id },
      data: {
        // LATE is recorded rather than hidden — a teacher deciding whether it
        // counts needs to know, and the parent can see they were late too.
        status: now > homework.dueDate ? 'LATE' : 'SUBMITTED',
        submittedOn: now,
        note: input.note?.trim() || null,
      },
    });

    // Only files this person uploaded themselves.
    //
    // The school check alone is not enough now that a submission grants read
    // access to what is attached to it. Attaching any file id in the school
    // would have let a parent point their own child's submission at another
    // family's medical letter and thereby give themselves permission to open
    // it. Attaching must never widen what you can see.
    const fileIds = [...new Set(input.fileIds ?? [])];

    if (fileIds.length > 0) {
      const owned = await tx.fileObject.findMany({
        where: { id: { in: fileIds }, uploadedById: actorUserId },
        select: { id: true },
      });

      if (owned.length !== fileIds.length) {
        throw ApiError.badRequest('You can only attach files you uploaded yourself');
      }

      // skipDuplicates because (submission, file) is unique: a parent sending
      // the same photograph twice is a double tap, not a 500.
      await tx.homeworkSubmissionFile.createMany({
        data: fileIds.map((fileId) => ({ schoolId, submissionId: submission.id, fileId })),
        skipDuplicates: true,
      });
    }
  });

  await writeAuditLog({
    action: 'HOMEWORK_SUBMITTED',
    entity: 'HomeworkSubmission',
    entityId: submission.id,
    schoolId,
    actorUserId,
    after: { homeworkId, studentId: input.studentId, submittedOn: now.toISOString() },
  });
}

/* -------------------------------------------------------------------------- */
/* Class stream                                                               */
/* -------------------------------------------------------------------------- */

export async function listClassroomPosts(classroomId: string): Promise<ClassroomPostSummary[]> {
  // Reading, not acting: the stream is written to this class's families, so a
  // parent with a child in it belongs here. Posting below still uses the
  // stricter guard.
  await assertCanReadClassroomContent(classroomId);

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
