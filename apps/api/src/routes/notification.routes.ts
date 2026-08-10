import { Router } from 'express';
import { z } from 'zod';
import { idParamSchema, paginationQuerySchema } from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { body, params, query, validate } from '../middleware/validate.js';
import { prismaUnscoped } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { paginate, toSkipTake } from '../lib/pagination.js';
import { isPushConfigured } from '../services/push.service.js';

export const notificationRouter = Router();

/**
 * The inbox is per-user, so it is queried by userId rather than through the
 * tenant-scoped client — a user only ever sees their own rows, which is a
 * narrower guarantee than school scoping.
 */
notificationRouter.get(
  '/',
  validate({ query: paginationQuerySchema.extend({ unreadOnly: z.coerce.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    const q = query<{ page: number; pageSize: number; unreadOnly?: boolean }>(req);
    const where = {
      userId: req.auth!.userId,
      ...(q.unreadOnly ? { readAt: null } : {}),
    };

    const [items, total, unread] = await Promise.all([
      prismaUnscoped.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(q),
      }),
      prismaUnscoped.notification.count({ where }),
      prismaUnscoped.notification.count({ where: { userId: req.auth!.userId, readAt: null } }),
    ]);

    res.json({
      ...paginate(
        items.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          entityType: n.entityType,
          entityId: n.entityId,
          readAt: n.readAt?.toISOString() ?? null,
          createdAt: n.createdAt.toISOString(),
        })),
        total,
        q,
      ),
      unread,
    });
  }),
);

notificationRouter.post(
  '/:id/read',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    // Scoped to the caller, so one user cannot mark another's notification read.
    await prismaUnscoped.notification.updateMany({
      where: { id: params<{ id: string }>(req).id, userId: req.auth!.userId, readAt: null },
      data: { readAt: new Date() },
    });
    res.status(204).send();
  }),
);

notificationRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const result = await prismaUnscoped.notification.updateMany({
      where: { userId: req.auth!.userId, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ marked: result.count });
  }),
);

/* -------------------------------------------------------------------------- */
/* Device registration                                                        */
/* -------------------------------------------------------------------------- */

const deviceSchema = z.object({
  token: z.string().trim().min(10).max(500),
  platform: z.enum(['ANDROID', 'IOS', 'WEB']).default('ANDROID'),
});

/**
 * Idempotent by design: the app registers its token on every launch, because
 * FCM rotates tokens without telling the app which one it replaced.
 */
notificationRouter.post(
  '/devices',
  validate({ body: deviceSchema }),
  asyncHandler(async (req, res) => {
    const input = body<z.infer<typeof deviceSchema>>(req);
    const schoolId = requireSchoolId();

    const existing = await prismaUnscoped.deviceToken.findFirst({
      where: { token: input.token },
      select: { id: true },
    });

    if (existing) {
      // Reassign rather than duplicate: a shared family phone can move between
      // accounts, and the token must follow whoever signed in last.
      await prismaUnscoped.deviceToken.update({
        where: { id: existing.id },
        data: {
          userId: req.auth!.userId,
          schoolId,
          platform: input.platform,
          lastSeenAt: new Date(),
          revokedAt: null,
        },
      });
    } else {
      await prismaUnscoped.deviceToken.create({
        data: {
          schoolId,
          userId: req.auth!.userId,
          token: input.token,
          platform: input.platform,
        },
      });
    }

    res.status(201).json({ registered: true, pushEnabled: isPushConfigured() });
  }),
);

notificationRouter.delete(
  '/devices',
  validate({ body: z.object({ token: z.string().trim().min(10).max(500) }) }),
  asyncHandler(async (req, res) => {
    await prismaUnscoped.deviceToken.updateMany({
      where: { token: body<{ token: string }>(req).token, userId: req.auth!.userId },
      data: { revokedAt: new Date() },
    });
    res.status(204).send();
  }),
);
