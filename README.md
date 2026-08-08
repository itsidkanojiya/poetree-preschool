# Poetree Preschool Platform

Multi-tenant SaaS for Poetree Publication: one platform, many schools, covering
Play Group, Nursery, Junior KG and Senior KG.

**Phase 1 (this repo, today) is web only** — Super Admin and School Admin. Teachers,
parents and students exist as records but have no login surface until the Phase 2
mobile app.

## What's here

```
apps/api        Node 22 · Express · TypeScript · Prisma · MySQL
apps/web        Next.js 15 (App Router) · TypeScript · Tailwind
packages/shared Contract types, enums, error codes and zod schemas
infra           PM2, Nginx, VPS bootstrap and deploy scripts
docs            Architecture, API reference, VPS setup
```

## The two things that matter most

1. **Tenant isolation.** Every tenant table carries `schoolId`, and it is enforced
   centrally by a Prisma client extension — not by developers remembering a
   `where` clause. `schoolId` comes from the verified JWT and never from a request
   body, query string or URL. See [docs/architecture.md](docs/architecture.md).
2. **Plan control.** When the Super Admin switches a school's plan off, every user
   of that school is blocked immediately — live sessions are revoked server-side,
   not merely left to expire.

Both are covered by the test suite, which is the release gate for this phase.

## Quick start

```bash
npm ci
npm run build -w @poetree/shared

# MySQL lives on the VPS. Open a tunnel first:
ssh -L 3306:localhost:3306 root@<vps-host>

cp apps/api/.env.example apps/api/.env      # fill in DATABASE_URL and JWT secrets
cp apps/web/.env.example apps/web/.env.local

npm run db:migrate -w @poetree/api
npm run db:seed -w @poetree/api

npm run dev            # API on :4200, portal on :3200
```

Ports are 4200/3200 rather than the usual 4000/3000 because the VPS is **shared
with three other live projects** that already hold 3000, 4000, 5000, 3100 and
4100. [docs/vps-setup.md](docs/vps-setup.md) lists the isolation rules — read it
before running anything on that server.

The seed prints the bootstrap logins, including two demo schools — the second one
exists so cross-tenant isolation can be checked by hand.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | API and portal together |
| `npm run build` | Build shared, API and web |
| `npm run typecheck` | Typecheck every workspace |
| `npm run lint` | ESLint across the monorepo |
| `npm test` | Unit tests always; integration tests when a database is reachable |
| `npm run db:migrate -w @poetree/api` | Create/apply a migration in development |
| `npm run db:seed -w @poetree/api` | Seed publication, plans, class levels, demo schools |

## Deployment

GitHub Actions builds on `main` and deploys over SSH to the Hostinger VPS, where
PM2 runs the API and the portal.

The portal is currently reached directly on port 3200 — **testing only, since
there is no TLS yet**. It moves behind Nginx at `school.poetreepublications.com`
once DNS is pointed. See [docs/vps-setup.md](docs/vps-setup.md) for both stages,
the required secrets, and the rules that keep this deployment from disturbing the
other projects sharing that box.

## Roadmap

- **Phase 2** — Flutter app, one branded Android app per school built from a single
  codebase, published from Poetree's Play Store account. Teacher and parent login
  arrive here. iOS afterwards.
- **Later** — attendance, fees, homework, timetable, notices, reports, progress
  tracking, and the interactive learning engine that is the platform's real USP.
