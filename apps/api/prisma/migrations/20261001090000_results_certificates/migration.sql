-- AlterTable
ALTER TABLE `schools` ADD COLUMN `principalSignatureFileId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `signatureFileId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `document_sequences` MODIFY `kind` ENUM('ADMISSION', 'RECEIPT', 'INVOICE', 'CERTIFICATE') NOT NULL;

-- AlterTable
ALTER TABLE `notifications` MODIFY `type` ENUM('ATTENDANCE_ABSENT', 'HOMEWORK_ASSIGNED', 'HOMEWORK_REVIEWED', 'FEE_DUE', 'FEE_RECEIPT', 'NOTICE_PUBLISHED', 'NOTICE_EMERGENCY', 'CLASSROOM_POST', 'PROGRESS_UPDATED', 'ACCOUNT_SECURITY', 'RESULT_PUBLISHED', 'CERTIFICATE_ISSUED') NOT NULL;

-- CreateTable
CREATE TABLE `grade_levels` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(30) NOT NULL,
    `description` VARCHAR(120) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `grade_levels_schoolId_label_key`(`schoolId`, `label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `terms` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `academicYearId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `startsOn` DATETIME(3) NULL,
    `endsOn` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `terms_schoolId_idx`(`schoolId`),
    UNIQUE INDEX `terms_academicYearId_name_key`(`academicYearId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_areas` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `classLevelId` VARCHAR(191) NOT NULL,
    `group` VARCHAR(60) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `report_areas_schoolId_classLevelId_idx`(`schoolId`, `classLevelId`),
    UNIQUE INDEX `report_areas_schoolId_classLevelId_group_name_key`(`schoolId`, `classLevelId`, `group`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_cards` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `termId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `classroomId` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
    `remarks` TEXT NULL,
    `enteredById` VARCHAR(191) NULL,
    `submittedAt` DATETIME(3) NULL,
    `publishedAt` DATETIME(3) NULL,
    `publishedById` VARCHAR(191) NULL,
    `snapshotJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `report_cards_schoolId_classroomId_termId_idx`(`schoolId`, `classroomId`, `termId`),
    INDEX `report_cards_studentId_status_idx`(`studentId`, `status`),
    UNIQUE INDEX `report_cards_termId_studentId_key`(`termId`, `studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_card_grades` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `reportCardId` VARCHAR(191) NOT NULL,
    `areaId` VARCHAR(191) NOT NULL,
    `gradeLevelId` VARCHAR(191) NULL,

    INDEX `report_card_grades_schoolId_idx`(`schoolId`),
    UNIQUE INDEX `report_card_grades_reportCardId_areaId_key`(`reportCardId`, `areaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `certificates` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `academicYearId` VARCHAR(191) NULL,
    `title` VARCHAR(120) NOT NULL,
    `body` VARCHAR(400) NOT NULL,
    `design` ENUM('CLASSIC', 'STARS', 'PLAYFUL', 'ELEGANT') NOT NULL DEFAULT 'CLASSIC',
    `issuedOn` DATETIME(3) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `issuedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `certificates_schoolId_issuedOn_idx`(`schoolId`, `issuedOn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `certificate_awards` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `certificateId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `number` VARCHAR(40) NULL,
    `classroomLabel` VARCHAR(80) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `certificate_awards_schoolId_studentId_idx`(`schoolId`, `studentId`),
    UNIQUE INDEX `certificate_awards_certificateId_studentId_key`(`certificateId`, `studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `schools` ADD CONSTRAINT `schools_principalSignatureFileId_fkey` FOREIGN KEY (`principalSignatureFileId`) REFERENCES `file_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_signatureFileId_fkey` FOREIGN KEY (`signatureFileId`) REFERENCES `file_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `grade_levels` ADD CONSTRAINT `grade_levels_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `terms` ADD CONSTRAINT `terms_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `terms` ADD CONSTRAINT `terms_academicYearId_fkey` FOREIGN KEY (`academicYearId`) REFERENCES `academic_years`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_areas` ADD CONSTRAINT `report_areas_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_areas` ADD CONSTRAINT `report_areas_classLevelId_fkey` FOREIGN KEY (`classLevelId`) REFERENCES `class_levels`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_cards` ADD CONSTRAINT `report_cards_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_cards` ADD CONSTRAINT `report_cards_termId_fkey` FOREIGN KEY (`termId`) REFERENCES `terms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_cards` ADD CONSTRAINT `report_cards_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_cards` ADD CONSTRAINT `report_cards_classroomId_fkey` FOREIGN KEY (`classroomId`) REFERENCES `classrooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_cards` ADD CONSTRAINT `report_cards_enteredById_fkey` FOREIGN KEY (`enteredById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_cards` ADD CONSTRAINT `report_cards_publishedById_fkey` FOREIGN KEY (`publishedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_card_grades` ADD CONSTRAINT `report_card_grades_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_card_grades` ADD CONSTRAINT `report_card_grades_reportCardId_fkey` FOREIGN KEY (`reportCardId`) REFERENCES `report_cards`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_card_grades` ADD CONSTRAINT `report_card_grades_areaId_fkey` FOREIGN KEY (`areaId`) REFERENCES `report_areas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_card_grades` ADD CONSTRAINT `report_card_grades_gradeLevelId_fkey` FOREIGN KEY (`gradeLevelId`) REFERENCES `grade_levels`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_academicYearId_fkey` FOREIGN KEY (`academicYearId`) REFERENCES `academic_years`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificate_awards` ADD CONSTRAINT `certificate_awards_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificate_awards` ADD CONSTRAINT `certificate_awards_certificateId_fkey` FOREIGN KEY (`certificateId`) REFERENCES `certificates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificate_awards` ADD CONSTRAINT `certificate_awards_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

