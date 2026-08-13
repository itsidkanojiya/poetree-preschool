import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    // Tenant isolation tests share one database; running files in parallel would
    // let one file's cleanup delete another's fixtures.
    fileParallelism: false,
    testTimeout: 30_000,
    // Setup wipes fifty tables one DELETE at a time, and the database is on the
    // other end of an SSH tunnel — fifty round trips is twenty-odd seconds on a
    // good day. Thirty was enough until the schema grew; the suite was timing
    // out in its own beforeAll and reporting it as an engine error, which reads
    // like a fault in the code under test rather than in the harness.
    hookTimeout: 120_000,
  },
});
