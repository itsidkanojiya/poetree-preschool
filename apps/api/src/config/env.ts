import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

    CORS_ORIGINS: z.string().default('http://localhost:3200'),

    /**
     * How many reverse proxies sit in front of this process.
     *
     * 0 = none, so `req.ip` is the real socket address. 1 = behind Nginx, where
     * the client address comes from X-Forwarded-For.
     *
     * Getting this wrong is a security bug, not a config detail: trusting the
     * header with no proxy in front lets anyone spoof X-Forwarded-For and walk
     * straight past the login rate limiter. Defaults to 0 — the safe answer.
     */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    SCHOOL_STATUS_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    /**
     * Where uploaded files live. Outside the repository on purpose, so a deploy
     * `rsync --delete` can never remove a school's photographs.
     */
    FILE_STORAGE_ROOT: z.string().default('/var/lib/poetree-preschool/files'),

    /**
     * Hand file transfers to Nginx via X-Accel-Redirect. The authorisation
     * decision stays in the API; only the byte-pushing moves. Off in
     * development, where there is no Nginx in front.
     */
    USE_X_ACCEL_REDIRECT: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .superRefine((value, ctx) => {
    if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // Fail fast and loudly — a half-configured API is worse than one that will not boot.
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;

export type Env = typeof env;
