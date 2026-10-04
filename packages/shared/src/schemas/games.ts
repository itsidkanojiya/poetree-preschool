import { z } from 'zod';
import { idSchema } from './common.js';

/**
 * The learning games: Letter Match, Find the Letter, Complete the Sequence,
 * Count & Choose and Listen & Match.
 *
 * What a game asks is content the app carries (and can later fetch); the
 * server knows which games there are, whether the module and each game are
 * switched on, and each child's results.
 */

export const GAME_KEYS = [
  'letter_match',
  'find_letter',
  'complete_sequence',
  'count_choose',
  'listen_match',
] as const;
export type GameKey = (typeof GAME_KEYS)[number];

/** The languages a game can be played in. */
export const GAME_LANGUAGES = ['en', 'hi', 'gu'] as const;
export type GameLanguage = (typeof GAME_LANGUAGES)[number];

export const GAME_NAMES: Record<GameKey, string> = {
  letter_match: 'Letter Match',
  find_letter: 'Find the Letter',
  complete_sequence: 'Complete the Sequence',
  count_choose: 'Count & Choose',
  listen_match: 'Listen & Match',
};

/* -------------------------------------------------------------------------- */
/* A child                                                                    */
/* -------------------------------------------------------------------------- */

export const gamesStudentSchema = z.object({ studentId: idSchema });

/** One round played to the end. */
export const recordGameSessionSchema = z
  .object({
    studentId: idSchema,
    gameKey: z.enum(GAME_KEYS),
    language: z.enum(GAME_LANGUAGES),
    total: z.number().int().min(1).max(50),
    correct: z.number().int().min(0).max(50),
    wrong: z.number().int().min(0).max(500),
  })
  .refine((v) => v.correct <= v.total, {
    message: 'More right answers than questions',
    path: ['correct'],
  });
export type RecordGameSessionInput = z.infer<typeof recordGameSessionSchema>;

/** How far a child has got with one game in one language. */
export interface GameProgress {
  played: number;
  /** The best round: right first time, out of how many. */
  bestCorrect: number;
  bestTotal: number;
}

export interface GameSummary {
  key: GameKey;
  name: string;
}

export interface GamesTotals {
  played: number;
  correct: number;
  wrong: number;
  /** One star for every answer right first time. */
  stars: number;
}

/** What the home screen and the Games hub ask: is it on, and how far along. */
export interface GamesHome {
  enabled: boolean;
  /** The games switched on, in order. */
  games: GameSummary[];
  /** language → game → progress. Absent means not played yet. */
  progress: Partial<Record<GameLanguage, Partial<Record<GameKey, GameProgress>>>>;
  totals: GamesTotals;
}

/* -------------------------------------------------------------------------- */
/* Publisher                                                                  */
/* -------------------------------------------------------------------------- */

export const gamesSettingsSchema = z.object({ enabled: z.boolean() });
export type GamesSettingsInput = z.infer<typeof gamesSettingsSchema>;

export const updateGameSchema = z.object({ isActive: z.boolean() });
export type UpdateGameInput = z.infer<typeof updateGameSchema>;

export const gameKeyParamSchema = z.object({ key: z.enum(GAME_KEYS) });

export interface GameAdmin {
  key: GameKey;
  name: string;
  isActive: boolean;
  /** Rounds played in every school, for the publisher's sense of use. */
  sessions: number;
}

export interface GamesAdmin {
  enabled: boolean;
  games: GameAdmin[];
}
