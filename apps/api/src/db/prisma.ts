import { Prisma, PrismaClient } from '@prisma/client';
import { getRequestContext } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { env } from '../config/env.js';

/**
 * Models that carry `schoolId` and are automatically filtered by the extension
 * below. Adding a tenant-owned model to the schema means adding it here too —
 * anything absent from this set is queried unfiltered.
 */
export const TENANT_MODELS = new Set<string>([
  'User',
  'TeacherProfile',
  'ParentProfile',
  'Student',
  'StudentGuardian',
  'AcademicYear',
  'Classroom',
]);

/** Operations whose `where` clause must be narrowed to the caller's school. */
const WHERE_OPERATIONS = new Set<string>([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

/** Operations whose payload must be stamped with the caller's school. */
const CREATE_OPERATIONS = new Set<string>(['create', 'createMany', 'createManyAndReturn']);

const basePrisma = new PrismaClient({
  log: env.isProduction ? ['warn', 'error'] : ['warn', 'error'],
});

/**
 * Raw, unfiltered client. Legitimate uses are narrow and deliberate:
 *
 *  - authentication, which must find a user *before* any context exists;
 *  - Super Admin routes already gated by `requireRole(PUBLICATION_ADMIN)`;
 *  - system reads such as the school plan-status lookup;
 *  - audit writes, which must never be suppressed by a tenant filter.
 *
 * Anywhere else, use `prisma`.
 */
export const prismaUnscoped = basePrisma;

function schoolIdForQuery(model: string, operation: string): string {
  const context = getRequestContext();

  if (!context) {
    // Fail closed. Returning unscoped rows here would silently leak every
    // school's data, so a missing context is always an error.
    throw ApiError.tenantContextMissing(
      `Tenant-scoped ${operation} on ${model} ran without request context. ` +
        'Wrap the call in runWithRequestContext, or use prismaUnscoped deliberately.',
    );
  }

  if (context.schoolId === null) {
    throw ApiError.tenantContextMissing(
      `${context.role} has no school bound, so a tenant-scoped ${operation} on ${model} is ambiguous. ` +
        'Super Admin routes must use prismaUnscoped explicitly.',
    );
  }

  return context.schoolId;
}

function stampCreateData(data: unknown, schoolId: string): unknown {
  if (Array.isArray(data)) {
    return data.map((row) => ({ ...(row as Record<string, unknown>), schoolId }));
  }
  if (data && typeof data === 'object') {
    return { ...(data as Record<string, unknown>), schoolId };
  }
  return data;
}

/**
 * Tenant-scoped client. Every query against a model in TENANT_MODELS is
 * rewritten to the caller's school:
 *
 *  - reads, updates and deletes get `schoolId` merged into `where`;
 *  - creates get `schoolId` forced into `data`, overriding whatever the client
 *    sent, so a spoofed `schoolId` in a request body is inert;
 *  - a missing context throws instead of falling back to unscoped.
 *
 * Caveat: this rewrites the *top level* of a query only. Nested writes must set
 * `schoolId` themselves — see `createStudent` for the pattern. The failure mode
 * of forgetting is a NOT NULL violation from MySQL, never a cross-tenant leak.
 */
export const prisma = basePrisma.$extends({
  name: 'tenant-isolation',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!TENANT_MODELS.has(model)) {
          return query(args);
        }

        const schoolId = schoolIdForQuery(model, operation);
        // `count()` and `findMany()` may be called with no arguments at all.
        const nextArgs = (args ?? {}) as Record<string, unknown>;

        if (CREATE_OPERATIONS.has(operation)) {
          return query({
            ...nextArgs,
            data: stampCreateData(nextArgs.data, schoolId),
          } as typeof args);
        }

        if (operation === 'upsert') {
          return query({
            ...nextArgs,
            where: { ...((nextArgs.where as object) ?? {}), schoolId },
            create: stampCreateData(nextArgs.create, schoolId),
            update: nextArgs.update,
          } as typeof args);
        }

        if (WHERE_OPERATIONS.has(operation)) {
          return query({
            ...nextArgs,
            where: { ...((nextArgs.where as object) ?? {}), schoolId },
          } as typeof args);
        }

        // Unrecognised operation on a tenant model — refuse rather than guess.
        throw ApiError.tenantContextMissing(
          `Operation "${operation}" on tenant model ${model} is not handled by the isolation extension.`,
        );
      },
    },
  },
});

export type TenantPrismaClient = typeof prisma;

/** Prisma's "record not found" code, raised by update/delete when the extended
 *  where clause excludes a row belonging to another school. */
export const PRISMA_NOT_FOUND = 'P2025';
export const PRISMA_UNIQUE_VIOLATION = 'P2002';
export const PRISMA_FK_VIOLATION = 'P2003';

export function isPrismaKnownError(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export async function disconnectPrisma(): Promise<void> {
  await basePrisma.$disconnect();
}
