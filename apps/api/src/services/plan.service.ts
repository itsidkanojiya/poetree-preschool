import type { Prisma } from '@prisma/client';
import type {
  CreatePlanInput,
  ListPlansQuery,
  Paginated,
  PlanSummary,
  UpdatePlanInput,
} from '@poetree/shared';
import { prismaUnscoped } from '../db/prisma.js';
import { ApiError } from '../lib/apiError.js';
import { paginate, toSkipTake } from '../lib/pagination.js';

const planSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  maxStudents: true,
  maxTeachers: true,
  priceInPaise: true,
  billingPeriodMonths: true,
  features: true,
  isActive: true,
  _count: { select: { subscriptions: true } },
} satisfies Prisma.SubscriptionPlanSelect;

type PlanRow = Prisma.SubscriptionPlanGetPayload<{ select: typeof planSelect }>;

function toFeatureList(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function toSummary(plan: PlanRow): PlanSummary {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    maxStudents: plan.maxStudents,
    maxTeachers: plan.maxTeachers,
    priceInPaise: plan.priceInPaise,
    billingPeriodMonths: plan.billingPeriodMonths,
    features: toFeatureList(plan.features),
    isActive: plan.isActive,
    schoolCount: plan._count.subscriptions,
  };
}

export async function listPlans(query: ListPlansQuery): Promise<Paginated<PlanSummary>> {
  const where: Prisma.SubscriptionPlanWhereInput = {};
  if (query.isActive !== undefined) where.isActive = query.isActive;
  if (query.search) {
    where.OR = [{ name: { contains: query.search } }, { code: { contains: query.search } }];
  }

  const [rows, total] = await Promise.all([
    prismaUnscoped.subscriptionPlan.findMany({
      where,
      select: planSelect,
      orderBy: [{ isActive: 'desc' }, { priceInPaise: 'asc' }],
      ...toSkipTake(query),
    }),
    prismaUnscoped.subscriptionPlan.count({ where }),
  ]);

  return paginate(rows.map(toSummary), total, query);
}

export async function getPlan(planId: string): Promise<PlanSummary> {
  const plan = await prismaUnscoped.subscriptionPlan.findUnique({
    where: { id: planId },
    select: planSelect,
  });
  if (!plan) throw ApiError.notFound('Plan not found');
  return toSummary(plan);
}

export async function createPlan(input: CreatePlanInput): Promise<PlanSummary> {
  const existing = await prismaUnscoped.subscriptionPlan.findUnique({
    where: { code: input.code },
    select: { id: true },
  });
  if (existing) throw ApiError.conflict(`Plan code "${input.code}" already exists`);

  const plan = await prismaUnscoped.subscriptionPlan.create({
    data: {
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      maxStudents: input.maxStudents,
      maxTeachers: input.maxTeachers,
      priceInPaise: input.priceInPaise,
      billingPeriodMonths: input.billingPeriodMonths,
      features: input.features,
      isActive: input.isActive,
    },
    select: planSelect,
  });

  return toSummary(plan);
}

export async function updatePlan(planId: string, input: UpdatePlanInput): Promise<PlanSummary> {
  const exists = await prismaUnscoped.subscriptionPlan.findUnique({
    where: { id: planId },
    select: { id: true },
  });
  if (!exists) throw ApiError.notFound('Plan not found');

  const plan = await prismaUnscoped.subscriptionPlan.update({
    where: { id: planId },
    data: { ...input, features: input.features ?? undefined },
    select: planSelect,
  });

  return toSummary(plan);
}

/**
 * Seat limits from the school's current plan. Returns `null` for a school with
 * no plan yet (a fresh TRIAL), which the roster services read as "unlimited for
 * now" rather than "blocked".
 */
export async function getPlanLimits(
  schoolId: string,
): Promise<{ maxStudents: number | null; maxTeachers: number | null } | null> {
  const subscription = await prismaUnscoped.schoolSubscription.findFirst({
    where: { schoolId, isCurrent: true },
    orderBy: { createdAt: 'desc' },
    select: { plan: { select: { maxStudents: true, maxTeachers: true } } },
  });

  return subscription?.plan ?? null;
}
