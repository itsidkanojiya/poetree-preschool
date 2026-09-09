import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { submitRegistrationSchema, type SubmitRegistrationInput } from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { body, params, validate } from '../middleware/validate.js';
import { env } from '../config/env.js';
import * as registrationService from '../services/registration.service.js';
import { prismaUnscoped } from '../db/prisma.js';
import { ApiError } from '../lib/apiError.js';
import { sendStoredFile } from '../lib/sendStoredFile.js';

/**
 * The only routes in this system that answer without a token.
 *
 * A sign-in screen has to be branded *before* anyone signs in — that is the
 * whole point of it — and the app has no credentials at that moment. So a
 * school's name, colour and logo are readable by anyone who knows the school
 * code. That is not a leak: the same three things are painted on the gate.
 *
 * Nothing else may ever be READ here. Not the school's phone number, not its
 * address, not how many children it has. If a field would embarrass the school
 * on a stranger's screen, it belongs behind the token like everything else.
 *
 * There is now one write. A parent registering themselves has no account yet,
 * so the request cannot carry a token, and a successful reply says only that
 * the request was received.
 *
 * Its refusals do say more than that, and deliberately: a wrong admission
 * number is told it is wrong, and a phone that already has an account is told
 * to sign in instead. Both are real disclosures — somebody working through
 * guessed admission numbers learns which exist. The alternative is a parent who
 * mistyped one digit having no way to find out, and they are the far more
 * likely caller. The rate limiter below is what makes that trade payable;
 * see submitRegistration for the reasoning in full.
 */
export const publicRouter = Router();

const codeParamSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .regex(/^[a-z][a-z0-9]{1,29}$/, 'Not a school code'),
});

const brandingSelect = {
  id: true,
  name: true,
  code: true,
  primaryColor: true,
  logoFileId: true,
  status: true,
} as const;

publicRouter.get(
  '/schools/:code/branding',
  validate({ params: codeParamSchema }),
  asyncHandler(async (req: Request, res) => {
    const { code } = params<{ code: string }>(req);

    const school = await prismaUnscoped.school.findUnique({
      where: { code },
      select: brandingSelect,
    });

    // A school whose plan has lapsed still gets its name and colours: the app
    // shows a "your school's access is paused" screen, and that screen should
    // still look like their school rather than a blank one.
    if (!school) throw ApiError.notFound('School not found');

    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      id: school.id,
      code: school.code,
      name: school.name,
      primaryColor: school.primaryColor,
      // A path, not bytes — so a client can cache the picture separately from
      // the name, which is the part that changes.
      logoUrl: school.logoFileId ? `/api/v1/public/schools/${school.code}/logo` : null,
    });
  }),
);

/**
 * The logo itself.
 *
 * Served here rather than through /files/:id because that route asks who you
 * are, and on the sign-in screen the answer is nobody. Only the one file the
 * school has nominated as its logo is reachable this way, by school code — a
 * file id is not accepted, so this cannot be turned into a way to read
 * somebody's documents.
 */
publicRouter.get(
  '/schools/:code/logo',
  validate({ params: codeParamSchema }),
  asyncHandler(async (req: Request, res) => {
    const { code } = params<{ code: string }>(req);

    const school = await prismaUnscoped.school.findUnique({
      where: { code },
      select: { logoFileId: true },
    });
    if (!school?.logoFileId) throw ApiError.notFound('No logo');

    const file = await prismaUnscoped.fileObject.findFirst({
      where: { id: school.logoFileId, deletedAt: null },
      select: { storageKey: true, mimeType: true },
    });
    if (!file) throw ApiError.notFound('No logo');

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', 'inline');
    // Public and long-lived: a logo changes once a decade, and this is fetched
    // on every cold start of every family's phone.
    res.setHeader('Cache-Control', 'public, max-age=86400');

    sendStoredFile(req, res, file, { code });
  }),
);

/**
 * A family's own request to join their school.
 *
 * Its own limiter, because the one in auth.routes.ts is keyed on a sign-in
 * identifier this route does not have. Keyed on the address alone and
 * deliberately tight: a whole preschool shares one Wi-Fi at the gate, but they
 * register once each, not once a minute, so a low ceiling costs a real family
 * nothing and costs somebody working through guessed admission numbers a great
 * deal.
 */
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many registration attempts. Try again in an hour.',
    },
  },
});

publicRouter.post(
  '/schools/:code/registrations',
  registrationLimiter,
  validate({ params: codeParamSchema, body: submitRegistrationSchema }),
  asyncHandler(async (req: Request, res) => {
    const { code } = params<{ code: string }>(req);
    const input = body<SubmitRegistrationInput>(req);

    // 202: the school has it, and nothing has happened yet. A 201 would say an
    // account was created, which is exactly what did not happen.
    res.status(202).json(await registrationService.submitRegistration(code, input));
  }),
);
