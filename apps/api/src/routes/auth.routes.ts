import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { changePasswordSchema, loginSchema, refreshSchema } from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { body, validate } from '../middleware/validate.js';
import { ApiError } from '../lib/apiError.js';
import { env } from '../config/env.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { prismaUnscoped } from '../db/prisma.js';
import * as authService from '../services/auth.service.js';
import type { ChangePasswordInput, LoginInput, RefreshInput } from '@poetree/shared';

export const authRouter = Router();

/**
 * Brute-force guard, keyed per account rather than per address.
 *
 * The default key is the IP, and a preschool is the worst possible case for
 * that: every family at the gate is on the school's one Wi-Fi, so ten sign-ins
 * between them locked the whole school out for a quarter of an hour — and the
 * message it showed ("too many sign-in attempts") accused a parent who had
 * typed their password once.
 *
 * Keyed on who is being signed in *and* from where, so someone guessing at one
 * account cannot lock out the rest of the school, and the wider per-address
 * ceiling below still catches an attacker spraying many accounts at once.
 */
/**
 * One phone on mobile data gets a fresh IPv6 address per connection but keeps
 * its /64, so the prefix is the stable part — the same normalisation
 * express-rate-limit applies to its own default key. IPv4 is already stable.
 */
const addressKey = (ip: string): string => {
  if (!ip.includes(':')) return ip;
  const groups = ip.split('%')[0]!.split(':');
  return groups.slice(0, 4).join(':');
};

export const loginRateLimitKey = (req: Pick<Request, 'body' | 'ip'>): string => {
  const value = (req.body as { identifier?: unknown } | undefined)?.identifier;
  const identifier = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return `${addressKey(req.ip ?? '')}|${identifier}`;
};

const tooManyAttempts = {
  error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Try again in 15 minutes.' },
};

// The isolation suite signs in dozens of times; throttling it would only test
// the limiter.
const skipInTests = () => env.isTest;

const perAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipInTests,
  keyGenerator: loginRateLimitKey,
  message: tooManyAttempts,
});

/**
 * The spray guard: one address, many accounts. Loose enough that a family of
 * four and a staff room share it comfortably, tight enough that walking a
 * password list through the school's parent roll does not.
 */
const perAddressLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipInTests,
  message: tooManyAttempts,
});

const loginLimiter = [perAddressLimiter, perAccountLimiter];

function requestMeta(req: Request) {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.header('user-agent') ?? null,
  };
}

/**
 * Phase 1 has one client — the admin portal — so login is narrowed to the two
 * portal roles here rather than in the service. Phase 2's app calls the same
 * endpoint without this restriction.
 */
authRouter.post(
  '/login',
  ...loginLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    // Deliberately role-agnostic. The same endpoint serves the web portal and
    // the mobile app, and gating it to portal roles here locked parents — the
    // app's main audience — out of their own children's information.
    //
    // Each client enforces its own allowed roles: the portal's sign-in action
    // refuses to store a session for a non-portal role, and the app refuses
    // anyone who is not a parent or teacher. A token alone grants nothing,
    // because every route is permission-gated regardless of how it was obtained.
    const result = await authService.login(body<LoginInput>(req), requestMeta(req));
    res.json(result);
  }),
);

authRouter.post(
  '/refresh',
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    const { refreshToken } = body<RefreshInput>(req);
    const result = await authService.refresh(refreshToken, requestMeta(req));
    res.json(result);
  }),
);

authRouter.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    const parsed = refreshSchema.partial().safeParse(req.body ?? {});
    const token = parsed.success ? parsed.data.refreshToken : undefined;
    await authService.logout(token, req.auth!.userId);
    res.status(204).send();
  }),
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await authService.getAuthenticatedUser(req.auth!.userId);
    res.json({ user });
  }),
);

authRouter.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    const input = body<ChangePasswordInput>(req);
    const userId = req.auth!.userId;

    const user = await prismaUnscoped.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) throw ApiError.unauthenticated();

    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw ApiError.invalidCredentials('Your current password is incorrect');
    }

    await prismaUnscoped.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(input.newPassword),
        mustChangePassword: false,
      },
    });

    // Changing a password ends every other session.
    await authService.logout(undefined, userId);

    res.status(204).send();
  }),
);
