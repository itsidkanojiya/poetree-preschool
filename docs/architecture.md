# Architecture

## Tenancy model

One MySQL database, shared schema. Every tenant-owned table carries `schoolId`.

The alternatives — a schema or a database per school — were rejected because the
platform is meant to carry hundreds of schools, and both make migrations and
connection pooling scale badly.

### The rule

> `schoolId` is derived from the verified JWT. Never from a request body, query
> string, or URL parameter.

A `schoolId` in a request body is not an error — it is simply discarded. Zod strips
it during validation, and the Prisma extension overwrites it on write.

### How it is enforced

Two layers, in `apps/api/src`:

**1. Request context** — [`context/requestContext.ts`](../apps/api/src/context/requestContext.ts)

`AsyncLocalStorage` carries `{ requestId, userId, role, schoolId }` for the life of
a request. Bound by the `tenantContext` middleware immediately after the token is
verified, and inherited by every async continuation downstream.

**2. Prisma client extension** — [`db/prisma.ts`](../apps/api/src/db/prisma.ts)

For every model listed in `TENANT_MODELS`:

| Operation | Rewrite |
|---|---|
| `findMany`, `findFirst`, `findUnique`, `count`, `aggregate`, `groupBy` | `schoolId` merged into `where` |
| `update`, `updateMany`, `delete`, `deleteMany` | `schoolId` merged into `where` |
| `create`, `createMany` | `schoolId` **forced** into `data`, overriding the caller |
| anything else | throws — refuses to guess |

If there is no request context, it **throws** rather than falling back to an
unscoped query. Failing closed is the whole point: a missing context is a bug, and
a bug must not become a data leak.

### The two clients

```ts
import { prisma, prismaUnscoped } from './db/prisma.js';
```

- `prisma` — tenant-scoped. Use for everything a School Admin touches.
- `prismaUnscoped` — raw. Four legitimate uses, and no others:
  1. authentication, which must find a user *before* any context exists;
  2. Super Admin routes already gated by `requireRole('PUBLICATION_ADMIN')`;
  3. system reads such as the school plan-status lookup;
  4. audit writes, which must never be suppressed by a tenant filter.

### Known limitation: nested writes

The extension rewrites the **top level** of a query only. A nested create of a
tenant model must set `schoolId` itself — see `createStudent` in
[`services/student.service.ts`](../apps/api/src/services/student.service.ts).

The failure mode of forgetting is a `NOT NULL` violation from MySQL, which is loud
and immediate. It is never a silent cross-tenant leak.

### `scopeKey`

MySQL treats `NULL`s as distinct in a unique index, so `@@unique([schoolId, email])`
would not prevent two Super Admins (both `schoolId = NULL`) sharing an email.
`User.scopeKey` holds `schoolId`, or the literal `'PUBLICATION'` when there is
none, and the uniqueness constraints are built on that instead.

## Request pipeline

```
helmet → cors → rate limit → requestId
       → authenticate        who you are, from the signed token only
       → enforceSchoolAccess blocks every user of a school with no active plan
       → tenantContext       binds schoolId for the Prisma extension
       → requireRole(...)    route-level RBAC
       → handler
       → errorHandler        { error: { code, message, details, requestId } }
```

The order is the security model. Moving `tenantContext` before `authenticate`, or
skipping `enforceSchoolAccess`, breaks a guarantee the tests assert.

## Plan control and cascade blocking

A school's `status` (`TRIAL | ACTIVE | SUSPENDED | EXPIRED`) gates every one of its
users. Enforced in five places so they cannot disagree:

1. **Login** — checked before any token is issued.
2. **Every request** — `enforceSchoolAccess`, backed by a short-lived in-memory
   cache so it costs no query per request.
3. **Refresh** — re-checked, so a suspended session cannot be extended.
4. **At suspension** — all refresh tokens for all users of the school are revoked
   in the same transaction as the status change. This is what makes the block
   bite immediately rather than at the end of each refresh window.
5. **Lazy expiry** — a plan past `expiresAt` flips the school to `EXPIRED` on the
   next request, which keeps a scheduled job out of Phase 1 entirely.

`PUBLICATION_ADMIN` is exempt throughout — the Super Admin must still be able to
administer, and reactivate, a school they have just switched off.

Worst case exposure after suspension is one access-token lifetime (15 minutes),
and only for a request already in flight.

## Identity

- **Super Admin** (`PUBLICATION_ADMIN`) — `schoolId` is `NULL`; sees every school.
- **School Admin** — bound to one school.
- **Teacher / Parent** — records exist and credentials are set, but `/auth/login`
  is narrowed to the two portal roles in Phase 1. The endpoint itself is
  role-agnostic, so the Phase 2 app needs no API change.
- **Student** — no credentials, ever. Reached through a guardian's account; in the
  Phase 2 app the parent taps a child's avatar.

## Forward compatibility

`School.code` is constrained to `[a-z][a-z0-9]{2,29}` and is immutable. That is not
cosmetic: Phase 2 derives each school's Android application id from it
(`com.poetree.<code>`), so changing it later would orphan a published app.

`AcademicYear` exists now, unused by any feature, because attendance, fees and
progress all hang off it and retrofitting one into live data is painful.
