# API reference — Phase 1

Base path: `/api/v1`. All bodies are JSON.

Authenticate with `Authorization: Bearer <accessToken>`. Access tokens last 15
minutes; refresh tokens last 30 days and rotate on every use.

## Errors

Every failure returns the same shape:

```json
{
  "error": {
    "code": "SCHOOL_SUSPENDED",
    "message": "Your school’s access has been suspended…",
    "details": { "schoolStatus": "SUSPENDED", "schoolName": "Sunrise Preschool" },
    "requestId": "3f1c…"
  }
}
```

Branch on `code`, never on `message`.

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | `details` is a list of `{ path, message }` |
| `UNAUTHENTICATED` | 401 | Missing or unreadable token |
| `INVALID_CREDENTIALS` | 401 | Wrong identifier or password |
| `TOKEN_EXPIRED` | 401 | Access token lapsed — refresh |
| `INVALID_REFRESH_TOKEN` | 401 | Reused, revoked or expired refresh token |
| `FORBIDDEN` | 403 | Role is not permitted |
| `SCHOOL_SUSPENDED` | 403 | The school's plan is off — **every** user is blocked |
| `PORTAL_ACCESS_DENIED` | 403 | Teacher/parent attempting the admin portal |
| `NOT_FOUND` | 404 | Missing — **also** what another school's records look like |
| `CONFLICT` | 409 | Duplicate code, email, phone or admission number; a decision already taken |
| `PLAN_LIMIT_EXCEEDED` | 422 | Seat limit on the school's plan reached |
| `RATE_LIMITED` | 429 | Too many sign-in attempts |

> Cross-tenant access returns **404, not 403**. A 403 would confirm the record
> exists somewhere, which is itself a leak.

## Auth

| Method | Path | Access |
|---|---|---|
| `POST` | `/auth/login` | public — 10 attempts / 15 min per IP |
| `POST` | `/auth/refresh` | valid refresh token |
| `POST` | `/auth/logout` | authenticated |
| `GET` | `/auth/me` | authenticated |
| `POST` | `/auth/change-password` | authenticated — ends all other sessions |
| `GET` | `/auth/branches` | authenticated — the branches an `ORG_ADMIN` may work in; `[]` for anyone else |
| `POST` | `/auth/switch-branch` | `ORG_ADMIN` only — `{ schoolId }`, returns a whole new session |

`POST /auth/login`

```json
{ "identifier": "admin@poetree.com", "password": "…" }
```

`identifier` accepts an email or a phone number. If the same identifier exists at
more than one school, the response is `409 CONFLICT` listing the school codes; send
`schoolCode` to disambiguate.

`schoolCode` accepts a school's code **or an organisation's**, because a branded
app is built per school for an independent customer and per group for one that
runs branches — and it sends whichever code it was built with. The mobile app
always sends it.

In Phase 1 the endpoint admits only `PUBLICATION_ADMIN` and `SCHOOL_ADMIN`.

Response: `{ accessToken, refreshToken, expiresIn, user }`.

## Super Admin — `PUBLICATION_ADMIN` only

| Method | Path | Notes |
|---|---|---|
| `GET` | `/publication/overview` | Counts by status, students, teachers, expiring soon |
| `GET` | `/publication/schools` | `?page&pageSize&search&status` |
| `POST` | `/publication/schools` | `code` optional — generated from the name, or numbered under the group's code; immutable once set. `organisationId` makes it a branch |
| `GET` | `/publication/schools/:id` | |
| `PATCH` | `/publication/schools/:id` | `code` cannot be changed |
| `POST` | `/publication/schools/:id/admins` | Creates the school's `SCHOOL_ADMIN` |
| `PATCH` | `/publication/schools/:id/subscription` | `{ planId, expiresAt }` — also sets the school active |
| `GET` | `/publication/schools/:id/suspension-impact` | `{ users, activeSessions }` for the confirmation dialog |
| `POST` | `/publication/schools/:id/suspend` | `{ reason }` — **blocks every user** |
| `POST` | `/publication/schools/:id/reactivate` | `{ note?, expiresAt? }` |
| `GET/POST` | `/publication/plans` | |
| `GET/PATCH` | `/publication/plans/:id` | |
| `GET/POST` | `/publication/organisations` | Groups that run several schools; `code` optional |
| `PATCH` | `/publication/organisations/:id` | Name only — the code is immutable, like a school's |
| `GET` | `/publication/organisations/:id/overview` | Branches with their counts |
| `POST` | `/publication/organisations/:id/admins` | Creates the group's `ORG_ADMIN` |

### Suspending

