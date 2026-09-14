import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The shared contract package ships as TypeScript-built ESM in the workspace.
  transpilePackages: ['@poetree/shared'],
  // Pin the trace root to the monorepo, otherwise Next walks up past the repo
  // and picks a stray lockfile from a parent directory.
  outputFileTracingRoot: path.join(here, '..', '..'),
  eslint: {
    // Linting is a CI job across the whole monorepo, not part of the app build.
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      // Every upload in the portal — a logo, a child's photograph, a document —
      // goes through a server action, and Next refuses any action body over
      // 1 MB by default. That is smaller than an ordinary phone photograph, and
      // the refusal happens before the action runs, so it cannot be turned into
      // a form error: the page just crashes. 16 MB covers the API's largest
      // accepted file (a 15 MB PDF) plus the form around it. Keep it in step
      // with ALLOWED_TYPES in apps/api/src/lib/storage.ts and with
      // client_max_body_size in infra/nginx.
      bodySizeLimit: '16mb',
    },
  },
};

export default nextConfig;
