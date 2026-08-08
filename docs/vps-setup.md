# VPS setup and deployment

Target: the Hostinger VPS — Ubuntu 22.04, 2 cores, 7.8 GB RAM.

The host address, database passwords and JWT secrets are **not** in this repo.
They live in GitHub Actions secrets and in `.env` files created directly on the
server. Anywhere below that says `<vps-host>`, substitute the real address.

> ## This box is shared. Read this first.
>
> Three other projects are already live on it. Anything you run here can take
> them down, so every script in `infra/` is written to be additive and scoped.
>
> | Project | Reached at | Ports |
> |---|---|---|
> | plumber-crm | the bare host address | 3000 + 5000 |
> | Poetree Publications | `poetreepublications.com`, `api.poetreepublications.com` | 4000 |
> | poetree-portal | `store.poetreepublications.com` | 3100 + 4100 |
> | **poetree-preschool (us)** | `<vps-host>:3200` for now | **3200 + 4200** |
>
> MySQL on this box also holds three other projects' schemas, and MongoDB runs
> alongside it.

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
ssh root@<vps-host>

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
CORS_ORIGINS="http://<vps-host>:3200"
TRUST_PROXY=0
SCHOOL_STATUS_CACHE_TTL_SECONDS=60
LOG_LEVEL=info
```

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`/var/www/poetree-preschool/apps/web/.env.local`

```ini
API_BASE_URL="http://127.0.0.1:4200/api/v1"
COOKIE_SECURE=0
```

## 3. Access — two stages

### Stage A · direct ports (current)

No Nginx site, no TLS, no DNS. The portal is reached at **`http://<vps-host>:3200`**
and that is the only address anyone needs — the browser never calls the API
directly, because the portal fetches it server-side over `127.0.0.1:4200`.

This deliberately adds *no* Nginx configuration, which is the safest possible
posture for the other three projects: nothing about their routing is touched.

Note the bare host address on port 80 already belongs to plumber-crm, which is
exactly why we use `:3200` rather than trying to share it.

> **This stage is for testing and demos only.**
>
> Without TLS, sign-in passwords and session tokens cross the network in
> plaintext, and `COOKIE_SECURE` must stay `0`. Do not put real children's or
> parents' data into the system until Stage B is done.

Consider closing 3200 to the public and reaching it through the SSH tunnel you
already use, if you want the demo private:

```bash
ssh -L 3200:localhost:3200 root@<vps-host>   # then browse http://localhost:3200
```

### Stage B · domain and TLS (when you're ready)

Point an A record for `school.poetreepublications.com` at the host, then:

```bash
sudo cp infra/nginx/poetree-preschool.conf /etc/nginx/sites-available/poetree-preschool
sudo ln -s /etc/nginx/sites-available/poetree-preschool /etc/nginx/sites-enabled/

sudo nginx -t          # MUST pass before reloading — other sites depend on it
sudo systemctl reload nginx

sudo certbot --nginx -d school.poetreepublications.com
```

Then flip three settings and reload PM2:

| File | Change |
|---|---|
| `apps/api/.env` | `TRUST_PROXY=1` — Nginx is now the source of the client IP |
| `apps/api/.env` | `CORS_ORIGINS="https://school.poetreepublications.com"` |
| `apps/web/.env.local` | `COOKIE_SECURE=1` |

`TRUST_PROXY` matters: at `1` with no proxy in front, anyone can spoof
`X-Forwarded-For` and walk past the login rate limiter. At `0` behind Nginx,
every request looks like it came from `127.0.0.1` and the limiter throttles all
users as one. Move it in step with Nginx, in the same change.

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
| `VPS_HOST` | the server address |
| `VPS_USER` | `root` |
| `VPS_PORT` | `22` |
| `VPS_SSH_KEY` | the **private** key printed above |

Optional repository *variable*:

| Variable | Value |
|---|---|
| `PUBLIC_HEALTH_URL` | `http://<vps-host>:4200/api/v1/health` (Stage A) |

Until these exist the Deploy workflow fails at the SSH step. That is expected,
and does not affect CI.

## 5. Local development

```bash
ssh -L 3306:localhost:3306 root@<vps-host>
```

Leave that open, then point `apps/api/.env` at
`mysql://poetree_preschool:<DB_PASSWORD>@127.0.0.1:3306/poetree_preschool`.

To run the integration suites locally:

```bash
TEST_DATABASE_URL="mysql://...@127.0.0.1:3306/<scratch-db>" npm test
```

They **wipe every table between runs**. Point them only at a scratch database —
never at anything holding real data. CI runs them against its own throwaway
MySQL service, which is the safer default.

## 6. First run

```bash
cd /var/www/poetree-preschool
export PATH=/opt/nodejs/current/bin:$PATH
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
SEED_SUPER_ADMIN_EMAIL='admin@poetree.com' \
SEED_SUPER_ADMIN_PASSWORD='<a strong password>' \
  npm run db:seed -w @poetree/api
```

Then sign in and change that password immediately — the seed prints it to the
console.

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

Two hardening items were found during the initial survey. Both affect all four
projects on the box, so neither is ours to change unilaterally, and both are
described to the maintainers out of band rather than in this file.

1. Database network exposure and firewall posture.
2. PM2 has no systemd unit, so **nothing restarts after a reboot** — all four
   projects stay down until someone runs `pm2 resurrect`.
