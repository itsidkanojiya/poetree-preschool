-- Questions as rows.
--
-- They lived inside `learning_activities.contentJson`, which was right while
-- content came from a seed script and wrong the moment a person had to type it
-- in: adding one question meant rewriting the whole blob, and a picture could
-- not be referenced from JSON at all.
CREATE TABLE `activity_questions` (
  `id` VARCHAR(191) NOT NULL,
  `activityId` VARCHAR(191) NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  -- What the app reads aloud. A child of four cannot read the question.
  `say` VARCHAR(200) NOT NULL,
  `promptGlyph` VARCHAR(16) NULL,
  `promptFileId` VARCHAR(191) NULL,
  -- Tracing paths stay JSON: they are arrays of normalised coordinates, not
  -- anything anybody queries.
  `strokesJson` JSON NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `activity_questions_activityId_sortOrder_idx`(`activityId`, `sortOrder`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `activity_questions`
  ADD CONSTRAINT `activity_questions_activityId_fkey`
  FOREIGN KEY (`activityId`) REFERENCES `learning_activities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `activity_questions`
  ADD CONSTRAINT `activity_questions_promptFileId_fkey`
  FOREIGN KEY (`promptFileId`) REFERENCES `file_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- What the child taps.
--
-- `isCorrect` on the option rather than an index on the question: an author
-- ticks the right picture, and the API works out the index the play engine
-- wants when it serves.
CREATE TABLE `question_options` (
  `id` VARCHAR(191) NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `text` VARCHAR(80) NULL,
  `glyph` VARCHAR(16) NULL,
  `fileId` VARCHAR(191) NULL,
  `isCorrect` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `question_options_questionId_sortOrder_idx`(`questionId`, `sortOrder`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `question_options`
  ADD CONSTRAINT `question_options_questionId_fkey`
  FOREIGN KEY (`questionId`) REFERENCES `activity_questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `question_options`
  ADD CONSTRAINT `question_options_fileId_fkey`
  FOREIGN KEY (`fileId`) REFERENCES `file_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
