import { Prisma } from '@prisma/client';
import {
  GAME_KEYS,
  GAME_NAMES,
  type GameKey,
  type GameLanguage,
  type GameProgress,
  type GamesAdmin,
  type GamesHome,
  type RecordGameSessionInput,
} from '@poetree/shared';
import { prisma, prismaUnscoped } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { assertCanReadStudent } from './scope.service.js';
import { writeAuditLog } from './audit.service.js';

/**
 * The learning games.
 *
 * Which games there are, and whether each is on, is the publisher's — the
 * same for every school. Each child's rounds are their school's. One switch
 * on the publication turns the module on or off everywhere; off closes the
 * child's routes as well as hiding the banner, so an app that has not noticed
 * yet still cannot open it.
 */

/** Writes any game that is not there yet. Games are never deleted. */
async function ensureGames(): Promise<void> {
  const existing = new Set(
    (await prismaUnscoped.game.findMany({ select: { key: true } })).map((g) => g.key),
  );
  for (const [index, key] of GAME_KEYS.entries()) {
    if (existing.has(key)) continue;
    try {
      await prismaUnscoped.game.create({
        data: { key, name: GAME_NAMES[key], sortOrder: index },
      });
    } catch (error) {
      // Two first requests at once: the other one wrote it.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
    }
  }
}

async function publicationRow() {
  const publication = await prismaUnscoped.publication.findFirst({
    select: { id: true, gamesEnabled: true },
  });
  if (!publication) {
    throw ApiError.internal('No publication has been configured. Run the database seed.');
  }
  return publication;
}

async function enabledForSchool(): Promise<boolean> {
  const school = await prismaUnscoped.school.findUnique({
    where: { id: requireSchoolId() },
    select: { publication: { select: { gamesEnabled: true } } },
  });
  return school?.publication.gamesEnabled ?? false;
}

const isGameKey = (key: string): key is GameKey => (GAME_KEYS as readonly string[]).includes(key);

/* -------------------------------------------------------------------------- */
/* A child                                                                    */
/* -------------------------------------------------------------------------- */

const noTotals = { played: 0, correct: 0, wrong: 0, stars: 0 };

export async function homeFor(studentId: string): Promise<GamesHome> {
  await assertCanReadStudent(studentId);
  if (!(await enabledForSchool())) {
    return { enabled: false, games: [], progress: {}, totals: noTotals };
  }
  await ensureGames();

  const [games, rows, totals] = await Promise.all([
    prismaUnscoped.game.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { key: true, name: true },
    }),
    prisma.gameSession.groupBy({
      by: ['gameKey', 'language'],
      where: { studentId },
      _count: { _all: true },
      _max: { correct: true, total: true },
    }),
    prisma.gameSession.aggregate({
      where: { studentId },
      _count: { _all: true },
      _sum: { correct: true, wrong: true },
    }),
  ]);

  const progress: GamesHome['progress'] = {};
  for (const row of rows) {
    if (!isGameKey(row.gameKey)) continue;
    const language = row.language as GameLanguage;
    const entry: GameProgress = {
      played: row._count._all,
      bestCorrect: row._max.correct ?? 0,
      bestTotal: row._max.total ?? 0,
    };
    (progress[language] ??= {})[row.gameKey] = entry;
  }

  const correct = totals._sum.correct ?? 0;
  return {
    enabled: true,
    games: games
      .filter((g) => isGameKey(g.key))
      .map((g) => ({ key: g.key as GameKey, name: g.name })),
    progress,
    totals: {
      played: totals._count._all,
      correct,
      wrong: totals._sum.wrong ?? 0,
      stars: correct,
    },
  };
}

/** A round played to the end. */
export async function recordSession(input: RecordGameSessionInput): Promise<GamesHome> {
  await assertCanReadStudent(input.studentId);
  // A 404 rather than a 403: to the app, a module or game that is off is
  // simply not there.
  if (!(await enabledForSchool())) throw ApiError.notFound('Games are not available');
  await ensureGames();
  const game = await prismaUnscoped.game.findUnique({ where: { key: input.gameKey } });
  if (!game?.isActive) throw ApiError.notFound('That game is not available');

  await prisma.gameSession.create({
    data: {
      schoolId: requireSchoolId(),
      studentId: input.studentId,
      gameKey: input.gameKey,
      language: input.language,
      total: input.total,
      correct: input.correct,
      wrong: input.wrong,
    },
  });
  return homeFor(input.studentId);
}

/* -------------------------------------------------------------------------- */
/* The publisher                                                              */
/* -------------------------------------------------------------------------- */

export async function adminView(): Promise<GamesAdmin> {
  await ensureGames();
  const [publication, games, sessions] = await Promise.all([
    publicationRow(),
    prismaUnscoped.game.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    prismaUnscoped.gameSession.groupBy({ by: ['gameKey'], _count: { _all: true } }),
  ]);
  const counts = new Map(sessions.map((s) => [s.gameKey, s._count._all]));

  return {
    enabled: publication.gamesEnabled,
    games: games
      .filter((g) => isGameKey(g.key))
      .map((g) => ({
        key: g.key as GameKey,
        name: g.name,
        isActive: g.isActive,
        sessions: counts.get(g.key) ?? 0,
      })),
  };
}

export async function setEnabled(enabled: boolean, actorUserId: string): Promise<void> {
  const publication = await publicationRow();
  await prismaUnscoped.publication.update({
    where: { id: publication.id },
    data: { gamesEnabled: enabled },
  });
  await writeAuditLog({
    action: 'GAMES_SETTINGS_CHANGED',
    entity: 'Publication',
    entityId: publication.id,
    schoolId: null,
    actorUserId,
    before: { gamesEnabled: publication.gamesEnabled },
    after: { gamesEnabled: enabled },
  });
}

export async function setGameActive(
  key: GameKey,
  isActive: boolean,
  actorUserId: string,
): Promise<void> {
  await ensureGames();
  const game = await prismaUnscoped.game.update({ where: { key }, data: { isActive } });
  await writeAuditLog({
    action: 'GAMES_SETTINGS_CHANGED',
    entity: 'Game',
    entityId: game.id,
    schoolId: null,
    actorUserId,
    after: { key, isActive },
  });
}
