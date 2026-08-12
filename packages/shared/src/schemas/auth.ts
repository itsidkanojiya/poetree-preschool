import { z } from 'zod';
import { ROLES } from '../enums.js';
import { passwordSchema } from './common.js';

/**
 * Login accepts either an email address or a phone number in a single field —
 * school admins are typically created with an email, while teachers and parents
 * (Phase 2) are far more likely to be reached by phone.
 */
export const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your email or phone number').max(160),
  password: z.string().min(1, 'Enter your password').max(72),
  /** Optional: restricts login to a specific school. Unused in Phase 1. */
  schoolCode: z.string().trim().toLowerCase().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'New password must be different from the current password',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * What an admin is handed after resetting somebody's password.
 *
 * Returned once and never stored in the clear — there is nowhere to look it up
 * afterwards, which is the point. If the office loses it they reset again.
 */
export interface PasswordResetResponse {
  userId: string;
  name: string;
  temporaryPassword: string;
}

export const roleSchema = z.enum(ROLES);

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Access-token lifetime in seconds. */
  expiresIn: number;
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: (typeof ROLES)[number];
  schoolId: string | null;
  /**
   * True while the user is holding a password somebody else chose for them.
   *
   * The API refuses everything but changing it, so clients should send them
   * straight there rather than to a screen they cannot use.
   */
  mustChangePassword: boolean;
  school: {
    id: string;
    name: string;
    code: string;
    logoUrl: string | null;
    primaryColor: string | null;
    status: string;
  } | null;
}

export interface LoginResponse extends AuthTokens {
  user: AuthenticatedUser;
}

/** JWT access-token payload. `schoolId` here is the only source of tenancy. */
export interface AccessTokenPayload {
  sub: string;
  role: (typeof ROLES)[number];
  schoolId: string | null;
  tokenType: 'access';
  /**
   * Carried in the token so the check costs nothing per request.
   *
   * Safe to trust: a reset revokes every session, so the holder has to sign in
   * again to get a token at all, and changing the password hands back a fresh
   * pair without the claim.
   */
  mustChangePassword?: boolean;
}

export interface RefreshTokenPayload {
  sub: string;
  /** Identifies the stored RefreshToken row so it can be rotated and revoked. */
  jti: string;
  tokenType: 'refresh';
}
