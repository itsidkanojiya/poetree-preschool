import { describe, expect, it } from 'vitest';
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

  it('covers every model that carries schoolId', () => {
    // A tenant-owned model missing from this set would be queried unfiltered.
    expect([...TENANT_MODELS].sort()).toEqual(
      [
        'AcademicYear',
        'Classroom',
        'ParentProfile',
        'Student',
        'StudentGuardian',
        'TeacherProfile',
        'User',
      ].sort(),
    );
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
