import { prisma, prismaUnscoped } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { studentName } from '../lib/names.js';
import { storage } from '../lib/storage.js';
import { writeAuditLog } from './audit.service.js';
import { settleInvoice } from './fee.service.js';

/**
 * Permanent deletes, one per thing the office or the publisher can erase.
 *
 * Each is a real delete, not a hidden flag, and none can be undone. The
 * database's own cascades take whatever hangs off the row; where a key is
 * Restrict — an allocation holding an invoice, a child's attempt holding an
 * activity — that dependent is removed first, deliberately, here. Every delete
 * is written to the audit trail with what it was.
 *
 * School-scoped ones go through the tenant client, so another school's id is
 * simply not found.
 */

/** The bytes of files whose rows are gone. A failure leaves an unreachable file, never a broken record. */
async function removeFiles(fileIds: Array<string | null | undefined>): Promise<void> {
  const ids = [...new Set(fileIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return;
  const files = await prismaUnscoped.fileObject.findMany({
    where: { id: { in: ids } },
    select: { id: true, storageKey: true },
  });
  await prismaUnscoped.fileObject.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
  for (const file of files) await storage.remove(file.storageKey).catch(() => undefined);
}

const same = (typed: string, expected: string) =>
  typed.trim().toLowerCase() === expected.trim().toLowerCase();

/* -------------------------------------------------------------------------- */
/* A school's own records                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A child, for good: attendance, fees and payments, report cards, progress,
 * certificates, documents and their links to parents. The admission number is
 * typed back as the confirmation.
 */
export async function eraseStudent(
  studentId: string,
  confirm: string,
  actorUserId: string,
): Promise<{ name: string }> {
  const schoolId = requireSchoolId();
  const student = await prisma.student.findFirst({
    where: { id: studentId, deletedAt: undefined },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      middleName: true,
      lastName: true,
      photoFileId: true,
      documents: { select: { fileId: true } },
    },
  });
  if (!student) throw ApiError.notFound('Student not found');
  if (!same(confirm, student.admissionNo)) {
    throw ApiError.badRequest(`Type the admission number, ${student.admissionNo}, to confirm.`);
  }

  await prisma.$transaction(async (tx) => {
    // An allocation holds its invoice (Restrict); both go with the child.
    await tx.paymentAllocation.deleteMany({
      where: { OR: [{ invoice: { studentId } }, { payment: { studentId } }] },
    });
    await tx.student.deleteMany({ where: { id: studentId, deletedAt: undefined } });
  });
  await removeFiles([student.photoFileId, ...student.documents.map((d) => d.fileId)]);

  const name = studentName(student);
  await writeAuditLog({
    action: 'STUDENT_ERASED',
    entity: 'Student',
    entityId: studentId,
    schoolId,
    actorUserId,
    metadata: { admissionNo: student.admissionNo },
  });
  return { name };
}

/**
 * A payment, for good. What it paid off is owed again. A refund goes with the
 * payment it refunded; a refund on its own is not deleted, because the payment
 * it undid would then read as still refunded.
 */
export async function deletePayment(paymentId: string, actorUserId: string): Promise<void> {
  const schoolId = requireSchoolId();
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId },
    select: { id: true, receiptNo: true, amountInPaise: true, studentId: true },
  });
  if (!payment) throw ApiError.notFound('Payment not found');
  if (payment.amountInPaise < 0) {
    throw ApiError.badRequest(
      'This is a refund. Delete the payment it refunded instead — the refund goes with it.',
    );
  }

  await prisma.$transaction(async (tx) => {
    const allocations = await tx.paymentAllocation.findMany({
      where: { paymentId },
      select: { invoiceId: true },
    });
    await tx.paymentAllocation.deleteMany({ where: { paymentId } });
    // Its refund: the negative payment that names this receipt.
    await tx.payment.deleteMany({
      where: { studentId: payment.studentId, reference: payment.receiptNo, amountInPaise: { lt: 0 } },
    });
    await tx.payment.deleteMany({ where: { id: paymentId } });
    for (const invoiceId of new Set(allocations.map((a) => a.invoiceId))) {
      await settleInvoice(tx, invoiceId);
    }
  });

  await writeAuditLog({
    action: 'PAYMENT_DELETED',
    entity: 'Payment',
    entityId: paymentId,
    schoolId,
    actorUserId,
    before: { receiptNo: payment.receiptNo, amountInPaise: payment.amountInPaise },
  });
}

