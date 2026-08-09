import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { ERROR_CODES } from '@poetree/shared';
import { prisma, TENANT_MODELS } from '../../src/db/prisma.js';
import { runWithRequestContext } from '../../src/context/requestContext.js';
import { isApiError } from '../../src/lib/apiError.js';
import { scopeKeyFor, slugify, PUBLICATION_SCOPE } from '../../src/lib/scope.js';

/**
 * These run without a database. The isolation extension rejects an unscoped
 * query *before* it reaches the engine, which is exactly the property worth
 * proving cheaply on every commit.
 */
describe('tenant isolation — fail closed', () => {
  async function captureError(promise: Promise<unknown>): Promise<unknown> {
    try {
      await promise;
      throw new Error('Expected the query to be rejected, but it resolved');
    } catch (error) {
      return error;
    }
  }

  it('refuses a tenant query with no request context', async () => {
    const error = await captureError(prisma.student.findMany());
    expect(isApiError(error)).toBe(true);
    expect((error as { code: string }).code).toBe(ERROR_CODES.TENANT_CONTEXT_MISSING);
  });

  it('refuses a tenant create with no request context', async () => {
    const error = await captureError(
      prisma.user.create({
        data: { scopeKey: 'x', name: 'Nobody', passwordHash: 'x', role: 'TEACHER' },
      }),
    );
    expect(isApiError(error)).toBe(true);
    expect((error as { code: string }).code).toBe(ERROR_CODES.TENANT_CONTEXT_MISSING);
  });

  it('refuses a tenant query for a Super Admin, who has no single school', async () => {
    const error = await captureError(
      runWithRequestContext(
        { requestId: 'r1', userId: 'u1', role: 'PUBLICATION_ADMIN', schoolId: null },
        () => prisma.student.findMany(),
      ),
    );
    expect(isApiError(error)).toBe(true);
    expect((error as { code: string }).code).toBe(ERROR_CODES.TENANT_CONTEXT_MISSING);
    expect((error as Error).message).toContain('prismaUnscoped');
  });

  /**
   * The guard that matters most in this file.
   *
   * A model carrying `schoolId` that is missing from TENANT_MODELS is queried
   * completely unfiltered — a cross-tenant leak, not a missing feature. This
   * once shipped: StudentEnrolment was added to the schema without being listed,
   * and one school's admin could read another school's children.
   *
   * So rather than restating a hand-written list, this reads the actual schema
   * and forces every schoolId-bearing model to be either scoped or explicitly,
   * deliberately exempt.
   */
  it('scopes every model in the schema that carries schoolId', () => {
    const DELIBERATELY_UNSCOPED = new Set([
      // Publication-owned; read by every school through prismaUnscoped.
      'FileObject',
      // Must never be filtered, or an audit trail could be suppressed.
      'AuditLog',
      // Super Admin surface only, and read system-side before any tenant
      // context exists (the plan-status gate).
      'SchoolSubscription',
    ]);

    const withSchoolId = Prisma.dmmf.datamodel.models
      .filter((model) => model.fields.some((field) => field.name === 'schoolId'))
      .map((model) => model.name);

    const unguarded = withSchoolId.filter(
      (name) => !TENANT_MODELS.has(name) && !DELIBERATELY_UNSCOPED.has(name),
    );

    expect(unguarded).toEqual([]);

    // And nothing is listed that no longer exists in the schema.
    const modelNames = new Set(Prisma.dmmf.datamodel.models.map((m) => m.name));
    expect([...TENANT_MODELS].filter((name) => !modelNames.has(name))).toEqual([]);
  });
});

describe('scope key', () => {
  it('collapses a null school to the publication sentinel', () => {
    expect(scopeKeyFor(null)).toBe(PUBLICATION_SCOPE);
    expect(scopeKeyFor(undefined)).toBe(PUBLICATION_SCOPE);
    expect(scopeKeyFor('school_123')).toBe('school_123');
  });

  it('builds a readable, code-suffixed slug', () => {
    expect(slugify('Sunrise Preschool', 'sunrise')).toBe('sunrise-preschool-sunrise');
    expect(slugify('!!!', 'abc')).toBe('abc');
  });
});
