import type { Role } from '@poetree/shared';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      /** Set by `authenticate`. The only trusted source of role and schoolId. */
      auth?: {
        userId: string;
        role: Role;
        schoolId: string | null;
      };
      /** Set by `validate`. Controllers read these, never the raw inputs. */
      validated?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};
