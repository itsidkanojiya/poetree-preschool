import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { enforceSchoolAccess } from '../middleware/enforceSchoolAccess.js';
import { tenantContext } from '../middleware/tenantContext.js';
import { prismaUnscoped } from '../db/prisma.js';
import { authRouter } from './auth.routes.js';
import { attendanceRouter } from './attendance.routes.js';
import { meRouter } from './me.routes.js';
import { enrolmentRouter } from './enrolment.routes.js';
import { classroomPostRouter, homeworkRouter, noticeRouter } from './teaching.routes.js';
import { feeRouter } from './fee.routes.js';
import { publicationRouter } from './publication.routes.js';
import { schoolAdminRouter } from './schoolAdmin.routes.js';

export const apiRouter = Router();

/** Deploy gate — CI fails the release if this does not return 200. */
apiRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    await prismaUnscoped.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  }),
);

apiRouter.use('/auth', authRouter);

/**
 * Everything past this point is authenticated, plan-gated and tenant-bound.
 * The order matters and is the whole security model:
 *
 *   authenticate        — establishes who you are, from the signed token only
 *   enforceSchoolAccess — blocks every user of a school whose plan is off
 *   tenantContext       — binds schoolId so Prisma scopes every query
 */
const secured = Router();
secured.use(authenticate, enforceSchoolAccess, tenantContext);

secured.use('/publication', publicationRouter);

// Permission-gated and shared across roles — mounted before the School Admin
// tree, which is gated by role and would otherwise reject teachers.
secured.use('/me', meRouter);
secured.use('/attendance', attendanceRouter);
secured.use('/enrolments', enrolmentRouter);
secured.use('/homework', homeworkRouter);
secured.use('/classroom-posts', classroomPostRouter);
secured.use('/notices', noticeRouter);
secured.use('/fees', feeRouter);

secured.use('/', schoolAdminRouter);

apiRouter.use(secured);
