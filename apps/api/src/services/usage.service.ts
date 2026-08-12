import { prismaUnscoped } from '../db/prisma.js';

/**
 * What the publisher's product is actually being used for.
 *
 * The overview counts schools and children — how much has been *sold*. This
 * answers the other question: whether any of it is being opened. A school with
 * sixty children and four attempts all term is a support call waiting to
 * happen, and it does not show up anywhere else.
 *
 * Every figure carries its basis for the same reason the progress screens do.
 * "Sunrise: 12%" is a verdict; "Sunrise: 7 of 58 children played something in
 * the last 30 days" is something you can act on.
 */

export interface UsageWindow {
  days: number;
  since: string;
}

export interface SchoolUsage {
  schoolId: string;
  schoolName: string;
  status: string;
  students: number;
  /** Distinct children who played anything in the window. */
  activeChildren: number;
  attempts: number;
  lastAttemptAt: string | null;
}

export interface ActivityUsage {
  activityId: string;
  code: string;
  title: string;
  type: string;
  isActive: boolean;
  attempts: number;
  schools: number;
  /** Correct answers as a share of questions asked, across every school. */
  averageScore: number | null;
}

export interface UsageReport {
  window: UsageWindow;
  totals: { attempts: number; activeChildren: number; schoolsUsing: number };
  schools: SchoolUsage[];
  activities: ActivityUsage[];
  /**
   * Written, playable, and never once opened by a child anywhere.
   *
   * The most useful list on the page: it is the work that did not land.
   */
  neverPlayed: Array<{ activityId: string; code: string; title: string }>;
}

export async function usageReport(days = 30): Promise<UsageReport> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [schools, attemptsBySchool, childrenBySchool, activities, attemptsByActivity] =
    await Promise.all([
      prismaUnscoped.school.findMany({
        select: { id: true, name: true, status: true, _count: { select: { students: true } } },
        orderBy: { name: 'asc' },
      }),
      prismaUnscoped.activityAttempt.groupBy({
        by: ['schoolId'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      // Distinct children, which groupBy cannot express in one pass — a child
      // who plays forty times is one child using the product, not forty.
      prismaUnscoped.activityAttempt.findMany({
        where: { createdAt: { gte: since } },
        select: { schoolId: true, studentId: true },
        distinct: ['schoolId', 'studentId'],
      }),
      prismaUnscoped.learningActivity.findMany({
        select: { id: true, code: true, title: true, type: true, isActive: true },
        orderBy: { code: 'asc' },
      }),
      prismaUnscoped.activityAttempt.groupBy({
        by: ['activityId'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { correctCount: true, totalCount: true },
      }),
    ]);

  const attemptsFor = new Map(attemptsBySchool.map((row) => [row.schoolId, row]));

  const childrenFor = new Map<string, number>();
  for (const row of childrenBySchool) {
    childrenFor.set(row.schoolId, (childrenFor.get(row.schoolId) ?? 0) + 1);
  }

  const schoolRows: SchoolUsage[] = schools.map((school) => {
    const attempts = attemptsFor.get(school.id);
    return {
      schoolId: school.id,
      schoolName: school.name,
      status: school.status,
      students: school._count.students,
      activeChildren: childrenFor.get(school.id) ?? 0,
      attempts: attempts?._count._all ?? 0,
      lastAttemptAt: attempts?._max.createdAt?.toISOString() ?? null,
    };
  });

  // Schools reached per activity, which needs the pairs rather than the counts.
  const schoolsPerActivity = await prismaUnscoped.activityAttempt.findMany({
    where: { createdAt: { gte: since } },
    select: { activityId: true, schoolId: true },
    distinct: ['activityId', 'schoolId'],
  });
  const schoolCountFor = new Map<string, number>();
  for (const row of schoolsPerActivity) {
    schoolCountFor.set(row.activityId, (schoolCountFor.get(row.activityId) ?? 0) + 1);
  }

  const usageFor = new Map(attemptsByActivity.map((row) => [row.activityId, row]));

  const activityRows: ActivityUsage[] = activities.map((activity) => {
    const usage = usageFor.get(activity.id);
    const asked = usage?._sum.totalCount ?? 0;
    const right = usage?._sum.correctCount ?? 0;

    return {
      activityId: activity.id,
      code: activity.code,
      title: activity.title,
      type: activity.type,
      isActive: activity.isActive,
      attempts: usage?._count._all ?? 0,
      schools: schoolCountFor.get(activity.id) ?? 0,
      // Null rather than zero when nothing was asked: an activity nobody has
      // played has no score, and showing 0% would read as one everybody failed.
      averageScore: asked === 0 ? null : Math.round((right / asked) * 100),
    };
  });

  // Across all time, not the window — an activity played once last year has
  // landed, however quietly, and does not belong on this list.
  const everPlayed = await prismaUnscoped.activityAttempt.findMany({
    select: { activityId: true },
    distinct: ['activityId'],
  });
  const played = new Set(everPlayed.map((row) => row.activityId));

  return {
    window: { days, since: since.toISOString() },
    totals: {
      attempts: attemptsBySchool.reduce((sum, row) => sum + row._count._all, 0),
      activeChildren: childrenBySchool.length,
      schoolsUsing: schoolRows.filter((school) => school.attempts > 0).length,
    },
    schools: schoolRows,
    activities: activityRows,
    neverPlayed: activities
      .filter((activity) => activity.isActive && !played.has(activity.id))
      .map((activity) => ({
        activityId: activity.id,
        code: activity.code,
        title: activity.title,
      })),
  };
}
