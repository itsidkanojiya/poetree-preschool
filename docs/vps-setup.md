# VPS setup and deployment

Target: Hostinger VPS at **72.62.227.2**, Ubuntu. The API, the portal and MySQL all
run on this one box, behind Nginx.

> **Before anything else.** The root password was shared over chat, so treat it as
> compromised: change it, add an SSH key, and turn password login off (step 6).
> No credential appears anywhere in this repository — everything sensitive lives in
> GitHub Secrets and in `.env` files created directly on the server.

## 1. Provision

```bash
ssh root@72.62.227.2

git clone https://github.com/itsidkanojiya/<repo>.git /var/www/poetree/app
cd /var/www/poetree/app

export DB_PROD_PASSWORD='<generate a long random password>'
export DB_DEV_PASSWORD='<a different long random password>'
sudo -E bash infra/vps-bootstrap.sh
```

That installs Node 22, MySQL 8, PM2, Nginx, Certbot and UFW; creates `poetree_prod`
and `poetree_dev` with least-privilege users; binds MySQL to `127.0.0.1`; and opens
only ports 22, 80 and 443.

MySQL is deliberately **not** reachable from the internet. Developers reach the dev
database through an SSH tunnel (step 5).

## 2. Environment files

These are created once on the server and are excluded from every deploy, so a
release never overwrites them.

`/var/www/poetree/app/apps/api/.env`

```ini
DATABASE_URL="mysql://poetree_prod:<DB_PROD_PASSWORD>@127.0.0.1:3306/poetree_prod"
JWT_ACCESS_SECRET="<48 random bytes>"
JWT_REFRESH_SECRET="<48 different random bytes>"
NODE_ENV=production
PORT=4000
CORS_ORIGINS="https://app.<your-domain>"
SCHOOL_STATUS_CACHE_TTL_SECONDS=60
LOG_LEVEL=info
```

Generate each secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`/var/www/poetree/app/apps/web/.env.local`

```ini
API_BASE_URL="http://127.0.0.1:4000/api/v1"
COOKIE_SECURE=1
```

`COOKIE_SECURE=1` is required in production — without it the auth cookies are sent
over plain HTTP.

## 3. Nginx and TLS

```bash
sudo cp infra/nginx/poetree.conf /etc/nginx/sites-available/poetree
sudo sed -i 's/api.example.com/api.<your-domain>/; s/app.example.com/app.<your-domain>/' \
  /etc/nginx/sites-available/poetree
sudo ln -sf /etc/nginx/sites-available/poetree /etc/nginx/sites-enabled/poetree
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d api.<your-domain> -d app.<your-domain>
```

Point both A records at `72.62.227.2` before running Certbot.

## 4. GitHub Actions

Create a deploy key on the VPS and give the public half to the server, the private
half to GitHub:

```bash
ssh-keygen -t ed25519 -C 'github-actions-deploy' -f ~/.ssh/gha_deploy -N ''
cat ~/.ssh/gha_deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/gha_deploy          # copy this into the VPS_SSH_KEY secret
```

Repository secrets (`Settings → Secrets and variables → Actions`):

| Secret | Value |
|---|---|
| `VPS_HOST` | `72.62.227.2` |
| `VPS_USER` | `root` (or a dedicated deploy user) |
| `VPS_PORT` | `22` |
| `VPS_SSH_KEY` | the **private** key printed above |

Optional repository *variable*:

| Variable | Value |
|---|---|
| `PUBLIC_HEALTH_URL` | `https://api.<your-domain>/api/v1/health` |

Push to `main` and the deploy workflow builds, rsyncs, runs `prisma migrate deploy`,
reloads PM2 and fails the job if `/api/v1/health` does not answer.

## 5. Local development against the VPS database

```bash
ssh -L 3306:localhost:3306 root@72.62.227.2
```

Leave that open, then in `apps/api/.env`:

```ini
DATABASE_URL="mysql://poetree_dev:<DB_DEV_PASSWORD>@127.0.0.1:3306/poetree_dev"
```

To run the integration test suites locally, point them at the dev database too:

```bash
TEST_DATABASE_URL="mysql://poetree_dev:<DB_DEV_PASSWORD>@127.0.0.1:3306/poetree_dev" npm test
```

They wipe every table between runs, so never aim them at `poetree_prod`.

## 6. Hardening

```bash
# Set a new root password, since the old one was shared in plain text.
passwd

# Then disable password login entirely.
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

Keep an SSH session open while you do this and verify key login from a second
terminal before closing it.

## 7. First run

```bash
cd /var/www/poetree/app
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
SEED_SUPER_ADMIN_EMAIL='admin@poetree.com' \
SEED_SUPER_ADMIN_PASSWORD='<a strong password>' \
  npm run db:seed -w @poetree/api
```

Then sign in at `https://app.<your-domain>` and change that password immediately —
the seed prints it to the console.

## Operations

```bash
pm2 status
pm2 logs poetree-api --lines 100
pm2 reload infra/ecosystem.config.cjs --update-env
curl -s http://127.0.0.1:4000/api/v1/health
```

**Rollback:** re-run the Deploy workflow from an earlier commit
(`Actions → Deploy → Run workflow`). Database migrations are forward-only; a
migration that must be undone needs a new migration that reverses it.
