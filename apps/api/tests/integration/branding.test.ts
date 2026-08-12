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
import { disconnectPrisma, prismaUnscoped } from '../../src/db/prisma.js';

const dbUp = await isDatabaseReachable();

/** A real 1x1 PNG. A fabricated row has no bytes on disk and would 404. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe.skipIf(!dbUp)('school branding', () => {
  let baseline: Baseline;
  let schoolA: TestSchool;
  let schoolB: TestSchool;
  let publisher: Session;
  let adminA: Session;
  let logoId: string;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    schoolA = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    schoolB = await seedSchool(baseline, 'beta', 'Beta Preschool');

    publisher = await login(baseline.superAdminEmail);
    adminA = await login(schoolA.adminEmail);

    const upload = await api
      .post(`${BASE}/files`)
      .set(auth(adminA))
      .attach('file', TINY_PNG, 'logo.png');
    logoId = upload.body.id as string;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('gives a sign-in screen what it needs before anyone has signed in', async () => {
    await api
      .put(`${BASE}/publication/schools/${schoolA.id}/logo`)
      .set(auth(publisher))
      .send({ fileId: logoId });

    // No token at all. This is the whole point: the app is branded on the
    // screen where nobody is signed in yet.
    const branding = await api.get(`${BASE}/public/schools/alpha/branding`);

    expect(branding.status).toBe(200);
    expect(branding.body.name).toBe('Alpha Preschool');
    expect(branding.body.logoUrl).toBe('/api/v1/public/schools/alpha/logo');

    const logo = await api.get(`${BASE}/public/schools/alpha/logo`);
    expect(logo.status).toBe(200);
    expect(logo.headers['content-type']).toContain('image/png');
  });

  it('says nothing about a school beyond what is painted on its gate', async () => {
    const branding = await api.get(`${BASE}/public/schools/alpha/branding`);

    // Anyone who knows the code can read this, so the shape is the guarantee.
    expect(Object.keys(branding.body).sort()).toEqual([
      'code',
      'id',
      'logoUrl',
      'name',
      'primaryColor',
    ]);
  });

  it('cannot be turned into a way to read somebody else’s files', async () => {
    // Only the nominated logo, reached by school code. A file id is not a key
    // here — otherwise this would be an unauthenticated read of every upload.
    //
    // 404 rather than 400: a cuid happens to satisfy the school-code pattern,
    // so it gets as far as the lookup and finds no school. That is the better
    // answer anyway — it says nothing about whether the file exists.
    const byId = await api.get(`${BASE}/public/schools/${logoId}/logo`);
    expect(byId.status).toBe(404);

    const unknown = await api.get(`${BASE}/public/schools/nosuchschool/logo`);
    expect(unknown.status).toBe(404);

    const noLogo = await api.get(`${BASE}/public/schools/beta/logo`);
    expect(noLogo.status).toBe(404);
  });

  it('will not let one school wear another’s badge', async () => {
    const stolen = await api
      .put(`${BASE}/publication/schools/${schoolB.id}/logo`)
      .set(auth(publisher))
      .send({ fileId: logoId });

    expect(stolen.status).toBe(400);
  });

  it('refuses a logo that is not a picture', async () => {
    const pdf = await api
      .post(`${BASE}/files`)
      .set(auth(adminA))
      .attach('file', Buffer.from('%PDF-1.4\n%����\n1 0 obj\n<<>>\nendobj\n'), 'letter.pdf');

    const response = await api
      .put(`${BASE}/publication/schools/${schoolA.id}/logo`)
      .set(auth(publisher))
      .send({ fileId: pdf.body.id });

    expect(response.status).toBe(400);
  });

  it('keeps the school out of its own branding', async () => {
    // Branding is the publisher's to set — it is what the school is buying.
    const response = await api
      .put(`${BASE}/publication/schools/${schoolA.id}/logo`)
      .set(auth(adminA))
      .send({ fileId: null });

    expect(response.status).toBe(403);
  });

  it('takes the logo away again when it is cleared', async () => {
    await api
      .put(`${BASE}/publication/schools/${schoolA.id}/logo`)
      .set(auth(publisher))
      .send({ fileId: null });

    const branding = await api.get(`${BASE}/public/schools/alpha/branding`);
    expect(branding.body.logoUrl).toBeNull();

    const stored = await prismaUnscoped.school.findUnique({
      where: { id: schoolA.id },
      select: { logoFileId: true },
    });
    expect(stored!.logoFileId).toBeNull();
  });
});
