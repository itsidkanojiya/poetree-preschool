import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    /**
     * Access tokens were fifteen minutes, which meant a parent opening the app
     * twice a day refreshed on essentially every visit. Every refresh is a
     * chance for the rotation race, and each lost race used to end every
     * session the user had.
     *
     * Four hours instead. The risk this number controls is a stolen unlocked
     * phone with a live session, and against that the honest defences are
     * device revocation and the short refresh window on the server — not
     * making a parent sign in again each time they check whether their child
     * was at school.
     */
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(14_400),

    /**
     * Ninety days, and it slides: every refresh issues a new one, so anyone
     * opening the app inside three months is never signed out. A phone that
     * genuinely sits unused for a season is a reasonable place to ask again.
     */
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(90),

    CORS_ORIGINS: z.string().default('http://localhost:3200'),

    /**
     * Who sends the sign-up code to a parent's phone.
     *
     * `static` accepts one fixed code and sends nothing — it is how this was
     * built and how it runs until an SMS account exists. It is NOT a
     * verification of anything: anyone can claim any number with it. What
     * still stands between that and an account is the office, which approves
     * every registration by hand.
     *
     * `msg91` is the real one. Switching is this variable and three
     * credentials; no schema, no app release.
     */
    OTP_PROVIDER: z.enum(['static', 'msg91']).default('static'),
    /**
     * The same for the address. Nothing in this platform sends email yet, so
     * `static` is the only one written — adding a mailer on spec would be
     * guessing at a service nobody has chosen. When there is an account it goes
     * in otp.service.ts beside MSG91, and nothing else moves.
     */
    EMAIL_OTP_PROVIDER: z.enum(['static']).default('static'),
    OTP_STATIC_CODE: z.string().regex(/^[0-9]{4,6}$/).default('1234'),
    OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(1800).default(600),
    MSG91_AUTH_KEY: z.string().optional(),
    MSG91_TEMPLATE_ID: z.string().optional(),
    MSG91_SENDER_ID: z.string().optional(),

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
