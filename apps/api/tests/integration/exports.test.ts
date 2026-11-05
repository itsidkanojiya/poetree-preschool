import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import type { Response } from 'superagent';
import {
  isDatabaseReachable,
  resetDatabase,
  seedBaseline,
  seedSchool,
  TEST_PASSWORD,
  type Baseline,
  type TestSchool,
} from '../helpers/db.js';
import { api, auth, BASE, login, type Session } from '../helpers/api.js';
import { disconnectPrisma, prismaUnscoped } from '../../src/db/prisma.js';

const dbUp = await isDatabaseReachable();

/** The body as bytes: an .xlsx is a zip, not text. */
function binary(res: Response, done: (error: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
}

/** Every row of the file's one sheet, as text — the header first. */
async function sheetOf(body: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs declares its own Buffer (an ArrayBuffer); Node's is one underneath.
  await workbook.xlsx.load(body as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0]!;
  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const values = (row.values as unknown[]).slice(1);
    rows.push(values.map((value) => (value == null ? '' : String(value))));
  });
  return rows;
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * School records as Excel files, from both doors.
 *
 * What matters most is the boundary: a School Admin's file holds their school
 * and nothing else whatever the filters say, a teacher gets no file at all,
 * and the Super Admin's says which school every row is from.
 */
describe.skipIf(!dbUp)('exporting to Excel', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let other: TestSchool;
  let admin: Session;
  let publisher: Session;

  const schoolExport = (session: Session, query: Record<string, string>) =>
    api.get(`${BASE}/exports`).query(query).set(auth(session)).buffer(true).parse(binary);

  const globalExport = (query: Record<string, string>) =>
    api
      .get(`${BASE}/publication/exports`)
      .query(query)
      .set(auth(publisher))
      .buffer(true)
      .parse(binary);

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    other = await seedSchool(baseline, 'beta', 'Beta Preschool');
    admin = await login(school.adminEmail);
    publisher = await login(baseline.superAdminEmail);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  describe('a School Admin', () => {
    it('gets their students as a formatted Excel file', async () => {
      const response = await schoolExport(admin, { type: 'students' });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain(XLSX);
      expect(response.headers['content-disposition']).toMatch(
        /attachment; filename="alpha-students-\d{4}-\d{2}-\d{2}\.xlsx"/,
      );

      const [header, ...rows] = await sheetOf(response.body as Buffer);
      expect(header).toEqual(
        expect.arrayContaining(['Admission no.', 'Name', 'Standard', 'Section', 'Parents']),
      );
      // One school: no School column.
      expect(header).not.toContain('School');
      expect(rows).toHaveLength(1);

      const audited = await prismaUnscoped.auditLog.findFirst({
        where: { action: 'DATA_EXPORTED', entityId: 'students', schoolId: school.id },
      });
      expect(audited).not.toBeNull();
    });

    it('never sees another school, whatever the filters name', async () => {
      // Beta's own class, asked for by Alpha's admin.
      const response = await schoolExport(admin, {
        type: 'students',
        classroomId: other.classroomId,
      });
      expect(response.status).toBe(200);
      const [, ...rows] = await sheetOf(response.body as Buffer);
      expect(rows).toHaveLength(0);

      const own = await schoolExport(admin, { type: 'students', classroomId: school.classroomId });
      expect((await sheetOf(own.body as Buffer)).length - 1).toBe(1);
    });

    it('exports only what the filters match', async () => {
      const withdrawn = await schoolExport(admin, { type: 'students', status: 'WITHDRAWN' });
      expect((await sheetOf(withdrawn.body as Buffer)).length - 1).toBe(0);

      const inactive = await schoolExport(admin, { type: 'teachers', status: 'INACTIVE' });
      expect((await sheetOf(inactive.body as Buffer)).length - 1).toBe(0);

      // A status that does not apply to the kind of record is refused.
      const wrong = await api
        .get(`${BASE}/exports`)
        .query({ type: 'students', status: 'SUSPENDED' })
        .set(auth(admin));
      expect(wrong.status).toBe(400);
    });

    it('gets teachers, parents and classes too — and no secrets in any', async () => {
      for (const type of ['teachers', 'parents', 'classes']) {
        const response = await schoolExport(admin, { type });
        expect(response.status, type).toBe(200);
        const rows = await sheetOf(response.body as Buffer);
        expect(rows.length - 1, type).toBeGreaterThan(0);

        const text = rows.flat().join('|');
        // No password hash, and nothing named like one.
        expect(text).not.toMatch(/\$2[aby]\$/);
        expect(text).not.toContain(TEST_PASSWORD);
        expect(rows[0]!.join('|').toLowerCase()).not.toMatch(/password|token|otp/);
      }

      const parents = await sheetOf(
        (await schoolExport(admin, { type: 'parents' })).body as Buffer,
      );
      const children = parents[0]!.indexOf('Children');
      expect(parents[1]![children]).toContain('(');
    });

    it('streams a large export in batches', async () => {
      await prismaUnscoped.student.createMany({
        data: Array.from({ length: 1200 }, (_, i) => ({
          schoolId: school.id,
          admissionNo: `BULK-${i}`,
          firstName: `Child${i}`,
          dateOfBirth: new Date('2022-01-01'),
          gender: 'OTHER' as const,
        })),
      });

      const response = await schoolExport(admin, { type: 'students' });
      expect(response.status).toBe(200);
      expect((await sheetOf(response.body as Buffer)).length - 1).toBe(1201);
    });

    it('is not for a teacher', async () => {
      const teacher = await login(school.teacherEmail);
      const response = await api
        .get(`${BASE}/exports`)
        .query({ type: 'students' })
        .set(auth(teacher));
      expect(response.status).toBe(403);
    });

    it('cannot use the Super Admin’s export', async () => {
      const response = await api
        .get(`${BASE}/publication/exports`)
        .query({ type: 'students' })
        .set(auth(admin));
      expect(response.status).toBe(403);
    });
  });

  describe('the Super Admin', () => {
    it('exports across every school, each row naming its school', async () => {
      const response = await globalExport({ type: 'teachers' });
      expect(response.status).toBe(200);
      expect(response.headers['content-disposition']).toContain('all-schools-teachers');

      const [header, ...rows] = await sheetOf(response.body as Buffer);
      expect(header!.slice(0, 2)).toEqual(['School', 'School ID']);
      expect(rows.map((row) => row[1]).sort()).toEqual(['alpha', 'beta']);
    });

    it('exports one school, or several', async () => {
      const one = await globalExport({ type: 'parents', schoolIds: other.id });
      const oneRows = (await sheetOf(one.body as Buffer)).slice(1);
      expect(oneRows.map((row) => row[1])).toEqual(['beta']);

      const both = await globalExport({ type: 'parents', schoolIds: `${school.id},${other.id}` });
      expect((await sheetOf(both.body as Buffer)).length - 1).toBe(2);
    });

    it('filters by standard, section, year and status', async () => {
      const nursery = await prismaUnscoped.classLevel.findUniqueOrThrow({
        where: { code: 'NURSERY' },
        select: { id: true },
      });
      const classroom = await prismaUnscoped.classroom.findUniqueOrThrow({
        where: { id: other.classroomId },
        select: { section: true, classLevelId: true, academicYear: { select: { name: true } } },
      });

      const matching = await globalExport({
        type: 'students',
        schoolIds: other.id,
        classLevelId: classroom.classLevelId,
        section: classroom.section,
        academicYear: classroom.academicYear.name,
        status: 'ACTIVE',
      });
      expect((await sheetOf(matching.body as Buffer)).length - 1).toBe(1);

      const none = await globalExport({ type: 'students', section: 'no-such-section' });
      expect((await sheetOf(none.body as Buffer)).length - 1).toBe(0);
      expect(nursery.id).toBeTruthy();
    });

    it('exports the schools themselves, with their counts', async () => {
      const response = await globalExport({ type: 'schools' });
      const [header, ...rows] = await sheetOf(response.body as Buffer);
      expect(header).toEqual(expect.arrayContaining(['School', 'School ID', 'Active children']));
      expect(rows.map((row) => row[1]).sort()).toEqual(['alpha', 'beta']);
    });

    it('is offered the schools, standards, years and sections to filter by', async () => {
      const filters = await api.get(`${BASE}/publication/exports/filters`).set(auth(publisher));
      expect(filters.status).toBe(200);
      expect(filters.body.schools.map((s: { code: string }) => s.code).sort()).toEqual([
        'alpha',
        'beta',
      ]);
      expect(filters.body.standards.length).toBeGreaterThan(0);
      expect(filters.body.academicYears.length).toBeGreaterThan(0);
    });

    it('refuses an id that is not one', async () => {
      const response = await api
        .get(`${BASE}/publication/exports`)
        .query({ type: 'students', schoolIds: 'not-an-id' })
        .set(auth(publisher));
      expect(response.status).toBe(400);
    });
  });
});
