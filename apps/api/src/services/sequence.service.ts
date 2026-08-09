import type { SequenceKind } from '@poetree/shared';
import type { TenantTransactionClient } from '../db/prisma.js';

/**
 * Gapless per-school document numbers.
 *
 * Receipt numbers are the reason this exists. `MAX(receiptNo) + 1` races: two
 * clerks taking fees at the same moment both read the same maximum and issue the
 * same receipt number. That is a financial defect, not a cosmetic one.
 *
 * The counter row is locked with SELECT … FOR UPDATE inside the caller's
 * transaction, so the second writer waits for the first to commit. It must
 * therefore always be called with a transaction client — never the bare client.
 */
export interface NextNumberInput {
  schoolId: string;
  kind: SequenceKind;
  /** NULL for series that do not restart each year, such as admission numbers. */
  academicYearId?: string | null;
  /** Used only when the counter is created; e.g. "RCP-". */
  defaultPrefix?: string;
  /** Zero-padding width for the numeric part. */
  padTo?: number;
}

interface SequenceRow {
  id: string;
  nextNumber: number;
  prefix: string;
}

export async function nextDocumentNumber(
  tx: TenantTransactionClient,
  input: NextNumberInput,
): Promise<string> {
  const academicYearId = input.academicYearId ?? null;
  const padTo = input.padTo ?? 4;

  // `<=>` is MySQL's NULL-safe equality. Plain `=` never matches NULL to NULL,
  // so a year-less series would silently create a new counter every call.
  let rows = await tx.$queryRaw<SequenceRow[]>`
    SELECT id, nextNumber, prefix
    FROM document_sequences
    WHERE schoolId = ${input.schoolId}
      AND kind = ${input.kind}
      AND academicYearId <=> ${academicYearId}
    FOR UPDATE
  `;

  if (rows.length === 0) {
    await tx.documentSequence.create({
      data: {
        schoolId: input.schoolId,
        kind: input.kind,
        academicYearId,
        prefix: input.defaultPrefix ?? '',
        nextNumber: 1,
      },
    });

    // Re-read under the lock so concurrent callers serialise from here on.
    rows = await tx.$queryRaw<SequenceRow[]>`
      SELECT id, nextNumber, prefix
      FROM document_sequences
      WHERE schoolId = ${input.schoolId}
        AND kind = ${input.kind}
        AND academicYearId <=> ${academicYearId}
      FOR UPDATE
    `;
  }

  const row = rows[0];
  if (!row) {
    throw new Error('Failed to allocate a document number: sequence row missing after create');
  }

  await tx.documentSequence.update({
    where: { id: row.id },
    data: { nextNumber: row.nextNumber + 1 },
  });

  return `${row.prefix}${String(row.nextNumber).padStart(padTo, '0')}`;
}
