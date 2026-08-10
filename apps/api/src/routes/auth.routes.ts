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

/** Brute-force guard. Deliberately tighter than the global limiter. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // The isolation suite signs in dozens of times; throttling it would only test
  // the limiter.
  skip: () => env.isTest,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Try again in 15 minutes.' },
  },
});

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
  loginLimiter,
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
