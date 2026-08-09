-- ERP Stage 0 — foundations.
--
-- ORDER MATTERS. Prisma's generated diff drops students.classroomId and
-- classrooms.classTeacherId BEFORE creating the tables that replace them, which
-- would silently discard every child's class assignment. This migration is
-- hand-ordered:
--
--   1. create the new tables
--   2. BACKFILL from the columns about to be dropped
--   3. add foreign keys (which also validates the backfilled rows)
--   4. only then alter and drop the old columns
--
-- Re-running is not supported; `prisma migrate deploy` applies it once.

-- ---------------------------------------------------------------------------
-- 1. New tables
-- ---------------------------------------------------------------------------

CREATE TABLE `student_enrolments` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `academicYearId` VARCHAR(191) NOT NULL,
    `classroomId` VARCHAR(191) NOT NULL,
    `rollNo` VARCHAR(20) NULL,
    `status` ENUM('ACTIVE', 'PROMOTED', 'TRANSFERRED', 'WITHDRAWN', 'GRADUATED') NOT NULL DEFAULT 'ACTIVE',
    `enrolledOn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `exitedOn` DATETIME(3) NULL,
    `exitReason` VARCHAR(200) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `student_enrolments_schoolId_classroomId_status_idx`(`schoolId`, `classroomId`, `status`),
    INDEX `student_enrolments_schoolId_academicYearId_status_idx`(`schoolId`, `academicYearId`, `status`),
    UNIQUE INDEX `student_enrolments_studentId_academicYearId_key`(`studentId`, `academicYearId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `file_objects` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NULL,
    `storageKey` VARCHAR(300) NOT NULL,
    `originalName` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(120) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `checksum` VARCHAR(64) NULL,
    `visibility` ENUM('PRIVATE', 'SCHOOL', 'PUBLIC') NOT NULL DEFAULT 'PRIVATE',
    `uploadedById` VARCHAR(191) NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `file_objects_storageKey_key`(`storageKey`),
    INDEX `file_objects_schoolId_deletedAt_idx`(`schoolId`, `deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `student_documents` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `fileId` VARCHAR(191) NOT NULL,
    `type` ENUM('PHOTO', 'BIRTH_CERTIFICATE', 'ADDRESS_PROOF', 'MEDICAL', 'TRANSFER_CERTIFICATE', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `label` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `student_documents_schoolId_studentId_idx`(`schoolId`, `studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `subjects` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NULL,
    `classLevelId` VARCHAR(191) NULL,
    `code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `subjects_schoolId_isActive_idx`(`schoolId`, `isActive`),
    UNIQUE INDEX `subjects_schoolId_code_key`(`schoolId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `classroom_teachers` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `classroomId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `subjectId` VARCHAR(191) NULL,
    `role` ENUM('CLASS_TEACHER', 'ASSISTANT', 'SUBJECT_TEACHER') NOT NULL DEFAULT 'CLASS_TEACHER',
    `startedOn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedOn` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `classroom_teachers_schoolId_userId_idx`(`schoolId`, `userId`),
    INDEX `classroom_teachers_schoolId_classroomId_idx`(`schoolId`, `classroomId`),
    UNIQUE INDEX `classroom_teachers_classroomId_userId_subjectId_key`(`classroomId`, `userId`, `subjectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `rooms` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `capacity` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `rooms_schoolId_name_key`(`schoolId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `school_holidays` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `academicYearId` VARCHAR(191) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `type` ENUM('HOLIDAY', 'VACATION', 'EVENT', 'WEEKLY_OFF') NOT NULL DEFAULT 'HOLIDAY',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `school_holidays_schoolId_startDate_endDate_idx`(`schoolId`, `startDate`, `endDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `document_sequences` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `academicYearId` VARCHAR(191) NULL,
    `kind` ENUM('ADMISSION', 'RECEIPT', 'INVOICE') NOT NULL,
    `prefix` VARCHAR(16) NOT NULL DEFAULT '',
    `nextNumber` INTEGER NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `document_sequences_schoolId_kind_academicYearId_key`(`schoolId`, `kind`, `academicYearId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `notifications` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('ATTENDANCE_ABSENT', 'HOMEWORK_ASSIGNED', 'HOMEWORK_REVIEWED', 'FEE_DUE', 'FEE_RECEIPT', 'NOTICE_PUBLISHED', 'NOTICE_EMERGENCY', 'CLASSROOM_POST', 'PROGRESS_UPDATED', 'ACCOUNT_SECURITY') NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `body` TEXT NOT NULL,
    `data` JSON NULL,
    `entityType` VARCHAR(60) NULL,
    `entityId` VARCHAR(40) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_schoolId_userId_readAt_idx`(`schoolId`, `userId`, `readAt`),
    INDEX `notifications_schoolId_createdAt_idx`(`schoolId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `device_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `platform` ENUM('ANDROID', 'IOS', 'WEB') NOT NULL,
    `appVersion` VARCHAR(40) NULL,
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `device_tokens_token_key`(`token`),
    INDEX `device_tokens_schoolId_userId_revokedAt_idx`(`schoolId`, `userId`, `revokedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. BACKFILL — must happen before the source columns are dropped
-- ---------------------------------------------------------------------------

-- Every student currently sitting in a classroom becomes an enrolment in that
-- classroom's academic year. Ids are prefixed `bf` so backfilled rows stay
-- identifiable afterwards.
INSERT INTO `student_enrolments`
    (`id`, `schoolId`, `studentId`, `academicYearId`, `classroomId`,
     `rollNo`, `status`, `enrolledOn`, `createdAt`, `updatedAt`)
SELECT
    LOWER(CONCAT('bf', REPLACE(UUID(), '-', ''))),
    s.`schoolId`,
    s.`id`,
    c.`academicYearId`,
    s.`classroomId`,
    s.`rollNo`,
    CASE s.`status`
        WHEN 'ACTIVE'    THEN 'ACTIVE'
        WHEN 'GRADUATED' THEN 'GRADUATED'
        WHEN 'WITHDRAWN' THEN 'WITHDRAWN'
        ELSE 'WITHDRAWN'
    END,
    s.`createdAt`,
    s.`createdAt`,
    NOW(3)
FROM `students` s
INNER JOIN `classrooms` c ON c.`id` = s.`classroomId`
WHERE s.`classroomId` IS NOT NULL;

-- The single class teacher each classroom carried becomes the first row of its
-- teaching team.
INSERT INTO `classroom_teachers`
    (`id`, `schoolId`, `classroomId`, `userId`, `subjectId`, `role`, `startedOn`, `createdAt`)
SELECT
    LOWER(CONCAT('bf', REPLACE(UUID(), '-', ''))),
    c.`schoolId`,
    c.`id`,
    c.`classTeacherId`,
    NULL,
    'CLASS_TEACHER',
    c.`createdAt`,
    NOW(3)
FROM `classrooms` c
WHERE c.`classTeacherId` IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Foreign keys — adding these AFTER the backfill validates the rows above
-- ---------------------------------------------------------------------------

ALTER TABLE `student_enrolments` ADD CONSTRAINT `student_enrolments_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `student_enrolments` ADD CONSTRAINT `student_enrolments_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `student_enrolments` ADD CONSTRAINT `student_enrolments_academicYearId_fkey` FOREIGN KEY (`academicYearId`) REFERENCES `academic_years`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `student_enrolments` ADD CONSTRAINT `student_enrolments_classroomId_fkey` FOREIGN KEY (`classroomId`) REFERENCES `classrooms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `file_objects` ADD CONSTRAINT `file_objects_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `file_objects` ADD CONSTRAINT `file_objects_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `student_documents` ADD CONSTRAINT `student_documents_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `student_documents` ADD CONSTRAINT `student_documents_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `student_documents` ADD CONSTRAINT `student_documents_fileId_fkey` FOREIGN KEY (`fileId`) REFERENCES `file_objects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `subjects` ADD CONSTRAINT `subjects_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `subjects` ADD CONSTRAINT `subjects_classLevelId_fkey` FOREIGN KEY (`classLevelId`) REFERENCES `class_levels`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `classroom_teachers` ADD CONSTRAINT `classroom_teachers_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `classroom_teachers` ADD CONSTRAINT `classroom_teachers_classroomId_fkey` FOREIGN KEY (`classroomId`) REFERENCES `classrooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `classroom_teachers` ADD CONSTRAINT `classroom_teachers_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `classroom_teachers` ADD CONSTRAINT `classroom_teachers_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `rooms` ADD CONSTRAINT `rooms_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `school_holidays` ADD CONSTRAINT `school_holidays_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `school_holidays` ADD CONSTRAINT `school_holidays_academicYearId_fkey` FOREIGN KEY (`academicYearId`) REFERENCES `academic_years`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `document_sequences` ADD CONSTRAINT `document_sequences_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `document_sequences` ADD CONSTRAINT `document_sequences_academicYearId_fkey` FOREIGN KEY (`academicYearId`) REFERENCES `academic_years`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `notifications` ADD CONSTRAINT `notifications_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `device_tokens` ADD CONSTRAINT `device_tokens_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `device_tokens` ADD CONSTRAINT `device_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Now it is safe to drop the replaced columns
-- ---------------------------------------------------------------------------

ALTER TABLE `classrooms` DROP FOREIGN KEY `classrooms_classTeacherId_fkey`;
ALTER TABLE `students` DROP FOREIGN KEY `students_classroomId_fkey`;
ALTER TABLE `students` DROP FOREIGN KEY `students_schoolId_fkey`;

DROP INDEX `classrooms_classTeacherId_idx` ON `classrooms`;
DROP INDEX `students_classroomId_fkey` ON `students`;
DROP INDEX `students_schoolId_classroomId_idx` ON `students`;

ALTER TABLE `classrooms` DROP COLUMN `classTeacherId`;

ALTER TABLE `students`
    DROP COLUMN `classroomId`,
    DROP COLUMN `rollNo`,
    ADD COLUMN `addressLine1` VARCHAR(200) NULL,
    ADD COLUMN `addressLine2` VARCHAR(200) NULL,
    ADD COLUMN `admissionDate` DATETIME(3) NULL,
    ADD COLUMN `allergies` TEXT NULL,
    ADD COLUMN `city` VARCHAR(100) NULL,
    ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `emergencyContactName` VARCHAR(120) NULL,
    ADD COLUMN `emergencyContactPhone` VARCHAR(20) NULL,
    ADD COLUMN `medicalNotes` TEXT NULL,
    ADD COLUMN `postalCode` VARCHAR(20) NULL;

CREATE INDEX `students_schoolId_deletedAt_idx` ON `students`(`schoolId`, `deletedAt`);

-- Prisma's diff drops this constraint and never re-adds it. Restored explicitly
-- so students stay referentially tied to their school.
ALTER TABLE `students` ADD CONSTRAINT `students_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 5. Remaining column additions
-- ---------------------------------------------------------------------------

ALTER TABLE `audit_logs`
    ADD COLUMN `after` JSON NULL,
    ADD COLUMN `before` JSON NULL,
    ADD COLUMN `requestId` VARCHAR(64) NULL;

ALTER TABLE `student_guardians`
    ADD COLUMN `canPickUp` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `isEmergencyContact` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `users` ADD COLUMN `deletedAt` DATETIME(3) NULL;

ALTER TABLE `student_guardians` DROP FOREIGN KEY `student_guardians_studentId_fkey`;
ALTER TABLE `student_guardians` ADD CONSTRAINT `student_guardians_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
