# VPS setup and deployment

Target: Hostinger VPS at **72.62.227.2** — Ubuntu 22.04, 2 cores, 7.8 GB RAM.

> ## This box is shared. Read this first.
>
> Three other projects are already live on it. Anything you run here can take
> them down, so every script in `infra/` is written to be additive and scoped.
>
> | Project | Domain | Ports |
> |---|---|---|
> | plumber-crm | `72.62.227.2` (bare IP) | 3000 + 5000 |
> | Poetree Publications | `poetreepublications.com`, `api.poetreepublications.com` | 4000 |
> | poetree-portal | `store.poetreepublications.com` | 3100 + 4100 |
> | **poetree-preschool (us)** | `school.poetreepublications.com` | **3200 + 4200** |
>
> MySQL also holds `poetree_db`, `poetree_portal` and `nexus_publication`, and
> MongoDB runs on 27017.

## The isolation rules

These are not style preferences. Breaking any one of them breaks a live site.

1. **Never change `/usr/bin/node`.** It is v20.20.0 and the other three projects
   run on it. `poetree-portal-api` launches with a *bare* `node` interpreter, so
   it resolves from `PATH` at start time. Our Node 22 lives in `/opt/nvm`, is
   never sourced into any shell profile, and is reached only by absolute path
   through `/opt/nodejs/current`.
2. **Never `apt install` nginx, mysql-server or nodejs.** All three are present
   and serving.
3. **Always address PM2 through our own ecosystem file** —
   `pm2 reload infra/ecosystem.config.cjs`. A bare `pm2 reload all` would
   restart the other five processes.
4. **Always `nginx -t` before reloading.** A syntax error takes down every site
   on the box, not just ours.
5. **Never point `rsync --delete` above `/var/www/poetree-preschool`.**

## 1. Prepare the shared host

```bash
ssh root@72.62.227.2

git clone git@github-personal:itsidkanojiya/poetree-preschool.git /var/www/poetree-preschool
cd /var/www/poetree-preschool

export DB_PASSWORD='<generate a long random password>'
sudo -E bash infra/vps-bootstrap.sh
```

The script refuses to continue if ports 3200/4200 are taken, and aborts if
`/usr/bin/node` changes version at any point. It installs Node 22 off-PATH,
creates `/var/www/poetree-preschool` and `/var/log/poetree-preschool`, and
creates the `poetree_preschool` database with a user granted on **that schema
only**.

It deliberately does *not* touch MySQL's bind address, ufw, or PM2's boot
configuration. See "Known issues" below.

## 2. Environment files

Created once on the server, and excluded from every deploy so a release never
overwrites them.

`/var/www/poetree-preschool/apps/api/.env`

```ini
DATABASE_URL="mysql://poetree_preschool:<DB_PASSWORD>@127.0.0.1:3306/poetree_preschool"
JWT_ACCESS_SECRET="<48 random bytes>"
JWT_REFRESH_SECRET="<48 different random bytes>"
NODE_ENV=production
PORT=4200
CORS_ORIGINS="https://school.poetreepublications.com"
SCHOOL_STATUS_CACHE_TTL_SECONDS=60
LOG_LEVEL=info
```

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`/var/www/poetree-preschool/apps/web/.env.local`

```ini
API_BASE_URL="http://127.0.0.1:4200/api/v1"
COOKIE_SECURE=1
```

`COOKIE_SECURE=1` is required in production — without it the browser drops the
auth cookies over HTTPS-only settings and nobody can stay signed in.

## 3. DNS, Nginx and TLS

Point an A record for `school.poetreepublications.com` at `72.62.227.2` **before**
running Certbot, or the challenge fails.

```bash
sudo cp infra/nginx/poetree-preschool.conf /etc/nginx/sites-available/poetree-preschool
sudo ln -s /etc/nginx/sites-available/poetree-preschool /etc/nginx/sites-enabled/

sudo nginx -t          # MUST pass before reloading — other sites depend on it
sudo systemctl reload nginx

sudo certbot --nginx -d school.poetreepublications.com
```

Do **not** remove `/etc/nginx/sites-enabled/default` or add `default_server`.
There is no explicit default on this box, so the alphabetically-first site
(`plumber-crm`) serves unmatched hosts. `poetree-preschool` sorts after it, so
that stays true.

## 4. GitHub Actions

```bash
ssh-keygen -t ed25519 -C 'github-actions-poetree-preschool' -f ~/.ssh/gha_preschool -N ''
cat ~/.ssh/gha_preschool.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/gha_preschool          # the private half goes into VPS_SSH_KEY
```

Repository secrets (`Settings → Secrets and variables → Actions`):

| Secret | Value |
|---|---|
| `VPS_HOST` | `72.62.227.2` |
| `VPS_USER` | `root` |
| `VPS_PORT` | `22` |
| `VPS_SSH_KEY` | the **private** key printed above |

Optional repository *variable*:

| Variable | Value |
|---|---|
| `PUBLIC_HEALTH_URL` | `https://school.poetreepublications.com/api/v1/health` |

Push to `main` and the workflow builds, rsyncs into `/var/www/poetree-preschool`,
runs `prisma migrate deploy`, reloads our two PM2 processes and fails the job if
the API does not answer.

## 5. Local development

```bash
ssh -L 3306:localhost:3306 root@72.62.227.2
```

Leave that open, then point `apps/api/.env` at
`mysql://poetree_preschool:<DB_PASSWORD>@127.0.0.1:3306/poetree_preschool`.

To run the integration suites:

```bash
TEST_DATABASE_URL="mysql://poetree_preschool:<pw>@127.0.0.1:3306/poetree_preschool" npm test
```

They **wipe every table between runs**. Point them only at a scratch database —
never at anything holding real school data.

## 6. First run

```bash
cd /var/www/poetree-preschool
export PATH=/opt/nodejs/current/bin:$PATH
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
SEED_SUPER_ADMIN_EMAIL='admin@poetree.com' \
SEED_SUPER_ADMIN_PASSWORD='<a strong password>' \
  npm run db:seed -w @poetree/api
```

Then sign in at `https://school.poetreepublications.com` and change that password
immediately — the seed prints it to the console.

## Operations

```bash
pm2 status
pm2 logs poetree-preschool-api --lines 100
pm2 reload infra/ecosystem.config.cjs --update-env    # never `pm2 reload all`
curl -s http://127.0.0.1:4200/api/v1/health
```

**Rollback:** re-run the Deploy workflow from an earlier commit
(`Actions → Deploy → Run workflow`). Migrations are forward-only; undoing one
needs a new migration that reverses it.

## Known issues — pre-existing, not introduced here

Both affect all four projects on the box. Neither is ours to fix unilaterally.

1. **MySQL listens on `0.0.0.0:3306` and ufw is inactive**, so the databases are
   reachable from the open internet. Closing it means binding to `127.0.0.1` and
   enabling the firewall — safe only once you have confirmed nothing connects
   remotely.
2. **PM2 has no systemd unit.** After a reboot, nothing restarts — all four
   projects stay down until someone runs `pm2 resurrect`. Fixing it
   (`pm2 startup systemd`) changes boot behaviour for everyone, so it needs the
   other projects' owners to agree.
