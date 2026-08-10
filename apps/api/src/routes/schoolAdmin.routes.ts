import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  attachDocumentSchema,
  createAcademicYearSchema,
  createClassroomSchema,
  createParentSchema,
  createStudentSchema,
  createTeacherSchema,
  idParamSchema,
  idSchema,
  listStudentsQuerySchema,
  listUsersQuerySchema,
  updateClassroomSchema,
  updateParentSchema,
  updateStudentSchema,
  updateTeacherSchema,
} from '@poetree/shared';
import type {
  AttachDocumentInput,
  CreateAcademicYearInput,
  CreateClassroomInput,
  CreateParentInput,
  CreateStudentInput,
  CreateTeacherInput,
  ListStudentsQuery,
  ListUsersQuery,
  UpdateClassroomInput,
  UpdateParentInput,
  UpdateStudentInput,
  UpdateTeacherInput,
} from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireRole } from '../middleware/requireRole.js';
import { body, params, query, validate } from '../middleware/validate.js';
import { prisma, prismaUnscoped } from '../db/prisma.js';
import * as teacherService from '../services/teacher.service.js';
import * as parentService from '../services/parent.service.js';
import * as studentService from '../services/student.service.js';
import * as classroomService from '../services/classroom.service.js';
import * as documentService from '../services/studentDocument.service.js';

/**
 * School Admin surface. Every handler below runs inside the tenant context, so
 * no route accepts a schoolId — it comes from the token and nowhere else.
 */
export const schoolAdminRouter = Router();

schoolAdminRouter.use(requireRole('SCHOOL_ADMIN'));

const idOf = (req: Request) => params<{ id: string }>(req).id;

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

schoolAdminRouter.get(
  '/dashboard/overview',
  asyncHandler(async (_req, res) => {
    const [students, teachers, parents, classrooms] = await Promise.all([
      prisma.student.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { role: 'TEACHER', status: 'ACTIVE' } }),
      prisma.user.count({ where: { role: 'PARENT', status: 'ACTIVE' } }),
      prisma.classroom.count(),
    ]);

    res.json({ students, teachers, parents, classrooms });
  }),
);

/* -------------------------------------------------------------------------- */
/* Teachers                                                                   */
/* -------------------------------------------------------------------------- */

schoolAdminRouter.get(
  '/teachers',
  validate({ query: listUsersQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await teacherService.listTeachers(query<ListUsersQuery>(req)));
  }),
);

schoolAdminRouter.post(
  '/teachers',
  validate({ body: createTeacherSchema }),
  asyncHandler(async (req, res) => {
    const teacher = await teacherService.createTeacher(
      body<CreateTeacherInput>(req),
      req.auth!.userId,
    );
    res.status(201).json(teacher);
  }),
);

schoolAdminRouter.get(
  '/teachers/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await teacherService.getTeacher(idOf(req)));
  }),
);

schoolAdminRouter.patch(
  '/teachers/:id',
  validate({ params: idParamSchema, body: updateTeacherSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await teacherService.updateTeacher(idOf(req), body<UpdateTeacherInput>(req), req.auth!.userId),
    );
  }),
);

/* -------------------------------------------------------------------------- */
/* Parents                                                                    */
/* -------------------------------------------------------------------------- */

schoolAdminRouter.get(
  '/parents',
  validate({ query: listUsersQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await parentService.listParents(query<ListUsersQuery>(req)));
  }),
);

schoolAdminRouter.post(
  '/parents',
  validate({ body: createParentSchema }),
  asyncHandler(async (req, res) => {
    const parent = await parentService.createParent(body<CreateParentInput>(req), req.auth!.userId);
    res.status(201).json(parent);
  }),
);

schoolAdminRouter.get(
  '/parents/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await parentService.getParent(idOf(req)));
  }),
);

schoolAdminRouter.patch(
  '/parents/:id',
  validate({ params: idParamSchema, body: updateParentSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await parentService.updateParent(idOf(req), body<UpdateParentInput>(req), req.auth!.userId),
    );
  }),
);

/* -------------------------------------------------------------------------- */
/* Students                                                                   */
/* -------------------------------------------------------------------------- */

