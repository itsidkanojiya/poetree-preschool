-- The animation a child watches before the book's activities open.
--
-- A YouTube link rather than an uploaded file: these are minutes of video, the
-- VPS has 2 cores and no CDN in front of it, and a preschool's parents are on
-- mobile data. YouTube already solves the delivery.
ALTER TABLE `books` ADD COLUMN `animationUrl` VARCHAR(500) NULL;

-- Who has watched it. One row per child per book, written the first time they
-- reach the end and never again.
CREATE TABLE `book_animation_views` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `bookId` VARCHAR(191) NOT NULL,
  `watchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  -- Watched once is watched. A child coming back to finish the questions must
  -- not have to sit through it again.
  UNIQUE INDEX `book_animation_views_studentId_bookId_key`(`studentId`, `bookId`),
  INDEX `book_animation_views_schoolId_studentId_idx`(`schoolId`, `studentId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `book_animation_views`
  ADD CONSTRAINT `book_animation_views_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `book_animation_views`
  ADD CONSTRAINT `book_animation_views_studentId_fkey`
  FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `book_animation_views`
  ADD CONSTRAINT `book_animation_views_bookId_fkey`
  FOREIGN KEY (`bookId`) REFERENCES `books`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
