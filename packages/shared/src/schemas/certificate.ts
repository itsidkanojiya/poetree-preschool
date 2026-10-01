import { z } from 'zod';
import { CERTIFICATE_DESIGNS, type CertificateDesign } from '../enums.js';
import { idSchema } from './common.js';

/**
 * Certificates the school awards — "Star of the Month", "Sports Day winner".
 *
 * One certificate, many children: the office writes it once, ticks the
 * children, and each gets their own numbered copy when it is issued. A draft is
 * invisible to families.
 */

export const createCertificateSchema = z.object({
  title: z.string().trim().min(2, 'Give the certificate a title').max(120),
  /** The line under the child's name. */
  body: z.string().trim().max(400).default(''),
  design: z.enum(CERTIFICATE_DESIGNS).default('CLASSIC'),
  issuedOn: z.coerce.date(),
  studentIds: z.array(idSchema).max(500).default([]),
});
export type CreateCertificateInput = z.infer<typeof createCertificateSchema>;

export const updateCertificateSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  body: z.string().trim().max(400).optional(),
  design: z.enum(CERTIFICATE_DESIGNS).optional(),
  issuedOn: z.coerce.date().optional(),
});
export type UpdateCertificateInput = z.infer<typeof updateCertificateSchema>;

export const setCertificateRecipientsSchema = z.object({
  studentIds: z.array(idSchema).max(500),
});
export type SetCertificateRecipientsInput = z.infer<typeof setCertificateRecipientsSchema>;

/** Points a signature at an uploaded picture. Null takes it off. */
export const setSignatureSchema = z.object({ fileId: idSchema.nullable() });
export type SetSignatureInput = z.infer<typeof setSignatureSchema>;

export interface CertificateSummary {
  id: string;
  title: string;
  body: string;
  design: CertificateDesign;
  issuedOn: string;
  issuedAt: string | null;
  status: 'DRAFT' | 'ISSUED';
  recipientCount: number;
  createdAt: string;
}

export interface CertificateRecipient {
  awardId: string;
  studentId: string;
  fullName: string;
  classroomLabel: string | null;
  number: string | null;
  revokedAt: string | null;
}

export interface CertificateDetail extends CertificateSummary {
  recipients: CertificateRecipient[];
}

/** A certificate as the family sees it in the app. */
export interface ChildCertificate {
  awardId: string;
  title: string;
  body: string;
  design: CertificateDesign;
  issuedOn: string;
  number: string | null;
}
