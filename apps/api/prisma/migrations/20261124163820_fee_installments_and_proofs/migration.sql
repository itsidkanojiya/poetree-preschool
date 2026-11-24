-- AlterTable
ALTER TABLE `fee_structures` ADD COLUMN `payInFullDiscountKind` ENUM('PERCENT', 'FIXED') NOT NULL DEFAULT 'FIXED',
    ADD COLUMN `payInFullDiscountValue` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `payInFullEnabled` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `student_fee_plans` ADD COLUMN `option` ENUM('INSTALLMENTS', 'PAY_IN_FULL') NULL,
    MODIFY `planId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `fee_structure_installments` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `feeStructureId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `label` VARCHAR(40) NOT NULL,
    `dueDate` DATE NOT NULL,
    `amountInPaise` INTEGER NOT NULL,

    INDEX `fee_structure_installments_schoolId_idx`(`schoolId`),
    UNIQUE INDEX `fee_structure_installments_feeStructureId_position_key`(`feeStructureId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `school_payment_details` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `bankEnabled` BOOLEAN NOT NULL DEFAULT false,
    `bankAccountName` VARCHAR(120) NULL,
    `bankAccountNo` VARCHAR(40) NULL,
    `bankIfsc` VARCHAR(20) NULL,
    `bankName` VARCHAR(120) NULL,
    `upiEnabled` BOOLEAN NOT NULL DEFAULT false,
    `upiId` VARCHAR(100) NULL,
    `upiName` VARCHAR(120) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `school_payment_details_schoolId_key`(`schoolId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_proofs` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `academicYearId` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NULL,
    `kind` ENUM('INSTALLMENT', 'PAY_IN_FULL') NOT NULL,
    `status` ENUM('WAITING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'WAITING',
    `amountInPaise` INTEGER NOT NULL,
    `method` ENUM('CASH', 'CHEQUE', 'BANK_TRANSFER', 'UPI', 'CARD', 'ONLINE') NOT NULL,
    `reference` VARCHAR(80) NULL,
    `screenshotFileId` VARCHAR(191) NOT NULL,
    `submittedById` VARCHAR(191) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `rejectReason` VARCHAR(200) NULL,
    `paymentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payment_proofs_paymentId_key`(`paymentId`),
    INDEX `payment_proofs_schoolId_status_createdAt_idx`(`schoolId`, `status`, `createdAt`),
    INDEX `payment_proofs_studentId_academicYearId_idx`(`studentId`, `academicYearId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fee_structure_installments` ADD CONSTRAINT `fee_structure_installments_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fee_structure_installments` ADD CONSTRAINT `fee_structure_installments_feeStructureId_fkey` FOREIGN KEY (`feeStructureId`) REFERENCES `fee_structures`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `school_payment_details` ADD CONSTRAINT `school_payment_details_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_proofs` ADD CONSTRAINT `payment_proofs_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_proofs` ADD CONSTRAINT `payment_proofs_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_proofs` ADD CONSTRAINT `payment_proofs_academicYearId_fkey` FOREIGN KEY (`academicYearId`) REFERENCES `academic_years`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_proofs` ADD CONSTRAINT `payment_proofs_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `fee_invoices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_proofs` ADD CONSTRAINT `payment_proofs_screenshotFileId_fkey` FOREIGN KEY (`screenshotFileId`) REFERENCES `file_objects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_proofs` ADD CONSTRAINT `payment_proofs_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_proofs` ADD CONSTRAINT `payment_proofs_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_proofs` ADD CONSTRAINT `payment_proofs_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
