/**
 * PM2 process definitions for the Hostinger VPS.
 *
 *   pm2 start infra/ecosystem.config.cjs
 *   pm2 reload infra/ecosystem.config.cjs   # zero-downtime redeploy
 *   pm2 save && pm2 startup                 # survive a reboot
 *
 * Both processes bind to 127.0.0.1 only — Nginx is the sole public entry point.
 */
const APP_ROOT = '/var/www/poetree/app';

module.exports = {
  apps: [
    {
      name: 'poetree-api',
      cwd: `${APP_ROOT}/apps/api`,
      script: 'dist/server.js',
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      error_file: '/var/log/poetree/api.error.log',
      out_file: '/var/log/poetree/api.out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'poetree-web',
      cwd: `${APP_ROOT}/apps/web`,
      // Invoke Next's binary directly; PM2 cannot execute the shell shim in .bin.
      // npm workspaces hoist `next` to the monorepo root, not into apps/web.
      script: `${APP_ROOT}/node_modules/next/dist/bin/next`,
      args: 'start -p 3000',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: '/var/log/poetree/web.error.log',
      out_file: '/var/log/poetree/web.out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
