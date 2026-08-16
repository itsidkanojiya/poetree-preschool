import { Router, type Request } from 'express';
import multer from 'multer';
import { idParamSchema } from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { params, validate } from '../middleware/validate.js';
import { tenantContext } from '../middleware/tenantContext.js';
import { prisma, prismaUnscoped } from '../db/prisma.js';
import { getRequestContext, requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import {
  ALLOWED_TYPES,
  MAX_UPLOAD_BYTES,
  sniffMime,
  storage,
  typeFor,
} from '../lib/storage.js';
import { stripImageMetadata } from '../lib/exif.js';
import { guardianStudentIds, teacherClassroomIds } from '../services/scope.service.js';
import { sendStoredFile } from '../lib/sendStoredFile.js';

export const fileRouter = Router();

/**
 * Uploads are buffered in memory rather than streamed to a temp file.
 *
 * The cap is 50 MB and a preschool uploads a handful of photographs a day, so
 * the memory cost is bounded and small — and nothing half-written can be left
 * behind on disk if the request fails validation.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

fileRouter.post(
  '/',
  upload.single('file'),
  // Re-bind the tenant context after multer.
  //
  // Multer finishes in a stream `close` callback whose async resource was
  // created when the request arrived — before tenantContext ran — so the
  // AsyncLocalStorage store is the empty one from that moment, and every
  // scoped Prisma call downstream would throw. `req.auth` is a plain property
  // and survives, so re-running the same middleware restores the context.
  //
  // This only bites once the upload crosses an async boundary, which a small
  // body over a local socket does not. It passed in tests and failed the moment
  // a real file went through Nginx.
  tenantContext,
  asyncHandler(async (req, res) => {
    const schoolId = requireSchoolId();
    const file = req.file;

    if (!file) throw ApiError.badRequest('No file was uploaded');

    // Identify by content, never by the supplied name or Content-Type — both
    // come from the client and neither says what the bytes actually are.
    const mime = sniffMime(file.buffer);
    if (!mime) {
      throw ApiError.badRequest('That file type is not supported', {
        allowed: ALLOWED_TYPES.map((t) => t.mime),
      });
    }

    const allowed = typeFor(mime);
    if (!allowed) {
      throw ApiError.badRequest(`${mime} files are not allowed`, {
        allowed: ALLOWED_TYPES.map((t) => t.mime),
      });
    }

    // Per-type cap, so a 40 MB "photograph" is refused even though the global
    // limit would let a video of that size through.
    if (file.size > allowed.maxBytes) {
      throw ApiError.badRequest(
        `${mime} files may be at most ${Math.round(allowed.maxBytes / (1024 * 1024))} MB`,
      );
    }

    // Strip metadata before anything touches disk.
    //
    // A photograph off a phone carries where it was taken. For this product
    // that is usually a child's home, because the commonest upload is a parent
    // photographing homework at the kitchen table. Storing it would mean the
    // school held, and served back, the address of every family who ever sent
    // a picture in.
    const bytes = stripImageMetadata(file.buffer, mime);

    const stored = await storage.put({
      schoolId,
      originalName: file.originalname,
      bytes,
    });

    const record = await prisma.fileObject.create({
      data: {
        schoolId,
        storageKey: stored.key,
        originalName: file.originalname.slice(0, 200),
        mimeType: mime,
        sizeBytes: stored.sizeBytes,
        checksum: stored.checksum,
        uploadedById: req.auth!.userId,
        visibility: 'SCHOOL',
      },
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
    });

    res.status(201).json({
      ...record,
      createdAt: record.createdAt.toISOString(),
      url: `/api/v1/files/${record.id}`,
    });
  }),
);

/**
 * May this caller read this file?
 *
 * School scoping is already handled by the tenant client. This adds the
 * row-level question it cannot answer: a parent may read a file attached to
 * their own child's homework or a notice addressed to them, and nothing else.
 */
async function assertMayRead(fileId: string): Promise<void> {
  const context = getRequestContext();
  if (!context) throw ApiError.unauthenticated();
  if (context.role === 'SCHOOL_ADMIN' || context.role === 'PUBLICATION_ADMIN') return;

  if (context.role === 'TEACHER') {
    const classrooms = await teacherClassroomIds();
    const reachable = await prisma.fileObject.findFirst({
      where: {
        id: fileId,
        OR: [
          { uploadedById: context.userId },
          { homeworkAttachments: { some: { homework: { classroomId: { in: classrooms } } } } },
          // Work sent in by a family, for a class this teacher actually takes.
          // Without this a teacher could open the review screen, see that a
          // photograph had been submitted, and get a 404 fetching it.
          {
            submissionFiles: {
              some: { submission: { homework: { classroomId: { in: classrooms } } } },
            },
          },
          { classroomPostAttachments: { some: { post: { classroomId: { in: classrooms } } } } },
          // The face on the register. A teacher who cannot load it sees a row
          // of broken squares for the children in front of them.
          {
            studentPhotos: {
              some: {
                enrolments: { some: { classroomId: { in: classrooms }, status: 'ACTIVE' } },
              },
            },
          },
          { noticeAttachments: { some: {} } },
        ],
      },
      select: { id: true },
    });
    if (!reachable) throw ApiError.notFound('File not found');
    return;
  }

  // Parent
  const studentIds = await guardianStudentIds();
  const reachable = await prisma.fileObject.findFirst({
    where: {
      id: fileId,
      OR: [
        {
          homeworkAttachments: {
            some: {
              homework: {
                status: 'PUBLISHED',
                classroom: {
                  enrolments: { some: { studentId: { in: studentIds }, status: 'ACTIVE' } },
                },
              },
            },
          },
        },
        {
          classroomPostAttachments: {
            some: {
              post: {
                classroom: {
                  enrolments: { some: { studentId: { in: studentIds }, status: 'ACTIVE' } },
                },
              },
            },
          },
        },
        // Their own child's photograph, and no other child's.
        { studentPhotos: { some: { id: { in: studentIds } } } },
        { noticeAttachments: { some: { notice: { status: 'PUBLISHED' } } } },
        { documents: { some: { studentId: { in: studentIds } } } },
        // Their own child's submitted work.
        //
        // Scoped by the guardian link and nothing else. Deliberately NOT by
        // `uploadedById`, which would be the easy way to let a parent re-read
        // what they sent: it would also hand them any file they had ever
        // uploaded, whatever it was later attached to.
        //
        // The case this has to survive is two children in the same class. They
        // share a classroom, a teacher and the homework itself, so every
        // filter except this one passes for both families.
        {
          submissionFiles: {
            some: { submission: { studentId: { in: studentIds } } },
          },
        },
      ],
    },
    select: { id: true },
  });

  // Missing rather than forbidden: a 403 would confirm the file exists.
  if (!reachable) throw ApiError.notFound('File not found');
}

/**
 * Serves a file, after checking the caller is entitled to it.
 *
 * The bytes are handed to Nginx with X-Accel-Redirect rather than streamed
 * through Node: the authorisation decision stays here, the transfer happens
 * where it is cheap, and the storage path is never guessable from outside.
 */
fileRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req: Request, res) => {
    const fileId = params<{ id: string }>(req).id;

    const file = await prisma.fileObject.findFirst({
      where: { id: fileId },
      select: { id: true, storageKey: true, mimeType: true, originalName: true, sizeBytes: true },
    });
    if (!file) throw ApiError.notFound('File not found');

    await assertMayRead(fileId);

    res.setHeader('Content-Type', file.mimeType);
    // `inline` for images and PDFs a parent wants to look at; the filename is
    // quoted because a child's name may contain spaces.
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${file.originalName.replace(/["\\]/g, '')}"`,
    );
    res.setHeader('Cache-Control', 'private, max-age=300');

    sendStoredFile(req, res, file, { fileId });
  }),
);

/**
 * Soft delete. The bytes stay for now — a misclick during a busy morning should
 * be recoverable, and a purge job removes them once nothing references them.
 */
fileRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const fileId = params<{ id: string }>(req).id;
    const context = getRequestContext();

    const file = await prisma.fileObject.findFirst({
      where: { id: fileId },
      select: { id: true, uploadedById: true },
    });
    if (!file) throw ApiError.notFound('File not found');

    const isAdmin = context?.role === 'SCHOOL_ADMIN';
    if (!isAdmin && file.uploadedById !== context?.userId) {
      throw ApiError.forbidden('You can only remove files you uploaded');
    }

    await prismaUnscoped.fileObject.update({
      where: { id: fileId },
      data: { deletedAt: new Date() },
    });

    res.status(204).send();
  }),
);
