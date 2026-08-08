import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

// bcrypt is deliberately slow; 12 rounds in production, fewer under test so the
// suite is not dominated by hashing.
const ROUNDS = env.isTest ? 4 : 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Constant-ish work factor for logins where the account does not exist, so an
 * attacker cannot distinguish "no such user" from "wrong password" by timing.
 */
const DUMMY_HASH = bcrypt.hashSync('poetree-timing-equaliser', ROUNDS);

export async function burnPasswordComparison(): Promise<void> {
  await bcrypt.compare('poetree-timing-equaliser', DUMMY_HASH);
}
