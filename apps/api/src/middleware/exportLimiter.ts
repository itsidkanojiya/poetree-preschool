import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * A ceiling on Excel exports, per person.
 *
 * Each one reads a school's whole roll — or every school's — so a stuck
 * button or a script asking in a loop is a real load on the database. Twenty
 * in ten minutes is far more than anyone exporting by hand needs.
 */
export const exportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  // Signed in by the time this runs: one person, wherever they are.
  keyGenerator: (req) => req.auth?.userId ?? req.ip ?? 'unknown',
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many exports. Try again in a few minutes.' },
  },
});
