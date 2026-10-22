import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
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
import { backgroundSettled } from '../../src/lib/compress.js';
import { appAssetsDir, appPictures } from '../../src/services/pictureLibrary.service.js';

const dbUp = await isDatabaseReachable();

/** A picture worth compressing: a 64×64 PNG with something in it. */
const pictureOf = (colour: string): Promise<Buffer> =>
  sharp({ create: { width: 64, height: 64, channels: 4, background: colour } })
    .composite([
      {
        input: Buffer.from(
          '<svg width="64" height="64"><circle cx="32" cy="32" r="20" fill="#fff"/></svg>',
        ),
      },
    ])
    .png()
    .toBuffer();

describe('the app’s own pictures', () => {
  it('are the letter and number pictures, each once, named to be found', async () => {
    const dir = appAssetsDir();
    expect(dir).not.toBeNull();
    const pictures = await appPictures(dir!);

    // 115 letters across English, Hindi and Gujarati, and ten numbers whose
    // picture is the same in every language.
    expect(pictures).toHaveLength(125);
    expect(new Set(pictures.map((p) => p.file)).size).toBe(125);
    expect(pictures).toContainEqual({ file: 'letters/en/apple.webp', name: 'Apple (A).webp' });
    expect(pictures).toContainEqual({
      file: 'numbers/number_04_fish.png',
      name: 'Four fish (4).png',
    });
    expect(pictures.find((p) => p.file === 'letters/hi/u0905.webp')?.name).toBe('अनानस (अ).webp');
  });
});

describe.skipIf(!dbUp)('the picture library', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let publisher: Session;
  let admin: Session;
  let parent: Session;
  let red: Buffer;
  let blue: Buffer;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    publisher = await login(baseline.superAdminEmail);
    admin = await login(school.adminEmail);
    parent = await login(school.parentPhone);
    red = await pictureOf('#e11d48');
    blue = await pictureOf('#2563eb');
  });

  afterAll(async () => {
    // The book's PDF is made smaller after the answer.
    await backgroundSettled();
    await disconnectPrisma();
  });

  it('keeps one copy of a picture uploaded twice, and answers it again', async () => {
    const first = await api
      .post(`${BASE}/publication/assets`)
      .set(auth(publisher))
      .attach('file', red, 'red-ball.png');
    expect(first.status).toBe(201);
    expect(first.body.reused).toBe(false);
    // Stored smaller, looking the same.
    expect(first.body.mimeType).toBe('image/webp');

    const again = await api
      .post(`${BASE}/publication/assets`)
      .set(auth(publisher))
      .attach('file', red, 'another-name.png');
    expect(again.status).toBe(200);
    expect(again.body.reused).toBe(true);
    expect(again.body.id).toBe(first.body.id);
    expect(again.body.url).toBe(`/api/v1/catalogue/assets/${first.body.id}`);

    const rows = await prismaUnscoped.fileObject.count({
      where: { schoolId: null, checksum: { not: null }, mimeType: 'image/webp' },
    });
    expect(rows).toBe(1);

    // A different picture is a different picture.
    const other = await api
      .post(`${BASE}/publication/assets`)
      .set(auth(publisher))
      .attach('file', blue, 'blue-ball.png');
    expect(other.status).toBe(201);
    expect(other.body.id).not.toBe(first.body.id);
  });

  it('lists the catalogue’s pictures, newest first, and finds one by name', async () => {
    const all = await api.get(`${BASE}/publication/assets`).set(auth(publisher));
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(2);
    expect(all.body.items.map((p: { name: string }) => p.name)).toEqual([
      'blue-ball.webp',
      'red-ball.webp',
    ]);
    expect(all.body.items[0].url).toMatch(/^\/api\/v1\/catalogue\/assets\//);

    const found = await api
      .get(`${BASE}/publication/assets`)
      .query({ search: 'red' })
      .set(auth(publisher));
    expect(found.body.items.map((p: { name: string }) => p.name)).toEqual(['red-ball.webp']);

    const paged = await api
      .get(`${BASE}/publication/assets`)
      .query({ pageSize: 1, page: 2 })
      .set(auth(publisher));
    expect(paged.body.items).toHaveLength(1);
    expect(paged.body.totalPages).toBe(2);
  });

  it('never lists a school’s photographs or a book’s PDF', async () => {
    // A school's upload: a child's photograph, perhaps.
    const ours = await api
      .post(`${BASE}/files`)
      .set(auth(admin))
      .attach('file', await pictureOf('#16a34a'), 'a-child.png');
    expect(ours.status).toBe(201);

    // A book's PDF is publication-owned too, and is what a school pays for.
    const nursery = await prismaUnscoped.classLevel.findUniqueOrThrow({
      where: { code: 'NURSERY' },
      select: { id: true },
    });
    const book = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({ code: 'NUR_EVS', name: 'EVS Book', classLevelId: nursery.id });
    const pdf = await api
      .post(`${BASE}/publication/books/${book.body.id}/pdf`)
      .set(auth(publisher))
      .attach(
        'file',
        Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n'),
        'evs.pdf',
      );
    expect(pdf.status).toBe(200);

    const listed = await api
      .get(`${BASE}/publication/assets`)
      .query({ pageSize: 96 })
      .set(auth(publisher));
    const names = listed.body.items.map((p: { name: string }) => p.name);
    expect(names).not.toContain('a-child.png');
    expect(names).not.toContain('a-child.webp');
    expect(names).not.toContain('evs.pdf');
    expect(listed.body.total).toBe(2);
  });

  it('is the publisher’s alone', async () => {
    const listed = await api.get(`${BASE}/publication/assets`).set(auth(admin));
    expect(listed.status).toBe(403);
    const imported = await api.post(`${BASE}/publication/assets/app-pictures`).set(auth(admin));
    expect(imported.status).toBe(403);
  });

  it('brings in the app’s letter and number pictures once, however often asked', async () => {
    const first = await api.post(`${BASE}/publication/assets/app-pictures`).set(auth(publisher));
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ total: 125, added: 125, existing: 0 });

    const again = await api.post(`${BASE}/publication/assets/app-pictures`).set(auth(publisher));
    expect(again.body).toEqual({ total: 125, added: 0, existing: 125 });

    const apple = await api
      .get(`${BASE}/publication/assets`)
      .query({ search: 'Apple (A)' })
      .set(auth(publisher));
    expect(apple.body.items).toHaveLength(1);
    expect(apple.body.items[0].mimeType).toBe('image/webp');

    // Uploading the app's apple by hand is the same apple.
    const bytes = await readFile(path.join(appAssetsDir()!, 'letters/en/apple.webp'));
    const uploaded = await api
      .post(`${BASE}/publication/assets`)
      .set(auth(publisher))
      .attach('file', bytes, 'apple.webp');
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.id).toBe(apple.body.items[0].id);

    // A number's picture, made smaller like any other.
    const fish = await api
      .get(`${BASE}/publication/assets`)
      .query({ search: 'Four fish' })
      .set(auth(publisher));
    expect(fish.body.items).toHaveLength(1);
    const original = await readFile(path.join(appAssetsDir()!, 'numbers/number_04_fish.png'));
    expect(fish.body.items[0].sizeBytes).toBeLessThan(original.length);

    // And served to every school's families like the rest of the catalogue.
    const served = await api
      .get(`${BASE}/catalogue/assets/${apple.body.items[0].id}`)
      .set(auth(parent));
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toContain('image/webp');
  }, 120_000);
});
