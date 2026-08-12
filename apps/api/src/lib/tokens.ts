import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { AccessTokenPayload, RefreshTokenPayload, Role } from '@poetree/shared';
import { env } from '../config/env.js';
import { ApiError } from './apiError.js';

const ISSUER = 'poetree-api';

export function signAccessToken(input: {
  userId: string;
  role: Role;
  schoolId: string | null;
  mustChangePassword?: boolean;
}): string {
  const payload: AccessTokenPayload = {
    sub: input.userId,
    role: input.role,
    schoolId: input.schoolId,
    tokenType: 'access',
    // Omitted rather than false so an ordinary token keeps its current shape.
    ...(input.mustChangePassword ? { mustChangePassword: true } : {}),
  };

  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    issuer: ISSUER,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: ISSUER });
    if (typeof decoded === 'string' || decoded.tokenType !== 'access') {
      throw ApiError.unauthenticated('Malformed access token');
    }
    return decoded as AccessTokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) throw ApiError.tokenExpired();
    if (error instanceof ApiError) throw error;
    throw ApiError.unauthenticated('Invalid access token');
  }
}

export function signRefreshToken(input: { userId: string; tokenId: string }): string {
  const payload: RefreshTokenPayload = {
    sub: input.userId,
    jti: input.tokenId,
    tokenType: 'refresh',
  };

  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    issuer: ISSUER,
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: ISSUER });
    if (typeof decoded === 'string' || decoded.tokenType !== 'refresh') {
      throw ApiError.invalidRefreshToken('Malformed refresh token');
    }
    return decoded as RefreshTokenPayload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.invalidRefreshToken();
  }
}

/** Refresh tokens are never stored in the clear — only this digest is. */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function newTokenId(): string {
  return crypto.randomUUID();
}

export function refreshTokenExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}