/** An invoice, for good — refused while any payment is on it. */
export async function deleteInvoice(invoiceId: string, actorUserId: string): Promise<void> {
  const schoolId = requireSchoolId();
  const invoice = await prisma.feeInvoice.findFirst({
    where: { id: invoiceId },
    select: { id: true, invoiceNo: true, netInPaise: true, _count: { select: { allocations: true } } },
  });
  if (!invoice) throw ApiError.notFound('Invoice not found');
  if (invoice._count.allocations > 0) {
    throw ApiError.conflict(
      `A payment is on invoice ${invoice.invoiceNo}. Delete that payment first, then the invoice.`,
    );
  }
  await prisma.feeInvoice.deleteMany({ where: { id: invoiceId } });
  await writeAuditLog({
    action: 'INVOICE_DELETED',
    entity: 'FeeInvoice',
    entityId: invoiceId,
    schoolId,
    actorUserId,
    before: { invoiceNo: invoice.invoiceNo, netInPaise: invoice.netInPaise },
  });
}

/** An announcement, for good: gone from every app, with its attachments. */
export async function deleteNotice(noticeId: string, actorUserId: string): Promise<void> {
  const schoolId = requireSchoolId();
  const notice = await prisma.notice.findFirst({
    where: { id: noticeId },
    select: { id: true, title: true, attachments: { select: { fileId: true } } },
  });
  if (!notice) throw ApiError.notFound('Announcement not found');
  await prisma.notice.deleteMany({ where: { id: noticeId } });
  await removeFiles(notice.attachments.map((a) => a.fileId));
  await writeAuditLog({
    action: 'NOTICE_DELETED',
    entity: 'Notice',
    entityId: noticeId,
    schoolId,
    actorUserId,
    before: { title: notice.title },
  });
}

/** A family's request, in any state. A verified one leaves its child and account as they are. */
export async function deleteRegistration(registrationId: string, actorUserId: string): Promise<void> {
  const schoolId = requireSchoolId();
  const row = await prisma.parentRegistration.findFirst({
    where: { id: registrationId },
    select: { id: true, status: true, studentName: true },
  });
  if (!row) throw ApiError.notFound('Registration not found');
  await prisma.parentRegistration.deleteMany({ where: { id: registrationId } });
  await writeAuditLog({
    action: 'REGISTRATION_DELETED',
    entity: 'ParentRegistration',
    entityId: registrationId,
    schoolId,
    actorUserId,
    before: { status: row.status },
  });
}

/** A term, with every report card written for it. */
export async function deleteTerm(termId: string, actorUserId: string): Promise<void> {
  const schoolId = requireSchoolId();
  const term = await prisma.term.findFirst({
    where: { id: termId },
    select: { id: true, name: true, _count: { select: { reportCards: true } } },
  });
  if (!term) throw ApiError.notFound('Term not found');
  await prisma.term.deleteMany({ where: { id: termId } });
  await writeAuditLog({
    action: 'TERM_DELETED',
    entity: 'Term',
    entityId: termId,
    schoolId,
    actorUserId,
    before: { name: term.name, reportCards: term._count.reportCards },
  });
}

/** A child's progress, from zero: every activity result, skill score, tracing and game. */
export async function resetProgress(studentId: string, actorUserId: string): Promise<void> {
  const schoolId = requireSchoolId();
  const student = await prisma.student.findFirst({ where: { id: studentId }, select: { id: true } });
  if (!student) throw ApiError.notFound('Student not found');
  await prisma.$transaction(async (tx) => {
    await tx.activityAttempt.deleteMany({ where: { studentId } });
    await tx.activityCompletion.deleteMany({ where: { studentId } });
    await tx.studentSkillProgress.deleteMany({ where: { studentId } });
    await tx.tracingProgress.deleteMany({ where: { studentId } });
    await tx.gameSession.deleteMany({ where: { studentId } });
    await tx.chapterAnimationView.deleteMany({ where: { studentId } });
  });
  await writeAuditLog({
    action: 'PROGRESS_RESET',
    entity: 'Student',
    entityId: studentId,
    schoolId,
    actorUserId,
  });
}