schoolAdminRouter.get(
  '/students',
  validate({ query: listStudentsQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await studentService.listStudents(query<ListStudentsQuery>(req)));
  }),
);

schoolAdminRouter.post(
  '/students',
  validate({ body: createStudentSchema }),
  asyncHandler(async (req, res) => {
    const student = await studentService.createStudent(
      body<CreateStudentInput>(req),
      req.auth!.userId,
    );
    res.status(201).json(student);
  }),
);

schoolAdminRouter.get(
  '/students/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await studentService.getStudent(idOf(req)));
  }),
);

schoolAdminRouter.patch(
  '/students/:id',
  validate({ params: idParamSchema, body: updateStudentSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await studentService.updateStudent(idOf(req), body<UpdateStudentInput>(req), req.auth!.userId),
    );
  }),
);

/* -------------------------------------------------------------------------- */
/* Student documents                                                          */
/* -------------------------------------------------------------------------- */

const documentIdParamSchema = z.object({ id: idSchema, documentId: idSchema });

schoolAdminRouter.get(
  '/students/:id/documents',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ documents: await documentService.listDocuments(idOf(req)) });
  }),
);

schoolAdminRouter.post(
  '/students/:id/documents',
  validate({ params: idParamSchema, body: attachDocumentSchema }),
  asyncHandler(async (req, res) => {
    const document = await documentService.attachDocument(
      idOf(req),
      body<AttachDocumentInput>(req),
      req.auth!.userId,
    );
    res.status(201).json(document);
  }),
);

schoolAdminRouter.delete(
  '/students/:id/documents/:documentId',
  validate({ params: documentIdParamSchema }),
  asyncHandler(async (req, res) => {
    const { id, documentId } = params<{ id: string; documentId: string }>(req);
    await documentService.removeDocument(id, documentId, req.auth!.userId);
    res.status(204).send();
  }),
);

/* -------------------------------------------------------------------------- */
/* Academic years, class levels and classrooms                                */
/* -------------------------------------------------------------------------- */

schoolAdminRouter.get(
  '/class-levels',
  asyncHandler(async (_req, res) => {
    res.json(await classroomService.listClassLevels());
  }),
);

/**
 * Activity areas for the timetable and homework.
 *
 * Two sources deliberately: the school's own subjects through the scoped
 * client, plus publication defaults which carry a NULL schoolId and so are
 * invisible to it. Every school inherits the defaults without owning a copy.
 */
schoolAdminRouter.get(
  '/subjects',
  asyncHandler(async (_req, res) => {
    const [own, defaults] = await Promise.all([
      prisma.subject.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, sortOrder: true },
      }),
      prismaUnscoped.subject.findMany({
        where: { schoolId: null, isActive: true },
        select: { id: true, code: true, name: true, sortOrder: true },
      }),
    ]);

    res.json([...own, ...defaults].sort((a, b) => a.sortOrder - b.sortOrder));
  }),
);

schoolAdminRouter.get(
  '/academic-years',
  asyncHandler(async (_req, res) => {
    res.json(await classroomService.listAcademicYears());
  }),
);

schoolAdminRouter.post(
  '/academic-years',
  validate({ body: createAcademicYearSchema }),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(await classroomService.createAcademicYear(body<CreateAcademicYearInput>(req)));
  }),
);

schoolAdminRouter.get(
  '/classrooms',
  asyncHandler(async (req, res) => {
    const academicYearId =
      typeof req.query.academicYearId === 'string' ? req.query.academicYearId : undefined;
    res.json(await classroomService.listClassrooms(academicYearId));
  }),
);

schoolAdminRouter.post(
  '/classrooms',
  validate({ body: createClassroomSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await classroomService.createClassroom(body<CreateClassroomInput>(req)));
  }),
);

schoolAdminRouter.get(
  '/classrooms/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await classroomService.getClassroom(idOf(req)));
  }),
);

schoolAdminRouter.patch(
  '/classrooms/:id',
  validate({ params: idParamSchema, body: updateClassroomSchema }),
  asyncHandler(async (req, res) => {
    res.json(await classroomService.updateClassroom(idOf(req), body<UpdateClassroomInput>(req)));
  }),
);
