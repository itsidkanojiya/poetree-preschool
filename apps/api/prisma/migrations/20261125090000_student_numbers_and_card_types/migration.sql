-- AlterTable
ALTER TABLE `schools` ADD COLUMN `admissionNoMode` ENUM('AUTO', 'MANUAL') NOT NULL DEFAULT 'AUTO',
    ADD COLUMN `idCardOrientation` ENUM('HORIZONTAL', 'VERTICAL') NOT NULL DEFAULT 'HORIZONTAL',
    ADD COLUMN `idCardShowAdmissionNo` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `idCardShowGrNo` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `students` ADD COLUMN `grNo` VARCHAR(40) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `students_schoolId_grNo_key` ON `students`(`schoolId`, `grNo`);


-- A6 was the only upright size. It is half A5 stood on end, which is what
-- orientation now says, so those schools' cards print exactly as before.
UPDATE `schools` SET `idCardSize` = 'HALF_A5', `idCardOrientation` = 'VERTICAL' WHERE `idCardSize` = 'A6';