/**
 * A class, for good — only once nobody is in it. Its timetable, homework,
 * attendance registers and report cards go with it; children who were in it in
 * other years keep their records, minus that class.
 */
export async function deleteClassroom(classroomId: string, actorUserId: string): Promise<void> {
  const schoolId = requireSchoolId();
  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId },
    select: {
      id: true,
      section: true,
      classLevel: { select: { name: true } },
      _count: { select: { enrolments: { where: { status: 'ACTIVE' } } } },
    },
  });
  if (!classroom) throw ApiError.notFound('Classroom not found');
  const label = `${classroom.classLevel.name} — ${classroom.section}`;
  if (classroom._count.enrolments > 0) {
    throw ApiError.conflict(
      `${label} still has ${classroom._count.enrolments} ${
        classroom._count.enrolments === 1 ? 'child' : 'children'
      }. Move them to another class first.`,
    );
  }
  await prisma.$transaction(async (tx) => {
    // Past enrolments hold the class (Restrict).
    await tx.studentEnrolment.deleteMany({ where: { classroomId } });
    await tx.classroom.deleteMany({ where: { id: classroomId } });
  });
  await writeAuditLog({
    action: 'CLASSROOM_DELETED',
    entity: 'Classroom',
    entityId: classroomId,
    schoolId,
    actorUserId,
    before: { label },
  });
}

/* -------------------------------------------------------------------------- */
/* The publisher's catalogue                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Children's results for activities that are going: their attempts are
 * deleted and the skills those attempts fed are recalculated from what is left.
 */
