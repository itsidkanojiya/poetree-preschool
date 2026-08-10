import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@poetree/shared';
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

const dbUp = await isDatabaseReachable();

/** A real 1x1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe.skipIf(!dbUp)('file uploads', () => {
  let baseline: Baseline;
  let schoolA: TestSchool;
  let schoolB: TestSchool;
  let adminA: Session;
  let adminB: Session;
  let fileId: string;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    schoolA = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    schoolB = await seedSchool(baseline, 'beta', 'Beta Preschool');
    adminA = await login(schoolA.adminEmail);
    adminB = await login(schoolB.adminEmail);
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnectPrisma();
  });

  it('accepts a genuine image', async () => {
    const response = await api
      .post(`${BASE}/files`)
      .set(auth(adminA))
      .attach('file', PNG, { filename: 'child.png', contentType: 'image/png' });

    expect(response.status).toBe(201);
    expect(response.body.mimeType).toBe('image/png');
    fileId = response.body.id;
  });

  it('refuses a file pretending to be an image', async () => {
    // Named .png, declared image/png, but the bytes are a script. Trusting
    // either the name or the header is how a server ends up storing something
    // a browser will happily execute.
    const response = await api
      .post(`${BASE}/files`)
      .set(auth(adminA))
      .attach('file', Buffer.from('<?php system($_GET["c"]); ?>'), {
        filename: 'innocent.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  it('stores a generated name, never the one supplied', async () => {
    const response = await api
      .post(`${BASE}/files`)
      .set(auth(adminA))
      .attach('file', PNG, { filename: '../../../etc/passwd.png', contentType: 'image/png' });

    expect(response.status).toBe(201);

    const stored = await prismaUnscoped.fileObject.findFirstOrThrow({
      where: { id: response.body.id },
    });

    // The original is metadata only; the path is a UUID and cannot traverse.
    expect(stored.storageKey).not.toContain('..');
    expect(stored.storageKey).toMatch(/[0-9a-f-]{36}\.png$/);
    expect(stored.originalName).toContain('passwd');
  });

  it('keeps a file invisible to another school', async () => {
    const response = await api.get(`${BASE}/files/${fileId}`).set(auth(adminB));

    // Missing, not forbidden — a 403 would confirm the file exists.
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('refuses a parent a file nothing of theirs references', async () => {
    const parent = await login(schoolA.parentPhone);
    const response = await api.get(`${BASE}/files/${fileId}`).set(auth(parent));

    expect(response.status).toBe(404);
  });

  it('serves the file to someone entitled to it', async () => {
    const response = await api.get(`${BASE}/files/${fileId}`).set(auth(adminA));

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/png');
    expect(response.headers['cache-control']).toContain('private');
  });

  it('lets the uploader remove it, and keeps it out of later reads', async () => {
    const remove = await api.delete(`${BASE}/files/${fileId}`).set(auth(adminA));
    expect(remove.status).toBe(204);

    // Soft deleted: the row survives for recovery, but the isolation extension
    // filters it out of every ordinary read.
    const after = await api.get(`${BASE}/files/${fileId}`).set(auth(adminA));
    expect(after.status).toBe(404);

    const row = await prismaUnscoped.fileObject.findFirstOrThrow({ where: { id: fileId } });
    expect(row.deletedAt).not.toBeNull();
  });
});
