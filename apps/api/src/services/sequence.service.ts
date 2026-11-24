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

const formatNumber = (prefix: string, value: number, padTo: number) =>
  `${prefix}${String(value).padStart(padTo, '0')}`;

/**
 * The number the series would issue next, without issuing it — for a form to
 * say "leave it blank for ADM-0043". Another clerk may take it first; the
 * number actually issued is whatever nextDocumentNumber hands out.
 */
export async function peekDocumentNumber(
  db: Pick<TenantTransactionClient, 'documentSequence'>,
  input: NextNumberInput,
): Promise<string> {
  const row = await db.documentSequence.findFirst({
    where: {
      schoolId: input.schoolId,
      kind: input.kind,
      academicYearId: input.academicYearId ?? null,
    },
    select: { nextNumber: true, prefix: true },
  });
  return formatNumber(
    row?.prefix ?? input.defaultPrefix ?? '',
    row?.nextNumber ?? 1,
    input.padTo ?? 4,
  );
}

/**
 * The next admission number nobody holds. A school that numbers automatically
 * may still type a number by hand, so the series skips any it meets that is
 * already a child's rather than issuing it twice.
 */
export async function issueAdmissionNo(
  tx: TenantTransactionClient,
  schoolId: string,
): Promise<string> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const candidate = await nextDocumentNumber(tx, {
      schoolId,
      kind: 'ADMISSION',
      academicYearId: null,
      defaultPrefix: 'ADM-',
    });
    const taken = await tx.student.findFirst({
      where: { schoolId, admissionNo: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  throw new Error('Could not find a free admission number');
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
