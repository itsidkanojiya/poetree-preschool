-- What a parent sent in with their child's homework, usually a photograph of
-- the work. The plan carried this table from the start; it was never created,
-- so submissions could hold a note but nothing else.
CREATE TABLE `homework_submission_files` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `submissionId` VARCHAR(191) NOT NULL,
  `fileId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  -- The same upload attached twice is a double tap, not a second photograph.
  UNIQUE INDEX `homework_submission_files_submissionId_fileId_key`(`submissionId`, `fileId`),
  INDEX `homework_submission_files_schoolId_submissionId_idx`(`schoolId`, `submissionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `homework_submission_files`
  ADD CONSTRAINT `homework_submission_files_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `homework_submission_files`
  ADD CONSTRAINT `homework_submission_files_submissionId_fkey`
  FOREIGN KEY (`submissionId`) REFERENCES `homework_submissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `homework_submission_files`
  ADD CONSTRAINT `homework_submission_files_fileId_fkey`
  FOREIGN KEY (`fileId`) REFERENCES `file_objects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
