import { prismaUnscoped } from '../db/prisma.js';
import { isBirthdayOn } from '../lib/birthdays.js';
import { schoolHour, schoolToday } from '../lib/feeSchedule.js';
import { logger } from '../lib/logger.js';
import { guardianUserIdsFor, notify } from '../services/notification.service.js';

/**
 * Birthday wishes: on a child's birthday, a message to their parents from the
 * school, for schools that have switched it on.
 *
 * Runs every quarter hour like the fee reminders, and sends from 9 in the
 * morning, school time, until 8 at night — a child born in the evening is
 * still wished, and nobody's phone lights up at midnight. A wish is a
 * notification with the child as its subject, so whether this year's has gone
 * is read from the notifications themselves, and a restart never sends one
 * twice.
 */

const FIRST_HOUR = 9;
const LAST_HOUR = 20;
const EVERY_MS = 15 * 60 * 1000;
const ENTITY = 'BirthdayWish';

export interface BirthdayRun {
  sent: number;
}

export async function runBirthdayWishes(now: Date = new Date()): Promise<BirthdayRun> {
  const run: BirthdayRun = { sent: 0 };
  const hour = schoolHour(now);
  if (hour < FIRST_HOUR || hour >= LAST_HOUR) return run;

  const today = schoolToday(now);
  const yearStart = new Date(`${today.slice(0, 4)}-01-01T00:00:00Z`);

  const schools = await prismaUnscoped.school.findMany({
    where: { status: { in: ['ACTIVE', 'TRIAL'] }, birthdayWishesEnabled: true },
    select: { id: true, name: true },
  });

  for (const school of schools) {
    const children = await prismaUnscoped.student.findMany({
      where: { schoolId: school.id, status: 'ACTIVE', deletedAt: null },
      select: { id: true, firstName: true, dateOfBirth: true },
    });
    const birthdays = children.filter((child) =>
      isBirthdayOn(child.dateOfBirth.toISOString().slice(0, 10), today),
    );
    if (birthdays.length === 0) continue;

    const already = new Set(
      (
        await prismaUnscoped.notification.findMany({
          where: {
            schoolId: school.id,
            type: 'BIRTHDAY_WISH',
            entityType: ENTITY,
            entityId: { in: birthdays.map((child) => child.id) },
            createdAt: { gte: yearStart },
          },
          select: { entityId: true },
        })
      ).map((row) => row.entityId),
    );

    for (const child of birthdays) {
      if (already.has(child.id)) continue;
      const parents = await guardianUserIdsFor([child.id]);
      if (parents.length === 0) continue;
      await notify({
        schoolId: school.id,
        userIds: parents,
        type: 'BIRTHDAY_WISH',
        title: `Happy birthday, ${child.firstName}! 🎂`,
        body: `Warm wishes from everyone at ${school.name}.`,
        entityType: ENTITY,
        entityId: child.id,
        data: { studentId: child.id },
      });
      run.sent += 1;
    }
  }

  return run;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Starts the quarter-hourly run. One process runs it; there is one API process. */
export function startBirthdayWishes(): void {
  if (timer) return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const run = await runBirthdayWishes();
      if (run.sent > 0) logger.info('Birthday wishes sent', { ...run });
    } catch (error) {
      logger.error('Birthday wishes failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  };
  setTimeout(() => void tick(), 90_000).unref();
  timer = setInterval(() => void tick(), EVERY_MS);
  timer.unref();
}

export function stopBirthdayWishes(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
