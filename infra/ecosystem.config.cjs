/**
 * PM2 process definitions for the Poetree preschool platform.
 *
 * This box is SHARED. It already runs plumber-crm, the Poetree Publications
 * site + API, and poetree-portal — five PM2 processes owned by other projects.
 * Everything below is scoped so none of them are affected:
 *
 *   - ports 4200 / 3200, verified free (3000, 4000, 5000, 3100, 4100 are taken)
 *   - an explicit Node 22 interpreter, so the system's /usr/bin/node v20 that
 *     the other apps run on is never involved
 *   - fork mode, one instance each, to be a good neighbour on a 2-core box
 *
 * Always reload by pointing at THIS file:
 *   pm2 reload infra/ecosystem.config.cjs --update-env
 * PM2 then acts only on the apps named here.
 */
const APP_ROOT = '/var/www/poetree-preschool';

/**
 * Node 22 lives outside the default PATH on purpose. `poetree-portal-api` is
 * launched with a bare `node` interpreter, so putting 22 on root's PATH would
 * silently move that project onto a runtime it was never tested against.
 * `infra/vps-bootstrap.sh` creates this stable symlink.
 */
const NODE_22 = '/opt/nodejs/current/bin/node';

module.exports = {
  apps: [
    {
      name: 'poetree-preschool-api',
      cwd: `${APP_ROOT}/apps/api`,
      script: 'dist/server.js',
      interpreter: NODE_22,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        PORT: 4200,
      },
      error_file: '/var/log/poetree-preschool/api.error.log',
      out_file: '/var/log/poetree-preschool/api.out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'poetree-preschool-web',
      cwd: `${APP_ROOT}/apps/web`,
      // npm workspaces hoist `next` to the monorepo root, not into apps/web.
      script: `${APP_ROOT}/node_modules/next/dist/bin/next`,
      args: 'start -p 3200',
      interpreter: NODE_22,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3200,
      },
      error_file: '/var/log/poetree-preschool/web.error.log',
      out_file: '/var/log/poetree-preschool/web.out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
