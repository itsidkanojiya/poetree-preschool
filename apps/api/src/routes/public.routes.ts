import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  deleteAccountSchema,
  sendOtpSchema,
  submitRegistrationSchema,
  verifyOtpSchema,
  type DeleteAccountInput,
  type SendOtpInput,
  type SubmitRegistrationInput,
  type VerifyOtpInput,
} from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { body, params, validate } from '../middleware/validate.js';
import { env } from '../config/env.js';
import { loginRateLimitKey } from './auth.routes.js';
import * as accountDeletion from '../services/accountDeletion.service.js';
import * as registrationService from '../services/registration.service.js';
import * as otpService from '../services/otp.service.js';
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
 * There are two writes. A parent registering themselves has no account yet,
 * so the request cannot carry a token, and a successful reply says only that
 * the request was received. And a parent closing their account from the
 * website, who may no longer have the app to hold a token in — proved the way
 * signing in is, with their password.
 *
 * Its refusals do say more than that, and deliberately: a phone that already
 * has an account is told to sign in instead, and one with a request already
 * waiting is told that too. Both are real disclosures — somebody working
 * through numbers learns which have accounts at this school. The alternative is
 * a parent who has forgotten they already registered having no way to find out,
 * and they are the far more likely caller. The rate limiter below is what makes
 * that trade payable; see submitRegistration for the reasoning in full.
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

/**
 * The standards a school takes children into — Nursery, Junior KG — for the
 * registration form to choose from.
 *
 * The ones it has classes of this year, so a family is not offered a standard
 * nobody teaches; a school that has not set up its classes yet offers every
 * standard, rather than an empty list nobody could get past.
 */
publicRouter.get(
  '/schools/:code/standards',
  validate({ params: codeParamSchema }),
  asyncHandler(async (req: Request, res) => {
    const { code } = params<{ code: string }>(req);
    const school = await prismaUnscoped.school.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!school) throw ApiError.notFound('School not found');

    const taught = await prismaUnscoped.classLevel.findMany({
      where: {
        isActive: true,
        classrooms: { some: { schoolId: school.id, academicYear: { isCurrent: true } } },
      },
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    });
    const standards =
      taught.length > 0
        ? taught
        : await prismaUnscoped.classLevel.findMany({
            where: { isActive: true },
            select: { id: true, name: true },
            orderBy: { sortOrder: 'asc' },
          });

    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(standards);
  }),
);

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

/**
 * One phone number or one email address, however it was typed.
 *
 * Read from the raw body because the limiter runs before validation — a
 * request refused for its rate never gets as far as being checked.
 */
export const otpDestinationKey = (req: Pick<Request, 'body'>): string => {
  const payload = req.body as { channel?: unknown; destination?: unknown } | undefined;
  const channel = payload?.channel === 'EMAIL' ? 'EMAIL' : 'PHONE';
  const raw = typeof payload?.destination === 'string' ? payload.destination : '';
  const destination =
    channel === 'EMAIL'
      ? raw.trim().toLowerCase()
      : // Last ten digits: +91 98200 00000, 098200 00000 and 9820000000 are
        // one phone.
        raw.replace(/[^0-9]/g, '').slice(-10);
  return `${channel}|${destination}`;
};

const otpRateLimited = (message: string) => ({
  error: { code: 'RATE_LIMITED', message },
});

/**
 * Codes to one number or one address.
 *
 * A code really sent costs the school money and rings somebody's phone, so
 * this is the tight one. It used to be keyed on the connection and shared with
 * checking a code: one registration is two codes sent and two checked, so the
 * second family registering over the school's Wi-Fi in the same hour was
 * turned away with a correct code in the boxes. Keyed on the destination, a
 * family asking again for their own phone is the only thing it counts.
 *
 * Skipped while no message is really sent: the fixed code costs nothing, and
 * the office trying the form ten times to see it work is not abuse.
 */
const otpPerDestinationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 6,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => {
    if (env.isTest) return true;
    const channel = (req.body as { channel?: unknown } | undefined)?.channel;
    return !otpService.isDelivered(channel === 'EMAIL' ? 'EMAIL' : 'PHONE');
  },
  keyGenerator: otpDestinationKey,
  message: otpRateLimited(
    'Too many codes sent to this number or address. Try again in an hour.',
  ),
});

/**
 * The same number or address, over a day. Six an hour is room for a family
 * fumbling the form; this stops somebody using the school to flood one phone
 * or inbox all day, six an hour, every hour.
 */
const otpPerDestinationDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => {
    if (env.isTest) return true;
    const channel = (req.body as { channel?: unknown } | undefined)?.channel;
    return !otpService.isDelivered(channel === 'EMAIL' ? 'EMAIL' : 'PHONE');
  },
  keyGenerator: otpDestinationKey,
  message: otpRateLimited(
    'Too many codes sent to this number or address today. Try again tomorrow.',
  ),
});

/**
 * The spray guard: one connection sending codes to many numbers. Loose enough
 * for a school's worth of families registering over its one Wi-Fi.
 */
const otpSendPerAddressLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: otpRateLimited('Too many codes requested. Try again in an hour.'),
});

/**
 * Typing codes back. Guessing is already capped where it matters — each code
 * dies after five wrong tries and a new one costs a send — so this only stops
 * a script hammering the endpoint.
 */
const otpVerifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: otpRateLimited('Too many tries. Try again in an hour.'),
});

/**
 * A code to the number that will sign in, or to the address beside it. Sent
 * before the form, not after.
 */
publicRouter.post(
  '/schools/:code/otp/send',
  otpSendPerAddressLimiter,
  otpPerDestinationLimiter,
  otpPerDestinationDailyLimiter,
  validate({ params: codeParamSchema, body: sendOtpSchema }),
  asyncHandler(async (req: Request, res) => {
    const { code } = params<{ code: string }>(req);
    const input = body<SendOtpInput>(req);

    const school = await registrationService.registeringSchool(code);
    res
      .status(202)
      .json(await otpService.sendChallenge(school.id, input.channel, input.destination));
  }),
);

/** Typing it back. Answers the same way whatever is wrong with it. */
publicRouter.post(
  '/schools/:code/otp/verify',
  otpVerifyLimiter,
  validate({ params: codeParamSchema, body: verifyOtpSchema }),
  asyncHandler(async (req: Request, res) => {
    const { code } = params<{ code: string }>(req);
    const input = body<VerifyOtpInput>(req);

    const school = await registrationService.registeringSchool(code);
    await otpService.verifyChallenge(school.id, input.challengeId, input.code);
    res.json({ verified: true });
  }),
);

const deletionRateLimited = {
  error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in 15 minutes.' },
};

/**
 * The website's deletion form takes a password, so it is guarded the way
 * signing in is: per account and address, and a looser ceiling per address
 * for somebody working down a list of numbers.
 */
const deletionPerAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  keyGenerator: loginRateLimitKey,
  message: deletionRateLimited,
});

const deletionPerAddressLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: deletionRateLimited,
});

/**
 * Closing an account from the website — Google Play requires a way that does
 * not need the app, for a family who has already uninstalled it.
 *
 * Not under /schools/:code: the School ID is only needed when the same number
 * is a parent at two schools, and the reply says when it is.
 */
publicRouter.post(
  '/account-deletion',
  deletionPerAddressLimiter,
  deletionPerAccountLimiter,
  validate({ body: deleteAccountSchema }),
  asyncHandler(async (req: Request, res) => {
    res.json(await accountDeletion.deleteAccountWithCredentials(body<DeleteAccountInput>(req)));
  }),
);

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
