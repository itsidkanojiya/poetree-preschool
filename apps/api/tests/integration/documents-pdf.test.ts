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
import { prismaUnscoped, disconnectPrisma } from '../../src/db/prisma.js';
import { rupeesInWords } from '../../src/lib/pdf.js';
import { runWithRequestContext } from '../../src/context/requestContext.js';
import { schoolLetterhead } from '../../src/services/document.service.js';

const dbUp = await isDatabaseReachable();

/**
 * Receipts and fee cards.
 *
 * A receipt is what a parent is actually handed, so these check the bytes are
 * a real PDF and that the guard holds — not merely that the endpoint answers.
 */
describe.skipIf(!dbUp)('printable documents', () => {
  let baseline: Baseline;
  let schoolA: TestSchool;
  let schoolB: TestSchool;
  let adminA: Session;
  let adminB: Session;
  let parentA: Session;

  let paymentId: string;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    schoolA = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    schoolB = await seedSchool(baseline, 'beta', 'Beta Preschool');

    adminA = await login(schoolA.adminEmail);
    adminB = await login(schoolB.adminEmail);
    parentA = await login(schoolA.parentPhone);

    // A school with an address, so the letterhead has something to print.
    await prismaUnscoped.school.update({
      where: { id: schoolA.id },
      data: {
        addressLine1: '14 Gulmohar Road',
        city: 'Pune',
        state: 'Maharashtra',
        postalCode: '411001',
        phone: '+912012345678',
        email: 'office@alpha.test',
      },
    });

    const payment = await api
      .post(`${BASE}/fees/payments`)
      .set(auth(adminA))
      .send({
        studentId: schoolA.studentId,
        amountInPaise: 1_250_000,
        method: 'UPI',
        paidOn: new Date().toISOString().slice(0, 10),
        reference: 'UPI-77421',
      });

    expect(payment.status).toBe(201);

    const row = await prismaUnscoped.payment.findFirstOrThrow({
      where: { studentId: schoolA.studentId },
    });
    paymentId = row.id;
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnectPrisma();
  });

  it('renders a receipt as a real PDF', async () => {
    const response = await api
      .get(`${BASE}/fees/payments/${paymentId}/receipt`)
      .set(auth(adminA))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');

    const pdf = response.body as Buffer;
    // The magic number, and a trailer — a truncated render would have one
    // without the other.
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-1024).toString('latin1')).toContain('%%EOF');

    // The font actually has to be embedded. PDF's built-in Helvetica carries
    // no U+20B9, so a silent fallback prints a blank box where every amount's
    // rupee sign belongs — a receipt that looks broken to whoever files it.
    //
    // Checked by name rather than by file size: PDFKit subsets to the glyphs
    // used, so a correct receipt is only a few kilobytes and a size threshold
    // cannot tell a subset from a fallback.
    const raw = pdf.toString('latin1');
    expect(raw).toContain('Poppins');
    expect(raw).toContain('FontFile2');
    expect(raw).not.toContain('Helvetica');
  });

  it('lets a parent print their own child’s receipt', async () => {
    const response = await api
      .get(`${BASE}/fees/payments/${paymentId}/receipt`)
      .set(auth(parentA));

    expect(response.status).toBe(200);
  });

  it('keeps another school out of it', async () => {
    const response = await api
      .get(`${BASE}/fees/payments/${paymentId}/receipt`)
      .set(auth(adminB));

    expect(response.status).toBe(404);
  });

  it('renders a fee card for a child', async () => {
    const response = await api
      .get(`${BASE}/fees/students/${schoolA.studentId}/fee-card`)
      .set(auth(adminA))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('will not print a fee card for someone else’s child', async () => {
    const response = await api
      .get(`${BASE}/fees/students/${schoolB.studentId}/fee-card`)
      .set(auth(parentA));

    expect(response.status).toBe(404);
  });

  it('puts each school’s own name on its own paperwork', async () => {
    // This was wrong, and quietly. `schoolLetterhead` fetched the school with
    // findFirstOrThrow and no `where`, and School is not a tenant model — it IS
    // the school, so it carries no schoolId for the extension to filter on. The
    // query returned whichever row the database handed back first, so every
    // school but one printed somebody else's name, address and telephone
    // number on its receipts and fee cards.
    //
    // Nothing caught it because the only school with an address in the fixture
    // was also the first one created. Two schools, two contexts, and the
    // letterhead read directly is the cheapest way to keep it caught.
    const forA = await runWithRequestContext(
      { requestId: 'r-a', userId: adminA.userId, role: 'SCHOOL_ADMIN', schoolId: schoolA.id },
      () => schoolLetterhead(),
    );
    const forB = await runWithRequestContext(
      { requestId: 'r-b', userId: adminB.userId, role: 'SCHOOL_ADMIN', schoolId: schoolB.id },
      () => schoolLetterhead(),
    );

    expect(forA.name).toBe('Alpha Preschool');
    expect(forB.name).toBe('Beta Preschool');
  });
});

describe('amounts in words', () => {
  // Indian grouping, not millions — a receipt reading "one million two hundred
  // thousand" would look wrong to everyone who has to file it.
  it('groups in lakh and crore', () => {
    expect(rupeesInWords(1_250_000)).toBe('Twelve Thousand Five Hundred Rupees only');
    expect(rupeesInWords(10_000_000)).toBe('One Lakh Rupees only');
    expect(rupeesInWords(100_000_000)).toBe('Ten Lakh Rupees only');
    expect(rupeesInWords(1_000_000_000)).toBe('One Crore Rupees only');
  });

  it('carries paise when there are any', () => {
    expect(rupeesInWords(150_075)).toBe('One Thousand Five Hundred Rupees and Seventy Five Paise only');
  });

  it('handles zero and a refund', () => {
    expect(rupeesInWords(0)).toBe('Zero Rupees only');
    expect(rupeesInWords(-50_000)).toBe('Five Hundred Rupees only');
  });});
