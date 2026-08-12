import { Router, type Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { params, validate } from '../middleware/validate.js';
import { prismaUnscoped } from '../db/prisma.js';
import { ApiError } from '../lib/apiError.js';
import { storage } from '../lib/storage.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * The only routes in this system that answer without a token.
 *
 * A sign-in screen has to be branded *before* anyone signs in — that is the
 * whole point of it — and the app has no credentials at that moment. So a
 * school's name, colour and logo are readable by anyone who knows the school
 * code. That is not a leak: the same three things are painted on the gate.
 *
 * Nothing else may ever be added here. Not the school's phone number, not its
 * address, not how many children it has. If a field would embarrass the school
 * on a stranger's screen, it belongs behind the token like everything else.
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

    if (env.USE_X_ACCEL_REDIRECT) {
      res.setHeader('X-Accel-Redirect', `/_protected_files/${file.storageKey}`);
      res.end();
      return;
    }

    res.sendFile(storage.locate(file.storageKey), (error) => {
      if (error) {
        logger.error('Failed to serve a school logo', { code, error: error.message });
        if (!res.headersSent) res.status(404).end();
      }
    });
  }),
);
