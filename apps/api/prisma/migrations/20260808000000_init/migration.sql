-- CreateTable
CREATE TABLE `publications` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `logoUrl` VARCHAR(500) NULL,
    `settings` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schools` (
    `id` VARCHAR(191) NOT NULL,
    `publicationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `slug` VARCHAR(60) NOT NULL,
    `email` VARCHAR(160) NULL,
    `phone` VARCHAR(20) NULL,
    `addressLine1` VARCHAR(200) NULL,
    `addressLine2` VARCHAR(200) NULL,
    `city` VARCHAR(100) NULL,
    `state` VARCHAR(100) NULL,
    `postalCode` VARCHAR(20) NULL,
    `principalName` VARCHAR(120) NULL,
    `logoUrl` VARCHAR(500) NULL,
    `primaryColor` VARCHAR(7) NULL,
    `status` ENUM('TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED') NOT NULL DEFAULT 'TRIAL',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `schools_code_key`(`code`),
    UNIQUE INDEX `schools_slug_key`(`slug`),
    INDEX `schools_publicationId_idx`(`publicationId`),
    INDEX `schools_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscription_plans` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `description` TEXT NULL,
    `maxStudents` INTEGER NULL,
    `maxTeachers` INTEGER NULL,
    `priceInPaise` INTEGER NOT NULL DEFAULT 0,
    `billingPeriodMonths` INTEGER NOT NULL DEFAULT 12,
    `features` JSON NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subscription_plans_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `school_subscriptions` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `startsAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `suspendedAt` DATETIME(3) NULL,
    `suspendedReason` TEXT NULL,
    `suspendedById` VARCHAR(191) NULL,
    `reactivatedAt` DATETIME(3) NULL,
    `reactivatedById` VARCHAR(191) NULL,
    `isCurrent` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `school_subscriptions_schoolId_isCurrent_idx`(`schoolId`, `isCurrent`),
    INDEX `school_subscriptions_planId_idx`(`planId`),
    INDEX `school_subscriptions_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `class_levels` (
    `id` VARCHAR(191) NOT NULL,
    `code` ENUM('PLAY_GROUP', 'NURSERY', 'JUNIOR_KG', 'SENIOR_KG') NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `sortOrder` INTEGER NOT NULL,
    `minAgeMonths` INTEGER NULL,
    `maxAgeMonths` INTEGER NULL,

    UNIQUE INDEX `class_levels_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NULL,
    `scopeKey` VARCHAR(32) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(160) NULL,
    `phone` VARCHAR(20) NULL,
    `passwordHash` VARCHAR(72) NOT NULL,
    `role` ENUM('PUBLICATION_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'PARENT') NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `lastLoginAt` DATETIME(3) NULL,
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `users_schoolId_role_idx`(`schoolId`, `role`),
    INDEX `users_schoolId_status_idx`(`schoolId`, `status`),
    UNIQUE INDEX `users_scopeKey_email_key`(`scopeKey`, `email`),
    UNIQUE INDEX `users_scopeKey_phone_key`(`scopeKey`, `phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `teacher_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `employeeCode` VARCHAR(40) NULL,
    `qualification` VARCHAR(160) NULL,
    `joinedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `teacher_profiles_userId_key`(`userId`),
    INDEX `teacher_profiles_schoolId_idx`(`schoolId`),
    UNIQUE INDEX `teacher_profiles_schoolId_employeeCode_key`(`schoolId`, `employeeCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parent_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `relation` ENUM('FATHER', 'MOTHER', 'GUARDIAN', 'OTHER') NOT NULL DEFAULT 'GUARDIAN',
    `occupation` VARCHAR(120) NULL,
    `address` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `parent_profiles_userId_key`(`userId`),
    INDEX `parent_profiles_schoolId_idx`(`schoolId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `students` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `admissionNo` VARCHAR(40) NOT NULL,
    `firstName` VARCHAR(60) NOT NULL,
    `lastName` VARCHAR(60) NULL,
    `dateOfBirth` DATETIME(3) NOT NULL,
    `gender` ENUM('MALE', 'FEMALE', 'OTHER') NOT NULL,
    `rollNo` VARCHAR(20) NULL,
    `avatarUrl` VARCHAR(500) NULL,
    `bloodGroup` VARCHAR(8) NULL,
    `classroomId` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'GRADUATED', 'WITHDRAWN') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `students_schoolId_classroomId_idx`(`schoolId`, `classroomId`),
    INDEX `students_schoolId_status_idx`(`schoolId`, `status`),
    UNIQUE INDEX `students_schoolId_admissionNo_key`(`schoolId`, `admissionNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_guardians` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `parentProfileId` VARCHAR(191) NOT NULL,
    `relation` ENUM('FATHER', 'MOTHER', 'GUARDIAN', 'OTHER') NOT NULL DEFAULT 'GUARDIAN',
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `student_guardians_schoolId_idx`(`schoolId`),
    INDEX `student_guardians_parentProfileId_idx`(`parentProfileId`),
    UNIQUE INDEX `student_guardians_studentId_parentProfileId_key`(`studentId`, `parentProfileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `academic_years` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `isCurrent` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `academic_years_schoolId_isCurrent_idx`(`schoolId`, `isCurrent`),
    UNIQUE INDEX `academic_years_schoolId_name_key`(`schoolId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `classrooms` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `academicYearId` VARCHAR(191) NOT NULL,
    `classLevelId` VARCHAR(191) NOT NULL,
    `section` VARCHAR(40) NOT NULL,
    `capacity` INTEGER NULL,
    `classTeacherId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `classrooms_schoolId_idx`(`schoolId`),
    INDEX `classrooms_academicYearId_idx`(`academicYearId`),
    INDEX `classrooms_classTeacherId_idx`(`classTeacherId`),
    UNIQUE INDEX `classrooms_schoolId_academicYearId_classLevelId_section_key`(`schoolId`, `academicYearId`, `classLevelId`, `section`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokedBy` VARCHAR(40) NULL,
    `replacedById` VARCHAR(191) NULL,
    `userAgent` VARCHAR(300) NULL,
    `ipAddress` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_tokens_tokenHash_key`(`tokenHash`),
    INDEX `refresh_tokens_userId_revokedAt_idx`(`userId`, `revokedAt`),
    INDEX `refresh_tokens_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NULL,
    `actorUserId` VARCHAR(191) NULL,
    `action` VARCHAR(60) NOT NULL,
    `entity` VARCHAR(60) NOT NULL,
    `entityId` VARCHAR(40) NULL,
    `metadata` JSON NULL,
    `ipAddress` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_schoolId_createdAt_idx`(`schoolId`, `createdAt`),
    INDEX `audit_logs_actorUserId_idx`(`actorUserId`),
    INDEX `audit_logs_action_idx`(`action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `schools` ADD CONSTRAINT `schools_publicationId_fkey` FOREIGN KEY (`publicationId`) REFERENCES `publications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `school_subscriptions` ADD CONSTRAINT `school_subscriptions_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `school_subscriptions` ADD CONSTRAINT `school_subscriptions_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `subscription_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `school_subscriptions` ADD CONSTRAINT `school_subscriptions_suspendedById_fkey` FOREIGN KEY (`suspendedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `school_subscriptions` ADD CONSTRAINT `school_subscriptions_reactivatedById_fkey` FOREIGN KEY (`reactivatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teacher_profiles` ADD CONSTRAINT `teacher_profiles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teacher_profiles` ADD CONSTRAINT `teacher_profiles_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parent_profiles` ADD CONSTRAINT `parent_profiles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parent_profiles` ADD CONSTRAINT `parent_profiles_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `students` ADD CONSTRAINT `students_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `students` ADD CONSTRAINT `students_classroomId_fkey` FOREIGN KEY (`classroomId`) REFERENCES `classrooms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_guardians` ADD CONSTRAINT `student_guardians_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_guardians` ADD CONSTRAINT `student_guardians_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_guardians` ADD CONSTRAINT `student_guardians_parentProfileId_fkey` FOREIGN KEY (`parentProfileId`) REFERENCES `parent_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academic_years` ADD CONSTRAINT `academic_years_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `classrooms` ADD CONSTRAINT `classrooms_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `classrooms` ADD CONSTRAINT `classrooms_academicYearId_fkey` FOREIGN KEY (`academicYearId`) REFERENCES `academic_years`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `classrooms` ADD CONSTRAINT `classrooms_classLevelId_fkey` FOREIGN KEY (`classLevelId`) REFERENCES `class_levels`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `classrooms` ADD CONSTRAINT `classrooms_classTeacherId_fkey` FOREIGN KEY (`classTeacherId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

