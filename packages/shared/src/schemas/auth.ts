import { z } from 'zod';
import { ROLES } from '../enums.js';
import { idSchema, passwordSchema } from './common.js';

/**
 * Login accepts either an email address or a phone number in a single field —
 * school admins are typically created with an email, while teachers and parents
 * (Phase 2) are far more likely to be reached by phone.
 */
export const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your email or phone number').max(160),
  password: z.string().min(1, 'Enter your password').max(72),
  /**
   * Narrows the search to one school — or to one group's branches.
   *
   * A school code and an organisation code are both accepted here, in one
   * field, because the caller does not know which it holds: a branded app is
   * built per school when the customer is independent and per group when it is
   * not, and either way the app sends the code it was built with.
   *
   * Without it, login still works: the user is found by email or phone and the
   * school comes from the row that matches. The code is what makes the answer
   * unambiguous when the same phone number exists at two schools.
   */
  schoolCode: z.string().trim().toLowerCase().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * A group administrator choosing which branch to work in.
 *
 * Returns a fresh token pair bound to that branch, so from the next request on
 * the session is indistinguishable from a School Admin's. One token, one
 * school — which is what every tenant-scoped query in the API relies on.
 */
export const switchBranchSchema = z.object({ schoolId: idSchema });
export type SwitchBranchInput = z.infer<typeof switchBranchSchema>;

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
  /**
   * The group this session belongs to, for a group administrator — set whether
   * or not they have picked a branch yet, which is how a client knows to show
   * the branch switcher at all.
   */
  organisation: {
    id: string;
    name: string;
    code: string;
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
  /**
   * Which sign-in this token belongs to. Stays the same across refreshes; a
   * new sign-in starts a new one. For roles held to one device, a token whose
   * session is no longer the account's current one is refused.
   */
  sid?: string;
}

export interface RefreshTokenPayload {
  sub: string;
  /** Identifies the stored RefreshToken row so it can be rotated and revoked. */
  jti: string;
  tokenType: 'refresh';
}

/**
 * The office setting somebody else's password to one it has chosen.
 *
 * Only the new password: there is no current one to prove, because the person
 * whose password it is cannot remember it — that is why the office is doing it.
 */
export const setPasswordSchema = z.object({ newPassword: passwordSchema });
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