```http
POST /api/v1/publication/schools/:id/suspend
{ "reason": "Non-payment of subscription" }
```

```json
{ "schoolId": "…", "status": "SUSPENDED", "revokedSessions": 7, "affectedUsers": 43 }
```

In one transaction this flips the school status, marks the subscription suspended,
and revokes every refresh token belonging to every user of that school. Their next
request returns `403 SCHOOL_SUSPENDED`; a fresh sign-in is refused; refresh fails.

Reactivating a school whose plan has already lapsed requires a new `expiresAt` —
without one, lazy expiry would block it again on the very next request.

## School Admin — `SCHOOL_ADMIN` only

Nothing here accepts a `schoolId`. It comes from the token.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/dashboard/overview` | Students, teachers, parents, classrooms |
| `GET/POST` | `/teachers` | `?page&pageSize&search&status` |
| `GET/PATCH` | `/teachers/:id` | |
| `GET/POST` | `/parents` | Phone is the parent's sign-in identifier |
| `GET/PATCH` | `/parents/:id` | |
| `GET/POST` | `/students` | `?page&pageSize&search&classroomId&status` |
| `GET/PATCH` | `/students/:id` | |
| `GET` | `/class-levels` | Play Group, Nursery, Junior KG, Senior KG |
| `GET/POST` | `/academic-years` | |
| `GET/POST` | `/classrooms` | `?academicYearId` |
| `GET/PATCH` | `/classrooms/:id` | |
| `GET` | `/registrations` | `?page&pageSize&search&status` — families who registered themselves |
| `POST` | `/registrations/:id/approve` | Creates the account. Body says which child |
| `POST` | `/registrations/:id/reject` | `{ reason? }` |

## Registrations

A family registers from the app with no account and **no admission number** —
`POST /public/schools/:code/registrations`, which returns `202` and creates
nothing. The office decides.

Before the form, the family proves the number that will sign in — the father's:

| Method | Path | Notes |
|---|---|---|
| `POST` | `/public/schools/:code/otp/send` | `{ channel, destination }` where channel is `PHONE` or `EMAIL` → `{ challengeId, expiresInSeconds, delivered }`. Never returns the code. 6/hour per address |
| `POST` | `/public/schools/:code/otp/verify` | `{ challengeId, code }`. Same refusal whatever is wrong with it |

Both the number and the address are proved. The registration carries
`phoneChallengeId` and `emailChallengeId`, each checked against the `phone` and
`email` on the form — and against its own channel, so a code sent to a phone
cannot stand in for one sent to an inbox — then spent, so one proof cannot open
two accounts.

`delivered` is false while a provider is `static`: it sends nothing and accepts
one fixed code, and the app says so on screen rather than leaving a family
waiting. That setting verifies nothing, and the office's approval is what stands
in the gap. SMS has MSG91 written and waiting on credentials; email has no real
sender yet, so it is `static` until a service is chosen.

`motherPhone` and `email` are required alongside it. On approval the mother's
number becomes the child's emergency contact where the school holds none.

The child's name arrives in three parts, the way a school form in India asks for
them — `studentFirstName`, `studentMiddleName` (the father's given name),
`studentLastName` — and is kept that way, so approving writes "Dishan Krunal
Patel" onto the record rather than a guess made by splitting a sentence.

Approving says which child the request is about, and that is the whole body:

```json
{ "mode": "LINK", "studentId": "…" }
```
```json
{ "mode": "CREATE", "gender": "MALE", "classroomId": "…", "admissionNo": "SUN-042" }
```

`LINK` attaches the family to a pupil already on the roll — a sibling, or a
child the office entered while the request waited. `CREATE` makes the record
there and then from the name and date of birth the family gave; `admissionNo` is
optional and is otherwise issued from the school's own `ADM-` series inside the
same transaction. Each waiting row carries a `matches` list — children already
here who look like the one described — so the office is choosing, not searching.

`POST /students` requires at least one guardian:

```json
{
  "firstName": "Dishan",
  "middleName": "Krunal",
  "lastName": "Patel",
  "dateOfBirth": "2022-03-01",
  "gender": "MALE",
  "admissionNo": "SUN-001",
  "classroomId": "…",
  "guardians": [{ "parentProfileId": "…", "relation": "MOTHER", "isPrimary": true }]
}
```

Students never receive credentials. A `parentProfileId` or `classroomId` from
another school does not resolve and the request fails validation.

## Health

`GET /health` — public. Pings the database and returns
`{ "status": "ok", "uptimeSeconds": n }`. The deploy workflow fails the release if
this does not answer 200.