async function forgetAttempts(activityIds: string[]): Promise<void> {
  if (activityIds.length === 0) return;
  const affected = await prismaUnscoped.activityAttempt.findMany({
    where: { activityId: { in: activityIds } },
    select: { studentId: true, activity: { select: { skillId: true } } },
    distinct: ['studentId', 'activityId'],
  });
  await prismaUnscoped.activityAttempt.deleteMany({ where: { activityId: { in: activityIds } } });

  const pairs = new Map<string, { studentId: string; skillId: string }>();
  for (const row of affected) {
    pairs.set(`${row.studentId}:${row.activity.skillId}`, {
      studentId: row.studentId,
      skillId: row.activity.skillId,
    });
  }
  for (const { studentId, skillId } of pairs.values()) {
    const attempts = await prismaUnscoped.activityAttempt.findMany({
      where: { studentId, activity: { skillId, id: { notIn: activityIds } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
      select: { correctCount: true, totalCount: true, createdAt: true },
    });
    if (attempts.length === 0) {
      await prismaUnscoped.studentSkillProgress.deleteMany({ where: { studentId, skillId } });
      continue;
    }
    const correct = attempts.reduce((sum, a) => sum + a.correctCount, 0);
    const total = attempts.reduce((sum, a) => sum + a.totalCount, 0);
    await prismaUnscoped.studentSkillProgress.updateMany({
      where: { studentId, skillId },
      data: {
        masteryPercent: total === 0 ? 0 : Math.round((correct / total) * 100),
        correctCount: correct,
        totalCount: total,
        attemptsCount: attempts.length,
        lastAssessedAt: attempts[0]!.createdAt,
      },
    });
  }
}

/**
 * An activity type, for good: its activities, and every child's results on it
 * at every school. Its title is typed back as the confirmation.
 */
export async function deleteActivity(
  activityId: string,
  confirm: string,
  actorUserId: string,
): Promise<{ title: string }> {
  const activity = await prismaUnscoped.learningActivity.findUnique({
    where: { id: activityId },
    select: { id: true, title: true, code: true },
  });
  if (!activity) throw ApiError.notFound('Activity type not found');
  if (!same(confirm, activity.title)) {
    throw ApiError.badRequest(`Type the activity type's name, “${activity.title}”, to confirm.`);
  }
  await forgetAttempts([activityId]);
  await prismaUnscoped.learningActivity.delete({ where: { id: activityId } });
  await writeAuditLog({
    action: 'ACTIVITY_DELETED',
    entity: 'LearningActivity',
    entityId: activityId,
    actorUserId,
    before: { title: activity.title, code: activity.code },
  });
  return { title: activity.title };
}

/**
 * A book, for good: its chapters, the activity types that are only in this
 * book — with every child's results on them — and its place at every school.
 * Activity types shared with another book stay, filed under that one. Its name
 * is typed back as the confirmation.
 */
export async function deleteBook(
  bookId: string,
  confirm: string,
  actorUserId: string,
): Promise<{ name: string }> {
  const book = await prismaUnscoped.book.findUnique({
    where: { id: bookId },
    select: {
      id: true,
      name: true,
      code: true,
      coverFileId: true,
      pdfFileId: true,
      chapters: { select: { id: true, coverFileId: true, pdfFileId: true } },
    },
  });
  if (!book) throw ApiError.notFound('Book not found');
  if (!same(confirm, book.name)) {
    throw ApiError.badRequest(`Type the book's name, “${book.name}”, to confirm.`);
  }

  const chapterIds = book.chapters.map((c) => c.id);
  const inBook = await prismaUnscoped.learningActivity.findMany({
    where: {
      allBooks: false,
      OR: [{ chapterId: { in: chapterIds } }, { books: { some: { bookId } } }],
    },
    select: { id: true, books: { select: { bookId: true } } },
  });
  // Only this book's: in no other book.
  const onlyHere = inBook
    .filter((activity) => activity.books.every((link) => link.bookId === bookId))
    .map((activity) => activity.id);

  await forgetAttempts(onlyHere);
  await prismaUnscoped.$transaction(async (tx) => {
    await tx.learningActivity.deleteMany({ where: { id: { in: onlyHere } } });
    // Shared ones stay, out of this book's chapters.
    await tx.learningActivity.updateMany({
      where: { chapterId: { in: chapterIds } },
      data: { chapterId: null },
    });
    await tx.book.delete({ where: { id: bookId } });
  });
  await removeFiles([
    book.coverFileId,
    book.pdfFileId,
    ...book.chapters.flatMap((c) => [c.coverFileId, c.pdfFileId]),
  ]);

  await writeAuditLog({
    action: 'BOOK_DELETED',
    entity: 'Book',
    entityId: bookId,
    actorUserId,
    before: { name: book.name, code: book.code, activityTypes: onlyHere.length },
  });
  return { name: book.name };
}

/**
 * A group, for good. Its branches carry on as independent schools — nothing in
 * them is touched — and its own administrators' accounts are erased.
 */
export async function deleteOrganisation(
  organisationId: string,
  actorUserId: string,
): Promise<{ name: string; branches: number }> {
  const organisation = await prismaUnscoped.organisation.findUnique({
    where: { id: organisationId },
    select: { id: true, name: true, code: true, _count: { select: { schools: true } } },
  });
  if (!organisation) throw ApiError.notFound('Group not found');

  await prismaUnscoped.$transaction(async (tx) => {
    await tx.school.updateMany({ where: { organisationId }, data: { organisationId: null } });
    // Group administrators: emptied the way any deleted account is, and freed
    // from the group so its delete does not take the rows with it.
    const admins = await tx.user.findMany({ where: { organisationId }, select: { id: true } });
    for (const admin of admins) {
      await tx.refreshToken.deleteMany({ where: { userId: admin.id } });
      await tx.user.update({
        where: { id: admin.id },
        data: {
          organisationId: null,
          name: 'Deleted account',
          email: null,
          phone: null,
          status: 'INACTIVE',
          deletedAt: new Date(),
        },
      });
    }
    await tx.organisation.delete({ where: { id: organisationId } });
  });

  await writeAuditLog({
    action: 'ORGANISATION_DELETED',
    entity: 'Organisation',
    entityId: organisationId,
    actorUserId,
    before: { name: organisation.name, code: organisation.code },
  });
  return { name: organisation.name, branches: organisation._count.schools };
}
