import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Runs before any test module is imported, so `src/config/env.ts` sees a valid
 * configuration at import time.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-that-is-long-enough-000000';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-that-is-long-enough-11111';
process.env.ACCESS_TOKEN_TTL_SECONDS ??= '900';
process.env.REFRESH_TOKEN_TTL_DAYS ??= '30';
process.env.LOG_LEVEL ??= 'error';
// Suspension must be observable immediately in tests; the production default of
// 60s would mask the cache invalidation the suite is there to prove.
process.env.SCHOOL_STATUS_CACHE_TTL_SECONDS ??= '0';

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

/**
 * Uploads go to a throwaway directory.
 *
 * The default is /var/lib/poetree-preschool/files, which exists on the server
 * and nowhere else — relying on it made the file tests pass on a machine where
 * the variable happened to be set and fail everywhere else, CI included. Tests
 * must not depend on the environment they are run in.
 */
process.env.FILE_STORAGE_ROOT ??= join(tmpdir(), 'poetree-test-files');
process.env.USE_X_ACCEL_REDIRECT = 'false';
