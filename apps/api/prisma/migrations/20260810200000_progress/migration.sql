-- AlterTable
ALTER TABLE `homework` ADD COLUMN `learningActivityId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `skills` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `classLevelId` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `skills_code_key`(`code`),
    INDEX `skills_classLevelId_sortOrder_idx`(`classLevelId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `learning_activities` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `type` ENUM('TRACING', 'MATCHING', 'COUNTING', 'FLASHCARD', 'SORTING', 'COLOURING', 'RHYME', 'STORY') NOT NULL,
    `skillId` VARCHAR(191) NOT NULL,
    `classLevelId` VARCHAR(191) NULL,
    `contentJson` JSON NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `learning_activities_code_key`(`code`),
    INDEX `learning_activities_skillId_idx`(`skillId`),
    INDEX `learning_activities_classLevelId_isActive_idx`(`classLevelId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_attempts` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,
    `correctCount` INTEGER NOT NULL,
    `totalCount` INTEGER NOT NULL,
    `timeSpentSeconds` INTEGER NOT NULL DEFAULT 0,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `resultJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `activity_attempts_schoolId_studentId_createdAt_idx`(`schoolId`, `studentId`, `createdAt`),
    INDEX `activity_attempts_schoolId_activityId_idx`(`schoolId`, `activityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_skill_progress` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `skillId` VARCHAR(191) NOT NULL,
    `academicYearId` VARCHAR(191) NOT NULL,
    `masteryPercent` INTEGER NOT NULL DEFAULT 0,
    `correctCount` INTEGER NOT NULL DEFAULT 0,
    `totalCount` INTEGER NOT NULL DEFAULT 0,
    `attemptsCount` INTEGER NOT NULL DEFAULT 0,
    `lastAssessedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `student_skill_progress_schoolId_studentId_idx`(`schoolId`, `studentId`),
    UNIQUE INDEX `student_skill_progress_studentId_skillId_academicYearId_key`(`studentId`, `skillId`, `academicYearId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `homework` ADD CONSTRAINT `homework_learningActivityId_fkey` FOREIGN KEY (`learningActivityId`) REFERENCES `learning_activities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `skills` ADD CONSTRAINT `skills_classLevelId_fkey` FOREIGN KEY (`classLevelId`) REFERENCES `class_levels`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_activities` ADD CONSTRAINT `learning_activities_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `skills`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_activities` ADD CONSTRAINT `learning_activities_classLevelId_fkey` FOREIGN KEY (`classLevelId`) REFERENCES `class_levels`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_attempts` ADD CONSTRAINT `activity_attempts_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_attempts` ADD CONSTRAINT `activity_attempts_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_attempts` ADD CONSTRAINT `activity_attempts_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `learning_activities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_skill_progress` ADD CONSTRAINT `student_skill_progress_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_skill_progress` ADD CONSTRAINT `student_skill_progress_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_skill_progress` ADD CONSTRAINT `student_skill_progress_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `skills`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_skill_progress` ADD CONSTRAINT `student_skill_progress_academicYearId_fkey` FOREIGN KEY (`academicYearId`) REFERENCES `academic_years`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
