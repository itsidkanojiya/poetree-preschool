import type { Prisma } from '@prisma/client';
import { prismaUnscoped } from '../db/prisma.js';
import { logger } from '../lib/logger.js';
import { sendPush } from './push.service.js';

/**
 * Notifications.
 *
 * The stored row is the product; the push is a courtesy. They are written and
 * sent separately so a failed push never loses the message — a parent who was
 * on the underground still sees the absence notice when they open the app.
 */

export type NotificationType =
  | 'ATTENDANCE_ABSENT'
  | 'HOMEWORK_ASSIGNED'
  | 'HOMEWORK_REVIEWED'
  | 'FEE_DUE'
  | 'FEE_RECEIPT'
  | 'NOTICE_PUBLISHED'
  | 'NOTICE_EMERGENCY'
  | 'CLASSROOM_POST'
  | 'PROGRESS_UPDATED'
  | 'ACCOUNT_SECURITY';

export interface NotifyInput {
  schoolId: string;
  userIds: string[];
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  data?: Record<string, string>;
}

/** Emergencies interrupt; everything else can wait for the reader to look. */
function isUrgent(type: NotificationType): boolean {
  return type === 'NOTICE_EMERGENCY' || type === 'ACCOUNT_SECURITY';
}

/**
 * Writes the inbox rows, then pushes.
 *
 * Call this AFTER the transaction that caused it has committed. Notifying
 * inside the transaction risks telling a parent their child was marked absent
 * and then rolling the mark back.
 */
export async function notify(input: NotifyInput): Promise<{ stored: number; pushed: number }> {
  if (input.userIds.length === 0) return { stored: 0, pushed: 0 };

  const rows: Prisma.NotificationCreateManyInput[] = input.userIds.map((userId) => ({
    schoolId: input.schoolId,
    userId,
    type: input.type,
    title: input.title,
    body: input.body,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    dataJson: input.data ?? undefined,
  }));

  await prismaUnscoped.notification.createMany({ data: rows });

  const pushed = await push(input);
  return { stored: rows.length, pushed };
}

async function push(input: NotifyInput): Promise<number> {
  const devices = await prismaUnscoped.deviceToken.findMany({
    where: { userId: { in: input.userIds }, revokedAt: null },
    select: { id: true, token: true },
  });

  if (devices.length === 0) return 0;

  let sent = 0;
  const stale: string[] = [];

  // Sequential rather than parallel: a class of thirty is a handful of requests,
  // and firing them all at once is the fastest way to be rate-limited by FCM.
  for (const device of devices) {
    const outcome = await sendPush({
      token: device.token,
      title: input.title,
      body: input.body,
      data: {
        type: input.type,
        ...(input.entityId ? { entityId: input.entityId } : {}),
        ...(input.entityType ? { entityType: input.entityType } : {}),
        ...(input.data ?? {}),
      },
    });

    if (outcome === 'sent') sent += 1;
    if (outcome === 'stale') stale.push(device.id);
    if (outcome === 'skipped') break; // push is not configured; stop trying
  }

  // A reinstalled app leaves its old token behind. Left alone these accumulate
  // and every send gets slower for no benefit.
  if (stale.length > 0) {
    await prismaUnscoped.deviceToken.updateMany({
      where: { id: { in: stale } },
      data: { revokedAt: new Date() },
    });
    logger.info('Revoked stale device tokens', { count: stale.length });
  }

  return sent;
}

/**
 * Fire-and-forget wrapper for the common case.
 *
 * A notification that fails must never fail the request that caused it: a
 * teacher's register is saved whether or not the parents' phones were reachable.
 */
export function notifySafe(input: NotifyInput): void {
  void notify(input).catch((error: unknown) => {
    logger.error('Notification dispatch failed', {
      type: input.type,
      recipients: input.userIds.length,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

/** The guardians of these children, for parent-facing notifications. */
export async function guardianUserIdsFor(studentIds: string[]): Promise<string[]> {
  if (studentIds.length === 0) return [];

  const links = await prismaUnscoped.studentGuardian.findMany({
    where: { studentId: { in: studentIds } },
    select: { parentProfile: { select: { userId: true } } },
  });

  return [...new Set(links.map((link) => link.parentProfile.userId))];
}

export { isUrgent };
