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
};

export default nextConfig;
