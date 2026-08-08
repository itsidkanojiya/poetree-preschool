import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from '@poetree/shared';

/**
 * Everything the tenancy layer is allowed to know about the caller.
 *
 * `schoolId` originates from the verified JWT and nowhere else — never from a
 * request body, query string or URL parameter. See docs/architecture.md.
 */
export interface RequestContext {
  requestId: string;
  userId: string;
  role: Role;
  /** NULL only for PUBLICATION_ADMIN, who is not bound to a single school. */
  schoolId: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with the given context bound for its entire async lifetime. */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * The caller's school, or `undefined` when there is no context at all.
 * Deliberately separate from `getRequestContext` so the Prisma extension can
 * distinguish "no context" (a bug) from "Super Admin, no school" (legitimate).
 */
export function getCurrentSchoolId(): string | null | undefined {
  return storage.getStore()?.schoolId;
}

/**
 * The caller's school, or a thrown error. Services that write tenant rows use
 * this for the columns the Prisma extension does not manage — `scopeKey`, and
 * the `schoolId` of nested creates.
 */
export function requireSchoolId(): string {
  const schoolId = storage.getStore()?.schoolId;
  if (!schoolId) {
    throw new Error(
      'requireSchoolId() called without a school-bound request context. ' +
        'Super Admin routes must use prismaUnscoped and pass schoolId explicitly.',
    );
  }
  return schoolId;
}
