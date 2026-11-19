import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isDatabaseReachable,
  resetDatabase,
  seedBaseline,
  seedSchool,
  type Baseline,
  type TestSchool,
} from '../helpers/db.js';
import { api, auth, BASE, login, type Session } from '../helpers/api.js';
import { disconnectPrisma, prismaUnscoped as db } from '../../src/db/prisma.js';

const dbUp = await isDatabaseReachable();

/**
 * Every permanent delete the office and the publisher have: each erases what
 * it says, refuses what it should, and touches nothing of anybody else.
 */
describe.skipIf(!dbUp)('permanent deletes', () => {
  let baseline: Baseline;
  let alpha: TestSchool;
  let beta: TestSchool;
  let admin: Session;
  let publisher: Session;
  let serial = 0;

  const next = () => (serial += 1);

  /** A child of Alpha's with an invoice, a payment on it and its allocation. */
  const billedChild = async (paid = true) => {
    const n = next();
    const student = await db.student.create({
      data: {
        schoolId: alpha.id,
        admissionNo: `HD-${n}`,
        firstName: `Child${n}`,
        dateOfBirth: new Date('2021-01-01'),
        gender: 'FEMALE',
      },
    });
    const head = await db.feeHead.create({
      data: { schoolId: alpha.id, code: `TUITION${n}`, name: 'Tuition' },
    });
    const invoice = await db.feeInvoice.create({
      data: {
        schoolId: alpha.id,
        studentId: student.id,
        academicYearId: alpha.academicYearId,
        invoiceNo: `INV-HD-${n}`,
        periodLabel: 'June',
        dueDate: new Date('2026-06-30'),
        grossInPaise: 100_000,
        netInPaise: 100_000,
        paidInPaise: paid ? 100_000 : 0,
        status: paid ? 'PAID' : 'ISSUED',
        lines: {
          create: {
            schoolId: alpha.id,
            feeHeadId: head.id,
            description: 'Tuition',
            amountInPaise: 100_000,
          },
        },
      },
    });
    const payment = paid
      ? await db.payment.create({
          data: {
            schoolId: alpha.id,
            studentId: student.id,
            receiptNo: `RCP-HD-${n}`,
            amountInPaise: 100_000,
            paidOn: new Date(),
            recordedById: alpha.adminId,
            allocations: {
              create: { schoolId: alpha.id, invoiceId: invoice.id, amountInPaise: 100_000 },
            },
          },
        })
      : null;
    return { student, invoice, payment };
  };

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    alpha = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    beta = await seedSchool(baseline, 'beta', 'Beta Preschool');
    admin = await login(alpha.adminEmail);
    publisher = await login(baseline.superAdminEmail);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  describe('a child', () => {
    it('is erased with every record, once the admission number is typed', async () => {
      const { student, invoice, payment } = await billedChild();

      const wrong = await api
        .delete(`${BASE}/students/${student.id}/permanently`)
        .set(auth(admin))
        .send({ confirm: 'nope' });
      expect(wrong.status).toBe(400);

      const erased = await api
        .delete(`${BASE}/students/${student.id}/permanently`)
        .set(auth(admin))
        .send({ confirm: student.admissionNo.toLowerCase() });
      expect(erased.status).toBe(200);
      expect(await db.student.count({ where: { id: student.id } })).toBe(0);
      expect(await db.feeInvoice.count({ where: { id: invoice.id } })).toBe(0);
      expect(await db.payment.count({ where: { id: payment!.id } })).toBe(0);
      // Beta's child is untouched.
      expect(await db.student.count({ where: { id: beta.studentId } })).toBe(1);
    });

    it('is not another school’s to erase', async () => {
      const other = await login(beta.adminEmail);
      const response = await api
        .delete(`${BASE}/students/${alpha.studentId}/permanently`)
        .set(auth(other))
        .send({ confirm: 'anything' });
      expect(response.status).toBe(404);
    });
  });

  describe('fees', () => {
    it('deleting a payment makes the invoice owed again, and takes its refund', async () => {
      const { invoice, payment } = await billedChild();
      await api.post(`${BASE}/fees/payments/${payment!.id}/refund`).set(auth(admin)).send({
        reason: 'Paid twice',
      });
      const refund = await db.payment.findFirstOrThrow({
        where: { reference: payment!.receiptNo, amountInPaise: { lt: 0 } },
      });

      // A refund alone is not deleted.
      const refused = await api.delete(`${BASE}/fees/payments/${refund.id}`).set(auth(admin));
      expect(refused.status).toBe(400);

      const deleted = await api.delete(`${BASE}/fees/payments/${payment!.id}`).set(auth(admin));
      expect(deleted.status).toBe(204);
      expect(await db.payment.count({ where: { id: { in: [payment!.id, refund.id] } } })).toBe(0);
      const owed = await db.feeInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
      expect(owed.paidInPaise).toBe(0);
    });

    it('deletes an invoice only once no payment is on it', async () => {
      const { invoice, payment } = await billedChild();
      const refused = await api.delete(`${BASE}/fees/invoices/${invoice.id}`).set(auth(admin));
      expect(refused.status).toBe(409);

      await api.delete(`${BASE}/fees/payments/${payment!.id}`).set(auth(admin));
      const deleted = await api.delete(`${BASE}/fees/invoices/${invoice.id}`).set(auth(admin));
      expect(deleted.status).toBe(204);
      expect(await db.feeInvoice.count({ where: { id: invoice.id } })).toBe(0);
    });

    it('is the office’s alone', async () => {
      const { invoice } = await billedChild(false);
      const teacher = await login(alpha.teacherEmail);
      const response = await api.delete(`${BASE}/fees/invoices/${invoice.id}`).set(auth(teacher));
      expect(response.status).toBe(403);
    });
  });

  describe('a classroom', () => {
    it('is refused while children are in it, and deleted once empty', async () => {
      const busy = await api.delete(`${BASE}/classrooms/${alpha.classroomId}`).set(auth(admin));
      expect(busy.status).toBe(409);
      expect(busy.body.error.message).toContain('Move them');

      const level = await db.classLevel.findFirstOrThrow({ select: { id: true } });
      const empty = await db.classroom.create({
        data: {
          schoolId: alpha.id,
          academicYearId: alpha.academicYearId,
          classLevelId: level.id,
          section: 'Z',
        },
      });
      const deleted = await api.delete(`${BASE}/classrooms/${empty.id}`).set(auth(admin));
      expect(deleted.status).toBe(204);
      expect(await db.classroom.count({ where: { id: empty.id } })).toBe(0);
    });
  });

  describe('the office’s other records', () => {
    it('deletes an announcement, a registration, a term and an issued certificate', async () => {
      const notice = await db.notice.create({
        data: { schoolId: alpha.id, title: 'Old news', body: 'x', createdById: alpha.adminId },
      });
      const registration = await db.parentRegistration.create({
        data: {
          schoolId: alpha.id,
          guardianName: 'Some Parent',
          phone: '+919820009191',
          passwordHash: 'x',
          studentName: 'Some Child',
        },
      });
      const term = await db.term.create({
        data: { schoolId: alpha.id, academicYearId: alpha.academicYearId, name: 'Term 1' },
      });
      const certificate = await db.certificate.create({
        data: {
          schoolId: alpha.id,
          title: 'Star of the Month',
          body: 'Well done',
          issuedOn: new Date(),
          issuedAt: new Date(),
          awards: { create: { schoolId: alpha.id, studentId: alpha.studentId } },
        },
      });

      for (const path of [
        `/notices/${notice.id}`,
        `/registrations/${registration.id}`,
        `/results/terms/${term.id}`,
        `/certificates/${certificate.id}`,
      ]) {
        const response = await api.delete(`${BASE}${path}`).set(auth(admin));
        expect([path, response.status]).toEqual([path, 204]);
      }
      expect(await db.notice.count({ where: { id: notice.id } })).toBe(0);
      expect(await db.parentRegistration.count({ where: { id: registration.id } })).toBe(0);
      expect(await db.term.count({ where: { id: term.id } })).toBe(0);
      expect(await db.certificate.count({ where: { id: certificate.id } })).toBe(0);
    });

    it('does not let a teacher delete an announcement', async () => {
      const notice = await db.notice.create({
        data: { schoolId: alpha.id, title: 'Keep me', body: 'x', createdById: alpha.adminId },
      });
      const teacher = await login(alpha.teacherEmail);
      const response = await api.delete(`${BASE}/notices/${notice.id}`).set(auth(teacher));
      expect(response.status).toBe(403);
    });
  });

  describe('the catalogue', () => {
    /** A book with a chapter, an activity only in it, one shared with another book, and a child's result. */
    const shelf = async () => {
      const n = next();
      const level = await db.classLevel.findFirstOrThrow({ select: { id: true } });
      const skill = await db.skill.create({ data: { code: `HD_SKILL_${n}`, name: 'Counting' } });
      const book = await db.book.create({
        data: { code: `HD_BOOK_${n}`, name: `Doomed Book ${n}`, classLevelId: level.id },
      });
      const keep = await db.book.create({
        data: { code: `HD_KEEP_${n}`, name: `Kept Book ${n}`, classLevelId: level.id },
      });
      const chapter = await db.chapter.create({ data: { bookId: book.id, name: 'Numbers' } });
      const only = await db.learningActivity.create({
        data: {
          code: `HD_ONLY_${n}`,
          title: `Count the apples ${n}`,
          type: 'SINGLE_CHOICE',
          skillId: skill.id,
          chapterId: chapter.id,
          books: { create: { bookId: book.id } },
        },
      });
      const shared = await db.learningActivity.create({
        data: {
          code: `HD_SHARED_${n}`,
          title: `Shared ${n}`,
          type: 'SINGLE_CHOICE',
          skillId: skill.id,
          books: { create: [{ bookId: book.id }, { bookId: keep.id }] },
        },
      });
      await db.activityAttempt.create({
        data: {
          schoolId: alpha.id,
          studentId: alpha.studentId,
          activityId: only.id,
          correctCount: 3,
          totalCount: 4,
        },
      });
      await db.studentSkillProgress.create({
        data: {
          schoolId: alpha.id,
          studentId: alpha.studentId,
          skillId: skill.id,
          academicYearId: alpha.academicYearId,
          masteryPercent: 75,
          correctCount: 3,
          totalCount: 4,
          attemptsCount: 1,
          lastAssessedAt: new Date(),
        },
      });
      return { book, keep, chapter, only, shared, skill };
    };

    it('deletes a book with what only it held, keeping what another book shares', async () => {
      const { book, only, shared, skill } = await shelf();

      const wrong = await api
        .delete(`${BASE}/publication/books/${book.id}`)
        .set(auth(publisher))
        .send({ confirm: 'Wrong name' });
      expect(wrong.status).toBe(400);

      const deleted = await api
        .delete(`${BASE}/publication/books/${book.id}`)
        .set(auth(publisher))
        .send({ confirm: book.name });
      expect(deleted.status).toBe(200);
      expect(await db.book.count({ where: { id: book.id } })).toBe(0);
      expect(await db.learningActivity.count({ where: { id: only.id } })).toBe(0);
      expect(await db.learningActivity.count({ where: { id: shared.id } })).toBe(1);
      expect(await db.activityAttempt.count({ where: { activityId: only.id } })).toBe(0);
      // The child's skill had only that result behind it, so it goes too.
      expect(
        await db.studentSkillProgress.count({
          where: { studentId: alpha.studentId, skillId: skill.id },
        }),
      ).toBe(0);
    });

    it('deletes an activity type and the results on it, once its name is typed', async () => {
      const { only } = await shelf();
      const deleted = await api
        .delete(`${BASE}/publication/activities/${only.id}`)
        .set(auth(publisher))
        .send({ confirm: only.title.toUpperCase() });
      expect(deleted.status).toBe(200);
      expect(await db.learningActivity.count({ where: { id: only.id } })).toBe(0);
      expect(await db.activityAttempt.count({ where: { activityId: only.id } })).toBe(0);
    });

    it('is the publisher’s alone', async () => {
      const { book } = await shelf();
      const response = await api
        .delete(`${BASE}/publication/books/${book.id}`)
        .set(auth(admin))
        .send({ confirm: book.name });
      expect(response.status).toBe(403);
    });
  });

  describe('a group', () => {
    it('is deleted; its branches carry on as schools and its admins are erased', async () => {
      const group = await db.organisation.create({
        data: { publicationId: baseline.publicationId, name: 'Doomed Group', code: 'doomedgroup' },
      });
      await db.school.update({ where: { id: beta.id }, data: { organisationId: group.id } });
      const groupAdmin = await db.user.create({
        data: {
          organisationId: group.id,
          scopeKey: `org:${group.id}`,
          name: 'Group Admin',
          email: 'group.admin@doomed.test',
          passwordHash: 'x',
          role: 'ORG_ADMIN',
        },
      });

      const deleted = await api
        .delete(`${BASE}/publication/organisations/${group.id}`)
        .set(auth(publisher));
      expect(deleted.status).toBe(200);
      expect(await db.organisation.count({ where: { id: group.id } })).toBe(0);
      const school = await db.school.findUniqueOrThrow({ where: { id: beta.id } });
      expect(school.organisationId).toBeNull();
      const erased = await db.user.findUniqueOrThrow({ where: { id: groupAdmin.id } });
      expect(erased).toMatchObject({ email: null, name: 'Deleted account' });
    });
  });

  describe('progress', () => {
    it('resets a child to zero', async () => {
      await api.delete(`${BASE}/progress/students/${alpha.studentId}`).set(auth(admin)).expect(204);
      expect(await db.activityAttempt.count({ where: { studentId: alpha.studentId } })).toBe(0);
      expect(await db.studentSkillProgress.count({ where: { studentId: alpha.studentId } })).toBe(
        0,
      );
    });
  });
});
