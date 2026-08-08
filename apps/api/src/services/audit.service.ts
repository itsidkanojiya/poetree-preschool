import type { Prisma } from '@prisma/client';
import type { AuditAction } from '@poetree/shared';
import { prismaUnscoped } from '../db/prisma.js';
import { logger } from '../lib/logger.js';

export interface AuditEntry {
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  schoolId?: string | null;
  actorUserId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}

/**
 * Audit rows are written with the unscoped client on purpose: an audit trail
 * that a tenant filter could suppress is not an audit trail, and
 * publication-level events (a failed Super Admin login) have no school at all.
 *
 * Pass `tx` when the entry must be atomic with the change it describes — a
 * suspension that succeeds without its log entry is a compliance gap.
 */
export async function writeAuditLog(
  entry: AuditEntry,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? prismaUnscoped;
  await client.auditLog.create({
    data: {
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      schoolId: entry.schoolId ?? null,
      actorUserId: entry.actorUserId ?? null,
      metadata: entry.metadata,
      ipAddress: entry.ipAddress ?? null,
    },
  });
}

/**
 * For observational events (login attempts) where losing the row is preferable
 * to failing the request the user actually made.
 */
export function writeAuditLogSafe(entry: AuditEntry): void {
  void writeAuditLog(entry).catch((error: unknown) => {
    logger.error('Failed to write audit log', {
      action: entry.action,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
