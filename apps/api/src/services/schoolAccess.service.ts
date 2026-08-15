import { ACTIVE_SCHOOL_STATUSES, type SchoolStatus } from '@poetree/shared';
import { env } from '../config/env.js';
import { prismaUnscoped } from '../db/prisma.js';
import { ApiError } from '../lib/apiError.js';
import { logger } from '../lib/logger.js';

/**
 * Plan gate for a whole school.
 *
 * When the Super Admin switches a school's plan off, every user of that school
 * must stop working — school admin, teachers and parents alike. This module is
 * the single place that decides whether a school's users are allowed through,
 * and it is consulted at login, on every authenticated request, and on refresh.
 */
export interface SchoolAccess {
  schoolId: string;
  name: string;
  status: SchoolStatus;
  /** Populated when the school is blocked, for a useful client-side message. */
  blockedReason: string | null;
  planExpiresAt: Date | null;
}

interface CacheEntry {
  value: SchoolAccess;
  cachedAt: number;
}

/**
 * A short-lived in-memory cache so the gate does not cost a query per request.
 * Suspension busts the entry immediately via `invalidateSchoolAccess`, so the
 * TTL only matters for changes made outside this process (another PM2 worker,
 * or a direct DB edit) — those take effect within the TTL.
 */
const cache = new Map<string, CacheEntry>();
const TTL_MS = env.SCHOOL_STATUS_CACHE_TTL_SECONDS * 1000;

export function invalidateSchoolAccess(schoolId: string): void {
  cache.delete(schoolId);
}

export function clearSchoolAccessCache(): void {
  cache.clear();
}

async function loadSchoolAccess(schoolId: string): Promise<SchoolAccess | null> {
  const school = await prismaUnscoped.school.findUnique({
    where: { id: schoolId },
    select: {
      id: true,
      name: true,
      status: true,
      validUntil: true,
      subscriptions: {
        where: { isCurrent: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, expiresAt: true, suspendedReason: true, status: true },
      },
    },
  });

  if (!school) return null;

  const subscription = school.subscriptions[0] ?? null;
  let status: SchoolStatus = school.status;

  /**
   * When their access runs out.
   *
   * The school's own date is the answer; a subscription's is the fallback for
   * schools set up before the date moved onto the school, so nobody's access
   * changed on the day that shipped.
   */
  const expiresAt = school.validUntil ?? subscription?.expiresAt ?? null;

  // Lazy expiry: a date that has passed blocks the school on its next request,
  // so nothing has to be running at midnight for this to be right.
  if (expiresAt && ACTIVE_SCHOOL_STATUSES.includes(status) && expiresAt.getTime() <= Date.now()) {
    status = 'EXPIRED';
    await prismaUnscoped.school.update({ where: { id: schoolId }, data: { status: 'EXPIRED' } });
    if (subscription) {
      await prismaUnscoped.schoolSubscription.update({
        where: { id: subscription.id },
        data: { status: 'EXPIRED' },
      });
    }
    logger.info('School validity ended', { schoolId, expiresAt });
  }

  return {
    schoolId: school.id,
    name: school.name,
    status,
    blockedReason: status === 'SUSPENDED' ? (subscription?.suspendedReason ?? null) : null,
    planExpiresAt: expiresAt,
  };
}

export async function getSchoolAccess(schoolId: string): Promise<SchoolAccess | null> {
  const cached = cache.get(schoolId);
  if (cached && Date.now() - cached.cachedAt < TTL_MS) {
    return cached.value;
  }

  const value = await loadSchoolAccess(schoolId);
  if (value) cache.set(schoolId, { value, cachedAt: Date.now() });
  return value;
}

export function isSchoolUsable(status: SchoolStatus): boolean {
  return ACTIVE_SCHOOL_STATUSES.includes(status);
}

const BLOCK_MESSAGES: Record<Exclude<SchoolStatus, 'TRIAL' | 'ACTIVE'>, string> = {
  SUSPENDED: 'Your school’s access has been suspended. Please contact Poetree Publication.',
  EXPIRED: 'Your school’s access has ended. Please contact Poetree Publication to renew it.',
};

/**
 * Throws unless the school's plan currently permits its users through.
 * Used by both the login path and the per-request middleware so the two can
 * never disagree about what "blocked" means.
 */
export async function assertSchoolUsable(schoolId: string): Promise<SchoolAccess> {
  const access = await getSchoolAccess(schoolId);

  if (!access) {
    // The school row is gone but a token for it still exists.
    throw ApiError.unauthenticated('Your school account no longer exists');
  }

  if (!isSchoolUsable(access.status)) {
    throw ApiError.schoolSuspended(
      BLOCK_MESSAGES[access.status as 'SUSPENDED' | 'EXPIRED'],
      {
        schoolStatus: access.status,
        schoolName: access.name,
        reason: access.blockedReason,
      },
    );
  }

  return access;
}
