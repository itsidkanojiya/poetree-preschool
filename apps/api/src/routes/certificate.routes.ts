import { Router, type Response } from 'express';
import {
  createCertificateSchema,
  idParamSchema,
  setCertificateRecipientsSchema,
  updateCertificateSchema,
  type CreateCertificateInput,
  type SetCertificateRecipientsInput,
  type UpdateCertificateInput,
} from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { body, params, validate } from '../middleware/validate.js';
import * as certificates from '../services/certificate.service.js';

/**
 * Certificates the school awards. Writing and issuing them is the office's;
 * one child's copy is also their family's to open, once issued.
 */
export const certificateRouter = Router();

const manage = requirePermission('certificate:manage');
const idOf = (req: Parameters<typeof params>[0]) => params<{ id: string }>(req).id;

function sendPdf(res: Response, file: { buffer: Buffer; filename: string }): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
  res.send(file.buffer);
}

/** One child's copy — the office's, or the family's own once issued. */
certificateRouter.get(
  '/awards/:id/pdf',
  requirePermission('certificate:read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => sendPdf(res, await certificates.awardPdf(idOf(req)))),
);

certificateRouter.post(
  '/awards/:id/revoke',
  manage,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await certificates.revokeAward(idOf(req), req.auth!.userId);
    res.status(204).end();
  }),
);

certificateRouter.get(
  '/',
  manage,
  asyncHandler(async (_req, res) => {
    res.json(await certificates.listCertificates());
  }),
);

certificateRouter.post(
  '/',
  manage,
  validate({ body: createCertificateSchema }),
  asyncHandler(async (req, res) => {
    const created = await certificates.createCertificate(
      body<CreateCertificateInput>(req),
      req.auth!.userId,
    );
    res.status(201).json(created);
  }),
);

certificateRouter.get(
  '/:id',
  manage,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await certificates.getCertificate(idOf(req)));
  }),
);

certificateRouter.patch(
  '/:id',
  manage,
  validate({ params: idParamSchema, body: updateCertificateSchema }),
  asyncHandler(async (req, res) => {
    res.json(await certificates.updateCertificate(idOf(req), body<UpdateCertificateInput>(req)));
  }),
);

certificateRouter.delete(
  '/:id',
  manage,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await certificates.deleteCertificate(idOf(req));
    res.status(204).end();
  }),
);

certificateRouter.put(
  '/:id/recipients',
  manage,
  validate({ params: idParamSchema, body: setCertificateRecipientsSchema }),
  asyncHandler(async (req, res) => {
    const { studentIds } = body<SetCertificateRecipientsInput>(req);
    res.json(await certificates.setRecipients(idOf(req), studentIds));
  }),
);

certificateRouter.post(
  '/:id/issue',
  manage,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await certificates.issueCertificate(idOf(req), req.auth!.userId));
  }),
);

/** Every child's copy, for the office to print. */
certificateRouter.get(
  '/:id/pdf',
  manage,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => sendPdf(res, await certificates.certificatePdf(idOf(req)))),
);

/** The design with a stand-in name, to check before issuing. */
certificateRouter.get(
  '/:id/preview',
  manage,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => sendPdf(res, await certificates.previewPdf(idOf(req)))),
);
