-- AlterTable
ALTER TABLE `fee_invoices` ADD COLUMN `studentFeePlanId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `fee_plans` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `academicYearId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `isEnabled` BOOLEAN NOT NULL DEFAULT true,
    `classLevelIds` JSON NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fee_plans_schoolId_academicYearId_idx`(`schoolId`, `academicYearId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fee_plan_installments` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `label` VARCHAR(40) NOT NULL,
    `dueDate` DATE NOT NULL,
    `weight` INTEGER NOT NULL DEFAULT 1,

    INDEX `fee_plan_installments_schoolId_idx`(`schoolId`),
    UNIQUE INDEX `fee_plan_installments_planId_position_key`(`planId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_fee_plans` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `academicYearId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `chosenById` VARCHAR(191) NOT NULL,
    `chosenByRole` VARCHAR(20) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `student_fee_plans_schoolId_planId_idx`(`schoolId`, `planId`),
    UNIQUE INDEX `student_fee_plans_studentId_academicYearId_key`(`studentId`, `academicYearId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fee_reminder_policies` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `daysBefore` JSON NOT NULL,
    `onDueDate` BOOLEAN NOT NULL DEFAULT true,
    `graceDays` INTEGER NOT NULL DEFAULT 0,
    `overdueEveryDays` INTEGER NOT NULL DEFAULT 7,
    `overdueMaxCount` INTEGER NOT NULL DEFAULT 3,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fee_reminder_policies_schoolId_key`(`schoolId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fee_reminder_logs` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `followUpId` VARCHAR(191) NULL,
    `reminderKey` VARCHAR(80) NOT NULL,
    `recipients` INTEGER NOT NULL DEFAULT 0,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fee_reminder_logs_schoolId_sentAt_idx`(`schoolId`, `sentAt`),
    UNIQUE INDEX `fee_reminder_logs_invoiceId_reminderKey_key`(`invoiceId`, `reminderKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fee_follow_ups` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `contactedAt` DATETIME(3) NULL,
    `outcome` ENUM('REACHED', 'NO_ANSWER', 'PROMISED_PAYMENT', 'REQUESTED_TIME', 'WRONG_NUMBER', 'OTHER') NULL,
    `note` VARCHAR(300) NULL,
    `followUpOn` DATE NOT NULL,
    `remindParent` BOOLEAN NOT NULL DEFAULT true,
    `status` ENUM('PENDING', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `reminderSentAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `closedReason` VARCHAR(120) NULL,
    `loggedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fee_follow_ups_schoolId_status_followUpOn_idx`(`schoolId`, `status`, `followUpOn`),
    INDEX `fee_follow_ups_invoiceId_idx`(`invoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fee_invoices` ADD CONSTRAINT `fee_invoices_studentFeePlanId_fkey` FOREIGN KEY (`studentFeePlanId`) REFERENCES `student_fee_plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fee_plans` ADD CONSTRAINT `fee_plans_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fee_plans` ADD CONSTRAINT `fee_plans_academicYearId_fkey` FOREIGN KEY (`academicYearId`) REFERENCES `academic_years`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fee_plan_installments` ADD CONSTRAINT `fee_plan_installments_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fee_plan_installments` ADD CONSTRAINT `fee_plan_installments_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `fee_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_fee_plans` ADD CONSTRAINT `student_fee_plans_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_fee_plans` ADD CONSTRAINT `student_fee_plans_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_fee_plans` ADD CONSTRAINT `student_fee_plans_academicYearId_fkey` FOREIGN KEY (`academicYearId`) REFERENCES `academic_years`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_fee_plans` ADD CONSTRAINT `student_fee_plans_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `fee_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_fee_plans` ADD CONSTRAINT `student_fee_plans_chosenById_fkey` FOREIGN KEY (`chosenById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fee_reminder_policies` ADD CONSTRAINT `fee_reminder_policies_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fee_reminder_logs` ADD CONSTRAINT `fee_reminder_logs_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fee_reminder_logs` ADD CONSTRAINT `fee_reminder_logs_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `fee_invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fee_reminder_logs` ADD CONSTRAINT `fee_reminder_logs_followUpId_fkey` FOREIGN KEY (`followUpId`) REFERENCES `fee_follow_ups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fee_follow_ups` ADD CONSTRAINT `fee_follow_ups_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fee_follow_ups` ADD CONSTRAINT `fee_follow_ups_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fee_follow_ups` ADD CONSTRAINT `fee_follow_ups_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `fee_invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fee_follow_ups` ADD CONSTRAINT `fee_follow_ups_loggedById_fkey` FOREIGN KEY (`loggedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

